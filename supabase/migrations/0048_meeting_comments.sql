-- ---------------------------------------------------------------------------
-- 0048 — Meetings, phase 3: the rest of the team
--
-- Everyone reads the minutes; only the author writes them. That was
-- Marcelo's call in the brief and it is the right one — two people typing
-- into one document is how a paragraph disappears and nobody finds out.
--
-- But "read only" is not the same as "say nothing". Dee sits in on a call,
-- Marcelo writes it up, and Dee remembers the part about the second depot.
-- Without somewhere to put that she either messages him and it is lost, or
-- she does not bother. A comment is the answer: it sits beside the minutes,
-- it is hers, and it changes not a word of his.
--
-- Deliberately its own table rather than reusing task_notes. They look alike
-- today and are not the same thing: task_notes carries replies, likes, reads
-- and @-mentions, all of which exist because a task is a conversation
-- between people doing it. A comment on minutes is a margin note. Bolting
-- meetings onto that table would mean a nullable task_id and a nullable
-- meeting_id and a constraint saying exactly one is set — the shape 0044
-- already rejected once for outcomes, for the same reason.
-- ---------------------------------------------------------------------------

create table if not exists public.meeting_comments (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  member_id uuid not null references public.members (id),
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  /* Soft, so a thread that was replied to does not lose its beginning. */
  deleted_at timestamptz
);

comment on table public.meeting_comments is
  'A margin note on somebody else''s minutes. Changes nothing about the body — only its own author may edit or remove it.';

create index if not exists meeting_comments_meeting_idx
  on public.meeting_comments (meeting_id, created_at);

alter table public.meeting_comments enable row level security;

drop policy if exists "meeting_comments_select" on public.meeting_comments;
create policy "meeting_comments_select"
  on public.meeting_comments for select
  to authenticated
  using (public.is_team_member());

/*
  Anyone on the team may comment, including on their own minutes — a note to
  self on what to chase is exactly what this is for.
*/
drop policy if exists "meeting_comments_insert" on public.meeting_comments;
create policy "meeting_comments_insert"
  on public.meeting_comments for insert
  to authenticated
  with check (public.is_team_member() and member_id = public.current_member_id());

drop policy if exists "meeting_comments_update" on public.meeting_comments;
create policy "meeting_comments_update"
  on public.meeting_comments for update
  to authenticated
  using (public.is_team_member())
  with check (public.is_team_member());

/*
  Your own words, and nobody else's — not even the author of the minutes.

  Pinned rather than refused, matching every other guard here: an ordinary
  save sends every column, and raising would turn a harmless no-op into a
  failed write. The body and the timestamps are what a comment IS, so a
  non-author can change nothing at all.
*/
create or replace function public.guard_meeting_comment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.member_id is distinct from old.member_id
     or old.member_id <> coalesce(public.current_member_id(), '00000000-0000-0000-0000-000000000000'::uuid)
  then
    new.body       = old.body;
    new.edited_at  = old.edited_at;
    new.deleted_at = old.deleted_at;
    new.member_id  = old.member_id;
  elsif new.body is distinct from old.body then
    /* Stamped here rather than trusted from the client, so "edited" is true. */
    new.edited_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists meeting_comments_guard on public.meeting_comments;
create trigger meeting_comments_guard
  before update on public.meeting_comments
  for each row execute function public.guard_meeting_comment();

-- ---------------------------------------------------------------------------
-- Telling the author somebody wrote in the margin
--
-- One notification, to the person whose minutes they are, and never to
-- yourself. The rest of the team is not told: a comment is addressed to the
-- author, and copying two other people on every one is how a bell stops
-- meaning anything.
--
-- The dedupe key is the comment's own id, so a comment announces itself once
-- and an edit to it says nothing — which is right, because an edit is not
-- news to anybody who already read it.
-- ---------------------------------------------------------------------------
/*
  The existing list plus one. Read off the live constraint rather than
  written from memory: the first draft of this dropped 'restored' and
  'reminder_nudge', and reminder_nudge has rows in production — so the ALTER
  would have failed on validation. 0044 made the same mistake on
  task_events_kind_check. Twice is a pattern: never retype one of these.
*/
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check
  check (kind in (
    'note', 'reply', 'assigned', 'status', 'due_date', 'mention',
    'delete_requested', 'delete_denied', 'deleted', 'restored',
    'reminder_upcoming', 'reminder_due', 'reminder_nudge',
    'due_soon', 'overdue', 'contact_erased',
    'meeting_comment'
  ));

/*
  And the other constraint on this table, which 0025 added and which is easy
  to miss: a notification must name a task, unless its kind is one that
  concerns something else. contact_erased was the first such kind; a comment
  on minutes is the second. Extended here rather than loosened — "every
  notification is about a task except these named ones" is a rule worth
  keeping tight, because it is what stops an orphaned row rendering as a
  card with nothing to open.
*/
alter table public.notifications drop constraint if exists notifications_subject_check;
alter table public.notifications
  add constraint notifications_subject_check
  check (
    case
      when kind in ('contact_erased', 'meeting_comment') then task_id is null
      else task_id is not null
    end
  );

create or replace function public.notify_meeting_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  author uuid;
  meeting_title text;
begin
  select mt.created_by, mt.title into author, meeting_title
    from public.meetings mt where mt.id = new.meeting_id;

  if author is null or author = new.member_id then
    return new;
  end if;

  insert into public.notifications (member_id, actor_id, task_id, kind, payload, dedupe_key)
  select author, new.member_id, null, 'meeting_comment',
         jsonb_build_object('meeting_id', new.meeting_id, 'title', meeting_title),
         'meeting_comment:' || new.id::text
  where exists (select 1 from public.members m where m.id = author and m.is_active)
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists meeting_comments_notify on public.meeting_comments;
create trigger meeting_comments_notify
  after insert on public.meeting_comments
  for each row execute function public.notify_meeting_comment();
