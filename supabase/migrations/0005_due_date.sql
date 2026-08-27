-- ---------------------------------------------------------------------------
-- due_date: a plain calendar deadline, separate from the older reminder_at
-- (a precise timestamptz meant for a notification time). The UI no longer
-- reads or writes reminder_at — it stays in place, unused, in case a
-- precise-time reminder feature comes back later.
-- ---------------------------------------------------------------------------

alter table public.tasks add column if not exists due_date date;

create index if not exists tasks_due_date_idx on public.tasks (due_date) where deleted_at is null;

comment on column public.tasks.reminder_at is 'Deprecated: no longer read or written by the app. See due_date.';
comment on column public.tasks.due_date is 'Calendar due date (no time-of-day), set from the task form.';
