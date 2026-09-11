-- ---------------------------------------------------------------------------
-- 0036 — A company's own email, and a log that stops narrating itself
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. companies.email
--
-- The switchboard has a phone number and a website; the general enquiries
-- inbox belonged with them and was simply missed. citext, matching
-- contacts.email and members.email: two rows differing only in capitals are
-- the same inbox, and nobody should have to notice that.
-- ---------------------------------------------------------------------------
alter table public.companies
  add column if not exists email citext
  check (email is null or char_length(email) <= 200);

comment on column public.companies.email is
  'The company''s own address — info@, sales@ — not a person''s. citext so case never makes a second one.';

-- ---------------------------------------------------------------------------
-- 2. The chip set when a contact is created is not an edit
--
-- Every contact in the book carries two lines in its Activity: "created",
-- and immediately after it "edited · What they are to us · set to Prospect".
-- Both are true and the second is noise — the chip was part of creating
-- them, not a change somebody made afterwards.
--
-- It reads that way because relationships live in their own table. The
-- contact row has to exist before a link can point at it, so the trigger
-- below always fires second, and it has no way of knowing it is still
-- watching the same gesture.
--
-- Nor can it be told: the app writes the contact and its links as two
-- separate PostgREST requests, so there is no shared transaction to carry a
-- flag, and current_setting would be gone by the time the second arrived.
--
-- So: age. A link added within half a minute of the contact appearing is
-- part of creating them. The trade is explicit — change somebody's chip
-- inside that first half minute and the log will not record it — and it is
-- worth taking, because the alternative is a spurious line on every contact
-- forever. A minute would swallow real edits; a second would miss a slow
-- phone on hotel wifi.
--
-- Removals are always logged, whenever they happen. Taking a chip off is
-- never part of creating somebody.
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
  born timestamptz;
begin
  if tg_op = 'INSERT' then
    select c.created_at into born from public.contacts c where c.id = new.contact_id;
    -- Still being created. The "created" line already says this happened.
    if born is not null and born > now() - interval '30 seconds' then
      return new;
    end if;

    select r.label into label from public.contact_relationships r where r.id = new.relationship_id;
    insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
    values (new.contact_id, actor, 'edited', 'What they are to us', null, label);
    return new;
  end if;

  /*
    The contact is on their way out — this delete is the cascade from erasing
    them, not somebody taking a chip off. Nothing to log, and nothing that
    could hold the log.
  */
  if not exists (select 1 from public.contacts c where c.id = old.contact_id) then
    return old;
  end if;

  select r.label into label from public.contact_relationships r where r.id = old.relationship_id;
  insert into public.contact_events (contact_id, member_id, kind, field, from_value, to_value)
  values (old.contact_id, actor, 'edited', 'What they are to us', label, null);
  return old;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. The lines already written
--
-- Seven contacts carry one of these from before the rule existed, including
-- the two imported minutes ago. They describe nothing that happened, so they
-- go — matched narrowly: an "edited" event on the relationship field, with
-- no from_value, landing within half a minute of the contact being created.
-- A chip genuinely changed later has a wider gap and survives.
-- ---------------------------------------------------------------------------
delete from public.contact_events e
using public.contacts c
where e.contact_id = c.id
  and e.kind = 'edited'
  and e.field = 'What they are to us'
  and e.from_value is null
  and e.created_at <= c.created_at + interval '30 seconds';
