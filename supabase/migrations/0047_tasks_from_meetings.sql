-- ---------------------------------------------------------------------------
-- 0047 — Meetings, phase 2: the work that came out of them
--
-- The reason this is worth building rather than using a notes app. A task
-- that came out of a meeting knows where it came from, and the meeting knows
-- what came out of it — so a task description can stop being the place
-- context is stored, which is the thing Marcelo said almost in passing and
-- which turned out to be the whole case for the feature.
--
-- One column, not a join table. A task comes out of at most one meeting: it
-- is the conversation it was decided in, and "this task came from these
-- three meetings" is not a fact anybody has. The join table would be the
-- more flexible shape and the less true one.
--
-- `on delete set null` rather than cascade, and the reasoning matters: a
-- meeting erased from the bin must not take the work with it. The task
-- outlives its origin and simply stops citing it.
-- ---------------------------------------------------------------------------

alter table public.tasks
  add column if not exists meeting_id uuid references public.meetings (id) on delete set null;

create index if not exists tasks_meeting_idx
  on public.tasks (meeting_id) where deleted_at is null;

comment on column public.tasks.meeting_id is
  'The meeting this task came out of, if any. Set once when the task is created and pinned thereafter — see guard_task_edit.';

-- ---------------------------------------------------------------------------
-- Set on the way in, and never again
--
-- The same rule 0041 gave is_outreach, for the same reason. A task that
-- could be re-pointed at a different meeting later would let a finished
-- "fix their address" be recast as an action item from a conversation it was
-- never part of, and the meeting's list of what it produced would quietly
-- stop being true.
--
-- Restated in full, as every change to this function has been, and with
-- 0041's is_outreach line carried forward. Dropping that line here would
-- silently undo 0041 — the two migrations are editing one function, and the
-- last one to run is the one that counts.
-- ---------------------------------------------------------------------------
create or replace function public.guard_task_edit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  /*
    Both pinned unconditionally, above the creator check: not even the person
    who made the task may move it to another meeting, or turn an ordinary
    task into an outreach round. Each is a fact about how the task came to
    exist rather than a field on it.
  */
  new.is_outreach = old.is_outreach;
  new.meeting_id  = old.meeting_id;

  if not public.can_edit_task(new.id) then
    new.title       = old.title;
    new.description = old.description;
    new.category_id = old.category_id;
    new.priority    = old.priority;
    new.due_date    = old.due_date;
    new.reminder_at = old.reminder_at;

    /*
      Status is the assignee's to move. Somebody neither assigned nor the
      creator has no business marking a task complete — and since 0037 they
      are looking at it on the team timeline, where the buttons are.

      Nested inside the creator check on purpose: a creator who is not an
      assignee still moves their own task.
    */
    if not public.is_task_assignee(new.id) then
      new.status       = old.status;
      new.completed_at = old.completed_at;
      new.completed_by = old.completed_by;
    end if;
  end if;
  return new;
end;
$$;

comment on function public.guard_task_edit() is
  'Pins what the writer may not change: the meeting a task came from and whether it is outreach, ever; the content columns unless they created the task; the status columns unless they are also on it. Deletion columns are left to guard_task_deletion.';
