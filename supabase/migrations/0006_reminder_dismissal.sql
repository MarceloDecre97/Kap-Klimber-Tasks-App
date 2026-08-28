-- ---------------------------------------------------------------------------
-- Reminder dismissal: marks a reminder as "dealt with" so a fired reminder
-- can stop asking for attention without touching the task's status, its
-- dates, or which dashboard bucket it sits in.
--
-- Deliberately shared rather than per-member: any member can set or edit a
-- task's reminder, so any member can dismiss it. This rides on the existing
-- tasks_update RLS policy (any active team member may update any task), so
-- no new policy is required.
-- ---------------------------------------------------------------------------

alter table public.tasks
  add column if not exists reminder_dismissed_at timestamptz,
  add column if not exists reminder_dismissed_by uuid references public.members (id);

comment on column public.tasks.reminder_dismissed_at is
  'When the current reminder was marked handled. Reset automatically whenever reminder_at changes.';

-- A dismissal belongs to one specific reminder. Without this, editing a
-- dismissed task to carry a NEW reminder would leave it already dismissed —
-- the reminder would never surface. Enforced by trigger rather than in the
-- server action so no code path can bypass it.
create or replace function public.reset_reminder_dismissal()
returns trigger
language plpgsql
as $$
begin
  if new.reminder_at is distinct from old.reminder_at then
    new.reminder_dismissed_at = null;
    new.reminder_dismissed_by = null;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_reset_reminder_dismissal on public.tasks;
create trigger tasks_reset_reminder_dismissal
  before update on public.tasks
  for each row execute function public.reset_reminder_dismissal();
