-- ---------------------------------------------------------------------------
-- Clearing notifications, and saying the right thing about a deletion.
--
-- Everything here came out of using the app for a day:
--
--   1. There was no way to remove a single notification. "Mark all read"
--      clears the count but leaves the list, and a list nobody can prune
--      becomes an archive people stop opening.
--   2. A denied request read as "Keith kept the task", which is too soft for
--      what is a decision about somebody's ask.
--   3. Approving a request and deleting your own task produced the same
--      "deleted" notification, so the person who asked never learned their
--      request was the reason.
--   4. Restoring a task told nobody, and left the earlier "deleted"
--      notification sitting there — quietly changing meaning, because the
--      task it points at exists again.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Removing one
-- ---------------------------------------------------------------------------

-- 0012 gave notifications no DELETE policy at all, on the reasoning that
-- clearing the bell is marking things read rather than destroying the record.
-- That was right about the *count* and wrong about the *list*: what is left
-- after everything is read is a pile with no way to tidy it.
--
-- Own rows only, so this can never remove anybody else's.
drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own"
  on public.notifications for delete
  to authenticated
  using (public.is_team_member() and member_id = public.current_member_id());

/*
  Spelled out rather than inherited.

  Supabase grants `authenticated` every privilege on new tables in `public` by
  default, which is why select and update on this table have worked since 0012
  without a grant appearing anywhere in these migrations. That is a project
  setting, not part of the schema: a database built from these files alone —
  a test harness, a second project, a restore — gets a policy allowing the
  delete and no privilege to attempt it, and the failure is a flat "permission
  denied" that says nothing about why.

  No insert. Notification rows come from triggers and SECURITY DEFINER
  functions only; nobody should be able to write themselves, or anyone else,
  a notification saying whatever they like.
*/
grant select, update, delete on public.notifications to authenticated;

-- ---------------------------------------------------------------------------
-- 2. A restored task is news too
-- ---------------------------------------------------------------------------

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check
  check (kind in (
    'note', 'reply', 'assigned', 'status', 'due_date', 'mention',
    'delete_requested', 'delete_denied', 'deleted', 'restored',
    'reminder_upcoming', 'reminder_due', 'due_soon', 'overdue'
  ));

-- ---------------------------------------------------------------------------
-- 3. Approving a request is not the same event as deleting your own task
-- ---------------------------------------------------------------------------

-- The requester gets a sentence that answers what they asked; everyone else
-- gets the plain fact. One extra flag in the payload rather than a second
-- notification kind, because it is the same event seen from two sides.

/*
  Dropped first, and this is not tidiness.

  `create or replace` matches on the argument list, and adding a fourth
  parameter — defaulted or not — makes a different one. The 0014 function
  would survive alongside this, and every existing three-argument call, which
  is every call in `delete_own_task`, would then fail to resolve:

      ERROR:  function public.notify_task_deleted(uuid, uuid, text) is not unique

  So this migration would have left the app unable to delete a task at all,
  and nothing about the migration running cleanly would have said so.
*/
drop function if exists public.notify_task_deleted(uuid, uuid, text);

