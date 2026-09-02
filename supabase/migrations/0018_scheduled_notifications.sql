-- ---------------------------------------------------------------------------
-- Phase 4: the reminders actually remind someone.
--
-- Until now, setting a reminder turned a chip red and did nothing else. The
-- four scheduled kinds have existed in the notifications table since 0012 and
-- the bell has known how to word them since the same day — but nothing
-- anywhere in the app or the database ever wrote one. This is the missing
-- half.
--
-- Called directly by pg_cron rather than through the web app. The dispatcher
-- has to be an HTTP route because signing a web push needs Node; deciding
-- *what to notify about* is a question about rows, and answering it in SQL
-- removes the whole chain that has already failed twice this week — no URL to
-- get wrong, no secret to rotate, no middleware to redirect it to a login page
-- with a 200.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- The clock
-- ---------------------------------------------------------------------------

-- The app runs on one fixed timezone on purpose: a reminder set for 9:00 AM
-- reads 9:00 AM to the whole team, wherever they are sitting. See APP_TIMEZONE
-- in src/lib/utils.ts. The morning rules below are the one place a *date*
-- becomes a *moment*, so they are the one place that could break that promise
-- — hence the constant, named once, rather than a zone repeated four times.
create or replace function public.app_timezone()
returns text
language sql
immutable
as $$ select 'America/Chicago'::text $$;

comment on function public.app_timezone() is
  'The single timezone the whole app runs on. Must match APP_TIMEZONE in src/lib/utils.ts.';

-- ---------------------------------------------------------------------------
-- Whoever set the reminder hears about it too
-- ---------------------------------------------------------------------------

-- They are often neither the creator nor an assignee — you set a reminder on
-- somebody else's task precisely because you are the one who wants chasing
-- about it. Sharing the audience's dedupe key means this is a no-op when they
-- are already in it, so nobody is ever told twice.
create or replace function public.notify_reminder_author(
  p_task_id uuid,
  p_author uuid,
  p_kind text,
  p_payload jsonb,
  p_dedupe_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_author is null then return; end if;

  insert into public.notifications (member_id, actor_id, task_id, kind, payload, dedupe_key)
  select p_author, null, p_task_id, p_kind, coalesce(p_payload, '{}'::jsonb), p_dedupe_key
  where exists (select 1 from public.members m where m.id = p_author and m.is_active)
    and exists (select 1 from public.tasks t where t.id = p_task_id and t.deleted_at is null)
  on conflict do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- The rules
-- ---------------------------------------------------------------------------

create or replace function public.run_scheduled_notifications()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- The wall clock the team shares, not the server's.
  local_now timestamp := now() at time zone public.app_timezone();
  today date := local_now::date;
  is_morning boolean := local_now::time >= '07:30' and local_now::time < '08:30';
  t record;
  before_count bigint;
  made jsonb := '{}'::jsonb;
begin
  select count(*) into before_count from public.notifications;

  /*
    1. A reminder is coming up — twelve hours out.

    The window is an hour wide, not an instant. A minute-wide test would lose
    the notification entirely if the cron job missed a single tick, and this
    runs 1,440 times a day on somebody else's infrastructure. An hour of
    catch-up costs nothing because the dedupe key below can only ever admit
    one row per reminder.

    It also gives the rule a property worth having by accident: a reminder set
    for two hours from now never produces a "coming up in twelve hours"
    notification, because that moment is already in the past. Telling somebody
    a reminder is coming up seconds after they set it themselves is noise.

    The dedupe key carries reminder_at, so moving a reminder genuinely re-arms
    this — which is right, because it is now a different appointment.
  */
  for t in
    select id, reminder_at, reminder_set_by
    from public.tasks
    where deleted_at is null
      and status <> 'complete'
      and reminder_at is not null
      and reminder_dismissed_at is null
      and now() >= reminder_at - interval '12 hours'
      and now() <  reminder_at - interval '11 hours'
  loop
    perform public.notify_task_audience(
      t.id, null, 'reminder_upcoming', null,
      jsonb_build_object('at', t.reminder_at),
      false,
      'reminder_upcoming:' || t.id::text || ':' || t.reminder_at::text
    );
    perform public.notify_reminder_author(
      t.id, t.reminder_set_by, 'reminder_upcoming',
      jsonb_build_object('at', t.reminder_at),
      'reminder_upcoming:' || t.id::text || ':' || t.reminder_at::text
    );
  end loop;

  /*
    2. The reminder has fired.

    The one that matters most, so it gets the widest catch-up window: an hour
    after the moment. Dismissing the reminder stops it — that is what the
    "handled" state has always meant, and continuing to buzz about something
    somebody has ticked off is how people learn to ignore the bell.
  */
  for t in
    select id, reminder_at, reminder_set_by
    from public.tasks
    where deleted_at is null
      and status <> 'complete'
      and reminder_at is not null
      and reminder_dismissed_at is null
      and now() >= reminder_at
      and now() <  reminder_at + interval '1 hour'
  loop
    perform public.notify_task_audience(
      t.id, null, 'reminder_due', null,
      jsonb_build_object('at', t.reminder_at),
      false,
      'reminder_due:' || t.id::text || ':' || t.reminder_at::text
    );
    perform public.notify_reminder_author(
      t.id, t.reminder_set_by, 'reminder_due',
      jsonb_build_object('at', t.reminder_at),
      'reminder_due:' || t.id::text || ':' || t.reminder_at::text
    );
  end loop;

  /*
    3 and 4. The morning rules.

    Both fire in the 07:30–08:30 Chicago window: early enough to change the
    day, late enough not to be the first thing on a phone at breakfast. An
    hour wide for the same catch-up reason as above, and harmless because the
    dedupe keys admit one row per task per date.
  */
  if is_morning then
    -- Due tomorrow.
    for t in
      select id, due_date
      from public.tasks
      where deleted_at is null
        and status <> 'complete'
        and due_date = today + 1
    loop
      perform public.notify_task_audience(
        t.id, null, 'due_soon', null,
        jsonb_build_object('due', t.due_date),
        false,
        'due_soon:' || t.id::text || ':' || t.due_date::text
      );
    end loop;

    /*
      Past its due date — once, the morning after it slips, and then silence.

      The card is already red and stays red, and the Dashboard already counts
      it. A daily notification about something the team has consciously chosen
      to leave is the single fastest way to teach everyone to swipe these away
      without reading.

      Dedupe on the due date rather than the task, so moving a deadline and
      missing the new one is a new piece of news, and only then.
    */
    for t in
      select id, due_date
      from public.tasks
      where deleted_at is null
        and status <> 'complete'
        and due_date < today
    loop
      perform public.notify_task_audience(
        t.id, null, 'overdue', null,
        jsonb_build_object('due', t.due_date),
        false,
        'overdue:' || t.id::text || ':' || t.due_date::text
      );
    end loop;
  end if;

  select jsonb_build_object(
    'at', local_now,
    'morning_window', is_morning,
    'created', (select count(*) from public.notifications) - before_count
  ) into made;

  return made;
end;
$$;

comment on function public.run_scheduled_notifications() is
  'Every scheduled notification rule. Safe to run once a minute: each rule is deduped per occurrence.';

-- Nobody but the scheduler. These write notification rows, and a member able
-- to call them could manufacture a notification for anyone.
revoke all on function public.run_scheduled_notifications() from public;
revoke all on function public.run_scheduled_notifications() from anon, authenticated;
revoke all on function public.notify_reminder_author(uuid, uuid, text, jsonb, text) from public;
revoke all on function public.notify_reminder_author(uuid, uuid, text, jsonb, text) from anon, authenticated;
