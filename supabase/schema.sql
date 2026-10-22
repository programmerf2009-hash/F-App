-- ============================================================================
-- F App — Supabase schema
-- ----------------------------------------------------------------------------
-- Run this ONCE in Supabase Dashboard → SQL Editor → New query → Run.
-- It is written to be safe to re-run in most cases.
--
-- Creates:
--   • profiles, friendships, posts, stories
--   • row level security (public card ≠ private profile)
--   • search / profile / friends / request RPCs
--   • storage buckets: avatars (public), media (private)
--   • realtime for friend requests
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------

create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  nickname      text not null unique,
  first_name    text not null,
  last_name     text not null,
  age           integer not null check (age between 1 and 120),
  gender        text not null check (gender in ('male', 'female', 'other')),
  avatar_path   text,
  bio           text not null default '' check (char_length(bio) <= 160),
  profession    text not null default '' check (char_length(profession) <= 60),
  song_path     text,
  song_name     text check (song_name is null or char_length(song_name) <= 80),
  song_type     text,
  song_size     bigint,
  song_duration numeric(10, 3),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint profiles_nickname_format check (
    nickname = lower(nickname)
    and nickname ~ '^[a-z0-9._]{5,24}$'
  ),
  constraint profiles_first_name_length check (char_length(trim(first_name)) between 2 and 40),
  constraint profiles_last_name_length check (char_length(trim(last_name)) between 2 and 40)
);

create table if not exists public.friendships (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  constraint friendships_not_self check (requester_id <> addressee_id)
);

-- One relationship per pair, in either direction.
create unique index if not exists friendships_pair_unique
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

create index if not exists friendships_addressee_pending_idx
  on public.friendships (addressee_id, status, created_at desc);

create index if not exists friendships_requester_idx
  on public.friendships (requester_id, status);

create table if not exists public.posts (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles (id) on delete cascade,
  kind         text not null check (kind in ('photo', 'video')),
  media_path   text not null unique,
  poster_path  text,
  caption      text not null default '' check (char_length(caption) <= 140),
  visibility   text not null default 'friends' check (visibility in ('public', 'friends')),
  created_at   timestamptz not null default now()
);

create index if not exists posts_owner_created_idx
  on public.posts (owner_id, created_at desc);

create table if not exists public.stories (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles (id) on delete cascade,
  kind         text not null check (kind in ('photo', 'video')),
  media_path   text not null unique,
  poster_path  text,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '24 hours'),
  constraint stories_expiry_window check (
    expires_at > created_at
    and expires_at <= created_at + interval '24 hours'
  )
);

create index if not exists stories_owner_expires_idx
  on public.stories (owner_id, expires_at desc);

-- ----------------------------------------------------------------------------
-- 2. Functions
-- ----------------------------------------------------------------------------

