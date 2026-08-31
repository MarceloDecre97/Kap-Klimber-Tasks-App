-- ---------------------------------------------------------------------------
-- Notes become editable, and can be replied to.
--
-- 0002_rls.sql called task_notes "an append-only log ... notes are never
-- edited or removed", and gave it only SELECT and INSERT policies. That was a
-- deliberate choice, and this migration reverses it deliberately: a note is
-- how the team records what is happening on a task, and a record you cannot
-- correct is one people work around by posting a second note saying "ignore
-- the last one".
--
-- What does not change: a note still belongs to whoever wrote it. Edits are
-- author-only, authorship cannot be reassigned, and every edit is visible as
-- one — enforced below by policy and trigger rather than by the server
-- action, so no code path can bypass it.
-- ---------------------------------------------------------------------------

alter table public.task_notes
  -- Null means never edited. The UI shows an "edited" marker from this, so a
  -- corrected note is never mistaken for what was originally written.
  add column if not exists edited_at timestamptz,
  -- A reply. Null for a top-level note. Self-referencing rather than a
  -- separate table so replies inherit the existing select policy, the task
  -- cascade, and the like/read tables that key off note id.
  add column if not exists parent_note_id uuid references public.task_notes (id) on delete cascade;

comment on column public.task_notes.edited_at is
  'When the body was last changed by its author. Null if never edited.';
comment on column public.task_notes.parent_note_id is
  'The note this one replies to. Null for a top-level note. One level only — enforced by trigger.';

-- Replies are always fetched as "the replies to these notes".
create index if not exists task_notes_parent_idx
  on public.task_notes (parent_note_id, created_at);

-- ---------------------------------------------------------------------------
-- One level of replies, not a tree
-- ---------------------------------------------------------------------------

-- A reply to a reply would render as an ever-deeper indent on a phone screen
-- that has no room for the first one. Threads stay flat: a note, and the
-- replies to it. A CHECK constraint cannot express this because it would have
-- to look at another row, so it is a trigger.
create or replace function public.enforce_flat_note_threads()
returns trigger
language plpgsql
as $$
begin
  if new.parent_note_id is not null then
    if exists (
      select 1 from public.task_notes
      where id = new.parent_note_id and parent_note_id is not null
    ) then
      raise exception 'A reply cannot be replied to — threads are one level deep.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists task_notes_flat_threads on public.task_notes;
create trigger task_notes_flat_threads
  before insert or update on public.task_notes
  for each row execute function public.enforce_flat_note_threads();

-- ---------------------------------------------------------------------------
-- An edit changes the body. Nothing else.
-- ---------------------------------------------------------------------------

-- RLS decides *which rows* a member may update, but cannot restrict which
-- columns. Without this, an UPDATE policy that checks authorship would still
-- allow rewriting member_id — reassigning a note to somebody else — or moving
-- it to another task. The trigger pins every field except the body, and
-- stamps edited_at itself so a client cannot claim an edit never happened.
create or replace function public.guard_note_edit()
returns trigger
language plpgsql
as $$
begin
  new.id = old.id;
  new.task_id = old.task_id;
  new.member_id = old.member_id;
  new.parent_note_id = old.parent_note_id;
  new.created_at = old.created_at;

  if new.body is distinct from old.body then
    new.edited_at = now();
  else
    new.edited_at = old.edited_at;
  end if;

  return new;
end;
$$;

drop trigger if exists task_notes_guard_edit on public.task_notes;
create trigger task_notes_guard_edit
  before update on public.task_notes
  for each row execute function public.guard_note_edit();

-- Author-only, checked on both sides: `using` decides which existing rows are
-- visible to the update, `with check` re-tests the row afterwards.
drop policy if exists "task_notes_update_own" on public.task_notes;
create policy "task_notes_update_own"
  on public.task_notes for update
  to authenticated
  using (public.is_team_member() and member_id = public.current_member_id())
  with check (public.is_team_member() and member_id = public.current_member_id());

-- Still no DELETE policy. Editing a note you wrote is correcting the record;
-- removing it leaves a conversation with a hole in it, and replies pointing
-- at nothing.
