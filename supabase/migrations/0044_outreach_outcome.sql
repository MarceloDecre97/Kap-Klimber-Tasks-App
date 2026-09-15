-- ---------------------------------------------------------------------------
-- 0044 — How an outreach ends, and the rounds it took
--
-- Two things were missing, and they are the same shape.
--
-- 1. There was no way to stop chasing somebody. Four emails to a cold
--    contact who never answers leaves "Contacted ×4" for ever, which looks
--    exactly like "Contacted ×1" from yesterday — so the book cannot tell you
--    who is still owed a chase. "No reply" is that: a decision, parked.
--
-- 2. Every round needed its own task. Create, send, complete, repeat — four
--    tasks for one prospect, times a few dozen prospects, is a task list
--    nobody can read. A round is now something you record on the outreach
--    you already have.
--
-- The first of those turns in_touch into one of several outcomes, so the pair
-- of columns holding it becomes a single answer with a name: what happened,
-- who said so, when. Two mutually exclusive flags would have been a rule the
-- database had to be told about, and a third outcome later would have been a
-- third pair.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- A round that is not a task
--
-- The same list 0011 and 0014 extended. A round lands in the task's own
-- timeline because that is where the task's history already lives — and
-- reading "sent another, 12 Oct" on the task is worth as much as counting it
-- on the contact.
-- ---------------------------------------------------------------------------
alter table public.task_events drop constraint if exists task_events_kind_check;
alter table public.task_events
  add constraint task_events_kind_check
  check (kind in (
    'created', 'status', 'due_date', 'reminder',
    'delete_requested', 'delete_denied', 'delete_cancelled', 'deleted', 'restored',
    'reminder_nudge',
    'outreach_sent'
  ));

-- ---------------------------------------------------------------------------
-- One outcome, not a flag per ending
-- ---------------------------------------------------------------------------
alter table public.contacts
  add column if not exists outcome text,
  add column if not exists outcome_at timestamptz,
  add column if not exists outcome_by uuid references public.members (id) on delete set null;

alter table public.contacts
  drop constraint if exists contacts_outcome_shape;

alter table public.contacts
  add constraint contacts_outcome_shape
    check (
      (outcome is null and outcome_at is null and outcome_by is null)
      or (outcome in ('in_touch', 'no_reply') and outcome_at is not null)
    );

/*
  Whatever 0041 and 0043 recorded, under its new name.

  No phantom edit in anybody's Activity, and without 0039's trick of
  disabling the log trigger around it: at this point record_contact_event is
  still the version that has never heard of `outcome`, so it has nothing to
  say about this update and says nothing. The restated version that does know
  the column is created further down, deliberately after this line. Leaving
  the trigger on is the safer of the two — a migration that fails halfway
  through cannot leave the log switched off behind it.
*/
update public.contacts
   set outcome = 'in_touch',
       outcome_at = in_touch_at,
       outcome_by = in_touch_by
 where in_touch_at is not null
   and outcome is null;

-- ---------------------------------------------------------------------------
-- The guard, renamed with the thing it guards
--
-- Same shape as 0041: RLS picks rows and cannot protect columns, so one
-- function holds the key and a BEFORE UPDATE trigger pins the columns
-- against everybody else.
-- ---------------------------------------------------------------------------
create or replace function public.guard_contact_outcome()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('app.outcome_write', true), '') <> 'on' then
    new.outcome    = old.outcome;
    new.outcome_at = old.outcome_at;
    new.outcome_by = old.outcome_by;
  end if;
  return new;
end;
$$;

drop trigger if exists contacts_guard_in_touch on public.contacts;
drop trigger if exists contacts_guard_outcome on public.contacts;
create trigger contacts_guard_outcome
  before update on public.contacts
  for each row execute function public.guard_contact_outcome();

-- ---------------------------------------------------------------------------
-- Who may say how it ended
--
-- Unchanged from 0041's rule, under a name that no longer says "in touch":
-- the creator of a completed outreach task for this person, or anyone who
-- was on it. Both endings are held to it. Giving up on somebody is as much a
-- claim as saying they answered.
-- ---------------------------------------------------------------------------
create or replace function public.can_set_contact_outcome(p_contact_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.task_contacts tc
    join public.tasks t on t.id = tc.task_id
    join public.members c on c.id = t.created_by
    left join public.task_assignees a
      on a.task_id = t.id and a.member_id = public.current_member_id()
    where tc.contact_id = p_contact_id
      and t.is_outreach
      and t.status = 'complete'
      and t.deleted_at is null
      and public.is_team_member()
      and (c.id = public.current_member_id() or a.member_id is not null or not c.is_active)
  );
$$;

