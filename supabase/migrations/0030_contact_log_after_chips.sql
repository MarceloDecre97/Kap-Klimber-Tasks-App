-- ---------------------------------------------------------------------------
-- 0030 — The activity log, after the chips changed
--
-- 0029 dropped contacts.category_id and the contact_categories table, but
-- record_contact_event() still read both. Postgres does not check the body of
-- a plpgsql function when a column is dropped — the reference is only
-- resolved when the function runs — so nothing failed at migration time and
-- everything failed at the next save:
--
--   record "new" has no field "category_id"
--
-- That is my mistake in 0029: I dropped a column without looking for what
-- read it. The lesson is in the query, not the apology — pg_proc.prosrc is
-- searchable, and any future drop should be preceded by grepping it.
--
-- While the function is being rewritten it also picks up two fields it never
-- logged. Suite and Country arrived in 0023 and were never added here, so
-- changing either left no trace in a log whose whole job is that anyone can
-- edit anyone.
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
  -- Added here, having been missed when 0023 created them.
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
  if new.notes is distinct from old.notes then
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'Notes', old.notes, new.notes); end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Relationships are logged too
--
-- The chip used to be a column on the contact, so the trigger above caught
-- it. It is a join table now, and without this the log would quietly stop
-- recording a kind of change it used to record — on the one screen whose
-- whole purpose is that anyone may edit anyone.
--
-- The label is stored, not the uuid: this log is read by people.
-- ---------------------------------------------------------------------------
create or replace function public.record_relationship_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := public.current_member_id();
  label text;
begin
  if tg_op = 'INSERT' then
    select r.label into label from public.contact_relationships r where r.id = new.relationship_id;
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.contact_id, actor, 'edited', 'What they are to us', null, label);
    return new;
  end if;

  select r.label into label from public.contact_relationships r where r.id = old.relationship_id;
  insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
  values (old.contact_id, actor, 'edited', 'What they are to us', label, null);
  return old;
end;
$$;

drop trigger if exists contact_relationship_links_record on public.contact_relationship_links;
create trigger contact_relationship_links_record
  after insert or delete on public.contact_relationship_links
  for each row execute function public.record_relationship_event();

-- ---------------------------------------------------------------------------
-- One more pass over the phones
--
-- 0028 left a number alone whenever its national part was not a shape we
-- know — a nine-digit Swiss mobile, for instance. Correct, and unreadable:
-- "+41793573300" is eleven digits with no break in it.
--
-- So the country code is now separated from the rest, and only that. No
-- grouping is invented for the national part, because we do not know one;
-- and a number that was already spaced by hand is left untouched, since
-- whoever typed it has already said how they want it read.
-- ---------------------------------------------------------------------------
create or replace function pg_temp.split_calling_code(raw text)
returns text
language plpgsql
immutable
as $$
declare
  v text := btrim(coalesce(raw, ''));
  digits text;
  code text;
begin
  -- Only an unspaced "+" number is a candidate.
  if v = '' or left(v, 1) <> '+' or v ~ '\s' then return v; end if;

  digits := regexp_replace(v, '\D', '', 'g');
  if digits = '' then return v; end if;

  -- Longest match first, so 212 wins over 21 and 1 is reached last.
  foreach code in array array[
    '211','212','213','216','218','220','221','222','223','224','225','226',
    '227','228','229','230','231','232','233','234','235','236','237','238',
    '239','240','241','242','243','244','245','246','248','249','250','251',
    '252','253','254','255','256','257','258','260','261','262','263','264',
    '265','266','267','268','269','290','291','297','298','299','350','351',
    '352','353','354','355','356','357','358','359','370','371','372','373',
    '374','375','376','377','378','380','381','382','383','385','386','387',
    '389','420','421','423','500','501','502','503','504','505','506','507',
    '508','509','590','591','592','593','595','597','598','599','670','673',
    '674','675','676','677','678','679','680','681','682','683','685','686',
    '687','688','689','690','691','692','850','852','853','855','856','880',
    '886','960','961','962','963','964','965','966','967','968','970','972',
    '973','974','975','976','977','992','993','994','995','996','998',
    '20','27','30','31','32','33','34','36','39','40','41','43','44','45',
    '46','47','48','49','51','52','53','54','55','56','57','58','60','61',
    '62','63','64','65','66','81','82','84','86','90','91','92','93','94',
    '95','98','1','7'
  ] loop
    if left(digits, length(code)) = code then
      return '+' || code || ' ' || substr(digits, length(code) + 1);
    end if;
  end loop;

  return v;
end;
$$;

update public.contacts set mobile = pg_temp.split_calling_code(mobile)
where mobile is not null and mobile <> pg_temp.split_calling_code(mobile);

update public.contacts set office_phone = pg_temp.split_calling_code(office_phone)
where office_phone is not null and office_phone <> pg_temp.split_calling_code(office_phone);

update public.companies set company_number = pg_temp.split_calling_code(company_number)
where company_number is not null and company_number <> pg_temp.split_calling_code(company_number);

drop function if exists pg_temp.split_calling_code(text);
