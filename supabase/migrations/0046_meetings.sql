-- ---------------------------------------------------------------------------
-- 0046 — Meetings
--
-- A Word document per meeting, saved somewhere, findable by whoever
-- remembers where they put it. That is what this replaces. Marcelo named the
-- four things that would send him back to Word — hard to find, saving fails,
-- not intuitive, hard to reach — and the shape below is chosen against them.
--
-- The design decisions worth stating, because they are not obvious:
--
-- 1. A meeting is an OCCURRENCE, not a folder. The idea it grew from was
--    "one document per company, split by dates". That is a reading
--    experience, not a storage format: the company pane lists every meeting
--    newest-first, which looks exactly like that document, while each
--    meeting stays a row a task can point at and search can return on its
--    own. A single growing document can do neither.
--
-- 2. The company is OPTIONAL and usually derived. Attendees are the real
--    fact — who was in the room — and the company follows from them. That
--    one choice covers an internal meeting (no contacts, only members) and a
--    call with two suppliers (contacts from both) without either needing a
--    mode of its own. An explicit company_id is still allowed for "met with
--    Brazos" where no individual is named.
--
-- 3. The body has NO event log, deliberately, where every other table here
--    has one. Autosave writes every few seconds; a log of that is not a
--    history, it is noise that would bury the contact log's genuine
--    usefulness. Title, date and attendees are another matter and are
--    logged. What the body gets instead is the thing a log is a poor
--    substitute for: it cannot be edited by anyone but its author, so there
--    is never a question of who wrote it.
--
-- 4. Everyone reads, one person writes. Marcelo's call and the right one:
--    two people typing into one document is how a paragraph disappears and
--    nobody finds out. Comments come in a later phase and change nothing
--    about the body.
-- ---------------------------------------------------------------------------

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),

  /*
    Typed, never generated. "Royal Truck — 17 Sep" is faster to produce and
    useless in six months; being made to say what it was about is what makes
    it findable, which is the first of the four fears. Marcelo chose this.
  */
  title text not null check (char_length(trim(title)) between 1 and 200),

  /*
    The day it happened, which may be in the future — an agenda written the
    night before is the same row, filled in from the top. Date required, time
    optional: minutes are filed by day, and the time only starts mattering
    when two meetings with one company land on the same date.
  */
  met_on date not null,
  met_at time,

  company_id uuid references public.companies (id) on delete set null,

  /*
    The paper. Plain text, and empty is legal — a meeting created thirty
    seconds before it starts has nothing in it yet, and refusing to save that
    would be refusing the whole point.

    The cap is 200k characters, about sixty pages. Not a limit anybody will
    meet; a backstop against a runaway paste turning one row into a problem
    for the whole table.
  */
  body text not null default '' check (char_length(body) <= 200000),

  created_by uuid not null references public.members (id),

  /* The bin, matching contacts and tasks. */
  deleted_at timestamptz,
  deleted_by uuid references public.members (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.meetings is
  'One row per meeting that happened (or is about to). The company is optional and usually derived from who was there. Only the author may edit the body.';

create index if not exists meetings_met_on_idx
  on public.meetings (met_on desc, created_at desc) where deleted_at is null;
create index if not exists meetings_company_idx
  on public.meetings (company_id) where deleted_at is null;

/*
  Search, as the first fear demands, and server-side because a body is up to
  200k characters and shipping every one of them to a phone to filter in
  JavaScript is how "search" becomes "wait".

  A trigram index rather than full-text: minutes are half sentences and half
  part-numbers, and to_tsvector stems "mounting" to "mount" while refusing to
  match "53-footer" at all. ILIKE '%foo%' over trigrams matches the way a
  person expects when they half-remember a word.
*/
create extension if not exists pg_trgm;

create index if not exists meetings_title_trgm_idx
  on public.meetings using gin (title gin_trgm_ops);
create index if not exists meetings_body_trgm_idx
  on public.meetings using gin (body gin_trgm_ops);

drop trigger if exists meetings_set_updated_at on public.meetings;
create trigger meetings_set_updated_at
  before update on public.meetings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Who was in the room
--
-- Two tables rather than one with a nullable pair, because a contact and a
-- member are different things with different foreign keys, and a single
-- table would need a constraint saying "exactly one of these is set" that
-- every reader would then have to remember.
-- ---------------------------------------------------------------------------
create table if not exists public.meeting_contacts (
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  added_by uuid references public.members (id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (meeting_id, contact_id)
);

create index if not exists meeting_contacts_contact_idx
  on public.meeting_contacts (contact_id);

create table if not exists public.meeting_members (
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  added_by uuid references public.members (id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (meeting_id, member_id)
);

create index if not exists meeting_members_member_idx
  on public.meeting_members (member_id);

-- ---------------------------------------------------------------------------
-- The company, worked out rather than stored
--
-- Set explicitly, or the single company every external attendee belongs to.
-- Two companies in the room and it returns null rather than picking one,
-- which is the honest answer: a title that names a company half the people
-- in the room do not work at is worse than naming none. The same rule
-- outreachTaskTitle already follows for its "from X" suffix.
-- ---------------------------------------------------------------------------
create or replace function public.meeting_company(p_meeting_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select m.company_id from public.meetings m where m.id = p_meeting_id),
    /* array_agg because uuid has no max(); the having is what enforces "one". */
    (select (array_agg(distinct c.company_id))[1]
       from public.meeting_contacts mc
       join public.contacts c on c.id = mc.contact_id
      where mc.meeting_id = p_meeting_id
        and c.company_id is not null
        and c.deleted_at is null
     having count(distinct c.company_id) = 1)
  );
$$;

comment on function public.meeting_company(uuid) is
  'The meeting''s company: the one set on it, or the single company its external attendees share. Null when they span several — naming one of them would be a guess.';

revoke all on function public.meeting_company(uuid) from public;
grant execute on function public.meeting_company(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- May I edit this one?
--
-- The author, and nobody else. With the inactive-author escape hatch the
-- rest of the app uses: when somebody leaves the team their meetings would
-- otherwise be frozen for ever, which is a worse answer than letting the
-- remaining four look after them.
-- ---------------------------------------------------------------------------
create or replace function public.can_edit_meeting(p_meeting_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.meetings mt
    join public.members c on c.id = mt.created_by
    where mt.id = p_meeting_id
      and mt.deleted_at is null
      and public.is_team_member()
      and (c.id = public.current_member_id() or not c.is_active)
  );
$$;

revoke all on function public.can_edit_meeting(uuid) from public;
grant execute on function public.can_edit_meeting(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Everyone reads, the author writes
--
-- RLS chooses rows and cannot protect columns, so the policy admits the
-- write and the guard below pins what the writer may not touch — the same
-- division 0033 and 0041 already use on tasks and contacts.
-- ---------------------------------------------------------------------------
alter table public.meetings enable row level security;
alter table public.meeting_contacts enable row level security;
alter table public.meeting_members enable row level security;

drop policy if exists "meetings_select" on public.meetings;
create policy "meetings_select"
  on public.meetings for select
  to authenticated
  using (public.is_team_member());

drop policy if exists "meetings_insert" on public.meetings;
create policy "meetings_insert"
  on public.meetings for insert
  to authenticated
  with check (public.is_team_member() and created_by = public.current_member_id());

drop policy if exists "meetings_update" on public.meetings;
create policy "meetings_update"
  on public.meetings for update
  to authenticated
  using (public.is_team_member())
  with check (public.is_team_member());

/*
  No delete policy, matching tasks and contacts: a meeting goes to the bin by
  having deleted_at set, and nothing removes the row from under somebody.
*/

drop policy if exists "meeting_contacts_select" on public.meeting_contacts;
create policy "meeting_contacts_select"
  on public.meeting_contacts for select
  to authenticated
  using (public.is_team_member());

drop policy if exists "meeting_contacts_write" on public.meeting_contacts;
create policy "meeting_contacts_write"
  on public.meeting_contacts for all
  to authenticated
  using (public.can_edit_meeting(meeting_id))
  with check (public.can_edit_meeting(meeting_id));

drop policy if exists "meeting_members_select" on public.meeting_members;
create policy "meeting_members_select"
  on public.meeting_members for select
  to authenticated
  using (public.is_team_member());

drop policy if exists "meeting_members_write" on public.meeting_members;
create policy "meeting_members_write"
  on public.meeting_members for all
  to authenticated
  using (public.can_edit_meeting(meeting_id))
  with check (public.can_edit_meeting(meeting_id));

create or replace function public.guard_meeting_edit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  /*
    Pinned rather than refused, the same as guard_task_edit: an ordinary save
    sends every column, and raising here would turn a harmless no-op into a
    failed write for somebody who only opened the page.
  */
  if not public.can_edit_meeting(new.id) then
    new.title      = old.title;
    new.met_on     = old.met_on;
    new.met_at     = old.met_at;
    new.company_id = old.company_id;
    new.body       = old.body;
  end if;

  /* The bin is set through delete_meeting, never by hand. */
  if coalesce(current_setting('app.meeting_deletion', true), '') <> 'on' then
    new.deleted_at = old.deleted_at;
    new.deleted_by = old.deleted_by;
  end if;

  return new;
end;
$$;

drop trigger if exists meetings_guard_edit on public.meetings;
create trigger meetings_guard_edit
  before update on public.meetings
  for each row execute function public.guard_meeting_edit();

-- ---------------------------------------------------------------------------
-- Saving, and the two screens problem
--
-- Marcelo writes on a laptop and, when the laptop dies or the call is on
-- speaker, on a phone. So the same meeting can genuinely be open twice, and
-- the losing screen must not silently flatten the winning one.
--
-- The client sends the updated_at it last saw. If the row has moved on since,
-- nothing is written and the function says so, and the page offers to reload
-- rather than overwriting work it never had. Last-write-wins is the default
-- everywhere and is exactly wrong for a document.
--
-- p_expected null is the first save after creating the meeting, where there
-- is nothing to conflict with.
-- ---------------------------------------------------------------------------
create or replace function public.save_meeting_body(
  p_meeting_id uuid,
  p_body text,
  p_expected timestamptz default null
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  current_stamp timestamptz;
  new_stamp timestamptz;
begin
  if public.current_member_id() is null then
    raise exception 'Not on the team.';
  end if;
  if not public.can_edit_meeting(p_meeting_id) then
    raise exception 'Only the person who wrote these minutes can change them.';
  end if;
  if char_length(p_body) > 200000 then
    raise exception 'These minutes are too long to save.';
  end if;

  select updated_at into current_stamp
    from public.meetings where id = p_meeting_id and deleted_at is null;
  if current_stamp is null then
    raise exception 'Those minutes no longer exist.';
  end if;

  if p_expected is not null and current_stamp <> p_expected then
    raise exception 'STALE' using errcode = '40001';
  end if;

  update public.meetings
     set body = p_body
   where id = p_meeting_id
   returning updated_at into new_stamp;

  return new_stamp;
end;
$$;

comment on function public.save_meeting_body(uuid, text, timestamptz) is
  'Autosave. Refuses with SQLSTATE 40001 when the row has moved on since the caller last read it, so a second open screen offers to reload instead of flattening the first.';

revoke all on function public.save_meeting_body(uuid, text, timestamptz) from public;
grant execute on function public.save_meeting_body(uuid, text, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- The bin
--
-- Soft, and the author's to use, matching everything else here.
-- ---------------------------------------------------------------------------
create or replace function public.delete_meeting(p_meeting_id uuid, p_deleted boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public.current_member_id();
  author uuid;
  author_active boolean;
begin
  if me is null then
    raise exception 'Not on the team.';
  end if;

  select mt.created_by, c.is_active into author, author_active
    from public.meetings mt join public.members c on c.id = mt.created_by
   where mt.id = p_meeting_id;

  if author is null then
    raise exception 'Those minutes no longer exist.';
  end if;
  if author <> me and author_active then
    raise exception 'Only the person who wrote these minutes can bin them.';
  end if;

  perform set_config('app.meeting_deletion', 'on', true);

  update public.meetings
     set deleted_at = case when p_deleted then now() else null end,
         deleted_by = case when p_deleted then me else null end
   where id = p_meeting_id;

  perform set_config('app.meeting_deletion', 'off', true);
end;
$$;

revoke all on function public.delete_meeting(uuid, boolean) from public;
grant execute on function public.delete_meeting(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- What changed, minus the typing
--
-- Title, date, time and company are logged. The body is not, for the reason
-- in the header: autosave would write a log line every few seconds and the
-- history would be unreadable. Attendees are logged by the app rather than a
-- trigger, since "added Eric" needs the name and the trigger only has an id.
-- ---------------------------------------------------------------------------
create table if not exists public.meeting_events (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  member_id uuid references public.members (id) on delete set null,
  kind text not null check (kind in ('created', 'edited', 'deleted', 'restored')),
  field text,
  from_value text,
  to_value text,
  created_at timestamptz not null default now()
);

create index if not exists meeting_events_meeting_idx
  on public.meeting_events (meeting_id, created_at desc);

alter table public.meeting_events enable row level security;

drop policy if exists "meeting_events_select" on public.meeting_events;
create policy "meeting_events_select"
  on public.meeting_events for select
  to authenticated
  using (public.is_team_member());

/* Written only by the trigger below, which is security definer. */

create or replace function public.record_meeting_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := public.current_member_id();
begin
  if tg_op = 'INSERT' then
    insert into public.meeting_events (meeting_id, member_id, kind)
    values (new.id, actor, 'created');
    return new;
  end if;

  if old.deleted_at is null and new.deleted_at is not null then
    insert into public.meeting_events (meeting_id, member_id, kind)
    values (new.id, coalesce(new.deleted_by, actor), 'deleted');
    return new;
  end if;
  if old.deleted_at is not null and new.deleted_at is null then
    insert into public.meeting_events (meeting_id, member_id, kind)
    values (new.id, actor, 'restored');
    return new;
  end if;

  if new.title is distinct from old.title then
    insert into public.meeting_events (meeting_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'Title', old.title, new.title); end if;
  if new.met_on is distinct from old.met_on then
    insert into public.meeting_events (meeting_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'Date', old.met_on::text, new.met_on::text); end if;
  if new.met_at is distinct from old.met_at then
    insert into public.meeting_events (meeting_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'Time',
            to_char(old.met_at, 'HH12:MI AM'), to_char(new.met_at, 'HH12:MI AM')); end if;
  if new.company_id is distinct from old.company_id then
    insert into public.meeting_events (meeting_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'Company',
            (select name from public.companies where id = old.company_id),
            (select name from public.companies where id = new.company_id)); end if;

  return new;
end;
$$;

drop trigger if exists meetings_record_event_insert on public.meetings;
create trigger meetings_record_event_insert
  after insert on public.meetings
  for each row execute function public.record_meeting_event();

drop trigger if exists meetings_record_event_update on public.meetings;
create trigger meetings_record_event_update
  after update on public.meetings
  for each row execute function public.record_meeting_event();
