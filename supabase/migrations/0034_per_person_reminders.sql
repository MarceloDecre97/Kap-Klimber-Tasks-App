-- ---------------------------------------------------------------------------
-- 0034 — A reminder belongs to a person
--
-- Until now a reminder was a property of the task: one reminder_at, one
-- dismissal, fired at everybody assigned. That fits "remind us about this"
-- and not the shape this team actually works in, which is "I need Dee to
-- review the document by Thursday" — an appointment between two people that
-- happens to hang off a task.
--
-- So: many per task, each with a named owner, each with its own dismissal.
--
--   An assignee   sets, changes and dismisses their own.
--   The creator   does all of that for anybody assigned, is the only person
--                 who can see the whole set, and can nudge.
--
-- tasks.reminder_at is left in place and stops being read. It is not dropped
-- in the migration that replaces it: that column was declared deprecated in
-- 0005 and brought back in 0011, and carrying a dead column for a few weeks
-- costs nothing next to being wrong about it.
-- ---------------------------------------------------------------------------

create table if not exists public.task_reminders (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.tasks (id) on delete cascade,
  /* Whose reminder this is — the person notified. Not who set it. */
  member_id    uuid not null references public.members (id) on delete cascade,
  remind_at    timestamptz not null,
  /* Themselves, or the creator on their behalf. Kept for the log, not for permission. */
  created_by   uuid references public.members (id) on delete set null,
  dismissed_at timestamptz,
  dismissed_by uuid references public.members (id) on delete set null,
  /* Last time the creator chased this one. Enforces the one-an-hour cap. */
  nudged_at    timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists task_reminders_task_idx on public.task_reminders (task_id);
create index if not exists task_reminders_member_idx on public.task_reminders (member_id);
/* The cron sweeps by time across every task, so this is the index it needs. */
create index if not exists task_reminders_due_idx
  on public.task_reminders (remind_at)
  where dismissed_at is null;

/*
  One live reminder per person per task.

  "Live" means undismissed, which is what makes the cap workable rather than
  a dead end: handling a reminder frees the slot, so a second nudge later in
  the week is fine, and the history of what was set stays on the table.
*/
create unique index if not exists task_reminders_one_live_per_member
  on public.task_reminders (task_id, member_id)
  where dismissed_at is null;

comment on table public.task_reminders is
  'One reminder per person per task, at most one undismissed at a time. Replaces tasks.reminder_at, which is retained but no longer read. Written only through the functions below.';

-- ---------------------------------------------------------------------------
-- Visibility
--
-- Your own, always. Everything on a task you created, because chasing people
-- is the point of the creator's Reminders section. Nothing else — a
-- non-creator sees no trace of anybody else's, not even a count.
-- ---------------------------------------------------------------------------
alter table public.task_reminders enable row level security;

drop policy if exists "task_reminders_select" on public.task_reminders;
create policy "task_reminders_select"
  on public.task_reminders for select
  to authenticated
  using (
    public.is_team_member()
    and (member_id = public.current_member_id() or public.can_edit_task(task_id))
  );

/*
  No insert, update or delete policy anywhere, deliberately — the same wall
  0021 puts around purging a task. Every write goes through the functions
  below, because "the creator, or yourself, and only for an assignee" is a
  sentence about three tables and does not fit a `with check`.
*/

-- ---------------------------------------------------------------------------
-- Who may touch a given reminder
-- ---------------------------------------------------------------------------
create or replace function public.can_manage_reminder(p_task_id uuid, p_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_team_member()
     and (
       p_member_id = public.current_member_id()
       or public.can_edit_task(p_task_id)
     )
     -- Only ever for somebody actually on the task.
     and exists (
       select 1 from public.task_assignees a
       where a.task_id = p_task_id and a.member_id = p_member_id
     );
$$;

-- ---------------------------------------------------------------------------
-- Setting one
--
-- Replaces rather than refuses when a live reminder already exists: that is
-- what changing your reminder means, and it matches how reminder_at behaved.
-- ---------------------------------------------------------------------------
create or replace function public.set_task_reminder(
  p_task_id uuid,
  p_member_id uuid,
  p_remind_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := public.current_member_id();
  new_id uuid;
begin
  if actor is null then
    raise exception 'Not signed in.';
  end if;
  if not public.can_manage_reminder(p_task_id, p_member_id) then
    raise exception 'You can only set a reminder for yourself, or — if you created the task — for someone assigned to it.';
  end if;
  if not exists (select 1 from public.tasks t where t.id = p_task_id and t.deleted_at is null) then
    raise exception 'That task no longer exists.';
  end if;

  /*
    The live one goes rather than being updated in place. A moved reminder is
    a different appointment — the notification dedupe keys are built from the
    reminder's identity, so reusing the row would let a rescheduled reminder
    inherit "already announced" from the one it replaced.
  */
  delete from public.task_reminders
  where task_id = p_task_id and member_id = p_member_id and dismissed_at is null;

  insert into public.task_reminders (task_id, member_id, remind_at, created_by)
  values (p_task_id, p_member_id, p_remind_at, actor)
  returning id into new_id;

  return new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Handling one, and un-handling it
--
-- A toggle, matching the reminder chip that has always worked this way. The
-- creator may do it on somebody's behalf: the common case is being told on a
-- call that the thing is done.
-- ---------------------------------------------------------------------------
create or replace function public.set_reminder_dismissed(p_reminder_id uuid, p_dismissed boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := public.current_member_id();
  r public.task_reminders;
begin
  if actor is null then
    raise exception 'Not signed in.';
  end if;

  select * into r from public.task_reminders where id = p_reminder_id;
  if not found then
    raise exception 'That reminder no longer exists.';
  end if;
  if not public.can_manage_reminder(r.task_id, r.member_id) then
    raise exception 'That is not your reminder.';
  end if;

  if p_dismissed then
    /*
      Un-dismissing is what makes the partial unique index reachable from the
      outside: if a live reminder already exists for this person, bringing an
      old one back would be a second. Dismissing is always safe.
    */
    update public.task_reminders
    set dismissed_at = now(), dismissed_by = actor
    where id = p_reminder_id;
  else
    if exists (
      select 1 from public.task_reminders x
      where x.task_id = r.task_id and x.member_id = r.member_id
        and x.dismissed_at is null and x.id <> r.id
    ) then
      raise exception 'There is already a live reminder for that person on this task.';
    end if;
    update public.task_reminders
    set dismissed_at = null, dismissed_by = null
    where id = p_reminder_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Removing one outright
-- ---------------------------------------------------------------------------
create or replace function public.clear_task_reminder(p_reminder_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.task_reminders;
begin
  if public.current_member_id() is null then
    raise exception 'Not signed in.';
  end if;

  select * into r from public.task_reminders where id = p_reminder_id;
  if not found then return; end if;

  if not public.can_manage_reminder(r.task_id, r.member_id) then
    raise exception 'That is not your reminder.';
  end if;

  delete from public.task_reminders where id = p_reminder_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Nudging
--
-- Only on a reminder that has fired and has not been dismissed. There is
-- nothing to chase before that, so an upcoming one is refused rather than
-- quietly doing nothing.
--
-- It needs a notification kind of its own. Re-firing 'reminder_due' would be
-- swallowed: that dedupe key is reminder_due:<id> by design, admitting
-- exactly one row per reminder, which is what stops the once-a-minute cron
-- announcing the same fired reminder sixty times an hour. The nudge carries
-- its own moment in its key instead.
--
-- One an hour, enforced here rather than in the interface, because a button
-- somebody can hold down is a button somebody will hold down.
-- ---------------------------------------------------------------------------
create or replace function public.nudge_task_reminder(p_reminder_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := public.current_member_id();
  r public.task_reminders;
begin
  if actor is null then
    raise exception 'Not signed in.';
  end if;

  select * into r from public.task_reminders where id = p_reminder_id;
  if not found then
    raise exception 'That reminder no longer exists.';
  end if;

  -- Nudging is the creator's alone: it is chasing somebody else.
  if not public.can_edit_task(r.task_id) then
    raise exception 'Only the person who created this task can nudge a reminder.';
  end if;
  if r.dismissed_at is not null then
    raise exception 'That reminder has already been handled.';
  end if;
  if r.remind_at > now() then
    raise exception 'That reminder has not fired yet — there is nothing to chase.';
  end if;
  if r.nudged_at is not null and r.nudged_at > now() - interval '1 hour' then
    raise exception 'You nudged that reminder within the last hour. Give them a moment.';
  end if;

  update public.task_reminders set nudged_at = now() where id = p_reminder_id;

  insert into public.notifications (member_id, actor_id, task_id, kind, payload, dedupe_key)
  select r.member_id, actor, r.task_id, 'reminder_nudge',
         jsonb_build_object('at', r.remind_at),
         'reminder_nudge:' || r.id::text || ':' || extract(epoch from now())::bigint::text
  where exists (select 1 from public.members m where m.id = r.member_id and m.is_active)
  on conflict do nothing;

  -- Written into the task's history so chasing somebody is visible rather
  -- than a private poke.
  insert into public.task_events (task_id, member_id, kind, from_value, to_value)
  values (
    r.task_id, actor, 'reminder_nudge', null,
    (select display_name from public.members where id = r.member_id)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Two kinds widened
-- ---------------------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check
  check (kind in (
    'note', 'reply', 'assigned', 'status', 'due_date', 'mention',
    'delete_requested', 'delete_denied', 'deleted', 'restored',
    'reminder_upcoming', 'reminder_due', 'reminder_nudge', 'due_soon', 'overdue',
    'contact_erased'
  ));

alter table public.task_events drop constraint if exists task_events_kind_check;
alter table public.task_events
  add constraint task_events_kind_check
  check (kind in (
    'created', 'status', 'due_date', 'reminder',
    'delete_requested', 'delete_denied', 'delete_cancelled', 'deleted', 'restored',
    'reminder_nudge'
  ));

-- ---------------------------------------------------------------------------
-- Reminders that should stop existing
-- ---------------------------------------------------------------------------

/*
  Completing a task clears every reminder on it, fired-but-undismissed ones
  included. Previously the cron simply skipped completed tasks, so a reminder
  sat there waiting for the task to come back. Deleting is the honest version:
  the work is done, and reopening should start from a clean sheet rather than
  resurrect a nag about something already finished.
*/
create or replace function public.clear_reminders_on_complete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'complete' and old.status is distinct from 'complete' then
    delete from public.task_reminders where task_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_clear_reminders_on_complete on public.tasks;
create trigger tasks_clear_reminders_on_complete
  after update on public.tasks
  for each row execute function public.clear_reminders_on_complete();

/*
  Taking somebody off a task takes their reminder with them. A reminder that
  fires at someone about work that is no longer theirs is worse than none.

  Guarded against the cascade, which is the trap 0031 was written to fix: an
  erased task removes its assignees, this trigger fires for each of them, and
  without the check it would be deleting from a table the cascade is already
  emptying. Harmless in itself, but the guard makes the intent explicit and
  costs one index lookup.
*/
create or replace function public.clear_reminder_on_unassign()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (select 1 from public.tasks t where t.id = old.task_id) then
    delete from public.task_reminders
    where task_id = old.task_id and member_id = old.member_id;
  end if;
  return old;
end;
$$;

drop trigger if exists task_assignees_clear_reminder on public.task_assignees;
create trigger task_assignees_clear_reminder
  after delete on public.task_assignees
  for each row execute function public.clear_reminder_on_unassign();

-- ---------------------------------------------------------------------------
-- The reminders that exist today
--
-- One row per assignee, so everybody notified by the old rule is still
-- notified by the new one. Nothing changes under anyone's feet on the day
-- this ships: that is the whole point of doing it this way rather than
-- handing each reminder to whoever happened to set it.
-- ---------------------------------------------------------------------------
insert into public.task_reminders (task_id, member_id, remind_at, created_by, dismissed_at, dismissed_by, created_at)
select t.id, a.member_id, t.reminder_at, t.reminder_set_by,
       t.reminder_dismissed_at, t.reminder_dismissed_by, t.created_at
from public.tasks t
join public.task_assignees a on a.task_id = t.id
where t.reminder_at is not null
  and t.deleted_at is null
  and not exists (
    select 1 from public.task_reminders r
    where r.task_id = t.id and r.member_id = a.member_id
  )
on conflict do nothing;

comment on column public.tasks.reminder_at is
  'Deprecated as of 0034: task_reminders holds these now, one row per person. Kept unread rather than dropped until the new table has been in daily use — see 0005 and 0011 for why this column gets the benefit of the doubt.';

-- ---------------------------------------------------------------------------
-- Grants: the functions, and nothing else
-- ---------------------------------------------------------------------------
revoke all on function public.set_task_reminder(uuid, uuid, timestamptz) from public;
revoke all on function public.set_reminder_dismissed(uuid, boolean) from public;
revoke all on function public.clear_task_reminder(uuid) from public;
revoke all on function public.nudge_task_reminder(uuid) from public;
revoke all on function public.can_manage_reminder(uuid, uuid) from public;

grant execute on function public.set_task_reminder(uuid, uuid, timestamptz) to authenticated;
grant execute on function public.set_reminder_dismissed(uuid, boolean) to authenticated;
grant execute on function public.clear_task_reminder(uuid) to authenticated;
grant execute on function public.nudge_task_reminder(uuid) to authenticated;
grant execute on function public.can_manage_reminder(uuid, uuid) to authenticated;
