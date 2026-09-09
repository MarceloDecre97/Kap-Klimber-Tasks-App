-- ---------------------------------------------------------------------------
-- 0027 — A company whose people are in Recently deleted
--
-- company_contact_count() counted only live contacts, but the foreign key from
-- contacts.company_id does not care whether a contact is in the bin. So a
-- company whose last person had been deleted read "Nobody yet", offered its
-- Remove button, passed delete_company's own check — and then died on the
-- constraint, putting this in front of a person:
--
--   update or delete on table "companies" violates foreign key constraint
--   "contacts_company_id_fkey" on table "contacts"
--
-- Two things were wrong. The count disagreed with the constraint, and a
-- database error reached somebody who cannot act on it.
--
-- The count now includes the bin, which is also the honest answer: somebody in
-- Recently deleted still works there until they are erased, and restoring them
-- would put them back at a company that no longer existed.
-- ---------------------------------------------------------------------------

create or replace function public.company_contact_count(p_company_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from public.contacts where company_id = p_company_id;
$$;

comment on function public.company_contact_count(uuid) is
  'Everybody at this company, Recently deleted included — the same set the foreign key protects.';

/**
 * How many of those are only in the bin.
 *
 * Split out so the refusal can say something a person can act on: "erase them
 * for good first" is a different instruction from "move them somewhere else",
 * and being told the wrong one sends you looking in the wrong place.
 */
create or replace function public.company_binned_contact_count(p_company_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from public.contacts
  where company_id = p_company_id and deleted_at is not null;
$$;

create or replace function public.delete_company(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  attached integer;
  binned integer;
begin
  if public.current_member_id() is null then
    raise exception 'Not signed in.';
  end if;
  if not exists (select 1 from public.companies where id = p_company_id) then
    raise exception 'That company no longer exists.';
  end if;

  select public.company_contact_count(p_company_id) into attached;
  select public.company_binned_contact_count(p_company_id) into binned;

  if attached > 0 and attached = binned then
    raise exception
      'Everyone at this company is in Recently deleted. Erase them for good first, then this can go.';
  elsif attached > 0 then
    raise exception 'Still has % contact(s). Move or delete them first.', attached - binned;
  end if;

  delete from public.companies where id = p_company_id;
end;
$$;

revoke all on function public.company_binned_contact_count(uuid) from public, anon;
grant execute on function public.company_binned_contact_count(uuid) to authenticated;