create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.friendships f
    where f.status = 'accepted'
      and (
        (f.requester_id = a and f.addressee_id = b)
        or (f.requester_id = b and f.addressee_id = a)
      )
  );
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- New auth user → profile row. The app sends nickname / name / age / gender
-- inside raw_user_meta_data during signUp.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nickname, first_name, last_name, age, gender)
  values (
    new.id,
    lower(trim(new.raw_user_meta_data ->> 'nickname')),
    trim(new.raw_user_meta_data ->> 'first_name'),
    trim(new.raw_user_meta_data ->> 'last_name'),
    (new.raw_user_meta_data ->> 'age')::integer,
    coalesce(new.raw_user_meta_data ->> 'gender', 'other')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Used before sign-up so the UI can show "nickname taken" immediately.
create or replace function public.nickname_available(p_nickname text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.profiles
    where nickname = lower(trim(p_nickname))
  );
$$;

-- Search by nickname, first name, last name, or "first last".
-- Only the public card fields are returned.
create or replace function public.search_profiles(p_query text)
returns table (
  id            uuid,
  nickname      text,
  first_name    text,
  last_name     text,
  avatar_path   text,
  friend_count  bigint,
  relation      text,
  friendship_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  with viewer as (
    select auth.uid() as uid
  ),
  q as (
    select lower(trim(coalesce(p_query, ''))) as term
  )
  select
    p.id,
    p.nickname,
    p.first_name,
    p.last_name,
    p.avatar_path,
    (
      select count(*)
      from public.friendships f
      where f.status = 'accepted'
        and (f.requester_id = p.id or f.addressee_id = p.id)
    ) as friend_count,
    case
      when exists (
        select 1 from public.friendships f
        where f.status = 'accepted'
          and ((f.requester_id = v.uid and f.addressee_id = p.id)
            or (f.addressee_id = v.uid and f.requester_id = p.id))
      ) then 'friends'
      when exists (
        select 1 from public.friendships f
        where f.status = 'pending'
          and f.requester_id = v.uid and f.addressee_id = p.id
      ) then 'requested'
      when exists (
        select 1 from public.friendships f
        where f.status = 'pending'
          and f.requester_id = p.id and f.addressee_id = v.uid
      ) then 'incoming'
      else 'none'
    end as relation,
    (
      select f.id
      from public.friendships f
      where (f.requester_id = v.uid and f.addressee_id = p.id)
         or (f.addressee_id = v.uid and f.requester_id = p.id)
      limit 1
    ) as friendship_id
  from public.profiles p
  cross join viewer v
  cross join q
  where v.uid is not null
    and q.term <> ''
    and p.id <> v.uid
    and (
      p.nickname ilike '%' || q.term || '%'
      or p.first_name ilike '%' || q.term || '%'
      or p.last_name ilike '%' || q.term || '%'
      or (p.first_name || ' ' || p.last_name) ilike '%' || q.term || '%'
    )
  order by
    (p.nickname = q.term) desc,
    (p.nickname ilike q.term || '%') desc,
    p.first_name,
    p.last_name
  limit 30;
$$;

-- Full profile card. Private fields are null unless the viewer is the owner
-- or an accepted friend.
create or replace function public.get_profile(p_nickname text)
returns table (
  id              uuid,
  nickname        text,
  first_name      text,
  last_name       text,
  avatar_path     text,
  bio             text,
  profession      text,
  song_path       text,
  song_name       text,
  song_type       text,
  song_size       bigint,
  song_duration   numeric,
  created_at      timestamptz,
  friend_count    bigint,
  relation        text,
  friendship_id   uuid,
  private_visible boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with viewer as (
    select auth.uid() as uid
  ),
  target as (
    select *
    from public.profiles
    where nickname = lower(trim(p_nickname))
    limit 1
  )
  select
    t.id,
    t.nickname,
    t.first_name,
    t.last_name,
    t.avatar_path,
    case when coalesce(t.id = v.uid, false) or public.are_friends(v.uid, t.id)
      then t.bio else null end as bio,
    case when coalesce(t.id = v.uid, false) or public.are_friends(v.uid, t.id)
      then t.profession else null end as profession,
    case when coalesce(t.id = v.uid, false) or public.are_friends(v.uid, t.id)
      then t.song_path else null end as song_path,
    case when coalesce(t.id = v.uid, false) or public.are_friends(v.uid, t.id)
      then t.song_name else null end as song_name,
    case when coalesce(t.id = v.uid, false) or public.are_friends(v.uid, t.id)
      then t.song_type else null end as song_type,
    case when coalesce(t.id = v.uid, false) or public.are_friends(v.uid, t.id)
      then t.song_size else null end as song_size,
    case when coalesce(t.id = v.uid, false) or public.are_friends(v.uid, t.id)
      then t.song_duration else null end as song_duration,
    case when coalesce(t.id = v.uid, false) or public.are_friends(v.uid, t.id)
      then t.created_at else null end as created_at,
    (
      select count(*)
      from public.friendships f
      where f.status = 'accepted'
        and (f.requester_id = t.id or f.addressee_id = t.id)
    ) as friend_count,
    case
      when t.id = v.uid then 'self'
      when exists (
        select 1 from public.friendships f
        where f.status = 'accepted'
          and ((f.requester_id = v.uid and f.addressee_id = t.id)
            or (f.addressee_id = v.uid and f.requester_id = t.id))
      ) then 'friends'
      when exists (
        select 1 from public.friendships f
        where f.status = 'pending'
          and f.requester_id = v.uid and f.addressee_id = t.id
      ) then 'requested'
      when exists (
        select 1 from public.friendships f
        where f.status = 'pending'
          and f.requester_id = t.id and f.addressee_id = v.uid
      ) then 'incoming'
      else 'none'
    end as relation,
    (
      select f.id
      from public.friendships f
      where (f.requester_id = v.uid and f.addressee_id = t.id)
         or (f.addressee_id = v.uid and f.requester_id = t.id)
      limit 1
    ) as friendship_id,
    (coalesce(t.id = v.uid, false) or public.are_friends(v.uid, t.id)) as private_visible
  from target t
  cross join viewer v;
$$;

-- Friend list. Only the owner or an accepted friend may read it.
create or replace function public.list_friends(p_user_id uuid)
returns table (
  id          uuid,
  nickname    text,
  first_name  text,
  last_name   text,
  avatar_path text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.nickname,
    p.first_name,
    p.last_name,
    p.avatar_path
  from public.friendships f
  join public.profiles p
    on p.id = case
      when f.requester_id = p_user_id then f.addressee_id
      else f.requester_id
    end
  where f.status = 'accepted'
    and (f.requester_id = p_user_id or f.addressee_id = p_user_id)
    and (
      p_user_id = auth.uid()
      or public.are_friends(auth.uid(), p_user_id)
    )
  order by p.first_name, p.last_name;
$$;

-- Incoming pending requests for the signed-in user.
create or replace function public.list_friend_requests()
returns table (
  friendship_id uuid,
  profile_id    uuid,
  nickname      text,
  first_name    text,
  last_name     text,
  avatar_path   text,
  created_at    timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    f.id,
    p.id,
    p.nickname,
    p.first_name,
    p.last_name,
    p.avatar_path,
    f.created_at
  from public.friendships f
  join public.profiles p on p.id = f.requester_id
  where f.addressee_id = auth.uid()
    and f.status = 'pending'
  order by f.created_at desc;
$$;

create or replace function public.send_friend_request(p_target uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me        uuid := auth.uid();
  existing  public.friendships%rowtype;
  new_id    uuid;
begin
  if me is null then
    raise exception 'You are not signed in.';
  end if;
  if p_target is null then
    raise exception 'Account not found.';
  end if;
  if p_target = me then
    raise exception 'You cannot add yourself.';
  end if;
  if not exists (select 1 from public.profiles where id = p_target) then
    raise exception 'Account not found.';
  end if;

  select *
  into existing
  from public.friendships f
  where (f.requester_id = me and f.addressee_id = p_target)
     or (f.requester_id = p_target and f.addressee_id = me)
  limit 1;

  if found then
    if existing.status = 'accepted' then
      raise exception 'You are already friends.';
    elsif existing.requester_id = me then
      raise exception 'Request already sent.';
    else
      raise exception 'This person already sent you a request.';
    end if;
  end if;

  insert into public.friendships (requester_id, addressee_id)
  values (me, p_target)
  returning id into new_id;

  return new_id;
exception
  when unique_violation then
    raise exception 'Request already exists.';
end;
$$;

create or replace function public.accept_friend_request(p_request uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You are not signed in.';
  end if;

  update public.friendships
  set status = 'accepted', responded_at = now()
  where id = p_request
    and addressee_id = auth.uid()
    and status = 'pending';

  if not found then
    raise exception 'Request not found.';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. Grants
-- ----------------------------------------------------------------------------

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (
  first_name, last_name, age, gender, avatar_path, bio, profession,
  song_path, song_name, song_type, song_size, song_duration, updated_at
) on public.profiles to authenticated;

revoke all on public.friendships from anon, authenticated;
grant select, delete on public.friendships to authenticated;

revoke all on public.posts from anon, authenticated;
grant select, insert, delete on public.posts to authenticated;

revoke all on public.stories from anon, authenticated;
grant select, insert, delete on public.stories to authenticated;

revoke execute on function public.search_profiles(text) from public, anon;
revoke execute on function public.get_profile(text) from public, anon;
revoke execute on function public.list_friends(uuid) from public, anon;
revoke execute on function public.list_friend_requests() from public, anon;
revoke execute on function public.send_friend_request(uuid) from public, anon;
revoke execute on function public.accept_friend_request(uuid) from public, anon;
revoke execute on function public.are_friends(uuid, uuid) from public, anon;

grant execute on function public.search_profiles(text) to authenticated;
grant execute on function public.get_profile(text) to authenticated;
grant execute on function public.list_friends(uuid) to authenticated;
grant execute on function public.list_friend_requests() to authenticated;
grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.accept_friend_request(uuid) to authenticated;
grant execute on function public.are_friends(uuid, uuid) to authenticated;

grant execute on function public.nickname_available(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. Row level security
-- ----------------------------------------------------------------------------

alter table public.profiles    enable row level security;
alter table public.friendships enable row level security;
alter table public.posts       enable row level security;
alter table public.stories     enable row level security;

drop policy if exists "profiles_select_self_or_friends" on public.profiles;
create policy "profiles_select_self_or_friends"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.are_friends(auth.uid(), id));

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "friendships_select_own" on public.friendships;
create policy "friendships_select_own"
  on public.friendships for select to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

drop policy if exists "friendships_delete_own" on public.friendships;
create policy "friendships_delete_own"
  on public.friendships for delete to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

drop policy if exists "posts_select_visible" on public.posts;
create policy "posts_select_visible"
  on public.posts for select to authenticated
  using (
    owner_id = auth.uid()
    or visibility = 'public'
    or public.are_friends(auth.uid(), owner_id)
  );

drop policy if exists "posts_insert_own" on public.posts;
create policy "posts_insert_own"
  on public.posts for insert to authenticated
  with check (
    owner_id = auth.uid()
    and media_path like 'posts/' || auth.uid()::text || '/%'
  );

drop policy if exists "posts_delete_own" on public.posts;
create policy "posts_delete_own"
  on public.posts for delete to authenticated
  using (owner_id = auth.uid());

drop policy if exists "stories_select_visible" on public.stories;
create policy "stories_select_visible"
  on public.stories for select to authenticated
  using (
    owner_id = auth.uid()
    or (expires_at > now() and public.are_friends(auth.uid(), owner_id))
  );

drop policy if exists "stories_insert_own" on public.stories;
create policy "stories_insert_own"
  on public.stories for insert to authenticated
  with check (
    owner_id = auth.uid()
    and media_path like 'stories/' || auth.uid()::text || '/%'
    and expires_at > now()
    and expires_at <= created_at + interval '24 hours'
  );

drop policy if exists "stories_delete_own" on public.stories;
create policy "stories_delete_own"
  on public.stories for delete to authenticated
  using (owner_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 5. Storage
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('avatars', 'avatars', true, 5242880)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;

insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', false, 52428800)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "avatars_owner_insert" on storage.objects;
create policy "avatars_owner_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_owner_update" on storage.objects;
create policy "avatars_owner_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_owner_delete" on storage.objects;
create policy "avatars_owner_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "media_owner_insert" on storage.objects;
create policy "media_owner_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] in ('posts', 'stories', 'songs')
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "media_owner_delete" on storage.objects;
create policy "media_owner_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "media_visible_to_owner_friends_or_public" on storage.objects;
create policy "media_visible_to_owner_friends_or_public"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'media'
    and (
      (storage.foldername(name))[2] = auth.uid()::text
      or (
        (storage.foldername(name))[1] = 'songs'
        and (storage.foldername(name))[2] ~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and public.are_friends(auth.uid(), ((storage.foldername(name))[2])::uuid)
      )
      or exists (
        select 1
        from public.posts p
        where p.media_path = storage.objects.name
          and (
            p.owner_id = auth.uid()
            or p.visibility = 'public'
            or public.are_friends(auth.uid(), p.owner_id)
          )
      )
      or exists (
        select 1
        from public.stories s
        where s.media_path = storage.objects.name
          and s.expires_at > now()
          and public.are_friends(auth.uid(), s.owner_id)
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 6. Realtime for friend request badges
-- ----------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'friendships'
  ) then
    alter publication supabase_realtime add table public.friendships;
  end if;
end $$;

-- Refresh PostgREST's schema cache after the new tables/functions.
notify pgrst, 'reload schema';
