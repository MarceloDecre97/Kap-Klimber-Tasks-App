-- ---------------------------------------------------------------------------
-- Deleting a task becomes a decision, and stops being permanent.
--
-- Until now any member could delete any task, and the only way back was an
-- eight-second toast. So a task could vanish with nobody told, and once those
-- seconds passed it was unreachable — the row was still in the database, but
-- nothing could reach it.
--
-- Three changes, agreed with Marcelo:
--
--   1. Only the task's creator can actually delete it. Anyone else asks, with
--      a reason, and the creator approves or denies.
--   2. A deleted task lands in a list only its creator sees, for fifteen
--      days, with restore. That list is the safety net for the one unguarded
--      path in the design — the creator deleting their own task, which needs
--      no approval because there is nobody to ask.
--   3. All of it is written to the task's own history, so the record survives
--      whichever way the decision goes.
--
-- Enforcement is in the database, not in the server actions. Everything here
-- goes through the four functions below; a plain UPDATE that tries to touch
-- deleted_at or the request columns has them pinned back by a trigger, so no
-- code path — including the SQL editor — can route around the rule.
-- ---------------------------------------------------------------------------

alter table public.tasks
  add column if not exists deletion_requested_by uuid references public.members (id),
  add column if not exists deletion_requested_at timestamptz,
  add column if not exists deletion_reason text;

do $$
begin
  alter table public.tasks
    add constraint tasks_deletion_reason_len
    check (deletion_reason is null or char_length(btrim(deletion_reason)) between 1 and 300);
exception when duplicate_object then null;
end;
$$;

comment on column public.tasks.deletion_requested_by is
  'Set while a non-creator is waiting on the creator to approve deleting this task. Cleared when the decision is made.';
comment on column public.tasks.deletion_reason is
  'Why they want it gone. Required — "Keith wants to delete this" is not a decision anybody can make from a phone.';

-- The creator's own bin, and the pending-request banner, are both keyed this
-- way round.
create index if not exists tasks_deleted_by_creator_idx
  on public.tasks (created_by, deleted_at)
  where deleted_at is not null;

create index if not exists tasks_deletion_pending_idx
  on public.tasks (deletion_requested_at)
  where deletion_requested_at is not null;

-- ---------------------------------------------------------------------------
-- New kinds
-- ---------------------------------------------------------------------------

alter table public.task_events drop constraint if exists task_events_kind_check;
alter table public.task_events
  add constraint task_events_kind_check
  check (kind in (
    'created', 'status', 'due_date', 'reminder',
    'delete_requested', 'delete_denied', 'delete_cancelled', 'deleted', 'restored'
  ));

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check
  check (kind in (
    'note', 'reply', 'assigned', 'status', 'due_date', 'mention',
    'delete_requested', 'delete_denied', 'deleted',
    'reminder_upcoming', 'reminder_due', 'due_soon', 'overdue'
  ));

-- ---------------------------------------------------------------------------
-- Who decides
-- ---------------------------------------------------------------------------

-- The creator, normally. The escape hatch matters: a task whose creator has
-- been deactivated would otherwise be undeletable by anybody, forever, with
-- no way to resolve a request already sitting against it.
create or replace function public.can_decide_task_deletion(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tasks t
    join public.members c on c.id = t.created_by
    where t.id = p_task_id
      and public.is_team_member()
      and (c.id = public.current_member_id() or not c.is_active)
  );
$$;

-- ---------------------------------------------------------------------------
-- The guard
-- ---------------------------------------------------------------------------

-- RLS decides which rows may be updated and cannot restrict which columns, so
-- without this any member could set deleted_at directly and the approval flow
-- would be decoration. The four functions below announce themselves with a
-- transaction-local setting; everything else has these columns pinned to what
-- they already were.
--
-- Pinned rather than rejected, deliberately: an ordinary task edit sends every
-- column, and raising an exception would turn a harmless no-op write into a
-- failed save.
create or replace function public.guard_task_deletion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('app.deletion_op', true), '') <> '1' then
    new.deleted_at = old.deleted_at;
    new.deletion_requested_by = old.deletion_requested_by;
    new.deletion_requested_at = old.deletion_requested_at;
    new.deletion_reason = old.deletion_reason;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_guard_deletion on public.tasks;
-- Named to sort after tasks_reset_reminder_dismissal and
-- tasks_stamp_reminder_author: triggers fire in name order, and this one only
-- ever pins its own columns, so it is independent of both.
create trigger tasks_guard_deletion
  before update on public.tasks
  for each row execute function public.guard_task_deletion();

-- ---------------------------------------------------------------------------
-- Asking
-- ---------------------------------------------------------------------------

