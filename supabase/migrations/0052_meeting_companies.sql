-- ---------------------------------------------------------------------------
-- 0052 — A meeting can be with more than one company
--
-- `meetings.company_id` said a meeting belongs to at most one company, and
-- everything downstream inherited the lie: a call with somebody from AAA and
-- somebody from ADV Mobil had to pick one, or pick neither and be filed as
-- nobody's. Marcelo's correction, after using it: pick up to four, and the
-- address book below then offers the people who work at any of them.
--
-- Four is a real limit rather than a round number. A meeting spanning five
-- companies is a conference, and its minutes want a title rather than five
-- chips on a 360px card.
--
-- The column goes. Keeping it beside the new table would give two answers to
-- "which company is this meeting with", and the one that answered would
-- depend on which query you happened to write.
-- ---------------------------------------------------------------------------

create table if not exists public.meeting_companies (
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  added_by uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (meeting_id, company_id)
);

create index if not exists meeting_companies_company_idx
  on public.meeting_companies (company_id);

comment on table public.meeting_companies is
  'Which companies a meeting was with, set by hand. Up to four, enforced in set_meeting_attendees. Companies are also DERIVED from whoever from the address book was in the room; this table is the deliberate half.';

alter table public.meeting_companies enable row level security;

drop policy if exists "meeting_companies_select" on public.meeting_companies;
create policy "meeting_companies_select"
  on public.meeting_companies for select
  to authenticated
  using (public.is_team_member());

/*
  No write policy, matching meeting_contacts and meeting_members since 0051:
  set_meeting_attendees is the only way in, so there is no second path whose
  permission rules could drift from the first.
*/

/* What the column already said, kept. */
insert into public.meeting_companies (meeting_id, company_id, added_by)
select m.id, m.company_id, m.created_by
  from public.meetings m
 where m.company_id is not null
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Everything that read the column, restated without it
--
-- Read off the live definitions first, as always. `meeting_company` keeps its
-- name and its contract — the ONE company a meeting belongs to, or null — and
-- only changes where it looks: the set now has to be a set of one, which is
-- the same rule it already applied to the derived half.
-- ---------------------------------------------------------------------------
create or replace function public.meeting_company(p_meeting_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select (array_agg(mc.company_id))[1]
       from public.meeting_companies mc
      where mc.meeting_id = p_meeting_id
     having count(*) = 1),
    /* array_agg because uuid has no max(); the having is what enforces "one". */
    (select (array_agg(distinct c.company_id))[1]
       from public.meeting_contacts mct
       join public.contacts c on c.id = mct.contact_id
      where mct.meeting_id = p_meeting_id
        and c.company_id is not null
        and c.deleted_at is null
     having count(distinct c.company_id) = 1)
  );
$$;

comment on function public.meeting_company(uuid) is
  'The meeting''s company: the single one set on it, or the single company its external attendees share. Null when either spans several — naming one of them would be a guess.';

create or replace function public.guard_meeting_edit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not public.can_edit_meeting_details(new.id) then
    new.title       = old.title;
    new.description = old.description;
    new.met_on      = old.met_on;
    new.met_at      = old.met_at;
  end if;

  if not public.can_edit_meeting(new.id) then
    new.body = old.body;
  end if;

  if coalesce(current_setting('app.meeting_deletion', true), '') <> 'on' then
    new.deleted_at = old.deleted_at;
    new.deleted_by = old.deleted_by;
  end if;

  return new;
