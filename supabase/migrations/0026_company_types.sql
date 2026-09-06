-- ---------------------------------------------------------------------------
-- 0026 — What kind of company, and a way to add one directly
--
-- Two things the companies book needs before it can be browsed rather than
-- merely looked up.
--
-- A type, so the book can be filtered the way the contacts book is filtered
-- by category. It is a table rather than a check constraint for the same
-- reason contact_categories is: the team adds one by typing it, not by
-- asking for a migration.
--
-- And an explicit way in. Until now a company could only be born as a side
-- effect of adding a contact, which was right about the two-step problem and
-- wrong about everything else — a company you have just heard of, with
-- nobody named at it yet, had nowhere to go. Adding a contact still creates
-- a company; this is a second door to the same room, not a step in front of it.
-- ---------------------------------------------------------------------------

create table if not exists public.company_types (
  id uuid primary key default gen_random_uuid(),
  label text not null unique check (char_length(trim(label)) between 1 and 60),
  icon text not null default 'building' check (char_length(icon) <= 40),
  -- Explicit rather than alphabetical, and Other last because it is the
  -- fallback rather than a kind of company.
  sort_order integer not null default 100,
  is_default boolean not null default false,
  created_by uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.company_types is
  'What kind of organisation this is. Anyone on the team can add one by typing it, the same way contact_categories works.';

/*
  Marcelo's list, in his order — the trailer trade as Opus Kap meets it,
  from the fleets who buy to the institutions who regulate. Not alphabetical:
  this is the order they matter in.
*/
insert into public.company_types (label, icon, sort_order, is_default) values
  ('Fleet',            'truck',      10, true),
  ('OEM Manufacturer', 'factory',    20, true),
  ('Upfitter',         'wrench',     30, true),
  ('Installer',        'hard-hat',   40, true),
  ('Service',          'life-buoy',  50, true),
  ('Institution',      'landmark',   60, true),
  ('Other',            'building',  100, true)
on conflict (label) do nothing;

alter table public.companies
  add column if not exists type_id uuid references public.company_types (id) on delete set null;

create index if not exists companies_type_idx on public.companies (type_id);

-- ---------------------------------------------------------------------------
-- Row-level security
--
-- The same shape contact_categories has: everybody reads, everybody may add
-- one mid-flow, and nobody edits or deletes an existing one through the app.
-- A type is referenced by however many companies already carry it, and
-- renaming it under them is not something a stray tap should be able to do.
-- ---------------------------------------------------------------------------
alter table public.company_types enable row level security;

drop policy if exists "company_types_select" on public.company_types;
create policy "company_types_select"
  on public.company_types for select
  to authenticated
  using (public.is_team_member());

drop policy if exists "company_types_insert" on public.company_types;
create policy "company_types_insert"
  on public.company_types for insert
  to authenticated
  with check (public.is_team_member() and created_by = public.current_member_id());

grant select, insert on public.company_types to authenticated;