revoke all on function public.can_set_contact_outcome(uuid) from public;
grant execute on function public.can_set_contact_outcome(uuid) to authenticated;

create or replace function public.set_contact_outcome(p_contact_id uuid, p_outcome text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public.current_member_id();
begin
  if me is null then
    raise exception 'Not on the team.';
  end if;
  if p_outcome is not null and p_outcome not in ('in_touch', 'no_reply') then
    raise exception 'Unknown outcome.';
  end if;
  if not public.can_set_contact_outcome(p_contact_id) then
    raise exception 'Only the people on a completed outreach task can say how it ended.';
  end if;

  perform set_config('app.outcome_write', 'on', true);

  update public.contacts
     set outcome    = p_outcome,
         outcome_at = case when p_outcome is null then null else now() end,
         outcome_by = case when p_outcome is null then null else me end
   where id = p_contact_id
     and deleted_at is null
     /* Already where it is being asked to go: nothing to write, nothing to log. */
     and outcome is distinct from p_outcome;

  perform set_config('app.outcome_write', 'off', true);
end;
$$;

revoke all on function public.set_contact_outcome(uuid, text) from public;
grant execute on function public.set_contact_outcome(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- A round, recorded on the task
--
-- Offered only once a round has finished, which is what makes it the second
-- one. Everybody on the task gets it: one email to three people is one round
-- each, the same rule completing the task follows.
-- ---------------------------------------------------------------------------
create or replace function public.record_outreach_sent(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public.current_member_id();
begin
  if me is null then
    raise exception 'Not on the team.';
  end if;

  if not exists (
    select 1
    from public.tasks t
    join public.members c on c.id = t.created_by
    left join public.task_assignees a on a.task_id = t.id and a.member_id = me
    where t.id = p_task_id
      and t.is_outreach
      and t.status = 'complete'
      and t.deleted_at is null
      and (c.id = me or a.member_id is not null or not c.is_active)
  ) then
    raise exception 'Only the people on a completed outreach task can add a round to it.';
  end if;

  insert into public.task_events (task_id, member_id, kind)
  values (p_task_id, me, 'outreach_sent');

  /*
    And the clock starts again.

    A round without a next date is how a prospect goes quiet for three months
    — the whole point of pressing this is that you intend to come back. Seven
    days, the same gap the Contact button sets on the first round, and moved
    rather than added: the live one is deleted first, so pressing this twice
    leaves one appointment and not two, and the new row's fresh id is what
    makes the notification rules treat it as never yet announced.

    Only ever for the caller, and written here rather than through
    set_task_reminder on purpose. That function requires its subject to be an
    assignee, which is the right rule for the gesture it was built for —
    putting a reminder on somebody's plate — and the wrong one here. You can
    create an outreach task, assign it to Dee, and still be the one who sends
    the email; refusing you a reminder for yourself on your own task would
    mean the round above inserts and this line then throws, rolling back the
    whole function and losing the round over a reminder nobody asked to be
    given. The stake was already checked: only the people on this completed
    outreach task reach this line.
  */
  delete from public.task_reminders
  where task_id = p_task_id and member_id = me and dismissed_at is null;

  insert into public.task_reminders (task_id, member_id, remind_at, created_by)
  values (p_task_id, me, now() + interval '7 days', me);
end;
$$;

revoke all on function public.record_outreach_sent(uuid) from public;
grant execute on function public.record_outreach_sent(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The outcome cannot outlive its evidence — 0043's rule, renamed
-- ---------------------------------------------------------------------------
create or replace function public.clear_outcome_without_evidence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.task_contacts tc
    join public.tasks t on t.id = tc.task_id
    where tc.contact_id = old.contact_id
      and t.is_outreach
      and t.status = 'complete'
      and t.deleted_at is null
  ) then
    return old;
  end if;

  perform set_config('app.outcome_write', 'on', true);

  update public.contacts
     set outcome = null, outcome_at = null, outcome_by = null
   where id = old.contact_id
     and outcome is not null;

  perform set_config('app.outcome_write', 'off', true);
  return old;
end;
$$;

drop trigger if exists task_contacts_clear_in_touch on public.task_contacts;
drop trigger if exists task_contacts_clear_outcome on public.task_contacts;
create trigger task_contacts_clear_outcome
  after delete on public.task_contacts
  for each row execute function public.clear_outcome_without_evidence();

-- ---------------------------------------------------------------------------
-- The log, told about the new column and untold about the old
--
-- Restated in full, as every change to this function has been. Logged as the
-- outcome's own words rather than a timestamp: "In touch" and "No reply" are
-- what a person reading the history wants to see.
-- ---------------------------------------------------------------------------
create or replace function public.record_contact_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := public.current_member_id();
begin
  if tg_op = 'INSERT' then
    insert into public.contact_events (contact_id, member_id, kind)
    values (new.id, actor, 'created');
    return new;
  end if;

  if old.deleted_at is null and new.deleted_at is not null then
    insert into public.contact_events (contact_id, member_id, kind)
    values (new.id, coalesce(new.deleted_by, actor), 'deleted');
    return new;
  end if;
  if old.deleted_at is not null and new.deleted_at is null then
    insert into public.contact_events (contact_id, member_id, kind)
    values (new.id, actor, 'restored');
    return new;
  end if;

  if new.first_name is distinct from old.first_name then
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'First name', old.first_name, new.first_name); end if;
  if new.last_name is distinct from old.last_name then
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'Last name', old.last_name, new.last_name); end if;
  if new.job_title is distinct from old.job_title then
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'Job title', old.job_title, new.job_title); end if;
  if new.company is distinct from old.company then
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'Company', old.company, new.company); end if;
  if new.mobile is distinct from old.mobile then
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'Mobile', old.mobile, new.mobile); end if;
  if new.office_phone is distinct from old.office_phone then
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'Office phone', old.office_phone, new.office_phone); end if;
  if new.office_phone_ext is distinct from old.office_phone_ext then
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'Extension', old.office_phone_ext, new.office_phone_ext); end if;
  if new.email is distinct from old.email then
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'Email', old.email::text, new.email::text); end if;
  if new.email2 is distinct from old.email2 then
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'Second email', old.email2::text, new.email2::text); end if;
  if new.website is distinct from old.website then
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'Website', old.website, new.website); end if;
  if new.street is distinct from old.street then
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'Street', old.street, new.street); end if;
  if new.suite is distinct from old.suite then
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'Suite', old.suite, new.suite); end if;
  if new.city is distinct from old.city then
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'City', old.city, new.city); end if;
  if new.state is distinct from old.state then
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'State', old.state, new.state); end if;
  if new.postal_code is distinct from old.postal_code then
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'ZIP', old.postal_code, new.postal_code); end if;
  if new.country is distinct from old.country then
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'Country', old.country, new.country); end if;
  if new.source is distinct from old.source then
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'Where they came from', old.source, new.source); end if;
  if new.trade_show is distinct from old.trade_show
     or new.trade_show_year is distinct from old.trade_show_year then
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'Trade show',
            public.trade_show_label(old.trade_show, old.trade_show_year),
            public.trade_show_label(new.trade_show, new.trade_show_year)); end if;
  if new.outcome is distinct from old.outcome then
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'Outreach',
            case old.outcome when 'in_touch' then 'In touch' when 'no_reply' then 'No reply' end,
            case new.outcome when 'in_touch' then 'In touch' when 'no_reply' then 'No reply' end);
  end if;
  if new.notes is distinct from old.notes then
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'Notes', old.notes, new.notes); end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- The old pair, gone
--
-- Dropped rather than left behind. A column nothing reads is a column
-- somebody reads by mistake in a year, and 0029 is the cautionary tale for
-- dropping one without rewriting what referenced it — which is why
-- record_contact_event above was restated before this line, not after.
-- ---------------------------------------------------------------------------
drop function if exists public.set_contact_in_touch(uuid, boolean);
drop function if exists public.can_confirm_in_touch(uuid);
drop function if exists public.clear_in_touch_without_evidence();
drop function if exists public.guard_contact_in_touch();

