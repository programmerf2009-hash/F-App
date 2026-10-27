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
-- Drop the earlier 7-argument signature before adding filter parameters, so
-- re-running this file cannot leave two overloaded RPCs with default arguments.
drop function if exists public.news_article_feed(
  text, text, text, boolean, timestamptz, uuid, integer
);

create or replace function public.news_article_feed(
  p_scope text default 'foryou',
  p_category text default null,
  p_region text default null,
  p_urgent_only boolean default false,
  p_before timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 20,
  p_categories text[] default null,
  p_since timestamptz default null
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
      p_categories is null
      or cardinality(p_categories) = 0
      or a.category = any (p_categories)
    )
    and (p_since is null or a.published_at >= p_since)
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
      or a.category = 'Local'
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
      or c.name ilike '%' || p_query || '%'
      or exists (
        select 1
        from unnest(a.tags) as article_tags(tag)
        where tag ilike '%' || p_query || '%'
      )
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

grant execute on function public.news_article_feed(text, text, text, boolean, timestamptz, uuid, integer, text[], timestamptz) to authenticated;
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

-- ----------------------------------------------------------------------------
-- 14. Engagement: daily views, saved stories and Short reactions
-- ----------------------------------------------------------------------------
-- View counters live on news_articles / news_flashes / news_shorts. This
-- section adds the per-reader ledger that makes those counters honest: one
-- counted view per signed-in reader per target per day. Saved stories and
-- Short likes/saves are personal rows, never channel rows.

create table if not exists public.news_views (
  user_id     uuid not null references auth.users (id) on delete cascade,
  target_type text not null,
  target_id   uuid not null,
  viewed_on   date not null default current_date,
  created_at  timestamptz not null default now(),
  primary key (user_id, target_type, target_id, viewed_on),
  constraint news_views_target_type
    check (target_type in ('article', 'flash', 'short'))
);

create index if not exists news_views_target_idx
  on public.news_views (target_type, target_id, viewed_on);

create table if not exists public.news_saved_articles (
  user_id    uuid not null references auth.users (id) on delete cascade,
  article_id uuid not null references public.news_articles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, article_id)
);

create index if not exists news_saved_articles_recent_idx
  on public.news_saved_articles (user_id, created_at desc);

create table if not exists public.news_short_reactions (
  user_id    uuid not null references auth.users (id) on delete cascade,
  short_id   uuid not null references public.news_shorts (id) on delete cascade,
  kind       text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, short_id, kind),
  constraint news_short_reactions_kind
    check (kind in ('like', 'save'))
);

create index if not exists news_short_reactions_target_idx
  on public.news_short_reactions (short_id, kind);