create or replace function public.notify_task_deleted(
  p_task_id uuid,
  p_actor uuid,
  p_title text,
  p_requester uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (member_id, actor_id, task_id, kind, payload, dedupe_key)
  select a.member_id, p_actor, p_task_id, 'deleted',
         jsonb_build_object(
           'title', p_title,
           -- True only for the person whose request this answers.
           'approved', a.member_id is not distinct from p_requester
         ),
         'deleted:' || p_task_id::text
  from public.task_audience(p_task_id, false) a
  join public.members m on m.id = a.member_id and m.is_active
  where a.member_id is distinct from p_actor
  on conflict do nothing;

  -- The requester is not always in the task's audience — they may be neither
  -- its creator nor an assignee — and they are the one person who is
  -- certainly owed an answer.
  if p_requester is not null and p_requester is distinct from p_actor then
    insert into public.notifications (member_id, actor_id, task_id, kind, payload, dedupe_key)
    select p_requester, p_actor, p_task_id, 'deleted',
           jsonb_build_object('title', p_title, 'approved', true),
           'deleted:' || p_task_id::text
    where exists (select 1 from public.members m where m.id = p_requester and m.is_active)
    on conflict do nothing;
  end if;
end;
$$;

create or replace function public.resolve_task_deletion(p_task_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := public.current_member_id();
  t public.tasks;
  requester uuid;
  reason text;
begin
  if not public.can_decide_task_deletion(p_task_id) then
    raise exception 'Only the person who created this task can decide that.';
  end if;

  select * into t from public.tasks where id = p_task_id and deleted_at is null;
  if not found then raise exception 'That task no longer exists.'; end if;
  if t.deletion_requested_at is null then raise exception 'Nobody has asked to delete this.'; end if;

  requester := t.deletion_requested_by;
  reason := t.deletion_reason;

  perform set_config('app.deletion_op', '1', true);
  update public.tasks
  set deleted_at = case when p_approve then now() else null end,
      deletion_requested_by = null,
      deletion_requested_at = null,
      deletion_reason = null
  where id = p_task_id;
  perform set_config('app.deletion_op', '', true);

  if p_approve then
    insert into public.task_events (task_id, member_id, kind, from_value, to_value)
    values (p_task_id, actor, 'deleted', null, reason);
    perform public.notify_task_deleted(p_task_id, actor, t.title, requester);
  else
    insert into public.task_events (task_id, member_id, kind, from_value, to_value)
    values (p_task_id, actor, 'delete_denied', null, reason);

    insert into public.notifications (member_id, actor_id, task_id, kind, payload)
    select requester, actor, p_task_id, 'delete_denied', jsonb_build_object('reason', reason)
    where exists (select 1 from public.members m where m.id = requester and m.is_active)
      and requester is distinct from actor;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Bringing a task back tells the people who were told it had gone
-- ---------------------------------------------------------------------------

-- And clears the notification that said it was deleted. Left in place that
-- row silently changes meaning — it points at a task that exists again — and
-- becomes tappable for no reason anyone could explain.
create or replace function public.restore_task(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := public.current_member_id();
  t public.tasks;
begin
  if not public.can_decide_task_deletion(p_task_id) then
    raise exception 'Only the person who created this task can bring it back.';
  end if;

  select * into t from public.tasks where id = p_task_id and deleted_at is not null;
  if not found then raise exception 'That task is not deleted.'; end if;

  perform set_config('app.deletion_op', '1', true);
  update public.tasks set deleted_at = null where id = p_task_id;
  perform set_config('app.deletion_op', '', true);

  insert into public.task_events (task_id, member_id, kind, from_value, to_value)
  values (p_task_id, actor, 'restored', null, null);

  /*
    Told to exactly the people who were told it had gone.

    Not the task's audience: the person who asked for the deletion is often
    not in it — they may be neither creator nor assignee — and they are the
    one most owed the correction, having just been told their request was
    approved. The rows about to be removed name that set precisely, so they
    are read before they are deleted.
  */
  create temporary table restored_recipients on commit drop as
  select distinct member_id
  from public.notifications
  where task_id = p_task_id and kind = 'deleted' and member_id is distinct from actor;

  delete from public.notifications
  where task_id = p_task_id and kind = 'deleted';

  insert into public.notifications (member_id, actor_id, task_id, kind, payload)
  select r.member_id, actor, p_task_id, 'restored', jsonb_build_object('title', t.title)
  from restored_recipients r
  join public.members m on m.id = r.member_id and m.is_active;

  -- Plus anyone on the task who never saw the deletion — added since, or
  -- whose row somebody had already cleared from their own inbox.
  insert into public.notifications (member_id, actor_id, task_id, kind, payload)
  select a.member_id, actor, p_task_id, 'restored', jsonb_build_object('title', t.title)
  from public.task_audience(p_task_id, false) a
  join public.members m on m.id = a.member_id and m.is_active
  where a.member_id is distinct from actor
    and not exists (select 1 from restored_recipients r where r.member_id = a.member_id);

  drop table restored_recipients;
end;
$$;
