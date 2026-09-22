-- ---------------------------------------------------------------------------
-- 0053 — Naming somebody in a comment, and agreeing with one
--
-- The margin was deliberately plainer than a task's notes: no replies, no
-- likes, no mentions. Two of those three earned their place after use.
--
-- A MENTION is the difference between Dee's note about the second depot
-- reaching Marcelo and sitting in a list he might scroll. A LIKE closes the
-- loop without adding a second comment saying "yes" — which is what people do
-- instead, and it is worse.
--
-- Threaded REPLIES stay out. A thread is a conversation, and a conversation
-- between four people who sit in the same room is machinery for a problem
-- this team does not have. The margin is a margin.
-- ---------------------------------------------------------------------------

create table if not exists public.meeting_comment_likes (
  comment_id uuid not null references public.meeting_comments (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, member_id)
);

comment on table public.meeting_comment_likes is
  'One row per member per comment they liked. The same shape as task_note_likes, and the same meaning: a reaction, never a status.';

create index if not exists meeting_comment_likes_member_idx
  on public.meeting_comment_likes (member_id);

alter table public.meeting_comment_likes enable row level security;

/*
  Everybody sees the count — that is the point of it — and each person writes
  only their own row. Unlike a comment, a like has nothing in it to guard: the
  row IS the fact, so the policy can carry the whole rule.
*/
drop policy if exists "meeting_comment_likes_select" on public.meeting_comment_likes;
create policy "meeting_comment_likes_select"
  on public.meeting_comment_likes for select
  to authenticated
  using (public.is_team_member());

drop policy if exists "meeting_comment_likes_insert" on public.meeting_comment_likes;
create policy "meeting_comment_likes_insert"
  on public.meeting_comment_likes for insert
  to authenticated
  with check (public.is_team_member() and member_id = public.current_member_id());

drop policy if exists "meeting_comment_likes_delete" on public.meeting_comment_likes;
create policy "meeting_comment_likes_delete"
  on public.meeting_comment_likes for delete
  to authenticated
  using (public.is_team_member() and member_id = public.current_member_id());

-- ---------------------------------------------------------------------------
-- A mention in the margin is its own kind of notification
--
-- `mention` already exists and its subject check requires a task_id, because
-- every mention until now has been in a note on a task. A meeting comment has
-- no task, so it needs a kind of its own rather than a loosened rule — the
-- rule is what stops a notification arriving with nothing to open.
--
-- Both constraint lists are READ OFF THE LIVE CONSTRAINT and restated with
-- one entry added. Retyping one of these from memory has gone wrong twice in
-- this project (0044, 0048); it is not doing so a third time.
-- ---------------------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (
  kind = any (array[
    'note', 'reply', 'assigned', 'status', 'due_date', 'mention',
    'delete_requested', 'delete_denied', 'deleted', 'restored',
    'reminder_upcoming', 'reminder_due', 'reminder_nudge',
    'due_soon', 'overdue', 'contact_erased',
    'meeting_comment', 'meeting_mention'
  ])
);

alter table public.notifications drop constraint if exists notifications_subject_check;
alter table public.notifications add constraint notifications_subject_check check (
  case
    when kind = any (array['contact_erased', 'meeting_comment', 'meeting_mention'])
      then task_id is null
    else task_id is not null
  end
);

-- ---------------------------------------------------------------------------
-- Who hears about a comment
--
-- Restated in full from the live definition. Two changes: everybody named in
-- the body is told, and the author of the minutes is told only if they were
-- not already told by being named — one comment, one notification each.
--
-- The `@[Name](uuid)` pattern has to stay in step with src/lib/mentions.ts and
-- with 0013_mentions.sql, which reads the same shape out of task notes.
-- ---------------------------------------------------------------------------
create or replace function public.notify_meeting_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  author uuid;
  meeting_title text;
  mentioned uuid[];
begin
  select mt.created_by, mt.title into author, meeting_title
    from public.meetings mt where mt.id = new.meeting_id;

  select coalesce(array_agg(distinct m[1]::uuid), '{}'::uuid[]) into mentioned
    from regexp_matches(
           new.body,
           '@\[[^\]\n]{1,80}\]\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)',
           'gi'
         ) as m;

  /* Named in the comment. Never yourself, and never somebody inactive. */
  insert into public.notifications (member_id, actor_id, task_id, kind, payload, dedupe_key)
  select mem.id, new.member_id, null, 'meeting_mention',
         jsonb_build_object('meeting_id', new.meeting_id, 'title', meeting_title),
         'meeting_mention:' || new.id::text || ':' || mem.id::text
  from public.members mem
  where mem.id = any (mentioned)
    and mem.id <> new.member_id
    and mem.is_active
  on conflict do nothing;

  /*
    And the person whose minutes these are — unless they were named, in which
    case they have already been told, and two rows for one comment is how a
    notification list stops being read.
  */
  if author is not null and author <> new.member_id and not (author = any (mentioned)) then
    insert into public.notifications (member_id, actor_id, task_id, kind, payload, dedupe_key)
    select author, new.member_id, null, 'meeting_comment',
           jsonb_build_object('meeting_id', new.meeting_id, 'title', meeting_title),
           'meeting_comment:' || new.id::text
    where exists (select 1 from public.members m where m.id = author and m.is_active)
    on conflict do nothing;
  end if;

  return new;
end;
$$;
