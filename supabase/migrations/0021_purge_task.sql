-- ---------------------------------------------------------------------------
-- 0021 — Erasing a deleted task for good
--
-- Everything else in this app is recoverable. This is the one door that is
-- not, so it is built narrow on purpose:
--
--   * only the creator can open it (same rule as delete and restore),
--   * only on a task that is already in the bin — purging is a second
--     decision, never the first, so nobody erases something in one tap from
--     the Tasklist,
--   * and it is the only way in. There is deliberately no delete policy on
--     public.tasks, so PostgREST refuses a hard delete outright; this
--     function is security definer and is the single hole in that wall.
--
-- What it destroys is not only the row. Five tables cascade off tasks —
-- task_notes, task_note_likes, task_events, task_reads and notifications —
-- so purging a task takes other people's notes and the whole history of who
-- moved it where with it. That is why it returns the counts: the app shows
-- them in the confirmation, and a warning that names "4 notes" is a warning,
-- where "this cannot be undone" is wallpaper.
--
-- The real use for this is a task created with something that should not sit
-- in a database — a rate, a phone number, the wrong client's name. It is not
-- meant to be housekeeping: the Recently deleted list already empties itself.
-- ---------------------------------------------------------------------------

create or replace function public.purge_task(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := public.current_member_id();
  t public.tasks;
  erased jsonb;
begin
  if actor is null then
    raise exception 'Not signed in.';
  end if;

  if not public.can_decide_task_deletion(p_task_id) then
    raise exception 'Only the person who created this task can erase it.';
  end if;

  -- Note the order: a task belonging to someone else and a task that never
  -- existed both come back as "only the creator can erase it", because
  -- can_decide_task_deletion is asked first. That is on purpose — the error
  -- should not tell a caller which task ids are real.
  select * into t from public.tasks where id = p_task_id;
  if not found then
    raise exception 'That task no longer exists.';
  end if;

  -- The guard that matters. can_decide_task_deletion says who; this says
  -- when, and without it "erase for good" would be reachable from a live
  -- task by anyone who called the RPC directly.
  if t.deleted_at is null then
    raise exception 'That task is not deleted. Delete it first.';
  end if;

  -- Counted before the delete, for the record the caller gets back. Notes
  -- include the removed ones: they are rows either way, and the point here
  -- is what is about to stop existing.
  select jsonb_build_object(
           'title', t.title,
           'notes', (select count(*) from public.task_notes n where n.task_id = p_task_id),
           'events', (select count(*) from public.task_events e where e.task_id = p_task_id)
         )
    into erased;

  -- No notification, and that is deliberate. Everyone who could have cared
  -- was told when it was deleted; this changes nothing they can see, and a
  -- second message about a task that no longer exists is noise with nowhere
  -- to send them. The cascade takes those old notifications with it.
  delete from public.tasks where id = p_task_id;

  return erased;
end;
$$;

revoke all on function public.purge_task(uuid) from public;
revoke all on function public.purge_task(uuid) from anon;
grant execute on function public.purge_task(uuid) to authenticated;
