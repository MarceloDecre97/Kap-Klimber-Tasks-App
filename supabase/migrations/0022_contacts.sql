-- ---------------------------------------------------------------------------
-- 0022 — The address book
--
-- A shared book of people outside Opus Kap: prospects who came in through the
-- website, the fleets running Kap Klimber units, Multimatic and the other
-- partners, suppliers. Teammates are not in here — they are `members`, which
-- is what assignment and @mentions already use.
--
-- Purely additive. Not one existing table is altered, so an app that has not
-- yet been taught about contacts behaves exactly as it did before this ran.
--
-- Three rules live here rather than in the form, because a rule the database
-- does not keep is a rule the next code path forgets:
--   * at most two contacts on a task,
--   * a contact cannot leave while a task still needs it,
--   * and deleting one takes two deliberate steps.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Categories
--
-- A table rather than a check constraint, mirroring public.categories: a
-- four-person company selling a new product will change what it calls these
-- buckets, and that should be an insert, not a migration. `icon` is a name
-- the app maps to a Lucide icon through a whitelist — an unknown name falls
-- back to a neutral one rather than breaking the row.
-- ---------------------------------------------------------------------------
create table if not exists public.contact_categories (
  id uuid primary key default gen_random_uuid(),
  label text not null unique check (char_length(trim(label)) between 1 and 60),
  icon text not null default 'user' check (char_length(icon) <= 40),
  -- Explicit rather than alphabetical: Prospects first because that is where
  -- most of the inbound lands, Other last because it is the fallback.
  sort_order integer not null default 100,
  is_default boolean not null default false,
  created_by uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.contact_categories is
  'What kind of contact this is. Anyone on the team can add one; editing and removing is admin/service-role only, same as public.categories.';

insert into public.contact_categories (label, icon, sort_order, is_default) values
  ('Prospects', 'target',      10, true),
  ('Customers', 'truck',       20, true),
  ('Partners',  'handshake',   30, true),
  ('Suppliers', 'package',     40, true),
  ('Industry',  'landmark',    50, true),
  ('Investors', 'trending-up', 60, true),
  ('Other',     'user',       100, true)
on conflict (label) do nothing;

-- ---------------------------------------------------------------------------
-- Contacts
-- ---------------------------------------------------------------------------
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),

  first_name text not null check (char_length(trim(first_name)) between 1 and 80),
  -- Required, deliberately. The book sorts by surname, and "Marion, no
  -- surname" filed under M is worse than being made to go and find it out.
  -- When it genuinely is not known the team writes what they do know.
  last_name  text not null check (char_length(trim(last_name)) between 1 and 80),
  job_title  text check (job_title is null or char_length(job_title) <= 120),
  company    text check (company is null or char_length(company) <= 120),

  mobile       text check (mobile is null or char_length(mobile) <= 40),
  office_phone text check (office_phone is null or char_length(office_phone) <= 40),
  -- citext, so marion@x.com and Marion@X.com are one address rather than two
  -- rows nobody notices are the same person. members.email already uses it.
  email  citext check (email is null or char_length(email) <= 200),
  email2 citext check (email2 is null or char_length(email2) <= 200),
  website text check (website is null or char_length(website) <= 300),

  street      text check (street is null or char_length(street) <= 200),
  city        text check (city is null or char_length(city) <= 100),
  state       text check (state is null or char_length(state) <= 60),
  postal_code text check (postal_code is null or char_length(postal_code) <= 20),

  category_id uuid references public.contact_categories (id) on delete set null,
  source text check (source is null or char_length(source) <= 200),
  notes  text check (notes is null or char_length(notes) <= 4000),

  created_by uuid not null references public.members (id),
  -- The bin. Two columns because the list has to say who put it there.
  deleted_at timestamptz,
  deleted_by uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A contact nobody can reach is a row, not a contact.
  constraint contacts_reachable check (
    coalesce(nullif(trim(mobile), ''), nullif(trim(office_phone), ''),
             nullif(trim(email::text), ''), nullif(trim(email2::text), '')) is not null
  )
);

