-- ---------------------------------------------------------------------------
-- notifications: one row per person per thing they should know about.
--
-- Until now the app has had one signal — the Dashboard's "N new notes since
-- you last looked" — and it only worked while you were looking at the app.
-- Everything else (a task assigned to you, a status moved out from under you,
-- a due date pushed) was findable but never announced.
--
-- This is the shared spine for all of it. Rows are written here by trigger,
-- and read by three consumers that all agree on the same row: the in-app
-- inbox now, web push next, and email as the gap-filler after that. Delivery
-- is stamped per channel rather than tracked in a separate table, so "was
-- this pushed?" is answerable without a join.
--
-- What this table deliberately does NOT hold is rendered English. A row
-- stores who, what and which task; the wording lives in one TypeScript
-- renderer that the inbox and the dispatcher both call. Rendering in SQL
-- would have meant a second copy of the status labels from constants.ts,
-- kept in sync by hope.
-- ---------------------------------------------------------------------------

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  -- Who is being told. Never null: a notification with no recipient is not a
  -- notification.
  member_id uuid not null references public.members (id) on delete cascade,
  -- Who caused it. Null when the change came from a path with no member
  -- session — a service-role script, the SQL editor, or a scheduled rule.
  actor_id uuid references public.members (id) on delete set null,
  task_id uuid not null references public.tasks (id) on delete cascade,
  -- Set for note-shaped kinds. The body is read through this rather than
  -- copied, so an edited note reads as edited and a removed one stops
  -- showing text somebody deleted.
  note_id uuid references public.task_notes (id) on delete cascade,
  kind text not null check (kind in (
    -- Written by the triggers below.
    'note', 'reply', 'assigned', 'status', 'due_date',
    -- Reserved for the phases that follow: @mentions, and the scheduled
    -- rules that watch reminders and deadlines. Listed now so those arrive
    -- as a trigger each rather than as a constraint rewrite each.
    'mention', 'reminder_upcoming', 'reminder_due', 'due_soon', 'overdue'
  )),
  -- Kind-specific detail that cannot be recovered from a join, e.g. the
  -- status a task moved away from. Never text the UI prints verbatim.
  payload jsonb not null default '{}'::jsonb,
  -- Present only where a repeat is possible and wrong. The scheduled rules
  -- run every minute and would otherwise re-announce the same fired reminder
  -- sixty times an hour; an assignment survives a task edit that rewrites the
  -- assignee list. Null means "every one of these is genuinely new".
  dedupe_key text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  -- Per-channel delivery stamps. Null means not yet sent on that channel.
  pushed_at timestamptz,
  emailed_at timestamptz
);

comment on table public.notifications is
  'One row per recipient per event. Written by trigger and by scheduled rules; read by the in-app inbox, web push, and email. Never written directly by the app.';
comment on column public.notifications.dedupe_key is
  'Scoped per recipient by a partial unique index. Set where a repeat would be wrong; null where every row is genuinely new.';

-- The inbox query, exactly: this member's, newest first.
create index if not exists notifications_member_idx
  on public.notifications (member_id, created_at desc);

-- The bell's count, which every page render asks for.
create index if not exists notifications_unread_idx
  on public.notifications (member_id)
  where read_at is null;

-- Per recipient, not global: the same event notifying four people is four
-- rows that must all be allowed to exist.
create unique index if not exists notifications_dedupe_idx
  on public.notifications (member_id, dedupe_key)
  where dedupe_key is not null;

-- ---------------------------------------------------------------------------
-- Who hears about a task
-- ---------------------------------------------------------------------------

