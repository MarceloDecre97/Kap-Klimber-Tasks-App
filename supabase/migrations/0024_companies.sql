-- ---------------------------------------------------------------------------
-- 0024 — Companies
--
-- The company was a text field on each contact, which meant three things
-- went wrong at once. Adding a second person from ADV Mobil meant retyping
-- the name and the whole address. A fact about the company — "an overland
-- vehicle builder in Howell MI" — had nowhere to live except one person's
-- notes. And correcting an address meant editing it on every colleague, or
-- more realistically on one of them.
--
-- Adding a contact does not change. You type the company name; if it exists
-- it is suggested and its details come with it, and if it does not you fill
-- in what you know and saving creates both, linked. There is no company step
-- to pass through first — the company page exists so a company can be
-- corrected later in one place, not as a gate.
-- ---------------------------------------------------------------------------

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(trim(name)) between 1 and 120),
  -- What they do, in a sentence. Belongs here rather than on a person: it is
  -- true of the company however many people you know there.
  about text check (about is null or char_length(about) <= 600),
  website text check (website is null or char_length(website) <= 300),
  -- The switchboard, as distinct from anybody's own line.
  company_number text check (company_number is null or char_length(company_number) <= 40),

  street text check (street is null or char_length(street) <= 200),
  suite text check (suite is null or char_length(suite) <= 100),
  city text check (city is null or char_length(city) <= 100),
  state text check (state is null or char_length(state) <= 60),
  postal_code text check (postal_code is null or char_length(postal_code) <= 20),
  country text check (country is null or char_length(country) <= 80),

  created_by uuid not null references public.members (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.companies is
  'One row per organisation. Created as a side effect of saving a contact, never through a step of its own.';

/*
  Matched case-insensitively as well as exactly.

  "ADV Mobil LLC" and "adv mobil llc" are one company, and without this the
  book fragments in exactly the way this table exists to prevent. The unique
  constraint above stops the exact duplicate; this stops the careless one.
*/
create unique index if not exists companies_name_lower_idx on public.companies (lower(name));

drop trigger if exists companies_set_updated_at on public.companies;
create trigger companies_set_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Contacts point at one
--
-- `on delete restrict` rather than cascade or set null: deleting a company
-- that still has people must fail loudly, not silently orphan them or take
-- them with it. The app checks first and explains; this is the backstop.
-- ---------------------------------------------------------------------------
alter table public.contacts
  add column if not exists company_id uuid references public.companies (id) on delete restrict;

create index if not exists contacts_company_id_idx on public.contacts (company_id) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Bringing the existing book across
--
-- One company per distinct name already typed, then every contact linked to
-- it, and the address carried over from whichever contact had one. Nothing
-- needs re-entering.
--
-- The old `company` text column stays. It is what the vCard and the export
-- have always read, and dropping it in the same migration that creates the
-- replacement would leave no way back if the link were ever wrong. It is now
-- kept in step with the company's name by the trigger below.
-- ---------------------------------------------------------------------------
insert into public.companies (name, street, suite, city, state, postal_code, country, created_by)
select
  distinct on (lower(trim(c.company)))
  trim(c.company),
  c.street, c.suite, c.city, c.state, c.postal_code, c.country,
  c.created_by
from public.contacts c
where nullif(trim(c.company), '') is not null
-- The contact with the most complete address wins the company's copy of it.
order by lower(trim(c.company)),
         (case when nullif(trim(c.street), '') is not null then 1 else 0 end
        + case when nullif(trim(c.city), '') is not null then 1 else 0 end
        + case when nullif(trim(c.postal_code), '') is not null then 1 else 0 end) desc,
         c.created_at
on conflict (name) do nothing;

update public.contacts c
set company_id = co.id
from public.companies co
where c.company_id is null
  and nullif(trim(c.company), '') is not null
  and lower(trim(c.company)) = lower(co.name);

-- ---------------------------------------------------------------------------
-- The text column follows the link
--
-- Every existing reader — the list, the search, the vCard, the export —
-- reads contacts.company. Rather than change all of them at once and hope,
-- the column is now derived: set it from the linked company on every write.
-- A rename of the company then reaches all of them for free.
-- ---------------------------------------------------------------------------
create or replace function public.sync_contact_company_name()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.company_id is not null then
    select name into new.company from public.companies where id = new.company_id;
  end if;
  return new;
end;
$$;

drop trigger if exists contacts_sync_company_name on public.contacts;
create trigger contacts_sync_company_name
  before insert or update on public.contacts
  for each row execute function public.sync_contact_company_name();

/** Renaming a company renames it on everybody at once. */
create or replace function public.cascade_company_rename()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.name is distinct from old.name then
    update public.contacts set company = new.name where company_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists companies_cascade_rename on public.companies;
create trigger companies_cascade_rename
  after update on public.companies
  for each row execute function public.cascade_company_rename();

-- ---------------------------------------------------------------------------
-- Who is at a company, and whether it can go
-- ---------------------------------------------------------------------------
create or replace function public.company_contact_count(p_company_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from public.contacts
  where company_id = p_company_id and deleted_at is null;
$$;

/*
  Deleting a company is refused while anybody is at it — the same shape as
  a contact being held by a live task. There is no bin here: a company with
  nobody at it is a typo being cleaned up, not a record anybody will miss.
*/
create or replace function public.delete_company(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  attached integer;
begin
  if public.current_member_id() is null then
    raise exception 'Not signed in.';
  end if;
  if not exists (select 1 from public.companies where id = p_company_id) then
    raise exception 'That company no longer exists.';
  end if;

  select public.company_contact_count(p_company_id) into attached;
  if attached > 0 then
    raise exception 'Still has % contact(s). Move or delete them first.', attached;
  end if;

  delete from public.companies where id = p_company_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.companies enable row level security;

drop policy if exists "companies_select" on public.companies;
create policy "companies_select"
  on public.companies for select
  to authenticated
  using (public.is_team_member());

drop policy if exists "companies_insert" on public.companies;
create policy "companies_insert"
  on public.companies for insert
  to authenticated
  with check (public.is_team_member() and created_by = public.current_member_id());

-- Anyone edits, same as contacts: a wrong address should be fixable by
-- whoever notices, and one edit now fixes it for everybody at that company.
drop policy if exists "companies_update" on public.companies;
create policy "companies_update"
  on public.companies for update
  to authenticated
  using (public.is_team_member())
  with check (public.is_team_member());

-- No DELETE policy: delete_company is the only way out.

grant select, insert, update on public.companies to authenticated;

revoke all on function public.delete_company(uuid) from public, anon;
revoke all on function public.company_contact_count(uuid) from public, anon;
grant execute on function public.delete_company(uuid) to authenticated;
grant execute on function public.company_contact_count(uuid) to authenticated;
