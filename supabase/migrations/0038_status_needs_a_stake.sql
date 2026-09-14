-- ---------------------------------------------------------------------------
-- 0038 — Changing a status needs a stake in the task
--
-- 0033 separated the creator from the assignees and pinned the content
-- columns for everyone else. It deliberately left status, completed_at and
-- completed_by alone, because moving a task to For review or marking it
-- complete is exactly what an assignee is for.
--
-- What it missed is that "everyone else" includes people with no connection
-- to the task at all. Any team member could move any task, and the Dashboard's
-- new team timeline puts other people's work in front of you with the status
-- buttons right there — so the gap went from theoretical to one tap away.
--
-- The rule it should have had: you may move a task if you are on it, or if
-- you own it. Everybody else may read it, comment on it, and nothing more.
--
-- Pinned rather than raised, the same as its neighbours: an ordinary save
-- sends every column, and refusing outright would turn a harmless no-op into
-- a failed write.
-- ---------------------------------------------------------------------------
create or replace function public.is_task_assignee(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.task_assignees a
    where a.task_id = p_task_id
      and a.member_id = public.current_member_id()
  );
$$;

revoke all on function public.is_task_assignee(uuid) from public;
grant execute on function public.is_task_assignee(uuid) to authenticated;

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
  'Pins what the writer may not change: the content columns unless they created the task, and the status columns unless they are also on it. Deletion columns are left to guard_task_deletion — request_task_deletion is by definition a non-creator writing to the task.';