create or replace function public.request_task_deletion(p_task_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := public.current_member_id();
  t public.tasks;
  reason text := btrim(coalesce(p_reason, ''));
begin
  if actor is null then raise exception 'Not a team member.'; end if;
  if char_length(reason) < 1 then
    raise exception 'Say why it should go — the creator has to decide from this alone.';
  end if;
  if char_length(reason) > 300 then raise exception 'Keep the reason under 300 characters.'; end if;

  select * into t from public.tasks where id = p_task_id and deleted_at is null;
  if not found then raise exception 'That task no longer exists.'; end if;
  if t.created_by = actor then
    raise exception 'This is your task — you can delete it yourself.';
  end if;
  if t.deletion_requested_at is not null then
    raise exception 'Somebody has already asked to delete this.';
  end if;

  perform set_config('app.deletion_op', '1', true);
  update public.tasks
  set deletion_requested_by = actor,
      deletion_requested_at = now(),
      deletion_reason = reason
  where id = p_task_id;
  perform set_config('app.deletion_op', '', true);

  insert into public.task_events (task_id, member_id, kind, from_value, to_value)
  values (p_task_id, actor, 'delete_requested', null, reason);

  -- No dedupe key: a request that was denied and made again later is a new
  -- ask, and collapsing the second into the first would hide it.
  insert into public.notifications (member_id, actor_id, task_id, kind, payload)
  select t.created_by, actor, p_task_id, 'delete_requested',
         jsonb_build_object('reason', reason)
  where exists (select 1 from public.members m where m.id = t.created_by and m.is_active)
    and t.created_by is distinct from actor;
end;
$$;

-- ---------------------------------------------------------------------------
-- Deciding
-- ---------------------------------------------------------------------------

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
    perform public.notify_task_deleted(p_task_id, actor, t.title);
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

-- Withdrawing your own request. Silent as far as the bell goes — the creator's
-- pending notification is marked read rather than left as a question about a
-- decision nobody is waiting on any more.
create or replace function public.cancel_task_deletion(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := public.current_member_id();
  t public.tasks;
begin
  select * into t from public.tasks where id = p_task_id and deleted_at is null;
  if not found then raise exception 'That task no longer exists.'; end if;
  if t.deletion_requested_by is distinct from actor then
    raise exception 'That is not your request to cancel.';
  end if;

  perform set_config('app.deletion_op', '1', true);
  update public.tasks
  set deletion_requested_by = null, deletion_requested_at = null, deletion_reason = null
  where id = p_task_id;
  perform set_config('app.deletion_op', '', true);

  insert into public.task_events (task_id, member_id, kind, from_value, to_value)
  values (p_task_id, actor, 'delete_cancelled', null, t.deletion_reason);

  update public.notifications
  set read_at = now()
  where task_id = p_task_id and kind = 'delete_requested' and read_at is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Deleting and restoring what is yours
-- ---------------------------------------------------------------------------

-- A deleted task is invisible to everyone but its creator (see the policy
-- below), so the title travels with the notification. Otherwise the people who
-- were working on it would be told something disappeared and not what.
create or replace function public.notify_task_deleted(p_task_id uuid, p_actor uuid, p_title text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (member_id, actor_id, task_id, kind, payload, dedupe_key)
  select a.member_id, p_actor, p_task_id, 'deleted',
         jsonb_build_object('title', p_title),
         'deleted:' || p_task_id::text
  from public.task_audience(p_task_id, false) a
  join public.members m on m.id = a.member_id and m.is_active
  where a.member_id is distinct from p_actor
  on conflict do nothing;
end;
$$;

create or replace function public.delete_own_task(p_task_id uuid)
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
    raise exception 'Only the person who created this task can delete it. Ask them instead.';
  end if;

  select * into t from public.tasks where id = p_task_id and deleted_at is null;
  if not found then raise exception 'That task no longer exists.'; end if;

  perform set_config('app.deletion_op', '1', true);
  update public.tasks
  set deleted_at = now(),
      deletion_requested_by = null, deletion_requested_at = null, deletion_reason = null
  where id = p_task_id;
  perform set_config('app.deletion_op', '', true);

  insert into public.task_events (task_id, member_id, kind, from_value, to_value)
  values (p_task_id, actor, 'deleted', null, null);

  perform public.notify_task_deleted(p_task_id, actor, t.title);
end;
$$;

create or replace function public.restore_task(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := public.current_member_id();
begin
  if not public.can_decide_task_deletion(p_task_id) then
    raise exception 'Only the person who created this task can bring it back.';
  end if;
  if not exists (select 1 from public.tasks where id = p_task_id and deleted_at is not null) then
    raise exception 'That task is not deleted.';
  end if;

  perform set_config('app.deletion_op', '1', true);
  update public.tasks set deleted_at = null where id = p_task_id;
  perform set_config('app.deletion_op', '', true);

  insert into public.task_events (task_id, member_id, kind, from_value, to_value)
  values (p_task_id, actor, 'restored', null, null);
end;
$$;

-- ---------------------------------------------------------------------------
-- A deleted task belongs to its creator alone
-- ---------------------------------------------------------------------------

-- "Only the creator sees the recently deleted list" has to be a rule the
-- database keeps, not a filter the app remembers to apply — otherwise it is a
-- promise the API quietly breaks. Live tasks stay shared exactly as before.
drop policy if exists "tasks_select" on public.tasks;
create policy "tasks_select"
  on public.tasks for select
  to authenticated
  using (
    public.is_team_member()
    and (deleted_at is null or created_by = public.current_member_id())
  );

-- ---------------------------------------------------------------------------
-- Reachable from the app, and only through these doors
-- ---------------------------------------------------------------------------
revoke all on function public.request_task_deletion(uuid, text) from public;
revoke all on function public.resolve_task_deletion(uuid, boolean) from public;
revoke all on function public.cancel_task_deletion(uuid) from public;
revoke all on function public.delete_own_task(uuid) from public;
revoke all on function public.restore_task(uuid) from public;

grant execute on function public.request_task_deletion(uuid, text) to authenticated;
grant execute on function public.resolve_task_deletion(uuid, boolean) to authenticated;
grant execute on function public.cancel_task_deletion(uuid) to authenticated;
grant execute on function public.delete_own_task(uuid) to authenticated;
grant execute on function public.restore_task(uuid) to authenticated;
