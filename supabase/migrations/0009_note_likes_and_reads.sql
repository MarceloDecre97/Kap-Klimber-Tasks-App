-- ---------------------------------------------------------------------------
-- "Seen" becomes two separate things.
--
-- task_note_acks was doing two jobs at once: it meant "I have read this",
-- which drove the Dashboard's "N notes you haven't marked seen" counter, and
-- it was also the only way to respond to a teammate's note. Turning it into a
-- Like would have quietly broken the counter — an unliked note is not an
-- unread one — so the two jobs are split:
--
--   like  an explicit, optional reaction to a note        (was: the ack)
--   read  implicit, written when you open the task        (new)
--
-- Reading stops being a chore somebody has to remember to perform, which is
-- the only reason the old counter could be trusted at all.
-- ---------------------------------------------------------------------------

-- The ack table already holds exactly the right shape for a like — one row
-- per member per note — and real rows the team has created. Renaming keeps
-- them; policies, indexes and the foreign keys follow the table.
alter table if exists public.task_note_acks rename to task_note_likes;

comment on table public.task_note_likes is
  'One row per member per note they liked. Purely a reaction — never affects task status, counts, or what counts as read.';

-- Policy names came along with the rename but still say "acks". Renaming them
-- keeps the next person from grepping for a table that no longer exists.
alter policy "task_note_acks_select" on public.task_note_likes rename to "task_note_likes_select";
alter policy "task_note_acks_insert" on public.task_note_likes rename to "task_note_likes_insert";
alter policy "task_note_acks_delete" on public.task_note_likes rename to "task_note_likes_delete";

-- ---------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------

-- One row per member per task, not per note. A row per note would mean a
-- write for every note every time anyone opened a busy task; a single
-- timestamp answers the same question — "what has been written here since I
-- last looked?" — with one upsert per visit.
create table if not exists public.task_reads (
  task_id uuid not null references public.tasks (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (task_id, member_id)
);

comment on table public.task_reads is
  'When each member last opened each task. Anything written after this, by someone else, is unread for them.';

create index if not exists task_reads_member_idx
  on public.task_reads (member_id);

alter table public.task_reads enable row level security;

-- Your own reading, and nobody else's: a member may only see and write their
-- own rows. This is the one table here that is per-person rather than shared,
-- and "who has read what" is not something the team needs to see about each
-- other.
drop policy if exists "task_reads_select_own" on public.task_reads;
create policy "task_reads_select_own"
  on public.task_reads for select
  to authenticated
  using (public.is_team_member() and member_id = public.current_member_id());

drop policy if exists "task_reads_insert_own" on public.task_reads;
create policy "task_reads_insert_own"
  on public.task_reads for insert
  to authenticated
  with check (public.is_team_member() and member_id = public.current_member_id());

drop policy if exists "task_reads_update_own" on public.task_reads;
create policy "task_reads_update_own"
  on public.task_reads for update
  to authenticated
  using (public.is_team_member() and member_id = public.current_member_id())
  with check (public.is_team_member() and member_id = public.current_member_id());

-- ---------------------------------------------------------------------------
-- Seed reads from the acks that were already there
--
-- Without this, everyone's Dashboard would show every note ever written as
-- unread the moment this ships. A member who had acked notes on a task has
-- demonstrably read it up to their most recent ack, so that timestamp becomes
-- their starting point.
-- ---------------------------------------------------------------------------
insert into public.task_reads (task_id, member_id, last_read_at)
select n.task_id, l.member_id, max(l.created_at)
from public.task_note_likes l
join public.task_notes n on n.id = l.note_id
group by n.task_id, l.member_id
on conflict (task_id, member_id) do nothing;