-- Count a view at most once per reader, target and day. Security definer so
-- the counter can be incremented without opening direct UPDATE to clients.
create or replace function public.news_register_view(
  p_target_type text,
  p_target_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rows bigint := 0;
  v_views bigint := 0;
begin
  if v_uid is null then
    return null;
  end if;

  if p_target_type is null or p_target_type not in ('article', 'flash', 'short') then
    raise exception 'Unknown view target' using errcode = '22023';
  end if;

  if p_target_type = 'article' then
    if not exists (
      select 1 from public.news_articles
      where id = p_target_id and status in ('published', 'archived')
    ) then
      return null;
    end if;
  elsif p_target_type = 'flash' then
    if not exists (
      select 1 from public.news_flashes
      where id = p_target_id and status in ('published', 'archived')
    ) then
      return null;
    end if;
  else
    if not exists (
      select 1 from public.news_shorts
      where id = p_target_id and status in ('published', 'archived')
    ) then
      return null;
    end if;
  end if;

  insert into public.news_views (user_id, target_type, target_id)
  values (v_uid, p_target_type, p_target_id)
  on conflict do nothing;

  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    if p_target_type = 'article' then
      select views into v_views from public.news_articles where id = p_target_id;
    elsif p_target_type = 'flash' then
      select views into v_views from public.news_flashes where id = p_target_id;
    else
      select views into v_views from public.news_shorts where id = p_target_id;
    end if;
    return coalesce(v_views, 0);
  end if;

  if p_target_type = 'article' then
    update public.news_articles
      set views = views + 1
      where id = p_target_id
      returning views into v_views;
  elsif p_target_type = 'flash' then
    update public.news_flashes
      set views = views + 1
      where id = p_target_id
      returning views into v_views;
  else
    update public.news_shorts
      set views = views + 1
      where id = p_target_id
      returning views into v_views;
  end if;

  return coalesce(v_views, 0);
end;
$$;

create or replace function public.news_toggle_saved_article(p_article_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rows bigint := 0;
begin
  if v_uid is null then
    raise exception 'Sign in to save a story' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.news_articles
    where id = p_article_id and status in ('published', 'archived')
  ) then
    raise exception 'Story not found' using errcode = 'P0002';
  end if;

  delete from public.news_saved_articles
  where user_id = v_uid and article_id = p_article_id;

  get diagnostics v_rows = row_count;

  if v_rows > 0 then
    return false;
  end if;

  insert into public.news_saved_articles (user_id, article_id)
  values (v_uid, p_article_id);

  return true;
end;
$$;

create or replace function public.news_toggle_short_reaction(
  p_short_id uuid,
  p_kind text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rows bigint := 0;
begin
  if v_uid is null then
    raise exception 'Sign in to react to a short' using errcode = '28000';
  end if;

  if p_kind is null or p_kind not in ('like', 'save') then
    raise exception 'Unknown reaction' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.news_shorts
    where id = p_short_id and status in ('published', 'archived')
  ) then
    raise exception 'Short not found' using errcode = 'P0002';
  end if;

  delete from public.news_short_reactions
  where user_id = v_uid and short_id = p_short_id and kind = p_kind;

  get diagnostics v_rows = row_count;

  if v_rows > 0 then
    return false;
  end if;

  insert into public.news_short_reactions (user_id, short_id, kind)
  values (v_uid, p_short_id, p_kind);

  return true;
end;
$$;

-- Keep news_shorts.like_count in step with personal reactions, including when
-- an account is deleted and its reactions cascade away.
create or replace function public.news_sync_short_like_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.kind = 'like' then
    update public.news_shorts
      set like_count = like_count + 1
      where id = new.short_id;
  elsif tg_op = 'DELETE' and old.kind = 'like' then
    update public.news_shorts
      set like_count = greatest(0, like_count - 1)
      where id = old.short_id;
  end if;

  return null;
end;
$$;

drop trigger if exists news_short_reactions_count on public.news_short_reactions;
create trigger news_short_reactions_count
  after insert or delete on public.news_short_reactions
  for each row execute function public.news_sync_short_like_count();

-- Row level security ------------------------------------------------------

alter table public.news_views           enable row level security;
alter table public.news_saved_articles  enable row level security;
alter table public.news_short_reactions enable row level security;

-- Views are written by the definer RPC only: no policies on purpose.
drop policy if exists "news_saved_articles_read_own" on public.news_saved_articles;
create policy "news_saved_articles_read_own"
  on public.news_saved_articles for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "news_saved_articles_insert_own" on public.news_saved_articles;
create policy "news_saved_articles_insert_own"
  on public.news_saved_articles for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "news_saved_articles_delete_own" on public.news_saved_articles;
create policy "news_saved_articles_delete_own"
  on public.news_saved_articles for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists "news_short_reactions_read_own" on public.news_short_reactions;
create policy "news_short_reactions_read_own"
  on public.news_short_reactions for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "news_short_reactions_insert_own" on public.news_short_reactions;
create policy "news_short_reactions_insert_own"
  on public.news_short_reactions for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "news_short_reactions_delete_own" on public.news_short_reactions;
create policy "news_short_reactions_delete_own"
  on public.news_short_reactions for delete to authenticated
  using (user_id = auth.uid());

-- Counters are server-owned. Strip table-wide UPDATE, then grant only the
-- editorial columns the app legitimately writes.
revoke update on table public.news_articles from authenticated, anon;
grant update (
  title, summary, category, region, tags, cover_url, cover_alt, urgent,
  status, follow_up_for_flash_id, read_minutes, published_at
) on public.news_articles to authenticated;

revoke update on table public.news_flashes from authenticated, anon;
revoke update on table public.news_shorts from authenticated, anon;

-- Privileges --------------------------------------------------------------

revoke all on table public.news_views from authenticated, anon;
revoke all on table public.news_saved_articles from authenticated, anon;
grant select, insert, delete on public.news_saved_articles to authenticated;

revoke all on table public.news_short_reactions from authenticated, anon;
grant select, insert, delete on public.news_short_reactions to authenticated;

revoke all on function public.news_register_view(text, uuid) from public, anon;
grant execute on function public.news_register_view(text, uuid) to authenticated;

revoke all on function public.news_toggle_saved_article(uuid) from public, anon;
grant execute on function public.news_toggle_saved_article(uuid) to authenticated;

revoke all on function public.news_toggle_short_reaction(uuid, text) from public, anon;
grant execute on function public.news_toggle_short_reaction(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 15. Comments and moderation
-- ----------------------------------------------------------------------------
-- Readers can discuss published articles, Flashes and Shorts. Comments are
-- written and read through definer RPCs only: public nickname/avatar cards are
-- exposed without opening the friend-only profiles table. Reports feed an
-- admin-only moderation queue.

create table if not exists public.news_comments (
  id          uuid primary key default gen_random_uuid(),
  target_type text not null,
  target_id   uuid not null,
  author_id   uuid not null references auth.users (id) on delete cascade,
  parent_id   uuid references public.news_comments (id) on delete cascade,
  body        text not null default '',
  status      text not null default 'visible',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint news_comments_target_type
    check (target_type in ('article', 'flash', 'short')),
  constraint news_comments_status
    check (status in ('visible', 'hidden', 'removed')),
  constraint news_comments_body_len
    check (char_length(body) <= 1000),
  constraint news_comments_body_required
    check (status = 'removed' or char_length(btrim(body)) between 1 and 1000)
);

create index if not exists news_comments_target_idx
  on public.news_comments (target_type, target_id, created_at desc);
create index if not exists news_comments_parent_idx
  on public.news_comments (parent_id, created_at);
create index if not exists news_comments_author_idx
  on public.news_comments (author_id, created_at desc);

create table if not exists public.news_reports (
  id                uuid primary key default gen_random_uuid(),
  reporter_id       uuid not null references auth.users (id) on delete cascade,
  target_type       text not null,
  target_id         uuid not null,
  reason            text not null,
  details           text not null default '',
  target_snapshot   text not null default '',
  target_author_id  uuid references auth.users (id) on delete set null,
  status            text not null default 'open',
  resolved_by       uuid references auth.users (id) on delete set null,
  resolution_note   text not null default '',
  resolved_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint news_reports_target_type
    check (target_type in ('article', 'flash', 'short', 'comment', 'channel')),
  constraint news_reports_reason
    check (reason in ('spam', 'abuse', 'misinformation', 'copyright', 'other')),
  constraint news_reports_status
    check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  constraint news_reports_details_len
    check (char_length(details) <= 500),
  constraint news_reports_note_len
    check (char_length(resolution_note) <= 500)
);

create unique index if not exists news_reports_one_open
  on public.news_reports (reporter_id, target_type, target_id)
  where status in ('open', 'reviewing');
create index if not exists news_reports_queue_idx
  on public.news_reports (status, created_at);
create index if not exists news_reports_target_idx
  on public.news_reports (target_type, target_id, created_at desc);

-- A target is commentable/reportable only while it is publicly readable.
create or replace function public.news_target_is_public(
  p_target_type text,
  p_target_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_target_type = 'article' then exists (
      select 1
      from public.news_articles a
      join public.news_channels c on c.id = a.channel_id
      where a.id = p_target_id
        and a.status = 'published'
        and c.archived_at is null
    )
    when p_target_type = 'flash' then exists (
      select 1
      from public.news_flashes f
      join public.news_channels c on c.id = f.channel_id
      where f.id = p_target_id
        and f.status in ('published', 'archived')
        and c.archived_at is null
    )
    when p_target_type = 'short' then exists (
      select 1
      from public.news_shorts s
      join public.news_channels c on c.id = s.channel_id
      where s.id = p_target_id
        and s.status in ('published', 'archived')
        and c.archived_at is null
    )
    else false
  end;
$$;

-- Flat thread for one target: newest roots first, oldest replies first. Only
-- nickname and avatar are exposed for other commenters.
create or replace function public.news_comment_thread(
  p_target_type text,
  p_target_id uuid,
  p_limit integer default 50
)
returns table (
  id          uuid,
  parent_id   uuid,
  body        text,
  status      text,
  created_at  timestamptz,
  author_id   uuid,
  nickname    text,
  avatar_path text,
  is_mine     boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
begin
  if auth.uid() is null then
    raise exception 'Sign in to read comments' using errcode = '28000';
  end if;

  if not public.news_target_is_public(p_target_type, p_target_id) then
    return;
  end if;

  return query
  with roots as (
    select c.id, c.created_at
    from public.news_comments c
    where c.target_type = p_target_type
      and c.target_id = p_target_id
      and c.parent_id is null
      and c.status in ('visible', 'removed')
    order by c.created_at desc
    limit v_limit
  ),
  thread as (
    select c.*
    from public.news_comments c
    join roots r on r.id = c.id
    union all
    select c.*
    from public.news_comments c
    join roots r on r.id = c.parent_id
    where c.status in ('visible', 'removed')
  )
  select
    t.id,
    t.parent_id,
    case when t.status = 'removed' then '' else t.body end,
    t.status,
    t.created_at,
    t.author_id,
    coalesce(p.nickname, 'F App user'),
    p.avatar_path,
    t.author_id = auth.uid()
  from thread t
  left join public.profiles p on p.id = t.author_id
  left join public.news_comments parent_comment on parent_comment.id = t.parent_id
  order by coalesce(parent_comment.created_at, t.created_at) desc, t.created_at asc;
end;
$$;

create or replace function public.news_add_comment(
  p_target_type text,
  p_target_id uuid,
  p_body text,
  p_parent_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_body   text := btrim(coalesce(p_body, ''));
  v_parent uuid := null;
  v_recent integer := 0;
  v_id     uuid;
begin
  if v_uid is null then
    raise exception 'Sign in to comment' using errcode = '28000';
  end if;

  if p_target_type is null or p_target_type not in ('article', 'flash', 'short') then
    raise exception 'Unknown comment target' using errcode = '22023';
  end if;

  if not public.news_target_is_public(p_target_type, p_target_id) then
    raise exception 'This story is not open for comments.' using errcode = 'P0002';
  end if;

  if char_length(v_body) < 1 or char_length(v_body) > 1000 then
    raise exception 'Comments must be 1 to 1000 characters.' using errcode = '22023';
  end if;

  select count(*) into v_recent
  from public.news_comments
  where author_id = v_uid
    and created_at > now() - interval '1 minute';

  if v_recent >= 6 then
    raise exception 'You are commenting too fast. Try again in a minute.' using errcode = '54000';
  end if;

  if p_parent_id is not null then
    -- Replies are one level deep: a reply to a reply joins the root thread.
    select coalesce(c.parent_id, c.id)
    into v_parent
    from public.news_comments c
    where c.id = p_parent_id
      and c.target_type = p_target_type
      and c.target_id = p_target_id
      and c.status = 'visible';

    if v_parent is null then
      raise exception 'The comment you replied to is no longer available.' using errcode = 'P0002';
    end if;
  end if;

  insert into public.news_comments (
    target_type, target_id, author_id, parent_id, body
  )
  values (
    p_target_type, p_target_id, v_uid, v_parent, v_body
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.news_delete_comment(p_comment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_author uuid;
  v_status text;
begin
  if v_uid is null then
    raise exception 'Sign in to delete a comment' using errcode = '28000';
  end if;

  select author_id, status
  into v_author, v_status
  from public.news_comments
  where id = p_comment_id;

  if not found then
    return false;
  end if;

  if v_author <> v_uid and not public.news_is_admin() then
    raise exception 'You can only delete your own comment.' using errcode = '42501';
  end if;

  if v_status = 'removed' then
    return true;
  end if;

  if exists (
    select 1 from public.news_comments
    where parent_id = p_comment_id and status = 'visible'
  ) then
    update public.news_comments
      set status = 'removed', body = '', updated_at = now()
      where id = p_comment_id;
  else
    delete from public.news_comments where id = p_comment_id;
  end if;

  return true;
end;
$$;

-- Validate a report, snapshot enough context for the moderation queue, and
-- make a repeat report from the same reader idempotent.
create or replace function public.news_report_content(
  p_target_type text,
  p_target_id uuid,
  p_reason text,
  p_details text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_details  text := btrim(coalesce(p_details, ''));
  v_snapshot text := '';
  v_author   uuid := null;
  v_existing uuid;
  v_recent   integer := 0;
  v_id       uuid;
begin
  if v_uid is null then
    raise exception 'Sign in to report content' using errcode = '28000';
  end if;

  if p_target_type is null or p_target_type not in ('article', 'flash', 'short', 'comment', 'channel') then
    raise exception 'Unknown report target' using errcode = '22023';
  end if;

  if p_reason is null or p_reason not in ('spam', 'abuse', 'misinformation', 'copyright', 'other') then
    raise exception 'Choose a report reason.' using errcode = '22023';
  end if;

  if char_length(v_details) > 500 then
    raise exception 'Report details must be 500 characters or fewer.' using errcode = '22023';
  end if;

  if p_target_type in ('article', 'flash', 'short') then
    if not public.news_target_is_public(p_target_type, p_target_id) then
      raise exception 'This content is not available to report.' using errcode = 'P0002';
    end if;
  elsif p_target_type = 'comment' then
    select left(c.body, 240), c.author_id
    into v_snapshot, v_author
    from public.news_comments c
    where c.id = p_target_id and c.status = 'visible';

    if v_snapshot is null then
      raise exception 'This comment is not available to report.' using errcode = 'P0002';
    end if;
  else
    select c.name, c.owner_id
    into v_snapshot, v_author
    from public.news_channels c
    where c.id = p_target_id and c.archived_at is null;

    if v_snapshot is null then
      raise exception 'This channel is not available to report.' using errcode = 'P0002';
    end if;
  end if;

  if p_target_type = 'article' then
    select left(a.title, 240), a.author_id
    into v_snapshot, v_author
    from public.news_articles a
    where a.id = p_target_id;
  elsif p_target_type = 'flash' then
    select left(f.title, 240), f.author_id
    into v_snapshot, v_author
    from public.news_flashes f
    where f.id = p_target_id;
  elsif p_target_type = 'short' then
    select left(s.caption, 240), s.author_id
    into v_snapshot, v_author
    from public.news_shorts s
    where s.id = p_target_id;
  end if;

  select id into v_existing
  from public.news_reports
  where reporter_id = v_uid
    and target_type = p_target_type
    and target_id = p_target_id
    and status in ('open', 'reviewing')
  limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  select count(*) into v_recent
  from public.news_reports
  where reporter_id = v_uid
    and created_at > now() - interval '1 day';

  if v_recent >= 20 then
    raise exception 'Too many reports today. Try again tomorrow.' using errcode = '54000';
  end if;

  insert into public.news_reports (
    reporter_id, target_type, target_id, reason, details,
    target_snapshot, target_author_id
  )
  values (
    v_uid, p_target_type, p_target_id, p_reason, v_details,
    coalesce(v_snapshot, ''), v_author
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.news_moderation_queue(
  p_status text default 'open'
)
returns table (
  id                     uuid,
  target_type            text,
  target_id              uuid,
  reason                 text,
  details                text,
  status                 text,
  created_at             timestamptz,
  resolved_at            timestamptz,
  target_snapshot        text,
  reporter_nickname      text,
  target_author_nickname text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_status text := coalesce(p_status, 'open');
begin
  if not public.news_is_admin() then
    raise exception 'Moderator access required.' using errcode = '42501';
  end if;

  if v_status not in ('open', 'reviewing', 'resolved', 'dismissed', 'all') then
    raise exception 'Unknown report status.' using errcode = '22023';
  end if;

  return query
  select
    r.id,
    r.target_type,
    r.target_id,
    r.reason,
    r.details,
    r.status,
    r.created_at,
    r.resolved_at,
    r.target_snapshot,
    coalesce(rep.nickname, 'F App user'),
    author.nickname
  from public.news_reports r
  left join public.profiles rep on rep.id = r.reporter_id
  left join public.profiles author on author.id = r.target_author_id
  where v_status = 'all' or r.status = v_status
  order by
    case when r.status in ('open', 'reviewing') then 0 else 1 end,
    r.created_at asc
  limit 100;
end;
$$;

create or replace function public.news_resolve_report(
  p_report_id uuid,
  p_status text,
  p_action text default 'none',
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid          uuid := auth.uid();
  v_target_type  text;
  v_target_id    uuid;
  v_reason       text;
  v_current      text;
  v_note         text := btrim(coalesce(p_note, ''));
  v_action       text := coalesce(p_action, 'none');
  v_audit_action text;
begin
  if not public.news_is_admin() then
    raise exception 'Moderator access required.' using errcode = '42501';
  end if;

  if p_status is null or p_status not in ('resolved', 'dismissed') then
    raise exception 'Close the report as resolved or dismissed.' using errcode = '22023';
  end if;

  if v_action not in ('none', 'hide', 'remove') then
    raise exception 'Unknown moderation action.' using errcode = '22023';
  end if;

  if char_length(v_note) > 500 then
    raise exception 'Moderation note must be 500 characters or fewer.' using errcode = '22023';
  end if;

  select target_type, target_id, reason, status
  into v_target_type, v_target_id, v_reason, v_current
  from public.news_reports
  where id = p_report_id;

  if not found then
    raise exception 'Report not found.' using errcode = 'P0002';
  end if;

  if v_current in ('resolved', 'dismissed') then
    return true;
  end if;

  if v_action <> 'none' then
    if v_target_type = 'comment' then
      if v_action = 'hide' then
        update public.news_comments
          set status = 'hidden', updated_at = now()
          where id = v_target_id and status <> 'removed';
      else
        update public.news_comments
          set status = 'removed', body = '', updated_at = now()
          where id = v_target_id;
      end if;
    elsif v_target_type = 'article' then
      update public.news_articles
        set status = 'archived', updated_at = now()
        where id = v_target_id and status <> 'removed';
    elsif v_target_type = 'flash' then
      update public.news_flashes
        set status = 'archived', updated_at = now()
        where id = v_target_id and status <> 'removed';
    elsif v_target_type = 'short' then
      update public.news_shorts
        set status = 'archived', updated_at = now()
        where id = v_target_id and status <> 'removed';
    elsif v_target_type = 'channel' then
      update public.news_channels
        set archived_at = coalesce(archived_at, now()), updated_at = now()
        where id = v_target_id;
    end if;
  end if;

  update public.news_reports
  set status = p_status,
      resolved_by = v_uid,
      resolution_note = left(v_note, 500),
      resolved_at = now(),
      updated_at = now()
  where id = p_report_id;

  v_audit_action := case
    when v_action = 'none' then 'moderation.report_closed'
    else 'moderation.content_' || v_action
  end;

  insert into public.news_audit_log (channel_id, actor_id, action, metadata)
  values (
    null,
    v_uid,
    v_audit_action,
    jsonb_build_object(
      'report_id', p_report_id,
      'target_type', v_target_type,
      'target_id', v_target_id,
      'reason', v_reason,
      'status', p_status,
      'action', v_action
    )
  );

  return true;
end;
$$;

-- Row level security ------------------------------------------------------

alter table public.news_comments enable row level security;
alter table public.news_reports  enable row level security;

-- No policies on purpose: reads and writes go through the definer RPCs above.
-- This keeps author identity cards limited to nickname/avatar and prevents a
-- reader from editing another reader's comment directly.

-- Privileges --------------------------------------------------------------

revoke all on table public.news_comments from authenticated, anon;
revoke all on table public.news_reports  from authenticated, anon;

revoke all on function public.news_target_is_public(text, uuid) from public, anon;
revoke all on function public.news_comment_thread(text, uuid, integer) from public, anon;
revoke all on function public.news_add_comment(text, uuid, text, uuid) from public, anon;
revoke all on function public.news_delete_comment(uuid) from public, anon;
revoke all on function public.news_report_content(text, uuid, text, text) from public, anon;
revoke all on function public.news_moderation_queue(text) from public, anon;
revoke all on function public.news_resolve_report(uuid, text, text, text) from public, anon;

grant execute on function public.news_comment_thread(text, uuid, integer) to authenticated;
grant execute on function public.news_add_comment(text, uuid, text, uuid) to authenticated;
grant execute on function public.news_delete_comment(uuid) to authenticated;
grant execute on function public.news_report_content(text, uuid, text, text) to authenticated;
grant execute on function public.news_moderation_queue(text) to authenticated;
grant execute on function public.news_resolve_report(uuid, text, text, text) to authenticated;

notify pgrst, 'reload schema';




