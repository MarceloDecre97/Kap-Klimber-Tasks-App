-- ---------------------------------------------------------------------------
-- Who set this reminder?
--
-- Reminders have been shared from the start: anyone can set one, anyone can
-- dismiss one (0006). That is still right for dismissal, but it leaves one
-- question unanswerable — when a reminder fires, who asked to be reminded?
-- Notifying "the team" means notifying four people about a note-to-self, and
-- notifying nobody means the person who set it finds out by accident.
--
-- So the reminder gets an author. Stamped by trigger, not by the server
-- action, for the same reason as everything else here: the SQL editor and any
-- future script are code paths too.
--
-- This also teaches task_events about reminders, so "Marcelo set a reminder
-- for Friday 3:00 PM" appears in a task's Activity beside its status and
-- due-date changes. Reminder history was previously unrecoverable in exactly
-- the way due dates were before 0007 — editing reminder_at overwrote it.
-- ---------------------------------------------------------------------------

alter table public.tasks
  add column if not exists reminder_set_by uuid references public.members (id);

comment on column public.tasks.reminder_set_by is
  'The member who set the current reminder. Follows reminder_at: cleared when the reminder is removed, reassigned when someone else changes it.';

-- Notifications ask this table "whose reminder is this", once per fired
-- reminder, so the lookup should not be a scan of every task.
create index if not exists tasks_reminder_at_idx
  on public.tasks (reminder_at)
  where reminder_at is not null;

-- ---------------------------------------------------------------------------
-- Stamping
-- ---------------------------------------------------------------------------

-- Authorship belongs to the *reminder*, not to the row: editing a task's
-- title must not quietly transfer its reminder to whoever did the editing.
-- Only a change to reminder_at reassigns it, which is the same rule 0006
-- already uses to reset the dismissal.
--
-- The fallback chain matters for the paths that have no member session — a
-- service-role script or the SQL editor. Rather than leaving the column null
-- and losing the reminder from every notification, it falls back to whoever
-- held it before, then to the task's creator.
create or replace function public.stamp_reminder_author()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.reminder_at is not null then
      new.reminder_set_by = coalesce(public.current_member_id(), new.created_by);
    else
      new.reminder_set_by = null;
    end if;
    return new;
  end if;

  if new.reminder_at is distinct from old.reminder_at then
    if new.reminder_at is null then
      new.reminder_set_by = null;
    else
      new.reminder_set_by = coalesce(public.current_member_id(), old.reminder_set_by, new.created_by);
    end if;
  else
    -- Pinned, like the note guard in 0008 pins authorship: RLS chooses rows,
    -- it cannot stop a client sending a column it has no business setting.
    new.reminder_set_by = old.reminder_set_by;
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_stamp_reminder_author on public.tasks;
create trigger tasks_stamp_reminder_author
  before insert or update on public.tasks
  for each row execute function public.stamp_reminder_author();

-- Reminders that already exist have no recorded author — that history was
-- never written. The task's creator is the best available answer and is right
-- far more often than null, which would notify nobody.
update public.tasks
set reminder_set_by = created_by
where reminder_at is not null and reminder_set_by is null;

-- ---------------------------------------------------------------------------
-- Reminders join the activity log
-- ---------------------------------------------------------------------------

-- 0007 created this constraint inline, so it carries Postgres's generated
-- name. Dropped by that name and rebuilt rather than altered — a CHECK cannot
-- be widened in place.
alter table public.task_events drop constraint if exists task_events_kind_check;
alter table public.task_events
  add constraint task_events_kind_check
  check (kind in ('created', 'status', 'due_date', 'reminder'));

-- from_value/to_value are text for every kind, and a timestamp rendered with
-- ::text picks up the session's timezone and a space instead of a T. Writing
-- explicit ISO-8601 in UTC keeps the value unambiguous no matter which
-- connection wrote it, and directly parseable by the app.
create or replace function public.record_task_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := public.current_member_id();
begin
  if tg_op = 'INSERT' then
    insert into public.task_events (task_id, member_id, kind, from_value, to_value)
    values (new.id, actor, 'created', null, new.status);

    -- A task created with a reminder already on it: recorded so the log does
    -- not start with a reminder that appears to have set itself.
    if new.reminder_at is not null then
      insert into public.task_events (task_id, member_id, kind, from_value, to_value)
      values (new.id, actor, 'reminder', null,
              to_char(new.reminder_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
    end if;

    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.task_events (task_id, member_id, kind, from_value, to_value)
    values (new.id, actor, 'status', old.status, new.status);
  end if;

  -- `is distinct from` rather than `<>` so a date being set for the first
  -- time, or cleared, is recorded too — `null <> 'x'` is null, not true.
  if new.due_date is distinct from old.due_date then
    insert into public.task_events (task_id, member_id, kind, from_value, to_value)
    values (new.id, actor, 'due_date', old.due_date::text, new.due_date::text);
  end if;

  -- Dismissing a reminder is not a change to the reminder, and does not
  -- appear here: reminder_at is what this records.
  if new.reminder_at is distinct from old.reminder_at then
    insert into public.task_events (task_id, member_id, kind, from_value, to_value)
    values (new.id, actor, 'reminder',
            to_char(old.reminder_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
            to_char(new.reminder_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
  end if;

  return new;
end;
$$;
