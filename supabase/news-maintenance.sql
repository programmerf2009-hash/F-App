-- ============================================================================
-- F News — maintenance fixes (run once in Supabase → SQL Editor)
-- ----------------------------------------------------------------------------
-- 1) Shorts comment counters: `news_shorts.comment_count` was defined but
--    nothing maintained it, so every Short showed 0 comments.
-- 2) Flash archival: expired Flashes were only hidden in the browser; the
--    table never changed status. pg_cron now archives them every 15 minutes.
--
-- Safe to re-run: functions are replaced, the trigger is recreated and the
-- cron job is unscheduled before being scheduled again.
-- ============================================================================

-- ---------------------------------------------------------------- comments
create or replace function public.news_refresh_short_comment_count(p_short_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.news_shorts s
     set comment_count = (
       select count(*)
         from public.news_comments c
        where c.target_type = 'short'
          and c.target_id = s.id
          and c.status = 'visible'
     )
   where s.id = p_short_id;
$$;

create or replace function public.news_comments_sync_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.target_type = 'short' then
    perform public.news_refresh_short_comment_count(old.target_id);
  end if;

  if tg_op in ('INSERT', 'UPDATE') and new.target_type = 'short' then
    perform public.news_refresh_short_comment_count(new.target_id);
  end if;

  return null;
end;
$$;

drop trigger if exists news_comments_sync_counts on public.news_comments;
create trigger news_comments_sync_counts
after insert or update of status, target_id, target_type or delete
on public.news_comments
for each row execute function public.news_comments_sync_counts();

-- Backfill every Short once so existing counters become truthful.
update public.news_shorts s
   set comment_count = coalesce(counted.total, 0)
  from (
    select target_id, count(*)::integer as total
      from public.news_comments
     where target_type = 'short'
       and status = 'visible'
     group by target_id
  ) counted
 where counted.target_id = s.id;

update public.news_shorts
   set comment_count = 0
 where comment_count <> 0
   and id not in (
     select target_id
       from public.news_comments
      where target_type = 'short'
        and status = 'visible'
   );

-- ------------------------------------------------------------------ flashes
-- pg_cron is available on Supabase projects (Database → Extensions).
create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'news-archive-expired-flashes') then
    perform cron.unschedule('news-archive-expired-flashes');
  end if;
end;
$$;

select cron.schedule(
  'news-archive-expired-flashes',
  '*/15 * * * *',
  $$select public.news_archive_expired_flashes();$$
);

-- Verify: select * from cron.job where jobname = 'news-archive-expired-flashes';
-- Verify: select id, title, comment_count from public.news_shorts order by created_at desc limit 5;
