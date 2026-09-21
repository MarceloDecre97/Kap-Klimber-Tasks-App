-- ---------------------------------------------------------------------------
-- 0051 — Who may change what, and erasing for good
--
-- 0046 drew one line: the author of the minutes could change everything, and
-- everybody else could change nothing. Marcelo has drawn a better one after
-- using it:
--
--   * the MINUTES belong to whoever wrote them. Two people typing into one
--     document is how a paragraph disappears and nobody finds out.
--   * the DETAILS around them — title, description, date, time, company, who
--     was in the room — belong to everybody who was at the meeting. Dee
--     remembering that Keith was there too is not an edit to Marcelo's
--     minutes, it is a correction to the record of a meeting she sat in.
--
-- "Everybody who was at the meeting" means listed in meeting_members: an
-- Opus Kap person the meeting was assigned to. Not the whole team — a
-- meeting Keith never attended is not Keith's to relabel.
-- ---------------------------------------------------------------------------

create or replace function public.can_edit_meeting_details(p_meeting_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_edit_meeting(p_meeting_id)
      or exists (
        select 1
        from public.meetings mt
        join public.meeting_members mm on mm.meeting_id = mt.id
        where mt.id = p_meeting_id
          and mt.deleted_at is null
          and public.is_team_member()
          and mm.member_id = public.current_member_id()
      );
$$;

comment on function public.can_edit_meeting_details(uuid) is
  'The author, or anybody from Opus Kap who was at the meeting. Governs the details around the minutes — never the minutes, which stay can_edit_meeting.';

revoke all on function public.can_edit_meeting_details(uuid) from public;
grant execute on function public.can_edit_meeting_details(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Two lines in the guard, where there was one
--
-- RLS chooses rows and cannot protect columns, so the policy admits the write
-- and this pins what the writer may not touch. It now pins in two groups,
-- because there are two permissions.
-- ---------------------------------------------------------------------------
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
  if not public.can_edit_meeting_details(new.id) then
    new.title       = old.title;
    new.description = old.description;
    new.met_on      = old.met_on;
    new.met_at      = old.met_at;
    new.company_id  = old.company_id;
  end if;

  /* The paper itself is the author's, and only the author's. */
  if not public.can_edit_meeting(new.id) then
    new.body = old.body;
  end if;

  /* The bin is set through delete_meeting, never by hand. */
  if coalesce(current_setting('app.meeting_deletion', true), '') <> 'on' then
    new.deleted_at = old.deleted_at;
    new.deleted_by = old.deleted_by;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- The one save, told about the second permission
--
-- Restated in full, as every change to this function has been. Two changes
-- from 0050: the gate is the details permission, and the body is written only
-- when the caller is the author. The guard above would have pinned it either
-- way — this is so the function agrees with the guard rather than quietly
-- relying on it.
-- ---------------------------------------------------------------------------
create or replace function public.save_meeting(
  p_meeting_id uuid,
  p_title text,
  p_met_on date,
  p_met_at time,
  p_company_id uuid,
  p_clear_company boolean,
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
         company_id  = case when p_clear_company then null else p_company_id end,
         description = nullif(trim(coalesce(p_description, '')), ''),
         body        = case when writes_body then coalesce(p_body, body) else body end
   where id = p_meeting_id
   returning updated_at into new_stamp;

  return new_stamp;
end;
$$;

comment on function public.save_meeting(uuid, text, date, time, uuid, boolean, text, timestamptz, text) is
  'One write for everything a meeting is. The details need can_edit_meeting_details; the body needs can_edit_meeting. Refuses with SQLSTATE 40001 when the row moved on since the caller last read it.';

revoke all on function public.save_meeting(uuid, text, date, time, uuid, boolean, text, timestamptz, text) from public;
grant execute on function public.save_meeting(uuid, text, date, time, uuid, boolean, text, timestamptz, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Who was in the room, set in one go
--
-- The app used to do this in four statements: delete the contacts, delete the
-- members, insert the contacts, insert the members. Under the old rule that
-- was merely wasteful. Under the new one it is a trap, and worth spelling out
-- because it is not obvious:
--
--   Dee may edit the details BECAUSE she is in meeting_members. Statement two
--   deletes every member row, which is allowed — she is still a member while
--   it runs. Statement four then tries to put them back, and by then she is
--   not a member of anything, so the policy refuses her. She would have wiped
--   the attendee list and been unable to restore it.
--
-- One function, one permission check, taken before anything is deleted. The
-- write policies on the two tables go away entirely: this is the only way in,
-- so there is no second path to keep in step with this one.
-- ---------------------------------------------------------------------------
create or replace function public.set_meeting_attendees(
  p_meeting_id uuid,
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
begin
  if me is null then
    raise exception 'Not on the team.';
  end if;
  if not public.can_edit_meeting_details(p_meeting_id) then
    raise exception 'Only somebody who was at this meeting can change who was there.';
  end if;
  if coalesce(array_length(p_contact_ids, 1), 0) > 40 then
    raise exception 'That is too many people from the book for one meeting.';
  end if;
  if coalesce(array_length(p_member_ids, 1), 0) > 20 then
    raise exception 'That is too many people from the team for one meeting.';
  end if;

  delete from public.meeting_contacts where meeting_id = p_meeting_id;
  delete from public.meeting_members where meeting_id = p_meeting_id;

  insert into public.meeting_contacts (meeting_id, contact_id, added_by)
  select p_meeting_id, id, me from unnest(coalesce(p_contact_ids, '{}'::uuid[])) as id
  on conflict do nothing;

  insert into public.meeting_members (meeting_id, member_id, added_by)
  select p_meeting_id, id, me from unnest(coalesce(p_member_ids, '{}'::uuid[])) as id
  on conflict do nothing;
end;
$$;

comment on function public.set_meeting_attendees(uuid, uuid[], uuid[]) is
  'The only way to change who was at a meeting. One permission check, taken before the delete — see 0051 for the trap that makes this a function rather than four statements.';

revoke all on function public.set_meeting_attendees(uuid, uuid[], uuid[]) from public;
grant execute on function public.set_meeting_attendees(uuid, uuid[], uuid[]) to authenticated;

drop policy if exists "meeting_contacts_write" on public.meeting_contacts;
drop policy if exists "meeting_members_write" on public.meeting_members;

-- ---------------------------------------------------------------------------
-- Erasing for good
--
-- The bin makes binning reversible. This is the other end of it, and the only
-- irreversible thing about a meeting — the same shape as purge_contact and
-- purge_task: it refuses anything not already in the bin, so it is always the
-- second of two deliberate acts, and it returns what it destroyed so the
-- screen can name it. There is no Undo afterwards, because there would be
-- nothing to bring back and the button would be a lie.
--
-- The author's alone, like binning. Tasks that came out of the meeting
-- survive it: `tasks.meeting_id` is `on delete set null`, so the work stays
-- and only its origin is forgotten.
-- ---------------------------------------------------------------------------
create or replace function public.purge_meeting(p_meeting_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.meetings;
  me uuid := public.current_member_id();
  author_active boolean;
  erased jsonb;
begin
  if me is null then
    raise exception 'Not on the team.';
  end if;

  select * into m from public.meetings where id = p_meeting_id;
  if not found then
    raise exception 'Those minutes no longer exist.';
  end if;
  if m.deleted_at is null then
    raise exception 'Move these minutes to the bin first.';
  end if;

  select c.is_active into author_active from public.members c where c.id = m.created_by;
  if m.created_by <> me and coalesce(author_active, false) then
    raise exception 'Only the person who wrote these minutes can erase them.';
  end if;

  select jsonb_build_object(
           'title', m.title,
           'characters', char_length(coalesce(m.body, '')),
           'comments', (select count(*) from public.meeting_comments where meeting_id = p_meeting_id),
           'people', (select count(*) from public.meeting_contacts where meeting_id = p_meeting_id)
                   + (select count(*) from public.meeting_members where meeting_id = p_meeting_id),
           'tasks', (select count(*) from public.tasks
                      where meeting_id = p_meeting_id and deleted_at is null)
         )
    into erased;

  delete from public.meetings where id = p_meeting_id;
  return erased;
end;
$$;

comment on function public.purge_meeting(uuid) is
  'Erases binned minutes for good. Refuses anything not already in the bin. Tasks that came out of the meeting survive — only their origin is forgotten.';

revoke all on function public.purge_meeting(uuid) from public;
grant execute on function public.purge_meeting(uuid) to authenticated;
