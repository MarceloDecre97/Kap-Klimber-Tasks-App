-- ---------------------------------------------------------------------------
-- 0041 — Outreach, recorded by the work rather than by a checkbox
--
-- The question "has anyone contacted this person" was going to be a flag on
-- the contact. A flag drifts: it means "somebody remembered to press a
-- button", and three weeks after a trade show nobody can tell you who or
-- when. So almost none of this is stored.
--
-- "Contacted" is derived. A completed task, marked as outreach, linked to a
-- contact IS the record — the date is the task's completion date and the
-- person is whoever completed it. There is nothing to keep in step with
-- reality because there is no second copy of it.
--
-- Three things are new:
--
--   tasks.is_outreach       what makes a task count. Set once, at creation,
--                           by the Contact button. Pinned forever after.
--   contacts.in_touch_at    the one fact that cannot be derived: they
--   contacts.in_touch_by    answered. That happens in somebody's inbox.
--
-- And the contact cap per task goes from two to four, because one email to
-- four people at the same company is one outreach each.
-- ---------------------------------------------------------------------------

alter table public.tasks
  add column if not exists is_outreach boolean not null default false;

comment on column public.tasks.is_outreach is
  'True only for tasks created by the Contact button on a contact. What separates "I emailed them" from "I fixed their phone number" — without it, completing any task linked to a contact would claim they had been contacted.';

alter table public.contacts
  add column if not exists in_touch_at timestamptz,
  add column if not exists in_touch_by uuid references public.members (id) on delete set null;

alter table public.contacts
  drop constraint if exists contacts_in_touch_pair;

alter table public.contacts
  add constraint contacts_in_touch_pair
    check ((in_touch_at is null) = (in_touch_by is null));

-- ---------------------------------------------------------------------------
-- Four contacts, not two
--
-- 0022 set the cap at two on the reasoning that a task about people is about
-- one or two of them. An email to everybody you met on a stand at MATS is a
-- counter-example, and each recipient earns their own outreach record from
-- the one task.
-- ---------------------------------------------------------------------------
create or replace function public.guard_task_contact_limit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  attached integer;
begin
  select count(*) into attached
  from public.task_contacts
  where task_id = new.task_id;

  if attached >= 4 then
    raise exception 'A task can carry four contacts at most. Take one off to swap it.';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- The marker cannot be edited
--
-- Not by its creator, not by anyone. It says what the task was made for, and
-- a task that could become outreach afterwards would let somebody turn a
-- finished "update their address" into evidence of an email that never
-- happened. Pinned unconditionally, outside the creator check, because this
-- is not a permission — nobody has it.
-- ---------------------------------------------------------------------------
create or replace function public.guard_task_edit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.is_outreach = old.is_outreach;

  if not public.can_edit_task(new.id) then
    new.title       = old.title;
    new.description = old.description;
    new.category_id = old.category_id;
    new.priority    = old.priority;
    new.due_date    = old.due_date;
    new.reminder_at = old.reminder_at;

    /*
      Status is the assignee's to move. Somebody neither assigned nor the
      creator has no business marking a task complete — and since 0037 they
      are looking at it on the team timeline, where the buttons are.

      Nested inside the creator check on purpose: a creator who is not an
      assignee still moves their own task.
    */
    if not public.is_task_assignee(new.id) then
      new.status       = old.status;
      new.completed_at = old.completed_at;
      new.completed_by = old.completed_by;
    end if;
  end if;
  return new;
end;
$$;

comment on function public.guard_task_edit() is
  'Pins what the writer may not change: is_outreach for everybody, the content columns unless they created the task, and the status columns unless they are also on it. Deletion columns are left to guard_task_deletion — request_task_deletion is by definition a non-creator writing to the task.';

-- ---------------------------------------------------------------------------
-- Who may say somebody answered
--
-- The creator of a completed outreach task for this person, or anyone who
-- was assigned to it. Those are the people who actually did the reaching
-- out. Not "anyone on the team", because this is an assertion rather than a
-- record — nothing in the app can check it — and the narrower the set of
-- people who can make it, the more it is worth.
--
-- The inactive-creator escape hatch is the same one can_edit_task and
-- can_decide_task_deletion carry: work should not become unreachable
-- because somebody left.
-- ---------------------------------------------------------------------------
create or replace function public.can_confirm_in_touch(p_contact_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.task_contacts tc
    join public.tasks t on t.id = tc.task_id
    join public.members c on c.id = t.created_by
    left join public.task_assignees a
      on a.task_id = t.id and a.member_id = public.current_member_id()
    where tc.contact_id = p_contact_id
      and t.is_outreach
      and t.status = 'complete'
      and t.deleted_at is null
      and public.is_team_member()
      and (c.id = public.current_member_id() or a.member_id is not null or not c.is_active)
  );
$$;

revoke all on function public.can_confirm_in_touch(uuid) from public;
grant execute on function public.can_confirm_in_touch(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The only way those two columns move
--
-- RLS chooses rows and cannot protect columns, so contacts_update would
-- otherwise let anybody write in_touch_at straight through PostgREST — the
-- same hole 0033 found on tasks, and the same fix: pin the columns in a
-- BEFORE UPDATE trigger and give exactly one function the key.
--
-- The key is a transaction-local setting. It exists only inside this
-- function's own statement, so there is no way to turn it on from outside
-- and no way for it to leak into the next request on a pooled connection.
-- ---------------------------------------------------------------------------
create or replace function public.guard_contact_in_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('app.in_touch_write', true), '') <> 'on' then
    new.in_touch_at = old.in_touch_at;
    new.in_touch_by = old.in_touch_by;
  end if;
  return new;