alter table public.contacts
  drop constraint if exists contacts_in_touch_pair;
alter table public.contacts
  drop column if exists in_touch_at,
  drop column if exists in_touch_by;

-- ---------------------------------------------------------------------------
-- Completing an outreach keeps its reminder, because completing it is the send
--
-- 0034 deletes every reminder on a task the moment it is marked complete, and
-- for ordinary work that is the honest behaviour: the job is done, so a nag
-- about it should stop existing rather than lurk waiting for the task to be
-- reopened.
--
-- It is precisely wrong for outreach. Completing the task is not the end of
-- the matter — it is the moment the email left, the event the follow-up is
-- measured from. Under 0034's rule the reminder the Contact button arms is
-- destroyed by the very act that starts it counting, so the first week's
-- chase could never arrive: not merely skipped by the scheduler, but gone
-- from the table. Loosening the scheduler alone would have fixed nothing,
-- because there would have been no row left to find.
--
-- So an outreach task keeps its reminders through completion. Everything else
-- behaves exactly as it did.
-- ---------------------------------------------------------------------------
create or replace function public.clear_reminders_on_complete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'complete' and old.status is distinct from 'complete'
     and not new.is_outreach then
    delete from public.task_reminders where task_id = new.id;
  end if;
  return new;
end;
$$;

