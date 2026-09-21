-- ---------------------------------------------------------------------------
-- 0050 — A meeting says what it was about, in its own words
--
-- The card in the list was showing the first 160 characters of the minutes,
-- which is whatever you happened to type first. "Mike Morrison, Kevin Scott.
-- Kevin joined late." is a fine opening line and a useless summary, and on a
-- meeting written in a hurry the card reads as noise.
--
-- So the summary is its own field, written on purpose and never derived.
-- Short by design: 200 characters is two lines on a 360px card, and a limit
-- that forces a sentence produces a sentence. Optional, because a meeting you
-- create thirty seconds before it starts has nothing to summarise yet — and
-- when it is empty the card simply shows nothing rather than falling back to
-- the body, which is the behaviour this replaces.
-- ---------------------------------------------------------------------------

alter table public.meetings
  add column if not exists description text
    check (description is null or char_length(description) <= 200);

comment on column public.meetings.description is
  'What the meeting was about, in one line, written rather than derived. Shown on the card in the list; when empty the card shows nothing rather than falling back to the minutes.';

-- ---------------------------------------------------------------------------
-- Carried by the one save, like everything else
--
-- Restated in full, as every change to this function has been. The only
-- difference from 0049 is the description, and the same rule applies to it as
-- to the company: null is a real answer, so clearing it is said outright
-- rather than inferred from a null argument.
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
begin
  if public.current_member_id() is null then
    raise exception 'Not on the team.';
  end if;
  if not public.can_edit_meeting(p_meeting_id) then
    raise exception 'Only the person who wrote these minutes can change them.';
  end if;
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
         body        = coalesce(p_body, body)
   where id = p_meeting_id
   returning updated_at into new_stamp;

  return new_stamp;
end;
$$;

comment on function public.save_meeting(uuid, text, date, time, uuid, boolean, text, timestamptz, text) is
  'One write for everything a meeting is. Refuses with SQLSTATE 40001 when the row moved on since the caller last read it.';

revoke all on function public.save_meeting(uuid, text, date, time, uuid, boolean, text, timestamptz, text) from public;
grant execute on function public.save_meeting(uuid, text, date, time, uuid, boolean, text, timestamptz, text) to authenticated;

/*
  The eight-argument version from 0049, dropped rather than left beside its
  successor. Postgres overloads on argument list, so leaving it would make
  `save_meeting(...)` ambiguous from any caller that omits the description —
  and the one that answered would be the one that silently discards it.
*/
drop function if exists public.save_meeting(uuid, text, date, time, uuid, boolean, text, timestamptz);

-- ---------------------------------------------------------------------------
-- The bin needs no new function
--
-- Marcelo asked where the bin was three times, which is the clearest possible
-- signal that binning something with no way to get it back is worse than no
-- bin at all. It is a screen, not a migration: `meetings_select` in 0046
-- already admits the whole team to every row, binned or not, and
-- `delete_meeting(id, false)` already puts one back. What was missing was
-- somewhere to look, and that is in the app.
--
-- Written down here because the absence is the decision. A
-- `list_binned_meetings()` was drafted and dropped: it would have returned
-- bare meeting rows, so the bin would have shown titles without the people or
-- the company every other list of meetings shows, and it would have been a
-- second definition of "what is in the bin" to keep in step with the first.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- The guard has to know about the new column
--
-- RLS chooses rows and cannot protect columns, so `meetings_update` admits
-- every team member to the write and this trigger pins what a non-author may
-- not have changed. A column it has never heard of is a column it does not
-- pin — so adding `description` above without adding it here would leave
-- Fred able to rewrite the one line of Marcelo's meeting that shows on the
-- card, with one API call and no screen needed.
--
-- Restated in full, which is the rule: read the live definition, add the line,
-- put the whole thing back. Verified against production before editing.
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
  if not public.can_edit_meeting(new.id) then
    new.title       = old.title;
    new.description = old.description;
    new.met_on      = old.met_on;
    new.met_at      = old.met_at;
    new.company_id  = old.company_id;
    new.body        = old.body;
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
-- And so does the history
--
-- Title, date, time and company are logged; the body is not, because autosave
-- would write a line every few seconds and the history would be unreadable.
-- The description is typed once and changed rarely, which puts it with the
-- first group rather than the second.
-- ---------------------------------------------------------------------------
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
  if new.company_id is distinct from old.company_id then
    insert into public.meeting_events (meeting_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'Company',
            (select name from public.companies where id = old.company_id),
            (select name from public.companies where id = new.company_id)); end if;

  return new;
end;
$$;
