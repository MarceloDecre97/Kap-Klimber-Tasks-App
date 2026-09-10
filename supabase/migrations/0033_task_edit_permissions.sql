-- ---------------------------------------------------------------------------
-- 0033 — Who may change a task
--
-- Until now creator and assignee were the same thing: any member could edit
-- any task. They separate here.
--
--   The creator      — everything.
--   An assignee      — status, completion, links, notes, and their own
--                      reminder. Not the title, not the dates, not who else
--                      is on it.
--
-- Two guards rather than one, because the writes arrive through two tables
-- and one of them is easy to miss.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Who counts as the editor
--
-- Deliberately the same shape as can_decide_task_deletion in 0014, including
-- the escape hatch: when the creator has been deactivated, everyone inherits
-- their powers. Without it a task belonging to someone who has left the
-- company can never be corrected again.
--
-- This is an interim answer. When the admin panel exists it will have a
-- better one, and this function is the single place that has to change.
-- ---------------------------------------------------------------------------
create or replace function public.can_edit_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tasks t
    join public.members c on c.id = t.created_by
    where t.id = p_task_id
      and public.is_team_member()
      and (c.id = public.current_member_id() or not c.is_active)
  );
$$;

revoke all on function public.can_edit_task(uuid) from public;
grant execute on function public.can_edit_task(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Guard 1 — the content columns on public.tasks
--
-- Pinned rather than rejected, which is the reasoning 0014 gives for the
-- deletion guard and it applies unchanged: an ordinary save sends every
-- column, so raising would turn a harmless no-op write into a failed save.
--
-- What is NOT pinned here matters as much as what is:
--
--   status, completed_at, completed_by
--     Exactly what an assignee is meant to change. Marking a task complete
--     and moving it to For review are the two things they do most.
--
--   the deletion columns
--     Left entirely to guard_task_deletion. request_task_deletion is BY
--     DEFINITION a non-creator writing to the task, so a guard that pinned
--     everything for non-creators would silently break the request path —
--     the button would still be there and would still do nothing. The two
--     triggers stay in separate lanes so they cannot fight.
--
--   reminder_set_by
--     Left to tasks_stamp_reminder_author, which only acts when reminder_at
--     changes. This trigger sorts ahead of it by name, so by the time it
--     runs reminder_at is already pinned and there is nothing to stamp.
-- ---------------------------------------------------------------------------
create or replace function public.guard_task_edit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not public.can_edit_task(new.id) then
    new.title       = old.title;
    new.description = old.description;
    new.category_id = old.category_id;
    new.priority    = old.priority;
    new.due_date    = old.due_date;
    new.reminder_at = old.reminder_at;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_guard_edit on public.tasks;
-- Triggers fire in name order. This one sorts after tasks_guard_deletion
-- (separate columns, so the order between them is immaterial) and before
-- tasks_reset_reminder_dismissal and tasks_stamp_reminder_author, which is
-- what makes the reminder_set_by note above true. Both AFTER triggers —
-- tasks_record_event_update and tasks_notify_change — see the pinned row,
-- so a refused edit is never logged or announced as though it happened.
create trigger tasks_guard_edit
  before update on public.tasks
  for each row execute function public.guard_task_edit();

-- ---------------------------------------------------------------------------
-- Guard 2 — the assignee list
--
-- This is the one that hiding a button does not cover.
--
-- task_assignees_insert and task_assignees_delete in 0002 admit any team
-- member, and task_assignees is its own table: removing the Edit screen from
-- an assignee leaves reassignment reachable straight through PostgREST,
-- including adding yourself to a task you were never given. The rule has to
-- live here.
-- ---------------------------------------------------------------------------
drop policy if exists "task_assignees_insert" on public.task_assignees;
create policy "task_assignees_insert"
  on public.task_assignees for insert
  to authenticated
  with check (public.can_edit_task(task_id));

drop policy if exists "task_assignees_delete" on public.task_assignees;
create policy "task_assignees_delete"
  on public.task_assignees for delete
  to authenticated
  using (public.can_edit_task(task_id));

-- Reading stays open: everyone can see who a task belongs to.
-- task_links stays open too — assignees are meant to add links, which is why
-- the banner grows its own control for them in this round.

comment on function public.can_edit_task(uuid) is
  'True for the task creator, or for anyone when the creator is deactivated. The single definition of "may change this task" — guard_task_edit and the task_assignees policies both defer to it.';
