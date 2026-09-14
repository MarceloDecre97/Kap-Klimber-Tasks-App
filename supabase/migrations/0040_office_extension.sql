-- ---------------------------------------------------------------------------
-- 0040 — The extension, out of the notes
--
-- The first real import arrived with "Ext. 228", "Ext. 5304" and "Ext. 3551"
-- written into Notes, because there was nowhere else to put them. That is
-- the right instinct and the wrong home: an extension is part of how you
-- reach somebody, so it belongs beside the number — and in the link, so a
-- phone dials it rather than leaving you to read it off the screen and type
-- it at a switchboard.
--
-- Digits only, and only alongside an office line. An extension with no
-- number to hang off is not a way to reach anybody, which is the same rule —
-- and the same reasoning — as the trade show year in 0039.
-- ---------------------------------------------------------------------------

alter table public.contacts
  add column if not exists office_phone_ext text;

alter table public.contacts
  drop constraint if exists contacts_office_ext_shape,
  drop constraint if exists contacts_office_ext_needs_line;

alter table public.contacts
  add constraint contacts_office_ext_shape
    check (office_phone_ext is null or office_phone_ext ~ '^[0-9]{1,10}$'),
  add constraint contacts_office_ext_needs_line
    check (office_phone_ext is null or office_phone is not null);

-- ---------------------------------------------------------------------------
-- The log learns it too
--
-- Restated in full, as 0039 and 0030 were: create or replace takes no less,
-- and a column this function has not been told about is a column whose
-- changes leave no trace.
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
  if new.notes is distinct from old.notes then
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'Notes', old.notes, new.notes); end if;

  return new;
end;
$$;
