-- ============================================================================
-- F News & Weather — Supabase schema
-- ----------------------------------------------------------------------------
-- Run AFTER supabase/schema.sql (this file reads public.profiles for the
-- public channel-owner card). Safe to re-run in the normal Supabase SQL Editor.
--
-- Creates:
--   • channels, studio memberships and personal subscriptions
--   • articles + ordered body blocks (text / quote / image / video / embed)
--   • 24-hour video Flash, news-only Shorts and a central media registry
--   • verification certificates, ownership transfer and audit trail
--   • news preferences (scope, categories, weather place and units)
--   • RLS, keyset-pagination indexes, FTS + trigram search, storage policies
--
-- Product rules encoded here:
--   • Subscribers are personal auth users. There is no “channel subscribes to
--     a channel” relationship in this schema.
--   • A Flash is published for exactly 24 hours, then moves to its channel
--     archive. The channel owner may attach a full follow-up article.
--   • Ownership transfer only changes news_channels.owner_id. Channel name,
--     handle, posts, media and subscriptions keep the same channel id.
-- ============================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'Run supabase/schema.sql first: public.profiles is required.';
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- 1. Channels, studio members and personal subscriptions
-- ----------------------------------------------------------------------------

create table if not exists public.news_channels (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references auth.users (id) on delete cascade,
  name                text not null,
  handle              text not null,
  description         text not null default '',
  category            text not null default 'Top',
  avatar_url          text,
  cover_url           text,
  locale              text not null default 'uz',
  region              text,
  verified            boolean not null default false,
  trust_level         text not null default 'standard',
  certificate_label   text,
  verified_at         timestamptz,
  subscriber_count    integer not null default 0,
  search_vector       tsvector,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  archived_at         timestamptz,
  constraint news_channels_name_len
    check (char_length(btrim(name)) between 2 and 80),
  constraint news_channels_handle_format
    check (handle ~ '^[a-z0-9_]{3,30}$'),
  constraint news_channels_description_len
    check (char_length(description) <= 600),
  constraint news_channels_category
    check (category in ('Top', 'Business', 'Technology', 'Sport', 'Local', 'World', 'Climate', 'Culture')),
  constraint news_channels_trust
    check (trust_level in ('standard', 'verified', 'trusted')),
  constraint news_channels_verified_consistent
    check ((verified and trust_level in ('verified', 'trusted')) or (not verified and trust_level = 'standard')),
  constraint news_channels_subscriber_count
    check (subscriber_count >= 0)
);

create unique index if not exists news_channels_handle_key
  on public.news_channels (lower(handle));
create index if not exists news_channels_owner_idx
  on public.news_channels (owner_id);
create index if not exists news_channels_category_idx
  on public.news_channels (category, subscriber_count desc)
  where archived_at is null;
create index if not exists news_channels_search_idx
  on public.news_channels using gin (search_vector);
create index if not exists news_channels_name_trgm_idx
  on public.news_channels using gin (name gin_trgm_ops);