-- Two circles, because they answer different questions.
--
--   core     the people responsible for the task — its creator and whoever
--            it is assigned to. A status change or a moved deadline is
--            their business.
--   writers  everyone who has also written a note on it. Someone who joined
--            the conversation should keep hearing it, but does not need to
--            be told the task moved to In progress.
--
-- Stated once, here, rather than re-derived in each trigger — the fastest way
-- to end up with notifications that disagree about who is involved.
create or replace function public.task_audience(p_task_id uuid, p_include_writers boolean)
returns table (member_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select t.created_by from public.tasks t where t.id = p_task_id
  union
  select ta.member_id from public.task_assignees ta where ta.task_id = p_task_id
  union
  select n.member_id from public.task_notes n
  where p_include_writers and n.task_id = p_task_id and n.deleted_at is null;
$$;

-- ---------------------------------------------------------------------------
-- The writer
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER for the same reason record_task_event is: the table has no
-- INSERT policy at all, so a trigger running as the caller would be denied by
-- the very rule that keeps the app from forging notifications.
--
-- Three exclusions, all of them things that would train people to ignore the
-- bell: you are never notified of your own action, a deactivated member never
-- accumulates rows, and a deleted task goes quiet.
create or replace function public.notify_task_audience(
  p_task_id uuid,
  p_actor uuid,
  p_kind text,
  p_note_id uuid,
  p_payload jsonb,
  p_include_writers boolean,
  p_dedupe_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.tasks t where t.id = p_task_id and t.deleted_at is null) then
    return;
  end if;

  insert into public.notifications (member_id, actor_id, task_id, note_id, kind, payload, dedupe_key)
  select a.member_id, p_actor, p_task_id, p_note_id, p_kind,
         coalesce(p_payload, '{}'::jsonb), p_dedupe_key
  from public.task_audience(p_task_id, p_include_writers) a
  join public.members m on m.id = a.member_id and m.is_active
  where a.member_id is distinct from p_actor
  on conflict do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- Notes and replies
-- ---------------------------------------------------------------------------

-- Writers included: a reply has to reach the person it answers, and they may
-- be neither the task's creator nor an assignee.
--
-- Deduped on the note id, which is what makes this safe to re-run — the same
-- note can never produce a second announcement.
create or replace function public.notify_on_note()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify_task_audience(
    new.task_id,
    new.member_id,
    case when new.parent_note_id is null then 'note' else 'reply' end,
    new.id,
    '{}'::jsonb,
    true,
    'note:' || new.id::text
  );
  return new;
end;
$$;

drop trigger if exists task_notes_notify on public.task_notes;
create trigger task_notes_notify
  after insert on public.task_notes
  for each row execute function public.notify_on_note();

-- ---------------------------------------------------------------------------
-- Assignment
-- ---------------------------------------------------------------------------

-- One person, not the audience: only the new assignee learns anything here.
--
-- The dedupe key is the reason this is not deafening. Editing a task rewrites
-- its assignee list wholesale, so every unrelated edit re-inserts every
-- assignee row; keyed on task and member, the second insert finds the first
-- notification already there and does nothing.
create or replace function public.notify_on_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := public.current_member_id();
begin
  if new.member_id is distinct from actor then
    insert into public.notifications (member_id, actor_id, task_id, kind, dedupe_key)
    select new.member_id, actor, new.task_id, 'assigned',
           'assigned:' || new.task_id::text
    where exists (select 1 from public.tasks t where t.id = new.task_id and t.deleted_at is null)
      and exists (select 1 from public.members m where m.id = new.member_id and m.is_active)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists task_assignees_notify on public.task_assignees;
create trigger task_assignees_notify
  after insert on public.task_assignees
  for each row execute function public.notify_on_assignment();

-- ---------------------------------------------------------------------------
-- Status and due date
-- ---------------------------------------------------------------------------

-- No dedupe key: moving a task to Waiting and back is two real events, and
-- collapsing them would hide the second.
--
-- Writers are excluded here. Having once commented on a task is not a reason
-- to hear about every status change on it; being responsible for it is.
create or replace function public.notify_on_task_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := public.current_member_id();
begin
  if new.status is distinct from old.status then
    perform public.notify_task_audience(
      new.id, actor, 'status', null,
      jsonb_build_object('from', old.status, 'to', new.status),
      false, null
    );
  end if;

  if new.due_date is distinct from old.due_date then
    perform public.notify_task_audience(
      new.id, actor, 'due_date', null,
      jsonb_build_object('from', old.due_date, 'to', new.due_date),
      false, null
    );
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_notify_change on public.tasks;
create trigger tasks_notify_change
  after update on public.tasks
  for each row execute function public.notify_on_task_change();

-- ---------------------------------------------------------------------------
-- RLS: yours only, and the only thing you may change is whether you have
-- read it.
-- ---------------------------------------------------------------------------

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications for select
  to authenticated
  using (public.is_team_member() and member_id = public.current_member_id());

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications for update
  to authenticated
  using (public.is_team_member() and member_id = public.current_member_id())
  with check (public.is_team_member() and member_id = public.current_member_id());

-- Same shape as guard_note_edit in 0008, and for the same reason: the policy
-- above chooses which rows may be updated but cannot stop the update touching
-- columns it has no business touching. Marking something read is the entire
-- permitted operation — a client cannot rewrite what it was told, reassign it
-- to someone else, or claim it was already pushed so the dispatcher skips it.
create or replace function public.guard_notification_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.id = old.id;
  new.member_id = old.member_id;
  new.actor_id = old.actor_id;
  new.task_id = old.task_id;
  new.note_id = old.note_id;
  new.kind = old.kind;
  new.payload = old.payload;
  new.dedupe_key = old.dedupe_key;
  new.created_at = old.created_at;
  new.pushed_at = old.pushed_at;
  new.emailed_at = old.emailed_at;
  return new;
end;
$$;

drop trigger if exists notifications_guard_update on public.notifications;
create trigger notifications_guard_update
  before update on public.notifications
  for each row execute function public.guard_notification_update();

-- No INSERT or DELETE policy, so both are denied for `authenticated` by
-- default. Rows appear only through the SECURITY DEFINER triggers above, and
-- clearing the bell is marking things read rather than destroying the record.
