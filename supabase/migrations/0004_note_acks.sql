-- Lightweight per-note "seen/recognized" acknowledgments. Purely a
-- reference signal between teammates — never affects task completion or
-- the done/total counters, which only ever look at tasks.status.
create table public.task_note_acks (
  note_id uuid not null references public.task_notes (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (note_id, member_id)
);

create index task_note_acks_note_idx on public.task_note_acks (note_id);

alter table public.task_note_acks enable row level security;

create policy "task_note_acks_select"
  on public.task_note_acks for select
  to authenticated
  using (public.is_team_member());

create policy "task_note_acks_insert"
  on public.task_note_acks for insert
  to authenticated
  with check (public.is_team_member() and member_id = public.current_member_id());

create policy "task_note_acks_delete"
  on public.task_note_acks for delete
  to authenticated
  using (public.is_team_member() and member_id = public.current_member_id());
