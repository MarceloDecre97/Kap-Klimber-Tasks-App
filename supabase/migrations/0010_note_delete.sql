-- ---------------------------------------------------------------------------
-- A member can remove a note they wrote.
--
-- Soft, not hard, for one specific reason: parent_note_id cascades. A hard
-- delete of a note that has replies would take those replies with it, and
-- they may be other people's writing. Marking the row instead lets the
-- replies survive, and lets the app leave a small "note deleted" marker in
-- their place so the remaining conversation still makes sense.
--
-- No new policy is needed. This is an UPDATE, and task_notes_update_own from
-- 0008 already limits updates to rows the caller wrote. The guard_note_edit
-- trigger pins id, task_id, member_id, parent_note_id and created_at and
-- leaves everything else alone, so deleted_at passes through it untouched —
-- and because the body is unchanged, deleting does not stamp edited_at.
-- ---------------------------------------------------------------------------

alter table public.task_notes
  add column if not exists deleted_at timestamptz;

comment on column public.task_notes.deleted_at is
  'Set when the author removes their note. The row stays so replies to it survive; the app hides it, or shows a marker where it had replies.';

-- Every note query filters on this, so it belongs in the index the timeline
-- already uses rather than in a separate one.
drop index if exists task_notes_task_idx;
create index task_notes_task_idx
  on public.task_notes (task_id, created_at)
  where deleted_at is null;

-- Kept unfiltered: a deleted parent still needs its replies found, which is
-- exactly the case the partial index above excludes.
create index if not exists task_notes_parent_all_idx
  on public.task_notes (parent_note_id, created_at);