end;
$$;

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
  if new.description is distinct from old.description then
    insert into public.meeting_events (meeting_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'Description', old.description, new.description); end if;
  if new.met_on is distinct from old.met_on then
    insert into public.meeting_events (meeting_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'Date', old.met_on::text, new.met_on::text); end if;
  if new.met_at is distinct from old.met_at then
    insert into public.meeting_events (meeting_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'Time',
            to_char(old.met_at, 'HH12:MI AM'), to_char(new.met_at, 'HH12:MI AM')); end if;

  /* The company moved to its own table; set_meeting_attendees logs it. */
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- One call still sets everybody, and now the companies with them
--
-- Three changes from 0051, and the last two are Marcelo's after using it:
--
--   * companies come along, up to four;
--   * rows that survive are LEFT ALONE rather than deleted and re-inserted,
--     so `added_by` still records who put somebody in the room;
--   * somebody who was at the meeting but did not write the minutes may add
--     anybody and remove only the people they added. Dee correcting the
--     record is right; Dee taking Marcelo off his own meeting is not.
--
-- The author may still take anybody off, themselves included. Nobody else can
-- take themselves off, because being on it is what gives them the right to
-- change any of this and there would be no way back in.
-- ---------------------------------------------------------------------------
create or replace function public.set_meeting_attendees(
  p_meeting_id uuid,
  p_company_ids uuid[],
  p_contact_ids uuid[],
  p_member_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public.current_member_id();
  is_author boolean;
  companies uuid[] := coalesce(p_company_ids, '{}'::uuid[]);
  contacts uuid[] := coalesce(p_contact_ids, '{}'::uuid[]);
  members uuid[] := coalesce(p_member_ids, '{}'::uuid[]);
  was text;
  now_is text;
begin
  if me is null then
    raise exception 'Not on the team.';
  end if;
  if not public.can_edit_meeting_details(p_meeting_id) then
    raise exception 'Only somebody who was at this meeting can change who was there.';
  end if;
  is_author := public.can_edit_meeting(p_meeting_id);

  if coalesce(array_length(companies, 1), 0) > 4 then
    raise exception 'Four companies is the most one meeting can be with.';
  end if;
  if coalesce(array_length(contacts, 1), 0) > 40 then
    raise exception 'That is too many people from the book for one meeting.';
  end if;
  if coalesce(array_length(members, 1), 0) > 20 then
    raise exception 'That is too many people from the team for one meeting.';
  end if;

  if not is_author and exists (
    select 1 from public.meeting_members mm
     where mm.meeting_id = p_meeting_id
       and not (mm.member_id = any (members))
       and (mm.added_by is distinct from me or mm.member_id = me)
  ) then
    raise exception 'You can only take off the people you added.';
  end if;

  /* What the history should say, read before anything changes. */
  select string_agg(c.name, ', ' order by c.name) into was
    from public.meeting_companies mc
    join public.companies c on c.id = mc.company_id
   where mc.meeting_id = p_meeting_id;

  delete from public.meeting_companies
   where meeting_id = p_meeting_id and not (company_id = any (companies));
  delete from public.meeting_contacts
   where meeting_id = p_meeting_id and not (contact_id = any (contacts));
  delete from public.meeting_members
   where meeting_id = p_meeting_id and not (member_id = any (members));

  insert into public.meeting_companies (meeting_id, company_id, added_by)
  select p_meeting_id, id, me from unnest(companies) as id
  on conflict do nothing;

  insert into public.meeting_contacts (meeting_id, contact_id, added_by)
  select p_meeting_id, id, me from unnest(contacts) as id
  on conflict do nothing;

  insert into public.meeting_members (meeting_id, member_id, added_by)
  select p_meeting_id, id, me from unnest(members) as id
  on conflict do nothing;

  select string_agg(c.name, ', ' order by c.name) into now_is
    from public.meeting_companies mc
    join public.companies c on c.id = mc.company_id
   where mc.meeting_id = p_meeting_id;

  if now_is is distinct from was then
    insert into public.meeting_events (meeting_id, member_id, kind, field, from_value, to_value)
    values (p_meeting_id, me, 'edited', 'Company', was, now_is);
  end if;
end;
$$;

comment on function public.set_meeting_attendees(uuid, uuid[], uuid[], uuid[]) is
  'The only way to change who a meeting was with. One permission check, taken before anything is deleted; surviving rows keep their added_by; a non-author may remove only the people they added, and never themselves.';

revoke all on function public.set_meeting_attendees(uuid, uuid[], uuid[], uuid[]) from public;
grant execute on function public.set_meeting_attendees(uuid, uuid[], uuid[], uuid[]) to authenticated;

/* 0051's three-argument version, dropped rather than left to be called by
   accident with the companies silently missing. */
drop function if exists public.set_meeting_attendees(uuid, uuid[], uuid[]);

-- ---------------------------------------------------------------------------
-- The one save, with the company arguments gone
--
-- Restated in full, as every change to this function has been. It no longer
-- carries a company at all: that is a list now, and lists go through
-- set_meeting_attendees with the rest of who was in the room.
-- ---------------------------------------------------------------------------
create or replace function public.save_meeting(
  p_meeting_id uuid,
  p_title text,
  p_met_on date,
  p_met_at time,
  p_body text,
  p_expected timestamptz default null,
  p_description text default null
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  current_stamp timestamptz;
  new_stamp timestamptz;
  writes_body boolean;
begin
  if public.current_member_id() is null then
    raise exception 'Not on the team.';
  end if;
  if not public.can_edit_meeting_details(p_meeting_id) then
    raise exception 'Only somebody who was at this meeting can change it.';
  end if;
  writes_body := public.can_edit_meeting(p_meeting_id);

  if char_length(coalesce(p_body, '')) > 200000 then
    raise exception 'These minutes are too long to save.';
  end if;
  if char_length(trim(coalesce(p_title, ''))) = 0 then
    raise exception 'Give these minutes a title — it is what makes them findable later.';
  end if;
  if char_length(coalesce(p_description, '')) > 200 then
    raise exception 'That description is too long — keep it to a line.';
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
     set title       = p_title,
         met_on      = p_met_on,
         met_at      = p_met_at,
         description = nullif(trim(coalesce(p_description, '')), ''),
         body        = case when writes_body then coalesce(p_body, body) else body end
   where id = p_meeting_id
   returning updated_at into new_stamp;

  return new_stamp;
end;
$$;

comment on function public.save_meeting(uuid, text, date, time, text, timestamptz, text) is
  'One write for everything a meeting is, except who it was with — that is set_meeting_attendees. The details need can_edit_meeting_details; the body needs can_edit_meeting. Refuses with SQLSTATE 40001 when the row moved on.';

revoke all on function public.save_meeting(uuid, text, date, time, text, timestamptz, text) from public;
grant execute on function public.save_meeting(uuid, text, date, time, text, timestamptz, text) to authenticated;

drop function if exists public.save_meeting(uuid, text, date, time, uuid, boolean, text, timestamptz, text);

/* Last, so everything above is already reading the new table. */
alter table public.meetings drop column if exists company_id;
