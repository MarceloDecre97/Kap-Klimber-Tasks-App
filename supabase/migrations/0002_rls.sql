-- Row Level Security. Everything is deny-by-default; policies below are the
-- only ways in. There is no anon access anywhere — every policy is scoped to
-- the `authenticated` role, and further scoped to rows the caller's own
-- `members` row can see.

create function public.current_member_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.members
  where user_id = auth.uid() and is_active
  limit 1;
$$;

create function public.is_team_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_member_id() is not null;
$$;

alter table public.members enable row level security;
alter table public.categories enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignees enable row level security;
alter table public.task_notes enable row level security;

-- members: any signed-in active team member can see the (active) roster, to
-- populate assignee pickers. Writes are reserved for the service role
-- (provisioning script today, admin panel later) — no INSERT/UPDATE/DELETE
-- policy is defined, so RLS denies those by default for `authenticated`.
create policy "members_select_active_roster"
  on public.members for select
  to authenticated
  using (is_active and public.is_team_member());

-- categories: readable and insertable by any active member (the "Other"
-- chip flow adds a shared category); editing/removing is admin-only for now.
create policy "categories_select"
  on public.categories for select
  to authenticated
  using (public.is_team_member());

create policy "categories_insert"
  on public.categories for insert
  to authenticated
  with check (public.is_team_member() and created_by = public.current_member_id());

-- tasks: shared team list — any active member can see, create, and update
-- any task. Deletion is soft (UPDATE deleted_at) so there is no DELETE
-- policy; hard deletes stay admin/service-role only.
create policy "tasks_select"
  on public.tasks for select
  to authenticated
  using (public.is_team_member());

create policy "tasks_insert"
  on public.tasks for insert
  to authenticated
  with check (public.is_team_member() and created_by = public.current_member_id());

create policy "tasks_update"
  on public.tasks for update
  to authenticated
  using (public.is_team_member())
  with check (public.is_team_member());

-- task_assignees: visible and manageable by any active member, mirroring
-- the shared-list model of tasks itself.
create policy "task_assignees_select"
  on public.task_assignees for select
  to authenticated
  using (public.is_team_member());

create policy "task_assignees_insert"
  on public.task_assignees for insert
  to authenticated
  with check (public.is_team_member());

create policy "task_assignees_delete"
  on public.task_assignees for delete
  to authenticated
  using (public.is_team_member());

-- task_notes: an append-only log. Any active member can read; a member can
-- only author a note as themselves, and notes are never edited or removed.
create policy "task_notes_select"
  on public.task_notes for select
  to authenticated
  using (public.is_team_member());

create policy "task_notes_insert"
  on public.task_notes for insert
  to authenticated
  with check (public.is_team_member() and member_id = public.current_member_id());