end;
$$;

comment on function public.guard_contact_in_touch() is
  'Pins in_touch_at and in_touch_by against every writer but set_contact_in_touch. A direct PostgREST update of those columns is discarded rather than refused, the same way guard_task_edit discards — an ordinary contact save sends every column, and raising would turn a harmless no-op into a failed save.';

drop trigger if exists contacts_guard_in_touch on public.contacts;
create trigger contacts_guard_in_touch
  before update on public.contacts
  for each row execute function public.guard_contact_in_touch();

create or replace function public.set_contact_in_touch(p_contact_id uuid, p_on boolean)
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

  if p_on and not public.can_confirm_in_touch(p_contact_id) then
    raise exception 'Only the people on a completed outreach task can say they answered.';
  end if;

  /*
    Turning it off is held to the same rule as turning it on. An undo that
    anybody could press would make the record worth less than the button
    that set it.
  */
  if not p_on and not public.can_confirm_in_touch(p_contact_id) then
    raise exception 'Only the people on a completed outreach task can take that back.';
  end if;

  perform set_config('app.in_touch_write', 'on', true);

  update public.contacts
     set in_touch_at = case when p_on then now() else null end,
         in_touch_by = case when p_on then me else null end
   where id = p_contact_id
     and deleted_at is null;

  perform set_config('app.in_touch_write', 'off', true);
end;
$$;

revoke all on function public.set_contact_in_touch(uuid, boolean) from public;
grant execute on function public.set_contact_in_touch(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- The log learns it
--
-- Restated in full, as 0030, 0039 and 0040 were. Logged as a plain yes, not
-- as a timestamp: the log already carries when it happened and who did it,
-- and "In touch: 2026-09-20T14:03:11Z" tells a person nothing twice.
-- ---------------------------------------------------------------------------
create or replace function public.record_contact_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := public.current_member_id();
begin
  if tg_op = 'INSERT' then
    insert into public.contact_events (contact_id, member_id, kind)
    values (new.id, actor, 'created');
    return new;
  end if;

  -- The bin, in and out. Reported as its own kind rather than as a field
  -- edit, because that is how a person reading the log thinks of it.
  if old.deleted_at is null and new.deleted_at is not null then
    insert into public.contact_events (contact_id, member_id, kind)
    values (new.id, coalesce(new.deleted_by, actor), 'deleted');
    return new;
  end if;
  if old.deleted_at is not null and new.deleted_at is null then
    insert into public.contact_events (contact_id, member_id, kind)
    values (new.id, actor, 'restored');
    return new;
  end if;

  -- Every plain field, compared old to new. `is distinct from` rather than
  -- `<>` so a value going to or from null counts as a change.
  if new.first_name is distinct from old.first_name then
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'First name', old.first_name, new.first_name); end if;
  if new.last_name is distinct from old.last_name then
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'Last name', old.last_name, new.last_name); end if;
  if new.job_title is distinct from old.job_title then
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'Job title', old.job_title, new.job_title); end if;
  if new.company is distinct from old.company then
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'Company', old.company, new.company); end if;
  if new.mobile is distinct from old.mobile then
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'Mobile', old.mobile, new.mobile); end if;
  if new.office_phone is distinct from old.office_phone then
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'Office phone', old.office_phone, new.office_phone); end if;
  if new.office_phone_ext is distinct from old.office_phone_ext then
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'Extension', old.office_phone_ext, new.office_phone_ext); end if;
  if new.email is distinct from old.email then
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'Email', old.email::text, new.email::text); end if;
  if new.email2 is distinct from old.email2 then
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'Second email', old.email2::text, new.email2::text); end if;
  if new.website is distinct from old.website then
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'Website', old.website, new.website); end if;
  if new.street is distinct from old.street then
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'Street', old.street, new.street); end if;
  if new.suite is distinct from old.suite then
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'Suite', old.suite, new.suite); end if;
  if new.city is distinct from old.city then
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'City', old.city, new.city); end if;
  if new.state is distinct from old.state then
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'State', old.state, new.state); end if;
  if new.postal_code is distinct from old.postal_code then
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'ZIP', old.postal_code, new.postal_code); end if;
  if new.country is distinct from old.country then
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'Country', old.country, new.country); end if;
  if new.source is distinct from old.source then
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'Where they came from', old.source, new.source); end if;
  if new.trade_show is distinct from old.trade_show
     or new.trade_show_year is distinct from old.trade_show_year then
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'Trade show',
            public.trade_show_label(old.trade_show, old.trade_show_year),
            public.trade_show_label(new.trade_show, new.trade_show_year)); end if;
  if new.in_touch_at is distinct from old.in_touch_at then
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'In touch',
            case when old.in_touch_at is null then null else 'Yes' end,
            case when new.in_touch_at is null then null else 'Yes' end); end if;
  if new.notes is distinct from old.notes then
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'Notes', old.notes, new.notes); end if;

  return new;
end;
$$;