/*
  Phone numbers, stripped to digits, for the duplicate check only.

  Stored as typed — "(847) 555 0164" is how a person reads a number back —
  but compared as digits, or the same number entered twice in two formats
  passes the check that exists to catch exactly that.
*/
alter table public.contacts
  add column if not exists mobile_digits text
    generated always as (nullif(regexp_replace(coalesce(mobile, ''), '\D', '', 'g'), '')) stored,
  add column if not exists office_digits text
    generated always as (nullif(regexp_replace(coalesce(office_phone, ''), '\D', '', 'g'), '')) stored;

comment on table public.contacts is
  'Shared address book of people outside the company. Soft-deleted into a bin; hard deletion only through purge_contact.';

-- The book, minus the bin: the list, the search and the picker all read this.
create index if not exists contacts_live_idx
  on public.contacts (last_name, first_name) where deleted_at is null;
create index if not exists contacts_company_idx
  on public.contacts (company) where deleted_at is null;
create index if not exists contacts_category_idx
  on public.contacts (category_id) where deleted_at is null;
-- The duplicate check, which deliberately searches the bin too.
create index if not exists contacts_email_idx  on public.contacts (email);
create index if not exists contacts_email2_idx on public.contacts (email2);
create index if not exists contacts_mobile_digits_idx on public.contacts (mobile_digits);
create index if not exists contacts_office_digits_idx on public.contacts (office_digits);

drop trigger if exists contacts_set_updated_at on public.contacts;
create trigger contacts_set_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Contacts on a task
-- ---------------------------------------------------------------------------
create table if not exists public.task_contacts (
  task_id    uuid not null references public.tasks (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  attached_by uuid references public.members (id) on delete set null,
  attached_at timestamptz not null default now(),
  primary key (task_id, contact_id)
);

create index if not exists task_contacts_contact_idx on public.task_contacts (contact_id);

comment on table public.task_contacts is
  'Up to two contacts per task. Cascades both ways: erasing a task or a contact removes the link, which is what takes the pill off a completed task.';

-- ---------------------------------------------------------------------------
-- At most two
--
-- In the database rather than the form, because the form is one of several
-- ways a row can arrive here and the cap is not a suggestion. Two is the
-- number the interface is drawn for: a third pill has nowhere to go.
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

  if attached >= 2 then
    raise exception 'A task can carry two contacts at most. Take one off to swap it.';
  end if;
  return new;
end;
$$;

drop trigger if exists task_contacts_limit on public.task_contacts;
create trigger task_contacts_limit
  before insert on public.task_contacts
  for each row execute function public.guard_task_contact_limit();

-- ---------------------------------------------------------------------------
-- The activity log
--
-- Anyone on the team can edit anyone's contact — a wrong phone number should
-- be fixable by whoever notices, not only by whoever typed it. That only
-- works if the book can also say who changed what, so this is the price of
-- the open edit rule rather than a nice extra.
--
-- Written by a trigger, so no code path can forget.
-- ---------------------------------------------------------------------------
create table if not exists public.contact_events (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts (id) on delete cascade,
  -- Null when the change came from a path with no member session: a
  -- service-role script, or the SQL editor.
  member_id uuid references public.members (id) on delete set null,
  kind text not null check (kind in ('created', 'edited', 'deleted', 'restored')),
  -- Which field moved, and where from. Null on created/deleted/restored,
  -- where the row itself is the news.
  field text,
  from_value text,
  to_value text,
  created_at timestamptz not null default now()
);

create index if not exists contact_events_contact_idx
  on public.contact_events (contact_id, created_at desc);

comment on table public.contact_events is
  'Append-only log of who changed what on a contact. Written by trigger; never updated or deleted by the app.';

/*
  One row per field that actually moved.

  Security definer because contact_events is select-only for members: a
  trigger running as the caller would be refused by the table's own policy.
*/
create or replace function public.record_contact_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := public.current_member_id();
  cat_from text;
  cat_to text;
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
  if new.city is distinct from old.city then
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'City', old.city, new.city); end if;
  if new.state is distinct from old.state then
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'State', old.state, new.state); end if;
  if new.postal_code is distinct from old.postal_code then
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'ZIP', old.postal_code, new.postal_code); end if;
  if new.source is distinct from old.source then
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'Where they came from', old.source, new.source); end if;
  if new.notes is distinct from old.notes then
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'Notes', old.notes, new.notes); end if;

  -- The category logs its label, not its uuid: the log is read by people.
  if new.category_id is distinct from old.category_id then
    select label into cat_from from public.contact_categories where id = old.category_id;
    select label into cat_to   from public.contact_categories where id = new.category_id;
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.id, actor, 'edited', 'Category', cat_from, cat_to);
  end if;

  return new;
