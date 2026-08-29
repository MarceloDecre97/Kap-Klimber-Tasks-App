-- ---------------------------------------------------------------------------
-- task_events: an append-only record of how a task changed.
--
-- The tasks table stores a task's *current* state and nothing about how it
-- got there. That makes several things permanently unknowable: how long work
-- actually took once it started, where in the workflow it waits, and how
-- often a due date gets pushed (editing due_date overwrites it, so a task
-- moved four times looks identical to one that never moved).
--
-- None of that can be backfilled — history that was never written is gone.
-- So this table starts collecting now, ahead of anything that reads it.
--
-- Written by a trigger rather than by the server actions, so no code path
-- can forget: every status and due-date change is recorded regardless of
-- which action, script, or SQL console made it.
-- ---------------------------------------------------------------------------

create table if not exists public.task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  -- Who caused it. Null when the change came from a path with no member
  -- session — a service-role script, or the SQL editor.
  member_id uuid references public.members (id) on delete set null,
  kind text not null check (kind in ('created', 'status', 'due_date')),
  -- Kept as text rather than typed columns: one row shape covers a status
  -- enum and a date, and these are read as a log, never joined on.
  from_value text,
  to_value text,
  created_at timestamptz not null default now()
);

comment on table public.task_events is
  'Append-only log of task status and due-date changes. Written by trigger; never updated or deleted by the app.';

-- Every read is "the events for these tasks, oldest first".
create index if not exists task_events_task_idx
  on public.task_events (task_id, created_at);

-- Answering "what happened in the last N weeks" without scanning the table.
create index if not exists task_events_created_idx
  on public.task_events (created_at);

-- ---------------------------------------------------------------------------
-- The recorder
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER so the insert always succeeds: the table's own RLS is
-- select-only for members (below), and a trigger running as the caller would
-- otherwise be denied by its own policy.
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

  return new;
end;
$$;

-- AFTER, not BEFORE: the event should only exist if the change committed.
drop trigger if exists tasks_record_event_insert on public.tasks;
create trigger tasks_record_event_insert
  after insert on public.tasks
  for each row execute function public.record_task_event();

drop trigger if exists tasks_record_event_update on public.tasks;
create trigger tasks_record_event_update
  after update on public.tasks
  for each row execute function public.record_task_event();

-- ---------------------------------------------------------------------------
-- RLS: readable by the team, writable by nobody.
--
-- Only SELECT gets a policy. With RLS enabled and no INSERT/UPDATE/DELETE
-- policy, those are denied by default for `authenticated` — which is the
-- point: an audit log that the app can rewrite is not an audit log. The
-- trigger above bypasses this as SECURITY DEFINER, and that is the only way
-- rows are ever written.
-- ---------------------------------------------------------------------------

alter table public.task_events enable row level security;

drop policy if exists "task_events_select" on public.task_events;
create policy "task_events_select"
  on public.task_events for select
  to authenticated
  using (public.is_team_member());
