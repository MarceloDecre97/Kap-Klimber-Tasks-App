-- ---------------------------------------------------------------------------
-- 0039 — Where they came from, the half you can filter by
--
-- `source` is free text and stays that way. It holds things like "Site visit
-- from Dee Kapur" — a story about one person, true and worth keeping, and
-- something nobody will ever filter by. Building a dropdown out of that
-- column would list it beside "MATS 2026" as if they were the same kind of
-- thing, and after an import of several hundred rows the list would be
-- mostly one-of-a-kind sentences.
--
-- So the filterable half gets its own two columns. Two, not one: with a
-- single "MATS 2026" string, MATS 2025 and MATS 2026 are unrelated text and
-- "everyone we have ever met at MATS" cannot be asked. Split, the show is
-- the show and the year hangs off it.
--
-- A year with no show is meaningless — it is not a fact about anybody — so
-- the database refuses it. A show with no year is fine: you met them at
-- MATS and cannot remember which one.
-- ---------------------------------------------------------------------------

alter table public.contacts
  add column if not exists trade_show text,
  add column if not exists trade_show_year smallint;

alter table public.contacts
  drop constraint if exists contacts_trade_show_length,
  drop constraint if exists contacts_trade_show_year_needs_show,
  drop constraint if exists contacts_trade_show_year_range;

alter table public.contacts
  add constraint contacts_trade_show_length
    check (trade_show is null or char_length(trade_show) between 1 and 120),
  add constraint contacts_trade_show_year_needs_show
    check (trade_show_year is null or trade_show is not null),
  /*
    1990 is before this industry's shows were worth recording and 2100 is
    well past anyone filling this in. The range exists to catch a mistyped
    phone number or a two-digit year, not to be a statement about history.
  */
  add constraint contacts_trade_show_year_range
    check (trade_show_year is null or trade_show_year between 1990 and 2100);

-- ---------------------------------------------------------------------------
-- The label, in one place
--
-- "MATS 2026", or "MATS" when the year is unknown. Written here as well as
-- in TypeScript because both the log below and the app have to agree on what
-- a trade show is called — and a log that spells it differently to the
-- screen is a log people stop trusting.
-- ---------------------------------------------------------------------------
create or replace function public.trade_show_label(show text, year smallint)
returns text
language sql
immutable
as $$
  select case
    when show is null then null
    when year is null then show
    else show || ' ' || year::text
  end;
$$;

-- ---------------------------------------------------------------------------
-- Mandy, moved
--
-- She is the one contact carrying a show in the free-text box. Moving her
-- means the filter has something in it on day one rather than being an empty
-- dropdown that looks broken.
--
-- With the log trigger disabled for exactly this statement. Left on, the
-- backfill would write "changed Where they came from" into her history as an
-- edit by nobody — current_member_id() is null in a migration, there being
-- no session. That is the same spurious-activity problem 0036 cleaned up,
-- and it is easier not to create it than to delete it afterwards.
-- ---------------------------------------------------------------------------
alter table public.contacts disable trigger contacts_record_event_update;

update public.contacts
   set trade_show = 'MATS',
       trade_show_year = 2026,
       source = null
 where source = 'MATS 2026';

alter table public.contacts enable trigger contacts_record_event_update;

-- ---------------------------------------------------------------------------
-- The log learns the new fields
--
-- record_contact_event() names every column explicitly, so a new one is
-- invisible to it until said out loud — which is how Suite and Country went
-- unlogged from 0023 until 0030 noticed. Restated in full because
-- `create or replace function` takes no less.
--
-- The two columns are logged as one line under "Trade show", carrying the
-- combined label. Somebody setting a show and its year at once did one
-- thing, and a log that reports it as two is a log that has stopped
-- describing what happened.
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