end;
$$;

drop trigger if exists contacts_record_event_insert on public.contacts;
create trigger contacts_record_event_insert
  after insert on public.contacts
  for each row execute function public.record_contact_event();

drop trigger if exists contacts_record_event_update on public.contacts;
create trigger contacts_record_event_update
  after update on public.contacts
  for each row execute function public.record_contact_event();

-- ---------------------------------------------------------------------------
-- Deleting a contact
--
-- Two deliberate actions, and a rule about when the first one is even
-- allowed. A contact attached to a task that is not finished cannot leave:
-- the number belongs to the job while the job is live. Once every task
-- holding it is Complete — or has been erased for good, which takes the link
-- with it — the contact can go to the bin, and from the bin somebody can
-- erase it. The pill leaves a completed task only at that second step.
--
-- A task sitting in Recently deleted still blocks, deliberately: it can be
-- restored, and it would come back wanting its contact.
-- ---------------------------------------------------------------------------

/** The unfinished tasks standing between this contact and the bin. */
create or replace function public.contact_blocking_tasks(p_contact_id uuid)
returns table (task_id uuid, title text, status text)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.title, t.status
  from public.task_contacts tc
  join public.tasks t on t.id = tc.task_id
  where tc.contact_id = p_contact_id
    and t.status <> 'complete'
  order by t.created_at;
$$;

/*
  The guard.

  deleted_at and deleted_by are pinned against every ordinary write, exactly
  as the task deletion columns are: an edit form sends every column, and a
  contact must not arrive in the bin because somebody saved a phone number.
  The two functions below raise the signal that lets them move.

  Pinned rather than rejected — raising here would turn a harmless no-op
  write into a failed save.
*/
create or replace function public.guard_contact_deletion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('app.contact_deletion_op', true), '') <> '1' then
    new.deleted_at = old.deleted_at;
    new.deleted_by = old.deleted_by;
  end if;
  return new;
end;
$$;

drop trigger if exists contacts_guard_deletion on public.contacts;
-- Named to sort before contacts_record_event_update only by convention; it is
-- a BEFORE trigger and that one is AFTER, so they cannot interfere.
create trigger contacts_guard_deletion
  before update on public.contacts
  for each row execute function public.guard_contact_deletion();

