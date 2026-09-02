-- ---------------------------------------------------------------------------
-- Waking the dispatcher, once a minute.
--
-- NOT a migration, and deliberately not in supabase/migrations: it carries a
-- secret and a deployment URL, so it is filled in and run by hand rather than
-- committed with real values in it.
--
-- Why Supabase and not Vercel: Vercel's cron on the free plan runs once a day,
-- give or take an hour. A reminder set for 3pm has to fire at 3pm, so the
-- schedule lives here, where pg_cron runs every minute for nothing.
--
-- Before running this, enable both extensions under Database → Extensions:
--   pg_cron   the scheduler
--   pg_net    lets a scheduled job make an HTTP request
--
-- Then replace the two placeholders below and run the whole file.
--
--   <<APP_URL>>       https://your-production-alias.vercel.app  (no trailing /)
--   <<CRON_SECRET>>   the exact value saved as CRON_SECRET in Vercel
--
-- REPLACE THE ANGLE BRACKETS TOO. `<<APP_URL>>` is the whole placeholder, so
-- the line should end up reading
--
--   url := 'https://your-alias.vercel.app/api/cron/notify',
--
-- and not `'<<https://your-alias.vercel.app>>/api/cron/notify'`. A URL with
-- the markers still in it is not a URL, and the job then fails silently —
-- there is no request, so there is no response to look at and nothing that
-- looks like an error. The guard at the bottom of this file catches exactly
-- that and tells you.
--
-- A note on the secret: it is stored in plain text in the cron.job table, so
-- anyone with database access can read it. On a five-person project whose
-- database is already the source of truth that is an acceptable trade — the
-- secret only protects the dispatcher from being triggered by strangers, and
-- triggering it early does nothing but send notifications a minute sooner.
-- Move it into Supabase Vault if that stops being true.
-- ---------------------------------------------------------------------------

-- Safe to re-run: replaces the job rather than adding a second one that would
-- double every notification.
select cron.unschedule('kap-klimber-notify')
where exists (select 1 from cron.job where jobname = 'kap-klimber-notify');

select cron.schedule(
  'kap-klimber-notify',
  '* * * * *',
  $job$
    select net.http_post(
      url := '<<APP_URL>>/api/cron/notify',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', '<<CRON_SECRET>>'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 20000
    );
  $job$
);

-- ---------------------------------------------------------------------------
-- Did the placeholders actually get replaced?
-- ---------------------------------------------------------------------------

-- Checked here rather than left to be discovered later. A job carrying `<<`
-- fails in the quietest possible way: pg_cron reports a successful run,
-- because it successfully ran a statement that could not build a request, and
-- net._http_response stays empty — which looks identical to "the schedule is
-- not running yet".
--
-- So the job is removed rather than left in place broken, and the error says
-- what to do.
do $$
declare
  cmd text;
begin
  select command into cmd from cron.job where jobname = 'kap-klimber-notify';
  if cmd is null then
    raise exception 'The job was not created. Check that pg_cron is enabled.';
  end if;
  if cmd like '%<<%' or cmd like '%>>%' then
    perform cron.unschedule('kap-klimber-notify');
    raise exception
      'Placeholders were left in. Delete the << >> markers as well as the words between them, then run this file again. The job has been removed so it cannot sit there failing quietly.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Checking on it
-- ---------------------------------------------------------------------------

-- Is the job there and running?
--   select jobid, jobname, schedule, active from cron.job;
--
-- Did the last few runs succeed? (This is pg_cron calling pg_net — it says
-- nothing about what the app replied.)
--   select status, return_message, start_time
--   from cron.job_run_details order by start_time desc limit 5;
--
-- What did the app actually reply? This is the one that matters:
-- 200 with {"ok":true,...} is a working dispatcher, 401 means the secret does
-- not match what is in Vercel.
--   select status_code, content, created
--   from net._http_response order by created desc limit 5;
--
-- To stop it:
--   select cron.unschedule('kap-klimber-notify');
