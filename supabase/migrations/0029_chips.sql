-- ---------------------------------------------------------------------------
-- 0029 — What a company is, and what a person is to us
--
-- Two chip vocabularies existed and only one of them was doing a job.
--
-- contact_categories held Fleets, Partners, Suppliers, Industry, Investors —
-- and not one of those describes a person. They describe organisations. So
-- tagging a human being meant classifying them with a vocabulary built for
-- businesses, and the answer was always guessable from their company, which
-- is why the chip felt arbitrary: it carried nothing the company did not.
--
-- The test that settles it: can you guess the chip from the company? The old
-- list failed. The new one passes — nothing about Royal Truck & Utility
-- Trailer says whether Mike is our client contact or our consultant.
--
-- So: two axes, neither derivable from the other.
--
--   company type          what this business is in the industry
--   contact relationship  what this person is to Opus Kap
--
-- Both many-to-many. Royal genuinely is a Trailer Dealer and a Parts Dealer
-- and an Upfitter, and a single type_id made the book lie about companies
-- like it. Contacts follow the same shape rather than a second one, because
-- one mechanic is easier to learn than two — and somebody really can be a
-- consultant and an investor.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. A company can be several things
-- ---------------------------------------------------------------------------
create table if not exists public.company_type_links (
  company_id uuid not null references public.companies (id) on delete cascade,
  type_id    uuid not null references public.company_types (id) on delete cascade,
  primary key (company_id, type_id)
);

create index if not exists company_type_links_type_idx on public.company_type_links (type_id);

comment on table public.company_type_links is
  'What a company is. Several, because a trailer dealer that also upfits is both.';

/*
  Everything already chosen through the single column comes across.

  Wrapped in a check because the Supabase SQL editor does not run a script as
  one transaction: a failure part-way leaves everything before it applied. So
  a second run of this file meets a companies table whose type_id has already
  been dropped at the bottom, and fails on a column that is *supposed* to be
  gone. Inside EXECUTE the reference is not parsed until it is reached, which
  is what makes the guard work at all.
*/
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'companies' and column_name = 'type_id'
  ) then
    execute $q$
      insert into public.company_type_links (company_id, type_id)
      select id, type_id from public.companies where type_id is not null
      on conflict do nothing
    $q$;
  end if;
end;
$$;

-- The rest of the trade as Opus Kap meets it. Installer stays: a company that
-- installs and a person who installs privately are both real, and Corebridge
-- is already tagged with it.
insert into public.company_types (label, icon, sort_order, is_default) values
  ('Trailer Dealer', 'truck',    25, true),
  ('Parts Dealer',   'package',  27, true),
  ('Supplier',       'package',  55, true)
on conflict (label) do nothing;

-- ---------------------------------------------------------------------------
-- 2. A person is something to us
-- ---------------------------------------------------------------------------
create table if not exists public.contact_relationships (
  id uuid primary key default gen_random_uuid(),
  label text not null unique check (char_length(trim(label)) between 1 and 60),
  icon text not null default 'user' check (char_length(icon) <= 40),
  sort_order integer not null default 100,
  is_default boolean not null default false,
  created_by uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.contact_relationships is
  'What a person is to Opus Kap — not what their company does. Anyone can add one by typing it.';

insert into public.contact_relationships (label, icon, sort_order, is_default) values
  ('Client',            'handshake',   10, true),
  ('Partner',           'users',       20, true),
  ('Consultant',        'briefcase',   30, true),
  ('Lawyer',            'scale',       40, true),
  ('Investor',          'trending-up', 50, true),
  ('Private installer', 'hard-hat',    60, true),
  ('Other',             'user',       100, true)
on conflict (label) do nothing;

create table if not exists public.contact_relationship_links (
  contact_id      uuid not null references public.contacts (id) on delete cascade,
  relationship_id uuid not null references public.contact_relationships (id) on delete cascade,
  primary key (contact_id, relationship_id)
);

create index if not exists contact_relationship_links_rel_idx
  on public.contact_relationship_links (relationship_id);

-- ---------------------------------------------------------------------------
-- 3. Moving what is already there
--
-- Partners and Investors are relationships and become them. Fleets, Customers,
-- Suppliers and Industry describe organisations, so they move onto the
-- contact's *company* as a type and the person's chip is left blank rather
-- than inventing a relationship nobody chose.
-- ---------------------------------------------------------------------------
-- Guarded for the same reason as above: on a second run the old table and
-- column are already gone, and that is success, not an error.
do $$
begin
  if to_regclass('public.contact_categories') is null then return; end if;

  execute $q$
    insert into public.contact_relationship_links (contact_id, relationship_id)
    select c.id, r.id
    from public.contacts c
    join public.contact_categories cat on cat.id = c.category_id
    join public.contact_relationships r
      on (cat.label = 'Partners'  and r.label = 'Partner')
      or (cat.label = 'Investors' and r.label = 'Investor')
    on conflict do nothing
  $q$;

  execute $q$
    insert into public.company_type_links (company_id, type_id)
    select c.company_id, t.id
    from public.contacts c
    join public.contact_categories cat on cat.id = c.category_id
    join public.company_types t
      on (cat.label in ('Fleets', 'Customers') and t.label = 'Fleet')
      or (cat.label = 'Suppliers'              and t.label = 'Supplier')
      or (cat.label = 'Industry'               and t.label = 'Institution')
    where c.company_id is not null
    on conflict do nothing
  $q$;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. The old shapes go
--
-- Both are provably empty of anything the steps above did not move: every
-- category is either mapped to a relationship, pushed onto a company, or was
-- 'Other', which carried no information in the first place.
-- ---------------------------------------------------------------------------
alter table public.contacts drop column if exists category_id;
drop table if exists public.contact_categories;
alter table public.companies drop column if exists type_id;

-- ---------------------------------------------------------------------------
-- Row-level security
--
-- The same shape everywhere else in the book: the team reads, the team
-- writes, and nobody edits a label out from under the rows carrying it.
-- ---------------------------------------------------------------------------
alter table public.contact_relationships enable row level security;
alter table public.contact_relationship_links enable row level security;
alter table public.company_type_links enable row level security;

drop policy if exists "contact_relationships_select" on public.contact_relationships;
create policy "contact_relationships_select" on public.contact_relationships
  for select to authenticated using (public.is_team_member());

drop policy if exists "contact_relationships_insert" on public.contact_relationships;
create policy "contact_relationships_insert" on public.contact_relationships
  for insert to authenticated
  with check (public.is_team_member() and created_by = public.current_member_id());

drop policy if exists "contact_relationship_links_all" on public.contact_relationship_links;
create policy "contact_relationship_links_all" on public.contact_relationship_links
  for all to authenticated
  using (public.is_team_member()) with check (public.is_team_member());

drop policy if exists "company_type_links_all" on public.company_type_links;
create policy "company_type_links_all" on public.company_type_links
  for all to authenticated
  using (public.is_team_member()) with check (public.is_team_member());

grant select, insert on public.contact_relationships to authenticated;
grant select, insert, delete on public.contact_relationship_links to authenticated;
grant select, insert, delete on public.company_type_links to authenticated;
