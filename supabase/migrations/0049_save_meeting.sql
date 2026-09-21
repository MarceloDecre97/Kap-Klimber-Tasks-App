-- ---------------------------------------------------------------------------
-- 0049 — One save for a meeting, not two
--
-- 0046 split saving in half: `save_meeting_body` for the paper, and a plain
-- update for the title, date and company. Two writes, two buttons, two ideas
-- of what "saved" means — and in use that was worse than it sounds. Marcelo
-- set a title, a company and an attendee, wrote a note, left the page and
-- came back to find none of it there: the details panel had its own Save
-- button he had not pressed, while the paper beside it was autosaving. One
-- half of the screen saved itself and the other quietly did not.
--
-- So there is one write. Everything a meeting is, in a single update, under a
-- single stale check. Attendees stay separate because they are separate
-- tables, but they are synced in the same action and behind the same button.
--
-- Nulls mean "leave alone" for title and date, which cannot be null anyway.
-- The company genuinely can be null — "worked out from who was there" — so it
-- takes p_clear_company rather than trying to read an intention out of a
-- null, which is the trap a nullable argument sets for every caller after
-- the first.
-- ---------------------------------------------------------------------------

create or replace function public.save_meeting(
  p_meeting_id uuid,
  p_title text,
  p_met_on date,
  p_met_at time,
  p_company_id uuid,
  p_clear_company boolean,
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
  if char_length(coalesce(p_body, '')) > 200000 then
    raise exception 'These minutes are too long to save.';
  end if;
  if char_length(trim(coalesce(p_title, ''))) = 0 then
    raise exception 'Give these minutes a title — it is what makes them findable later.';
  end if;

  select updated_at into current_stamp
    from public.meetings where id = p_meeting_id and deleted_at is null;
  if current_stamp is null then
    raise exception 'Those minutes no longer exist.';
  end if;

  /*
    The two-screens check, unchanged from 0046 and now covering the whole
    meeting rather than only its body: Marcelo writes on a laptop and, when
    the laptop dies or the call is on speaker, on a phone. The losing screen
    must not flatten the winning one.
  */
  if p_expected is not null and current_stamp <> p_expected then
    raise exception 'STALE' using errcode = '40001';
  end if;

  update public.meetings
     set title      = p_title,
         met_on     = p_met_on,
         met_at     = p_met_at,
         company_id = case when p_clear_company then null else p_company_id end,
         body       = coalesce(p_body, body)
   where id = p_meeting_id
   returning updated_at into new_stamp;

  return new_stamp;
end;
$$;

comment on function public.save_meeting(uuid, text, date, time, uuid, boolean, text, timestamptz) is
  'One write for everything a meeting is. Refuses with SQLSTATE 40001 when the row moved on since the caller last read it, so a second open screen offers to reload rather than flattening the first. Replaces the split between save_meeting_body and a direct update, which let half a screen save itself while the other half did not.';

revoke all on function public.save_meeting(uuid, text, date, time, uuid, boolean, text, timestamptz) from public;
grant execute on function public.save_meeting(uuid, text, date, time, uuid, boolean, text, timestamptz) to authenticated;

/*
  save_meeting_body stays. It is what the editor calls when only the paper has
  changed, which during a meeting is almost every save, and sending the title
  and the date along with every keystroke-batch would be writing four columns
  to change one.
*/
