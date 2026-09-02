-- ---------------------------------------------------------------------------
-- Running the scheduled notification rules, once a minute.
--
-- The companion to notify-every-minute.sql, and much simpler than it, because
-- this one never leaves the database.
--
--   * No URL. Nothing to mistype, nothing to redirect.
--   * No secret. Nothing to rotate, nothing to leak in a screenshot.
--   * No HTTP. No middleware in the way, no 200 that is really a login page.
--
-- Deciding *what to notify about* is a question about rows, and it is answered
-- in SQL. Only the sending needs the app, because signing a web push requires
-- Node's crypto — that is what the other file is for.
--
-- There is nothing to fill in. Paste the whole file into the SQL editor and
-- run it.
--
-- Requires pg_cron, which is already enabled if the dispatcher is running.
-- ---------------------------------------------------------------------------

-- Safe to re-run: unschedules the job first, so running this twice replaces
-- the schedule instead of leaving two jobs firing the rules in parallel.
do $$
begin
  perform cron.unschedule('kap-klimber-scheduled-rules');
exception
  when others then null;  -- Not scheduled yet. Nothing to remove.
end $$;

select cron.schedule(
  'kap-klimber-scheduled-rules',
  '* * * * *',
  $job$ select public.run_scheduled_notifications() $job$
);

-- ---------------------------------------------------------------------------
-- Did it work?
-- ---------------------------------------------------------------------------

-- The job should appear, active, running every minute.
select jobname, schedule, active
from cron.job
where jobname = 'kap-klimber-scheduled-rules';

-- And you can always run the rules by hand to see what they would do. It is
-- safe at any moment: every rule is deduped per occurrence, so calling this
-- fifty times in a row produces the same notifications as calling it once.
--
--   select public.run_scheduled_notifications();
--
-- It answers with the app's own wall clock, whether the 07:30–08:30 morning
-- window is currently open, and how many notifications it created:
--
--   {"at": "2026-09-02T08:16:49", "morning_window": true, "created": 3}
--
-- A minute later, the same call on the same data returns "created": 0. If it
-- does not, something is wrong with the dedupe keys and the team is about to
-- be notified about the same thing sixty times an hour.