-- Studio access. news_channels.owner_id remains the public source of truth;
-- this table grants editors/producers access to the Studio.
create table if not exists public.news_channel_members (
  channel_id  uuid not null references public.news_channels (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null default 'editor',
  created_at  timestamptz not null default now(),
  primary key (channel_id, user_id),
  constraint news_channel_members_role
    check (role in ('owner', 'editor', 'producer', 'analyst'))
);

create unique index if not exists news_channel_members_one_owner
  on public.news_channel_members (channel_id)
  where role = 'owner';
create index if not exists news_channel_members_user_idx
  on public.news_channel_members (user_id);

-- Subscribers are always personal auth users. subscriber_id can never point at
-- a news channel, which enforces “channels cannot subscribe to channels”.
create table if not exists public.news_subscriptions (
  channel_id     uuid not null references public.news_channels (id) on delete cascade,
  subscriber_id  uuid not null references auth.users (id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (channel_id, subscriber_id)
);

create index if not exists news_subscriptions_subscriber_idx
  on public.news_subscriptions (subscriber_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 2. Media registry
-- ----------------------------------------------------------------------------

create table if not exists public.news_media (
  id               uuid primary key default gen_random_uuid(),
  channel_id       uuid not null references public.news_channels (id) on delete cascade,
  owner_id         uuid not null references auth.users (id) on delete cascade,
  kind             text not null,
  bucket           text not null default 'news-media',
  storage_path     text,
  public_url       text,
  poster_url       text,
  alt_text         text,
  width            integer,
  height           integer,
  duration_seconds numeric(10, 3),
  size_bytes       bigint,
  status           text not null default 'ready',
  created_at       timestamptz not null default now(),
  constraint news_media_kind
    check (kind in ('image', 'video', 'audio')),
  constraint news_media_status
    check (status in ('ready', 'processing', 'failed')),
  constraint news_media_source
    check (storage_path is not null or public_url is not null),
  constraint news_media_dimensions
    check ((width is null or width > 0) and (height is null or height > 0)),
  constraint news_media_duration
    check (duration_seconds is null or duration_seconds >= 0),
  constraint news_media_size
    check (size_bytes is null or size_bytes >= 0)
);

create unique index if not exists news_media_storage_key
  on public.news_media (bucket, storage_path)
  where storage_path is not null;
create index if not exists news_media_channel_idx
  on public.news_media (channel_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 3. Flash, articles, blocks and Shorts
-- ----------------------------------------------------------------------------

create table if not exists public.news_flashes (
  id               uuid primary key default gen_random_uuid(),
  channel_id       uuid not null references public.news_channels (id) on delete cascade,
  author_id        uuid not null references auth.users (id) on delete cascade,
  title            text not null,
  category         text not null default 'Top',
  video_media_id   uuid references public.news_media (id) on delete set null,
  video_url        text,
  poster_url       text,
  duration_seconds integer not null default 0,
  broadcast_type   text not null default 'recorded',
  status           text not null default 'draft',
  views            bigint not null default 0,
  published_at     timestamptz,
  expires_at       timestamptz,
  search_vector    tsvector,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint news_flashes_title_len
    check (char_length(btrim(title)) between 4 and 160),
  constraint news_flashes_category
    check (category in ('Top', 'Business', 'Technology', 'Sport', 'Local', 'World', 'Climate', 'Culture')),
  constraint news_flashes_broadcast
    check (broadcast_type in ('recorded', 'live')),
  constraint news_flashes_status
    check (status in ('draft', 'published', 'archived', 'removed')),
  constraint news_flashes_duration
    check (duration_seconds >= 0),
  constraint news_flashes_views
    check (views >= 0),
  constraint news_flashes_published_requires_date
    check (status in ('draft', 'removed') or published_at is not null),
  constraint news_flashes_published_requires_expiry
    check (status in ('draft', 'removed') or expires_at is not null),
  constraint news_flashes_lifetime
    check (expires_at is null or published_at is null or expires_at <= published_at + interval '24 hours')
);

create index if not exists news_flashes_live_idx
  on public.news_flashes (published_at desc, id desc)
  where status = 'published';
create index if not exists news_flashes_channel_idx
  on public.news_flashes (channel_id, status, published_at desc);
create index if not exists news_flashes_expiry_idx
  on public.news_flashes (expires_at)
  where status = 'published';
create index if not exists news_flashes_search_idx
  on public.news_flashes using gin (search_vector);
create index if not exists news_flashes_title_trgm_idx
  on public.news_flashes using gin (title gin_trgm_ops);

create table if not exists public.news_articles (
  id                    uuid primary key default gen_random_uuid(),
  channel_id            uuid not null references public.news_channels (id) on delete cascade,
  author_id             uuid not null references auth.users (id) on delete cascade,
  title                 text not null,
  summary               text not null default '',
  category              text not null default 'Top',
  region                text,
  tags                  text[] not null default '{}',
  cover_url             text,
  cover_alt             text,
  urgent                boolean not null default false,
  status                text not null default 'draft',
  follow_up_for_flash_id uuid references public.news_flashes (id) on delete set null,
  read_minutes          integer,
  views                 bigint not null default 0,
  published_at          timestamptz,
  search_vector         tsvector,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint news_articles_title_len
    check (char_length(btrim(title)) between 6 and 200),
  constraint news_articles_summary_len
    check (char_length(summary) <= 400),
  constraint news_articles_category
    check (category in ('Top', 'Business', 'Technology', 'Sport', 'Local', 'World', 'Climate', 'Culture')),
  constraint news_articles_status
    check (status in ('draft', 'review', 'published', 'archived', 'removed')),
  constraint news_articles_read_minutes
    check (read_minutes is null or read_minutes > 0),
  constraint news_articles_views
    check (views >= 0),
  constraint news_articles_published_requires_date
    check (status in ('draft', 'review', 'removed') or published_at is not null),
  constraint news_articles_published_requires_cover
    check (status in ('draft', 'review', 'removed') or cover_url is not null)
);

create index if not exists news_articles_published_cursor_idx
  on public.news_articles (published_at desc, id desc)
  where status = 'published';
create index if not exists news_articles_channel_idx
  on public.news_articles (channel_id, published_at desc);
create index if not exists news_articles_category_idx
  on public.news_articles (category, published_at desc)
  where status = 'published';
create index if not exists news_articles_urgent_idx
  on public.news_articles (published_at desc)
  where status = 'published' and urgent;
create index if not exists news_articles_follow_up_idx
  on public.news_articles (follow_up_for_flash_id)
  where follow_up_for_flash_id is not null;
create index if not exists news_articles_search_idx
  on public.news_articles using gin (search_vector);
create index if not exists news_articles_title_trgm_idx
  on public.news_articles using gin (title gin_trgm_ops);
create index if not exists news_articles_summary_trgm_idx
  on public.news_articles using gin (summary gin_trgm_ops);

-- Ordered long-form body. Multiple image blocks and video blocks are allowed.
create table if not exists public.news_article_blocks (
  id               uuid primary key default gen_random_uuid(),
  article_id       uuid not null references public.news_articles (id) on delete cascade,
  position         integer not null,
  type             text not null,
  text             text,
  media_id         uuid references public.news_media (id) on delete set null,
  media_url        text,
  poster_url       text,
  caption          text,
  alt_text         text,
  duration_seconds numeric(10, 3),
  created_at       timestamptz not null default now(),
  constraint news_article_blocks_position
    check (position >= 0),
  constraint news_article_blocks_type
    check (type in ('text', 'quote', 'image', 'video', 'embed')),
  constraint news_article_blocks_content
    check (
      (type in ('text', 'quote') and text is not null)
      or (type in ('image', 'video', 'embed') and (media_id is not null or media_url is not null))
    ),
  constraint news_article_blocks_duration
    check (duration_seconds is null or duration_seconds >= 0),
  unique (article_id, position)
);

create table if not exists public.news_shorts (
  id               uuid primary key default gen_random_uuid(),
  channel_id       uuid not null references public.news_channels (id) on delete cascade,
  author_id        uuid not null references auth.users (id) on delete cascade,
  caption          text not null,
  category         text not null default 'Top',
  video_media_id   uuid references public.news_media (id) on delete set null,
  video_url        text,
  poster_url       text,
  duration_seconds integer not null default 0,
  status           text not null default 'draft',
  views            bigint not null default 0,
  like_count       integer not null default 0,
  comment_count    integer not null default 0,
  published_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint news_shorts_caption_len
    check (char_length(btrim(caption)) between 4 and 280),
  constraint news_shorts_category
    check (category in ('Top', 'Business', 'Technology', 'Sport', 'Local', 'World', 'Climate', 'Culture')),
  constraint news_shorts_status
    check (status in ('draft', 'published', 'archived', 'removed')),
  constraint news_shorts_duration
    check (duration_seconds >= 0),
  constraint news_shorts_counters
    check (views >= 0 and like_count >= 0 and comment_count >= 0),
  constraint news_shorts_published_requires_date
    check (status in ('draft', 'removed') or published_at is not null)
);

create index if not exists news_shorts_published_cursor_idx
  on public.news_shorts (published_at desc, id desc)
  where status = 'published';
create index if not exists news_shorts_channel_idx
  on public.news_shorts (channel_id, status, published_at desc);
create index if not exists news_shorts_category_idx
  on public.news_shorts (category, published_at desc)
  where status = 'published';

-- ----------------------------------------------------------------------------
-- 4. News preferences, verification, transfer and audit
-- ----------------------------------------------------------------------------

create table if not exists public.news_preferences (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  home_scope        text not null default 'foryou',
  categories        text[] not null default array['Top', 'Business', 'Technology', 'Sport', 'Local', 'World', 'Climate', 'Culture']::text[],
  content_filter    text not null default 'all',
  time_filter       text not null default 'any',
  weather_place_id  text not null default 'toshkent',
  weather_label     text not null default 'Toshkent',
  weather_region    text not null default '',
  weather_lat       numeric(9, 6),
  weather_lon       numeric(9, 6),
  weather_units     text not null default 'C',
  weather_alerts    boolean not null default true,
  breaking_alerts   boolean not null default true,
  autoplay_video    boolean not null default false,
  language          text not null default 'uz',
  updated_at        timestamptz not null default now(),
  constraint news_preferences_scope
    check (home_scope in ('foryou', 'following', 'local')),
  constraint news_preferences_categories
    check (categories <@ array['Top', 'Business', 'Technology', 'Sport', 'Local', 'World', 'Climate', 'Culture']::text[]),
  constraint news_preferences_content
    check (content_filter in ('all', 'articles', 'flashes')),
  constraint news_preferences_time
    check (time_filter in ('any', '24h', 'week')),
  constraint news_preferences_units
    check (weather_units in ('C', 'F'))
);

-- Upgrade path for projects that applied an earlier revision of this file.
alter table public.news_preferences
  add column if not exists weather_region text not null default '',
  add column if not exists breaking_alerts boolean not null default true,
  add column if not exists autoplay_video boolean not null default false;

create table if not exists public.news_channel_verifications (
  id            uuid primary key default gen_random_uuid(),
  channel_id    uuid not null references public.news_channels (id) on delete cascade,
  requested_by  uuid not null references auth.users (id) on delete cascade,
  level         text not null,
  status        text not null default 'pending',
  evidence      text not null default '',
  note          text,
  reviewer_id   uuid references auth.users (id) on delete set null,
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint news_verifications_level
    check (level in ('verified', 'trusted')),
  constraint news_verifications_status
    check (status in ('pending', 'approved', 'rejected', 'revoked'))
);

create index if not exists news_verifications_channel_idx
  on public.news_channel_verifications (channel_id, created_at desc);
create index if not exists news_verifications_pending_idx
  on public.news_channel_verifications (created_at)
  where status = 'pending';

create table if not exists public.news_channel_transfers (
  id            uuid primary key default gen_random_uuid(),
  channel_id    uuid not null references public.news_channels (id) on delete cascade,
  from_owner    uuid not null references auth.users (id) on delete cascade,
  to_user       uuid not null references auth.users (id) on delete cascade,
  status        text not null default 'pending',
  note          text not null default '',
  requested_at  timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '7 days'),
  accepted_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint news_transfers_status
    check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  constraint news_transfers_different_users
    check (from_owner <> to_user)
);

create unique index if not exists news_channel_transfers_one_pending
  on public.news_channel_transfers (channel_id)
  where status = 'pending';
create index if not exists news_channel_transfers_recipient_idx
  on public.news_channel_transfers (to_user, status, created_at desc);

create table if not exists public.news_audit_log (
  id          uuid primary key default gen_random_uuid(),
  channel_id  uuid references public.news_channels (id) on delete cascade,
  actor_id    uuid references auth.users (id) on delete set null,
  action      text not null,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists news_audit_channel_idx
  on public.news_audit_log (channel_id, created_at desc);

-- Bootstrap admin access by inserting a real auth user id:
--   insert into public.news_admins (user_id) values ('<uuid>');
create table if not exists public.news_admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 5. Access helpers
-- ----------------------------------------------------------------------------

create or replace function public.news_is_channel_member(
  p_channel_id uuid,
  p_roles text[] default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.news_channel_members m
    where m.channel_id = p_channel_id
      and m.user_id = auth.uid()
      and (p_roles is null or m.role = any (p_roles))
  );
$$;

create or replace function public.news_can_edit_channel(p_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.news_channel_members m
    where m.channel_id = p_channel_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'editor', 'producer')
  );
$$;

create or replace function public.news_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.news_admins a where a.user_id = auth.uid()
  );
$$;

-- Public owner card. This is a definer function so a reader can see who owns a
-- channel without gaining access to the owner's friend-only profile fields.
create or replace function public.news_channel_owner(p_channel_id uuid)
returns table (owner_id uuid, nickname text, avatar_path text)
language sql
stable
security definer
set search_path = public
as $$
  select c.owner_id, p.nickname, p.avatar_path
  from public.news_channels c
  join public.profiles p on p.id = c.owner_id
  where c.id = p_channel_id
  limit 1;
$$;

-- Directory reads need the public owner card for several channels at once.
create or replace function public.news_channel_owners(p_channel_ids uuid[])
returns table (
  channel_id uuid,
  owner_id uuid,
  nickname text,
  first_name text,
  last_name text,
  avatar_path text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.owner_id, p.nickname, p.first_name, p.last_name, p.avatar_path
  from public.news_channels c
  join public.profiles p on p.id = c.owner_id
  where c.id = any (p_channel_ids);
$$;

-- ----------------------------------------------------------------------------
-- 6. Trigger functions
-- ----------------------------------------------------------------------------

create or replace function public.news_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.news_channel_search_vector()
returns trigger
language plpgsql
as $$
begin
  new.search_vector :=
    setweight(to_tsvector('simple', coalesce(new.name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(new.handle, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(new.description, '')), 'B');
  return new;
end;
$$;

create or replace function public.news_article_search_vector()
returns trigger
language plpgsql
as $$
begin
  new.search_vector :=
    setweight(to_tsvector('simple', coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(new.summary, '')), 'B') ||
    setweight(to_tsvector('simple', concat_ws(' ', new.category, new.region, array_to_string(new.tags, ' '))), 'C');
  return new;
end;
$$;

create or replace function public.news_flash_search_vector()
returns trigger
language plpgsql
as $$
begin
  new.search_vector :=
    setweight(to_tsvector('simple', coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(new.category, '')), 'B');
  return new;
end;
$$;

create or replace function public.news_article_lifecycle()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

create or replace function public.news_article_follow_up_guard()
returns trigger
language plpgsql
as $$
declare
  v_channel_id uuid;
begin
  if new.follow_up_for_flash_id is not null then
    select channel_id into v_channel_id
    from public.news_flashes
    where id = new.follow_up_for_flash_id;

    if v_channel_id is null then
      raise exception 'Follow-up Flash does not exist.';
    end if;
    if v_channel_id <> new.channel_id then
      raise exception 'A follow-up article must belong to the Flash channel.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.news_flash_lifecycle()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'published' then
    if tg_op = 'INSERT' then
      new.published_at := coalesce(new.published_at, now());
      new.expires_at := new.published_at + interval '24 hours';
    elsif old.status is distinct from 'published' then
      new.published_at := coalesce(new.published_at, now());
      new.expires_at := new.published_at + interval '24 hours';
    elsif new.expires_at is null then
      new.expires_at := new.published_at + interval '24 hours';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.news_flash_require_video()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'published'
     and new.video_media_id is null
     and new.video_url is null then
    raise exception 'A published Flash needs a recorded video.';
  end if;
  return new;
end;
$$;

create or replace function public.news_short_lifecycle()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'published' then
    if new.video_media_id is null and new.video_url is null then
      raise exception 'A published Short needs a video.';
    end if;
    if new.published_at is null then
      new.published_at := now();
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.news_sync_subscriber_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.news_channels
    set subscriber_count = subscriber_count + 1
    where id = new.channel_id;
    return new;
  end if;

  update public.news_channels
  set subscriber_count = greatest(0, subscriber_count - 1)
  where id = old.channel_id;
  return old;
end;
$$;

create or replace function public.news_after_channel_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.news_channel_members (channel_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (channel_id, user_id) do update set role = 'owner';

  insert into public.news_audit_log (channel_id, actor_id, action, metadata)
  values (
    new.id,
    new.owner_id,
    'channel.created',
    jsonb_build_object('name', new.name, 'handle', new.handle)
  );
  return new;
end;
$$;

create or replace function public.news_audit_owner_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    insert into public.news_audit_log (channel_id, actor_id, action, metadata)
    values (
      new.id,
      auth.uid(),
      'channel.owner_changed',
      jsonb_build_object('from', old.owner_id, 'to', new.owner_id)
    );
  end if;
  return new;
end;
$$;

create or replace function public.news_apply_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_apply boolean;
  v_revoke boolean;
begin
  if tg_op = 'INSERT' then
    v_apply := new.status = 'approved';
    v_revoke := false;
  else
    v_apply := new.status = 'approved' and old.status is distinct from 'approved';
    v_revoke := new.status = 'revoked' and old.status is distinct from 'revoked';
  end if;

  if v_apply then
    update public.news_channels
    set trust_level = new.level,
        verified = true,
        verified_at = coalesce(new.reviewed_at, now()),
        certificate_label = case
          when new.level = 'trusted' then 'Trusted newsroom'
          else 'Verified newsroom'
        end,
        updated_at = now()
    where id = new.channel_id;

    insert into public.news_audit_log (channel_id, actor_id, action, metadata)
    values (
      new.channel_id,
      auth.uid(),
      'verification.approved',
      jsonb_build_object('level', new.level, 'verification', new.id)
    );
  elsif v_revoke then
    update public.news_channels
    set trust_level = 'standard',
        verified = false,
        verified_at = null,
        certificate_label = null,
        updated_at = now()
    where id = new.channel_id;

    insert into public.news_audit_log (channel_id, actor_id, action, metadata)
    values (
      new.channel_id,
      auth.uid(),
      'verification.revoked',
      jsonb_build_object('level', new.level, 'verification', new.id)
    );
  end if;
  return new;
end;
$$;

create or replace function public.news_archive_expired_flashes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.news_flashes
  set status = 'archived',
      updated_at = now()
  where status = 'published'
    and expires_at <= now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. Ownership transfer RPCs
-- ----------------------------------------------------------------------------

create or replace function public.news_request_channel_transfer(
  p_channel_id uuid,
  p_to_user uuid,
  p_note text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in required.';
  end if;

  select owner_id into v_owner
  from public.news_channels
  where id = p_channel_id and archived_at is null
  for update;

  if v_owner is null then
    raise exception 'Channel not found.';
  end if;
  if v_owner <> auth.uid() then
    raise exception 'Only the channel owner can start a transfer.';
  end if;
  if p_to_user = auth.uid() then
    raise exception 'Choose another personal account.';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_to_user) then
    raise exception 'Recipient account not found.';
  end if;

  update public.news_channel_transfers
  set status = 'cancelled', updated_at = now()
  where channel_id = p_channel_id and status = 'pending';

  insert into public.news_channel_transfers (channel_id, from_owner, to_user, note)
  values (p_channel_id, auth.uid(), p_to_user, left(coalesce(p_note, ''), 500))
  returning id into v_id;

  insert into public.news_audit_log (channel_id, actor_id, action, metadata)
  values (
    p_channel_id,
    auth.uid(),
    'transfer.requested',
    jsonb_build_object('transfer', v_id, 'to', p_to_user)
  );
  return v_id;
end;
$$;

create or replace function public.news_accept_channel_transfer(p_transfer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.news_channel_transfers%rowtype;
  v_owner uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in required.';
  end if;

  select * into t
  from public.news_channel_transfers
  where id = p_transfer_id
  for update;

  if not found then
    raise exception 'Transfer not found.';
  end if;
  if t.to_user <> auth.uid() then
    raise exception 'This transfer belongs to another account.';
  end if;
  if t.status <> 'pending' then
    raise exception 'This transfer is no longer pending.';
  end if;
  if t.expires_at <= now() then
    update public.news_channel_transfers
    set status = 'expired', updated_at = now()
    where id = t.id;
    raise exception 'This transfer has expired.';
  end if;

  select owner_id into v_owner
  from public.news_channels
  where id = t.channel_id
  for update;

  if v_owner is null then
    raise exception 'Channel not found.';
  end if;
  if v_owner <> t.from_owner then
    raise exception 'The channel owner changed before this transfer was accepted.';
  end if;

  -- Previous owner keeps editor access; channel identity and subscribers do not move.
  update public.news_channel_members
  set role = 'editor'
  where channel_id = t.channel_id
    and user_id = t.from_owner
    and role = 'owner';

  -- Repair any stale owner membership before promoting the recipient.
  delete from public.news_channel_members
  where channel_id = t.channel_id
    and role = 'owner'
    and user_id <> t.to_user;

  insert into public.news_channel_members (channel_id, user_id, role)
  values (t.channel_id, t.to_user, 'owner')
  on conflict (channel_id, user_id) do update set role = 'owner';

  update public.news_channels
  set owner_id = t.to_user, updated_at = now()
  where id = t.channel_id;

  update public.news_channel_transfers
  set status = 'accepted', accepted_at = now(), updated_at = now()
  where id = t.id;

  update public.news_channel_transfers
  set status = 'cancelled', updated_at = now()
  where channel_id = t.channel_id
    and status = 'pending'
    and id <> t.id;

  insert into public.news_audit_log (channel_id, actor_id, action, metadata)
  values (
    t.channel_id,
    auth.uid(),
    'transfer.accepted',
    jsonb_build_object('transfer', t.id, 'from', t.from_owner, 'to', t.to_user)
  );
  return t.channel_id;
end;
$$;

create or replace function public.news_decline_channel_transfer(p_transfer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.news_channel_transfers%rowtype;
begin
  select * into t
  from public.news_channel_transfers
  where id = p_transfer_id
  for update;

  if not found then
    raise exception 'Transfer not found.';
  end if;
  if t.to_user <> auth.uid() then
    raise exception 'This transfer belongs to another account.';
  end if;
  if t.status <> 'pending' then
    raise exception 'This transfer is no longer pending.';
  end if;

  update public.news_channel_transfers
  set status = 'declined', updated_at = now()
  where id = t.id;

  insert into public.news_audit_log (channel_id, actor_id, action, metadata)
  values (
    t.channel_id,
    auth.uid(),
    'transfer.declined',
    jsonb_build_object('transfer', t.id, 'from', t.from_owner)
  );
  return t.channel_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 8. Cursor feed and search RPCs
-- ----------------------------------------------------------------------------

-- Keyset-paginated article feed. Pass the previous row's published_at + id as
-- (p_before, p_before_id). Index news_articles_published_cursor_idx serves it.
create or replace function public.news_article_feed(
  p_scope text default 'foryou',
  p_category text default null,
  p_region text default null,
  p_urgent_only boolean default false,
  p_before timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 20
)
returns setof public.news_articles
language sql
stable
security invoker
set search_path = public
as $$
  select a.*
  from public.news_articles a
  join public.news_channels c on c.id = a.channel_id
  where a.status = 'published'
    and c.archived_at is null
    and (p_category is null or a.category = p_category)
    and (not p_urgent_only or a.urgent)
    and (
      p_scope <> 'following'
      or exists (
        select 1
        from public.news_subscriptions s
        where s.channel_id = a.channel_id
          and s.subscriber_id = auth.uid()
      )
    )
    and (
      p_scope <> 'local'
      or p_region is null
      or a.region = p_region
    )
    and (
      p_before is null
      or a.published_at < p_before
      or (p_before_id is not null and a.published_at = p_before and a.id < p_before_id)
    )
  order by a.published_at desc, a.id desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

create or replace function public.news_search_articles(
  p_query text,
  p_category text default null,
  p_before timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 20
)
returns setof public.news_articles
language sql
stable
security invoker
set search_path = public
as $$
  select a.*
  from public.news_articles a
  join public.news_channels c on c.id = a.channel_id
  where a.status = 'published'
    and c.archived_at is null
    and (p_category is null or a.category = p_category)
    and (
      coalesce(btrim(p_query), '') = ''
      or a.search_vector @@ websearch_to_tsquery('simple', coalesce(p_query, ''))
      or a.title ilike '%' || p_query || '%'
      or a.summary ilike '%' || p_query || '%'
    )
    and (
      p_before is null
      or a.published_at < p_before
      or (p_before_id is not null and a.published_at = p_before and a.id < p_before_id)
    )
  order by a.published_at desc, a.id desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

create or replace function public.news_search_channels(
  p_query text,
  p_limit integer default 30
)
returns setof public.news_channels
language sql
stable
security invoker
set search_path = public
as $$
  select c.*
  from public.news_channels c
  where c.archived_at is null
    and (
      coalesce(btrim(p_query), '') = ''
      or c.search_vector @@ websearch_to_tsquery('simple', coalesce(p_query, ''))
      or c.name ilike '%' || p_query || '%'
      or c.handle ilike '%' || p_query || '%'
      or c.description ilike '%' || p_query || '%'
    )
  order by c.verified desc, c.subscriber_count desc, c.created_at desc
  limit greatest(1, least(coalesce(p_limit, 30), 60));
$$;

-- ----------------------------------------------------------------------------
-- 9. Triggers
-- ----------------------------------------------------------------------------

drop trigger if exists news_channels_search on public.news_channels;
create trigger news_channels_search
  before insert or update on public.news_channels
  for each row execute function public.news_channel_search_vector();

drop trigger if exists news_channels_touch on public.news_channels;
create trigger news_channels_touch
  before update on public.news_channels
  for each row execute function public.news_touch_updated_at();

drop trigger if exists news_channels_after_insert on public.news_channels;
create trigger news_channels_after_insert
  after insert on public.news_channels
  for each row execute function public.news_after_channel_insert();

drop trigger if exists news_channels_owner_audit on public.news_channels;
create trigger news_channels_owner_audit
  after update of owner_id on public.news_channels
  for each row execute function public.news_audit_owner_change();

drop trigger if exists news_articles_lifecycle on public.news_articles;
create trigger news_articles_lifecycle
  before insert or update on public.news_articles
  for each row execute function public.news_article_lifecycle();

drop trigger if exists news_articles_follow_up_guard on public.news_articles;
create trigger news_articles_follow_up_guard
  before insert or update on public.news_articles
  for each row execute function public.news_article_follow_up_guard();

drop trigger if exists news_articles_search on public.news_articles;
create trigger news_articles_search
  before insert or update on public.news_articles
  for each row execute function public.news_article_search_vector();

drop trigger if exists news_articles_touch on public.news_articles;
create trigger news_articles_touch
  before update on public.news_articles
  for each row execute function public.news_touch_updated_at();

drop trigger if exists news_flashes_lifecycle on public.news_flashes;
create trigger news_flashes_lifecycle
  before insert or update on public.news_flashes
  for each row execute function public.news_flash_lifecycle();

drop trigger if exists news_flashes_require_video on public.news_flashes;
create trigger news_flashes_require_video
  before insert or update on public.news_flashes
  for each row execute function public.news_flash_require_video();

drop trigger if exists news_flashes_search on public.news_flashes;
create trigger news_flashes_search
  before insert or update on public.news_flashes
  for each row execute function public.news_flash_search_vector();

drop trigger if exists news_flashes_touch on public.news_flashes;
create trigger news_flashes_touch
  before update on public.news_flashes
  for each row execute function public.news_touch_updated_at();

drop trigger if exists news_shorts_lifecycle on public.news_shorts;
create trigger news_shorts_lifecycle
  before insert or update on public.news_shorts
  for each row execute function public.news_short_lifecycle();

drop trigger if exists news_shorts_touch on public.news_shorts;
create trigger news_shorts_touch
  before update on public.news_shorts
  for each row execute function public.news_touch_updated_at();

drop trigger if exists news_preferences_touch on public.news_preferences;
create trigger news_preferences_touch
  before update on public.news_preferences
  for each row execute function public.news_touch_updated_at();

drop trigger if exists news_verifications_touch on public.news_channel_verifications;
create trigger news_verifications_touch
  before update on public.news_channel_verifications
  for each row execute function public.news_touch_updated_at();

drop trigger if exists news_verifications_apply on public.news_channel_verifications;
create trigger news_verifications_apply
  after insert or update on public.news_channel_verifications
  for each row execute function public.news_apply_verification();

drop trigger if exists news_transfers_touch on public.news_channel_transfers;
create trigger news_transfers_touch
  before update on public.news_channel_transfers
  for each row execute function public.news_touch_updated_at();

drop trigger if exists news_subscriptions_count on public.news_subscriptions;
create trigger news_subscriptions_count
  after insert or delete on public.news_subscriptions
  for each row execute function public.news_sync_subscriber_count();

-- ----------------------------------------------------------------------------
-- 10. Row level security
-- ----------------------------------------------------------------------------

alter table public.news_channels                enable row level security;
alter table public.news_channel_members         enable row level security;
alter table public.news_subscriptions           enable row level security;
alter table public.news_media                   enable row level security;
alter table public.news_flashes                 enable row level security;
alter table public.news_articles                enable row level security;
alter table public.news_article_blocks          enable row level security;
alter table public.news_shorts                  enable row level security;
alter table public.news_preferences             enable row level security;
alter table public.news_channel_verifications   enable row level security;
alter table public.news_channel_transfers       enable row level security;
alter table public.news_audit_log               enable row level security;
alter table public.news_admins                  enable row level security;

-- Channels --------------------------------------------------------------

drop policy if exists "news_channels_read" on public.news_channels;
create policy "news_channels_read"
  on public.news_channels for select to authenticated
  using (archived_at is null or owner_id = auth.uid() or public.news_is_admin());

drop policy if exists "news_channels_insert" on public.news_channels;
create policy "news_channels_insert"
  on public.news_channels for insert to authenticated
  with check (
    owner_id = auth.uid()
    and not verified
    and trust_level = 'standard'
    and archived_at is null
  );

drop policy if exists "news_channels_update" on public.news_channels;
create policy "news_channels_update"
  on public.news_channels for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "news_channels_delete" on public.news_channels;
create policy "news_channels_delete"
  on public.news_channels for delete to authenticated
  using (owner_id = auth.uid());

-- Studio members --------------------------------------------------------

drop policy if exists "news_channel_members_read" on public.news_channel_members;
create policy "news_channel_members_read"
  on public.news_channel_members for select to authenticated
  using (
    user_id = auth.uid()
    or public.news_is_channel_member(channel_id, array['owner'])
    or public.news_is_admin()
  );

drop policy if exists "news_channel_members_insert" on public.news_channel_members;
create policy "news_channel_members_insert"
  on public.news_channel_members for insert to authenticated
  with check (
    public.news_is_admin()
    or (
      public.news_is_channel_member(channel_id, array['owner'])
      and role <> 'owner'
    )
  );

drop policy if exists "news_channel_members_update" on public.news_channel_members;
create policy "news_channel_members_update"
  on public.news_channel_members for update to authenticated
  using (
    public.news_is_admin()
    or (
      public.news_is_channel_member(channel_id, array['owner'])
      and role <> 'owner'
    )
  )
  with check (
    public.news_is_admin()
    or (
      public.news_is_channel_member(channel_id, array['owner'])
      and role <> 'owner'
    )
  );

drop policy if exists "news_channel_members_delete" on public.news_channel_members;
create policy "news_channel_members_delete"
  on public.news_channel_members for delete to authenticated
  using (
    public.news_is_admin()
    or (
      public.news_is_channel_member(channel_id, array['owner'])
      and role <> 'owner'
    )
  );

-- Personal subscriptions ------------------------------------------------

drop policy if exists "news_subscriptions_read_own" on public.news_subscriptions;
create policy "news_subscriptions_read_own"
  on public.news_subscriptions for select to authenticated
  using (subscriber_id = auth.uid() or public.news_is_admin());

drop policy if exists "news_subscriptions_insert_own" on public.news_subscriptions;
create policy "news_subscriptions_insert_own"
  on public.news_subscriptions for insert to authenticated
  with check (
    subscriber_id = auth.uid()
    and exists (
      select 1 from public.news_channels c
      where c.id = channel_id and c.archived_at is null
    )
  );

drop policy if exists "news_subscriptions_delete_own" on public.news_subscriptions;
create policy "news_subscriptions_delete_own"
  on public.news_subscriptions for delete to authenticated
  using (subscriber_id = auth.uid() or public.news_is_admin());

-- Media -----------------------------------------------------------------

drop policy if exists "news_media_read" on public.news_media;
create policy "news_media_read"
  on public.news_media for select to authenticated
  using (
    public.news_is_channel_member(channel_id)
    or public.news_is_admin()
    or exists (
      select 1 from public.news_channels c
      where c.id = channel_id and c.archived_at is null
    )
  );

drop policy if exists "news_media_insert" on public.news_media;
create policy "news_media_insert"
  on public.news_media for insert to authenticated
  with check (
    owner_id = auth.uid()
    and public.news_can_edit_channel(channel_id)
  );

drop policy if exists "news_media_update" on public.news_media;
create policy "news_media_update"
  on public.news_media for update to authenticated
  using (public.news_can_edit_channel(channel_id) or public.news_is_admin())
  with check (public.news_can_edit_channel(channel_id) or public.news_is_admin());

drop policy if exists "news_media_delete" on public.news_media;
create policy "news_media_delete"
  on public.news_media for delete to authenticated
  using (public.news_can_edit_channel(channel_id) or public.news_is_admin());

-- Articles and blocks ---------------------------------------------------

drop policy if exists "news_articles_read" on public.news_articles;
create policy "news_articles_read"
  on public.news_articles for select to authenticated
  using (
    (
      status = 'published'
      and exists (
        select 1 from public.news_channels c
        where c.id = channel_id and c.archived_at is null
      )
    )
    or public.news_can_edit_channel(channel_id)
    or public.news_is_admin()
  );

drop policy if exists "news_articles_insert" on public.news_articles;
create policy "news_articles_insert"
  on public.news_articles for insert to authenticated
  with check (
    author_id = auth.uid()
    and status in ('draft', 'review', 'published')
    and public.news_can_edit_channel(channel_id)
  );

drop policy if exists "news_articles_update" on public.news_articles;
create policy "news_articles_update"
  on public.news_articles for update to authenticated
  using (public.news_can_edit_channel(channel_id) or public.news_is_admin())
  with check (public.news_can_edit_channel(channel_id) or public.news_is_admin());

drop policy if exists "news_articles_delete" on public.news_articles;
create policy "news_articles_delete"
  on public.news_articles for delete to authenticated
  using (public.news_can_edit_channel(channel_id) or public.news_is_admin());

drop policy if exists "news_article_blocks_read" on public.news_article_blocks;
create policy "news_article_blocks_read"
  on public.news_article_blocks for select to authenticated
  using (
    exists (
      select 1 from public.news_articles a
      where a.id = article_id
    )
  );

drop policy if exists "news_article_blocks_write" on public.news_article_blocks;
create policy "news_article_blocks_write"
  on public.news_article_blocks for insert to authenticated
  with check (
    exists (
      select 1 from public.news_articles a
      where a.id = article_id
        and (public.news_can_edit_channel(a.channel_id) or public.news_is_admin())
    )
  );

drop policy if exists "news_article_blocks_update" on public.news_article_blocks;
create policy "news_article_blocks_update"
  on public.news_article_blocks for update to authenticated
  using (
    exists (
      select 1 from public.news_articles a
      where a.id = article_id
        and (public.news_can_edit_channel(a.channel_id) or public.news_is_admin())
    )
  )
  with check (
    exists (
      select 1 from public.news_articles a
      where a.id = article_id
        and (public.news_can_edit_channel(a.channel_id) or public.news_is_admin())
    )
  );

drop policy if exists "news_article_blocks_delete" on public.news_article_blocks;
create policy "news_article_blocks_delete"
  on public.news_article_blocks for delete to authenticated
  using (
    exists (
      select 1 from public.news_articles a
      where a.id = article_id
        and (public.news_can_edit_channel(a.channel_id) or public.news_is_admin())
    )
  );

-- Flash -----------------------------------------------------------------

drop policy if exists "news_flashes_read" on public.news_flashes;
create policy "news_flashes_read"
  on public.news_flashes for select to authenticated
  using (
    (
      status in ('published', 'archived')
      and exists (
        select 1 from public.news_channels c
        where c.id = channel_id and c.archived_at is null
      )
    )
    or public.news_can_edit_channel(channel_id)
    or public.news_is_admin()
  );

drop policy if exists "news_flashes_insert" on public.news_flashes;
create policy "news_flashes_insert"
  on public.news_flashes for insert to authenticated
  with check (
    author_id = auth.uid()
    and status in ('draft', 'published')
    and public.news_can_edit_channel(channel_id)
  );

drop policy if exists "news_flashes_update" on public.news_flashes;
create policy "news_flashes_update"
  on public.news_flashes for update to authenticated
  using (public.news_can_edit_channel(channel_id) or public.news_is_admin())
  with check (public.news_can_edit_channel(channel_id) or public.news_is_admin());

drop policy if exists "news_flashes_delete" on public.news_flashes;
create policy "news_flashes_delete"
  on public.news_flashes for delete to authenticated
  using (public.news_can_edit_channel(channel_id) or public.news_is_admin());

-- Shorts ----------------------------------------------------------------

drop policy if exists "news_shorts_read" on public.news_shorts;
create policy "news_shorts_read"
  on public.news_shorts for select to authenticated
  using (
    (
      status = 'published'
      and exists (
        select 1 from public.news_channels c
        where c.id = channel_id and c.archived_at is null
      )
    )
    or public.news_can_edit_channel(channel_id)
    or public.news_is_admin()
  );

drop policy if exists "news_shorts_insert" on public.news_shorts;
create policy "news_shorts_insert"
  on public.news_shorts for insert to authenticated
  with check (
    author_id = auth.uid()
    and status in ('draft', 'published')
    and public.news_can_edit_channel(channel_id)
  );

drop policy if exists "news_shorts_update" on public.news_shorts;
create policy "news_shorts_update"
  on public.news_shorts for update to authenticated
  using (public.news_can_edit_channel(channel_id) or public.news_is_admin())
  with check (public.news_can_edit_channel(channel_id) or public.news_is_admin());

drop policy if exists "news_shorts_delete" on public.news_shorts;
create policy "news_shorts_delete"
  on public.news_shorts for delete to authenticated
  using (public.news_can_edit_channel(channel_id) or public.news_is_admin());

-- Preferences -----------------------------------------------------------

drop policy if exists "news_preferences_read_own" on public.news_preferences;
create policy "news_preferences_read_own"
  on public.news_preferences for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "news_preferences_insert_own" on public.news_preferences;
create policy "news_preferences_insert_own"
  on public.news_preferences for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "news_preferences_update_own" on public.news_preferences;
create policy "news_preferences_update_own"
  on public.news_preferences for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "news_preferences_delete_own" on public.news_preferences;
create policy "news_preferences_delete_own"
  on public.news_preferences for delete to authenticated
  using (user_id = auth.uid());

-- Verification ----------------------------------------------------------

drop policy if exists "news_verifications_read" on public.news_channel_verifications;
create policy "news_verifications_read"
  on public.news_channel_verifications for select to authenticated
  using (
    public.news_is_channel_member(channel_id)
    or public.news_is_admin()
  );

drop policy if exists "news_verifications_request" on public.news_channel_verifications;
create policy "news_verifications_request"
  on public.news_channel_verifications for insert to authenticated
  with check (
    requested_by = auth.uid()
    and status = 'pending'
    and reviewer_id is null
    and public.news_is_channel_member(channel_id, array['owner'])
  );

drop policy if exists "news_verifications_review" on public.news_channel_verifications;
create policy "news_verifications_review"
  on public.news_channel_verifications for update to authenticated
  using (public.news_is_admin())
  with check (public.news_is_admin());

drop policy if exists "news_verifications_delete" on public.news_channel_verifications;
create policy "news_verifications_delete"
  on public.news_channel_verifications for delete to authenticated
  using (public.news_is_admin());

-- Transfers are RPC-only ------------------------------------------------

drop policy if exists "news_transfers_read" on public.news_channel_transfers;
create policy "news_transfers_read"
  on public.news_channel_transfers for select to authenticated
  using (
    from_owner = auth.uid()
    or to_user = auth.uid()
    or public.news_is_admin()
  );

-- Audit and admins ------------------------------------------------------

drop policy if exists "news_audit_read" on public.news_audit_log;
create policy "news_audit_read"
  on public.news_audit_log for select to authenticated
  using (
    public.news_is_admin()
    or (channel_id is not null and public.news_is_channel_member(channel_id))
  );

drop policy if exists "news_admins_read_self" on public.news_admins;
create policy "news_admins_read_self"
  on public.news_admins for select to authenticated
  using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 11. Privileges
-- ----------------------------------------------------------------------------

grant select, insert, delete on public.news_channels to authenticated;
-- Strip the default table-wide UPDATE before granting only safe columns.
-- Subscriber counts, verification, search and ownership are server-managed.
revoke update on table public.news_channels from authenticated;
revoke update on table public.news_channels from anon;
grant update (
  name, handle, description, category, avatar_url, cover_url,
  locale, region, archived_at
) on public.news_channels to authenticated;

grant select, insert, update, delete on public.news_channel_members to authenticated;
grant select, insert, delete on public.news_subscriptions to authenticated;
grant select, insert, update, delete on public.news_media to authenticated;
grant select, insert, update, delete on public.news_flashes to authenticated;
grant select, insert, update, delete on public.news_articles to authenticated;
grant select, insert, update, delete on public.news_article_blocks to authenticated;
grant select, insert, update, delete on public.news_shorts to authenticated;
grant select, insert, update, delete on public.news_preferences to authenticated;
grant select, insert, update, delete on public.news_channel_verifications to authenticated;

-- Transfers and audit entries are written by definer RPCs/triggers only.
revoke all on table public.news_channel_transfers from authenticated, anon;
grant select on public.news_channel_transfers to authenticated;
revoke all on table public.news_audit_log from authenticated, anon;
grant select on public.news_audit_log to authenticated;
revoke all on table public.news_admins from authenticated, anon;

grant execute on function public.news_is_channel_member(uuid, text[]) to authenticated;
grant execute on function public.news_can_edit_channel(uuid) to authenticated;
grant execute on function public.news_is_admin() to authenticated;
grant execute on function public.news_channel_owner(uuid) to authenticated;
grant execute on function public.news_channel_owners(uuid[]) to authenticated;

grant execute on function public.news_article_feed(text, text, text, boolean, timestamptz, uuid, integer) to authenticated;
grant execute on function public.news_search_articles(text, text, timestamptz, uuid, integer) to authenticated;
grant execute on function public.news_search_channels(text, integer) to authenticated;

grant execute on function public.news_request_channel_transfer(uuid, uuid, text) to authenticated;
grant execute on function public.news_accept_channel_transfer(uuid) to authenticated;
grant execute on function public.news_decline_channel_transfer(uuid) to authenticated;

grant execute on function public.news_archive_expired_flashes() to service_role;

-- ----------------------------------------------------------------------------
-- 12. Storage: public news-media bucket, channel-scoped uploads
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'news-media',
  'news-media',
  true,
  104857600,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "news_media_storage_public_read" on storage.objects;
create policy "news_media_storage_public_read"
  on storage.objects for select
  using (bucket_id = 'news-media');

drop policy if exists "news_media_storage_channel_insert" on storage.objects;
create policy "news_media_storage_channel_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'news-media'
    and (storage.foldername(name))[1] = 'news'
    and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (
      public.news_is_admin()
      or public.news_is_channel_member(
        ((storage.foldername(name))[2])::uuid,
        array['owner', 'editor', 'producer']
      )
    )
  );

drop policy if exists "news_media_storage_channel_update" on storage.objects;
create policy "news_media_storage_channel_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'news-media'
    and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (
      public.news_is_admin()
      or public.news_is_channel_member(
        ((storage.foldername(name))[2])::uuid,
        array['owner', 'editor', 'producer']
      )
    )
  )
  with check (
    bucket_id = 'news-media'
    and (storage.foldername(name))[1] = 'news'
    and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (
      public.news_is_admin()
      or public.news_is_channel_member(
        ((storage.foldername(name))[2])::uuid,
        array['owner', 'editor', 'producer']
      )
    )
  );

drop policy if exists "news_media_storage_channel_delete" on storage.objects;
create policy "news_media_storage_channel_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'news-media'
    and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (
      public.news_is_admin()
      or public.news_is_channel_member(
        ((storage.foldername(name))[2])::uuid,
        array['owner', 'editor', 'producer']
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 13. Realtime and schema-cache refresh
-- ----------------------------------------------------------------------------

do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['news_flashes', 'news_channel_transfers'] loop
      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end
$$;

notify pgrst, 'reload schema';








