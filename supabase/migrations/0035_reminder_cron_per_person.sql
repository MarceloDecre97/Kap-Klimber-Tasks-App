-- ---------------------------------------------------------------------------
-- 0035 — The scheduled rules, now that a reminder has an owner
--
-- Rules 1 and 2 sweep public.task_reminders instead of public.tasks, and
-- notify the reminder's owner instead of the task's audience. Rules 3 and 4,
-- the morning due-date rules, are about the task itself and are unchanged —
-- they are repeated verbatim below because this replaces the whole function.
--
-- The audience change is the point: you set a reminder for Dee and Dee is
-- notified. Nobody else is, including you.
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
  r record;
  before_count bigint;
  made jsonb := '{}'::jsonb;
begin
  select count(*) into before_count from public.notifications;

  /*
    1. A reminder is coming up — twelve hours out.

    The window is an hour wide, not an instant. A minute-wide test would lose
    the notification entirely if the cron job missed a single tick, and this
    runs 1,440 times a day on somebody else's infrastructure. An hour of
    catch-up costs nothing because the dedupe key admits one row per reminder.

    It also keeps a property worth having: a reminder set for two hours from
    now never produces a "coming up in twelve hours" notification, because
    that moment is already past. Telling somebody a reminder is coming up
    seconds after they set it themselves is noise.

    The key is the reminder's id rather than its timestamp. Moving a reminder
    replaces the row (see set_task_reminder), so a rescheduled reminder gets a
    new identity and genuinely re-arms, while the old row's key can never
    collide with it.
  */
  for r in
    select rm.id, rm.task_id, rm.member_id, rm.remind_at
    from public.task_reminders rm
    join public.tasks tk on tk.id = rm.task_id
    where tk.deleted_at is null
      and tk.status <> 'complete'
      and rm.dismissed_at is null
      and now() >= rm.remind_at - interval '12 hours'
      and now() <  rm.remind_at - interval '11 hours'
  loop
    insert into public.notifications (member_id, actor_id, task_id, kind, payload, dedupe_key)
    select r.member_id, null, r.task_id, 'reminder_upcoming',
           jsonb_build_object('at', r.remind_at),
           'reminder_upcoming:' || r.id::text
    where exists (select 1 from public.members m where m.id = r.member_id and m.is_active)
    on conflict do nothing;
  end loop;

  /*
    2. The reminder has fired.

    The one that matters most, so it gets the widest catch-up window: an hour
    after the moment. Dismissing stops it — that is what "handled" has always
    meant, and continuing to buzz about something somebody has ticked off is
    how people learn to ignore the bell.

    After this hour the reminder goes quiet on its own. Chasing it further is
    the creator's decision, made by looking and pressing Nudge, and never the
    scheduler's.
  */
  for r in
    select rm.id, rm.task_id, rm.member_id, rm.remind_at
    from public.task_reminders rm
    join public.tasks tk on tk.id = rm.task_id
    where tk.deleted_at is null
      and tk.status <> 'complete'
      and rm.dismissed_at is null
      and now() >= rm.remind_at
      and now() <  rm.remind_at + interval '1 hour'
  loop
    insert into public.notifications (member_id, actor_id, task_id, kind, payload, dedupe_key)
    select r.member_id, null, r.task_id, 'reminder_due',
           jsonb_build_object('at', r.remind_at),
           'reminder_due:' || r.id::text
    where exists (select 1 from public.members m where m.id = r.member_id and m.is_active)
    on conflict do nothing;
  end loop;

  /*
    3 and 4. The morning rules — unchanged.

    Both fire in the 07:30–08:30 Chicago window: early enough to change the
    day, late enough not to be the first thing on a phone at breakfast. An
    hour wide for the same catch-up reason as above, and harmless because the
    dedupe keys admit one row per task per date.

    These stay on notify_task_audience: a deadline belongs to the task and
    everybody on it, which is exactly what a reminder turned out not to be.
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
  'Every scheduled notification rule. Safe to run once a minute: each rule is deduped per occurrence. Reminder rules read task_reminders and notify its owner alone; the morning due-date rules still address the whole task audience.';

revoke all on function public.run_scheduled_notifications() from public;
revoke all on function public.run_scheduled_notifications() from anon, authenticated;

/*
  notify_reminder_author is left defined but no longer called.

  It existed to tell whoever set a reminder that it had fired, on top of the
  task audience. With an owner on every reminder that is exactly the person
  the rules above notify, so the extra call would be a duplicate — and by the
  decision recorded in the Phase 2 plan, the creator is deliberately NOT told
  when a reminder they set for somebody else goes off. They see it red in the
  Reminders section and nudge if they want to.
*/