/** Step one: into the bin. Anyone on the team, and the book records who. */
create or replace function public.delete_contact(p_contact_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := public.current_member_id();
  blocker text;
begin
  if actor is null then
    raise exception 'Not signed in.';
  end if;
  if not exists (select 1 from public.contacts where id = p_contact_id and deleted_at is null) then
    raise exception 'That contact is not in the book.';
  end if;

  select title into blocker from public.contact_blocking_tasks(p_contact_id) limit 1;
  if blocker is not null then
    raise exception 'Still needed on a task that is not finished: %', blocker;
  end if;

  perform set_config('app.contact_deletion_op', '1', true);
  update public.contacts
  set deleted_at = now(), deleted_by = actor
  where id = p_contact_id;
  perform set_config('app.contact_deletion_op', '', true);
end;
$$;

/** Out of the bin, unchanged. */
create or replace function public.restore_contact(p_contact_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_member_id() is null then
    raise exception 'Not signed in.';
  end if;
  if not exists (select 1 from public.contacts where id = p_contact_id and deleted_at is not null) then
    raise exception 'That contact is not in Recently deleted.';
  end if;

  perform set_config('app.contact_deletion_op', '1', true);
  update public.contacts
  set deleted_at = null, deleted_by = null
  where id = p_contact_id;
  perform set_config('app.contact_deletion_op', '', true);
end;
$$;

/*
  Step two, and the only irreversible thing here.

  Only from the bin — never in one action from the book — and it returns what
  it destroyed so the confirmation can name it. The task_contacts rows cascade
  away with it, which is what finally takes the pill off a completed task.

  There is deliberately no DELETE policy on public.contacts, so PostgREST
  refuses a hard delete outright; this function is the single way through.
*/
create or replace function public.purge_contact(p_contact_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.contacts;
  erased jsonb;
begin
  if public.current_member_id() is null then
    raise exception 'Not signed in.';
  end if;

  select * into c from public.contacts where id = p_contact_id;
  if not found then
    raise exception 'That contact no longer exists.';
  end if;
  if c.deleted_at is null then
    raise exception 'Move the contact to Recently deleted first.';
  end if;

  select jsonb_build_object(
           'name', trim(c.first_name || ' ' || c.last_name),
           'phones', (case when nullif(trim(c.mobile), '') is not null then 1 else 0 end)
                   + (case when nullif(trim(c.office_phone), '') is not null then 1 else 0 end),
           'emails', (case when c.email is not null then 1 else 0 end)
                   + (case when c.email2 is not null then 1 else 0 end),
           'addresses', (case when nullif(trim(coalesce(c.street, '')), '') is not null then 1 else 0 end),
           'tasks', (select count(*) from public.task_contacts where contact_id = p_contact_id)
         )
    into erased;

  delete from public.contacts where id = p_contact_id;
  return erased;
end;
$$;

-- ---------------------------------------------------------------------------
-- The duplicate check
--
-- A warning, never a block: two people genuinely can share a number — a
-- shared office line is the obvious case. It searches the bin as well, and
-- says so, or you would re-add somebody you deliberately removed.
-- ---------------------------------------------------------------------------
create or replace function public.find_contact_duplicates(
  p_email text default null,
  p_email2 text default null,
  p_mobile text default null,
  p_office text default null,
  p_exclude_id uuid default null
)
returns table (
  id uuid,
  first_name text,
  last_name text,
  job_title text,
  company text,
  matched_on text,
  in_bin boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with wanted as (
    select
      nullif(trim(p_email), '')::citext  as em1,
      nullif(trim(p_email2), '')::citext as em2,
      nullif(regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g'), '') as mob,
      nullif(regexp_replace(coalesce(p_office, ''), '\D', '', 'g'), '') as off
  )
  select c.id, c.first_name, c.last_name, c.job_title, c.company,
         case
           when w.em1 is not null and c.email  = w.em1 then 'that email'
           when w.em1 is not null and c.email2 = w.em1 then 'that email'
           when w.em2 is not null and c.email  = w.em2 then 'that second email'
           when w.em2 is not null and c.email2 = w.em2 then 'that second email'
           when w.mob is not null and c.mobile_digits = w.mob then 'that mobile number'
           when w.mob is not null and c.office_digits = w.mob then 'that mobile number'
           when w.off is not null and c.mobile_digits = w.off then 'that office number'
           else 'that office number'
         end as matched_on,
         c.deleted_at is not null as in_bin
  from public.contacts c
  cross join wanted w
  where (p_exclude_id is null or c.id <> p_exclude_id)
    and (
      (w.em1 is not null and (c.email = w.em1 or c.email2 = w.em1)) or
      (w.em2 is not null and (c.email = w.em2 or c.email2 = w.em2)) or
      (w.mob is not null and (c.mobile_digits = w.mob or c.office_digits = w.mob)) or
      (w.off is not null and (c.mobile_digits = w.off or c.office_digits = w.off))
    )
  order by c.deleted_at nulls first, c.last_name, c.first_name;
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
--
-- Same shape as the rest of the app: a signed-in, active team member sees
-- everything, and there is no anon access anywhere. The bin is shared too —
-- the list names who deleted a contact, and anyone can put it back.
-- ---------------------------------------------------------------------------
alter table public.contact_categories enable row level security;
alter table public.contacts           enable row level security;
alter table public.task_contacts      enable row level security;
alter table public.contact_events     enable row level security;

drop policy if exists "contact_categories_select" on public.contact_categories;
create policy "contact_categories_select"
  on public.contact_categories for select
  to authenticated
  using (public.is_team_member());

drop policy if exists "contact_categories_insert" on public.contact_categories;
create policy "contact_categories_insert"
  on public.contact_categories for insert
  to authenticated
  with check (public.is_team_member() and created_by = public.current_member_id());

drop policy if exists "contacts_select" on public.contacts;
create policy "contacts_select"
  on public.contacts for select
  to authenticated
  using (public.is_team_member());

drop policy if exists "contacts_insert" on public.contacts;
create policy "contacts_insert"
  on public.contacts for insert
  to authenticated
  with check (public.is_team_member() and created_by = public.current_member_id());

-- Anyone edits. A wrong number should be fixable by whoever spots it, and the
-- activity log is what makes that safe. The deletion columns are pinned by
-- the guard trigger regardless of what an update sends.
drop policy if exists "contacts_update" on public.contacts;
create policy "contacts_update"
  on public.contacts for update
  to authenticated
  using (public.is_team_member())
  with check (public.is_team_member());

-- No DELETE policy, on purpose: purge_contact is the only way a row leaves.

drop policy if exists "task_contacts_select" on public.task_contacts;
create policy "task_contacts_select"
  on public.task_contacts for select
  to authenticated
  using (public.is_team_member());

drop policy if exists "task_contacts_insert" on public.task_contacts;
create policy "task_contacts_insert"
  on public.task_contacts for insert
  to authenticated
  with check (public.is_team_member() and attached_by = public.current_member_id());

drop policy if exists "task_contacts_delete" on public.task_contacts;
create policy "task_contacts_delete"
  on public.task_contacts for delete
  to authenticated
  using (public.is_team_member());

-- Append-only, and appended to by a trigger. Members read it and nothing else.
drop policy if exists "contact_events_select" on public.contact_events;
create policy "contact_events_select"
  on public.contact_events for select
  to authenticated
  using (public.is_team_member());

-- ---------------------------------------------------------------------------
-- Reachable from the app, and only through these doors
-- ---------------------------------------------------------------------------
grant select, insert on public.contact_categories to authenticated;
grant select, insert, update on public.contacts to authenticated;
grant select, insert, delete on public.task_contacts to authenticated;
grant select on public.contact_events to authenticated;

revoke all on function public.delete_contact(uuid) from public, anon;
revoke all on function public.restore_contact(uuid) from public, anon;
revoke all on function public.purge_contact(uuid) from public, anon;
revoke all on function public.contact_blocking_tasks(uuid) from public, anon;
revoke all on function public.find_contact_duplicates(text, text, text, text, uuid) from public, anon;

grant execute on function public.delete_contact(uuid) to authenticated;
grant execute on function public.restore_contact(uuid) to authenticated;
grant execute on function public.purge_contact(uuid) to authenticated;
grant execute on function public.contact_blocking_tasks(uuid) to authenticated;
grant execute on function public.find_contact_duplicates(text, text, text, text, uuid) to authenticated;