comment on function public.clear_reminders_on_complete() is
  'Completing a task deletes its reminders, because a nag about finished work should stop existing. Outreach tasks are exempt: there, completion is when the email went out and the reminder is the follow-up. See 0044.';

-- ---------------------------------------------------------------------------
-- Is anybody on this task still owed a chase?
--
-- True while the task is outreach and at least one live contact on it has no
-- outcome yet. The reminder rules below ask this instead of asking whether
-- the task is finished.
--
-- Written as its own function rather than inlined twice, because the two
-- rules must agree: a "coming up in twelve hours" that fires on a chase the
-- "it has fired" rule then declines to mention would be worse than either
-- behaviour on its own.
-- ---------------------------------------------------------------------------
create or replace function public.outreach_still_owed(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tasks t
    join public.task_contacts tc on tc.task_id = t.id
    join public.contacts c on c.id = tc.contact_id
    where t.id = p_task_id
      and t.is_outreach
      and c.deleted_at is null
      and c.outcome is null
  );
$$;

comment on function public.outreach_still_owed(uuid) is
  'True while an outreach task has at least one live contact with no outcome recorded. Lets a completed outreach task keep its follow-up reminder, and lets marking In touch or No reply end the chase without anything to cancel.';

revoke all on function public.outreach_still_owed(uuid) from public;
grant execute on function public.outreach_still_owed(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- A chase whose clock survives the task being finished
--
-- 0035's rules 1 and 2 both read `tk.status <> 'complete'`, and for ordinary
-- work that is exactly right: a reminder to do a thing is pointless once the
-- thing is done, and buzzing about it is how people learn to ignore the bell.
--
-- Outreach inverts it. Completing the task is not the end of the matter, it
-- is the moment the email went out — the event the week's wait is measured
-- from. Under the old rule the reminder the Contact button sets would be
-- silenced by the very act that starts it counting, so it could never once
-- fire, and record_outreach_sent above would be re-arming an appointment
-- nothing would ever keep.
--
-- So a completed task's reminder still fires, but only for outreach, and only
-- while somebody on it is still owed a chase. That last clause is what stops
-- it nagging for ever: it is read from the contacts every time rather than
-- switched off once, so marking "In touch" or "No reply" ends the chase by
-- itself, with nothing to remember to cancel. Three people on one email and
-- one of them answers — the reminder keeps coming, because two of them
-- haven't, and that is the truth of it.
--
-- Rules 3 and 4 are untouched and repeated verbatim, since this replaces the
-- whole function.
-- ---------------------------------------------------------------------------
create or replace function public.run_scheduled_notifications()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
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

    An hour-wide window, not an instant: a minute-wide test would lose the
    notification entirely if the cron job missed a single tick, and this runs
    1,440 times a day on somebody else's infrastructure. The dedupe key admits
    one row per reminder, so catch-up costs nothing.

    The key is the reminder's id rather than its timestamp. Moving a reminder
    replaces the row (see set_task_reminder), so a rescheduled reminder gets a
    new identity and genuinely re-arms — which is precisely what makes "Sent
    another" work: the new appointment has never been announced.
  */
  for r in
    select rm.id, rm.task_id, rm.member_id, rm.remind_at
    from public.task_reminders rm
    join public.tasks tk on tk.id = rm.task_id
    where tk.deleted_at is null
      and (tk.status <> 'complete' or public.outreach_still_owed(tk.id))
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
    meant. After that hour it goes quiet on its own; chasing further is a
    decision somebody makes by looking, never the scheduler's.
  */
  for r in
    select rm.id, rm.task_id, rm.member_id, rm.remind_at
    from public.task_reminders rm
    join public.tasks tk on tk.id = rm.task_id
    where tk.deleted_at is null
      and (tk.status <> 'complete' or public.outreach_still_owed(tk.id))
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

    Both fire in the 07:30–08:30 Chicago window, an hour wide for the same
    catch-up reason, and harmless because the dedupe keys admit one row per
    task per date. These stay on notify_task_audience: a deadline belongs to
    the task and everybody on it, which is what a reminder turned out not
    to be.
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
      The card is already red and the Dashboard already counts it. Dedupe on
      the due date, so missing a moved deadline is new news, and only then.
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
  'Every scheduled notification rule. Safe to run once a minute: each rule is deduped per occurrence. Reminder rules read task_reminders and notify its owner alone, and survive completion on an outreach task while anyone on it is still owed a chase. The morning due-date rules address the whole task audience.';

revoke all on function public.run_scheduled_notifications() from public;
revoke all on function public.run_scheduled_notifications() from anon, authenticated;
