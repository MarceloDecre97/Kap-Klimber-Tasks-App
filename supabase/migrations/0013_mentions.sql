-- ---------------------------------------------------------------------------
-- @mentions in notes.
--
-- Nothing is added to the schema. A mention lives inside the note body, as
-- `@[Keith B](uuid)`, and this migration teaches the database to read it.
--
-- The id is in the token on purpose. Two people can share a first name, and
-- "@Keith" would leave this trigger guessing which one to notify; a display
-- name can also change, which would leave every past mention pointing at
-- somebody who no longer goes by it. The app renders the token as a chip and
-- never shows it raw — src/lib/mentions.ts holds the matching pattern, and
-- the two have to stay in step.
--
-- Storing them in a side table was the obvious alternative and buys nothing:
-- the only consumer is this notification, the body is already the source of
-- truth, and a second copy is a second thing to keep correct when a note is
-- edited.
-- ---------------------------------------------------------------------------

-- Kept identical to MENTION_SOURCE in src/lib/mentions.ts. The uuid shape is
-- matched strictly rather than loosely, so the cast below cannot fail on
-- something a member typed by hand.
create or replace function public.mentioned_member_ids(p_body text)
returns setof uuid
language sql
immutable
as $$
  select distinct (
    regexp_matches(
      p_body,
      '@\[[^\]\n]{1,80}\]\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)',
      'gi'
    )
  )[1]::uuid;
$$;

comment on function public.mentioned_member_ids(text) is
  'Member ids named in a note body. Mirrors MENTION_SOURCE in src/lib/mentions.ts — change both together.';

-- ---------------------------------------------------------------------------
-- Being named beats being nearby
-- ---------------------------------------------------------------------------

-- A mention reaches whoever is named, whether or not they have anything to do
-- with the task — that is the entire point of one. So this is a direct insert
-- rather than a call to notify_task_audience, which only ever reaches people
-- already involved.
--
-- The dedupe key is deliberately the same one the plain note notification
-- uses. Mentions are written first; when the note pass runs a moment later,
-- the unique index on (member_id, dedupe_key) turns it into a no-op for
-- anyone already told. So being named gets you "Keith mentioned you" and
-- never also "Keith commented" — without either trigger having to know the
-- other exists.
create or replace function public.notify_note_mentions(
  p_note_id uuid,
  p_task_id uuid,
  p_author uuid,
  p_body text
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

  insert into public.notifications (member_id, actor_id, task_id, note_id, kind, dedupe_key)
  select m.id, p_author, p_task_id, p_note_id, 'mention', 'note:' || p_note_id::text
  from public.mentioned_member_ids(p_body) as mentioned(id)
  join public.members m on m.id = mentioned.id and m.is_active
  where m.id is distinct from p_author
  on conflict do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- Wiring
-- ---------------------------------------------------------------------------

create or replace function public.notify_on_note()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Order matters: mentions claim their recipients first.
  perform public.notify_note_mentions(new.id, new.task_id, new.member_id, new.body);

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

-- An edit that adds a name has to reach that person: the alternative is
-- deleting the note and writing it again, which is worse for everyone. The
-- shared dedupe key means nobody already notified about this note hears
-- about it twice, so this is safe to run on every body change.
create or replace function public.notify_on_note_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.body is distinct from old.body and new.deleted_at is null then
    perform public.notify_note_mentions(new.id, new.task_id, new.member_id, new.body);
  end if;
  return new;
end;
$$;

drop trigger if exists task_notes_notify_edit on public.task_notes;
create trigger task_notes_notify_edit
  after update on public.task_notes
  for each row execute function public.notify_on_note_edit();
