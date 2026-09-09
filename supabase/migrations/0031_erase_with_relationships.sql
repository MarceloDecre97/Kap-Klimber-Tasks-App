-- ---------------------------------------------------------------------------
-- 0031 — Erasing a contact who has relationship chips
--
-- 0030 added a trigger that logs a relationship being added or removed. It
-- did not account for the one case where a relationship is removed and there
-- is nobody left to log it against: erasing the contact.
--
-- purge_contact deletes the contact; that cascades to
-- contact_relationship_links; the AFTER DELETE trigger fires and tries to
-- write a contact_events row pointing at a contact that no longer exists:
--
--   insert or update on table "contact_events" violates foreign key
--   constraint "contact_events_contact_id_fkey"
--
-- So Ana could not be erased. The log entry was never wanted here anyway —
-- erasing takes the whole activity log with it by design, and a last line
-- saying "relationship removed" would be written only to be deleted in the
-- same breath.
--
-- The guard is an existence check rather than a flag: it is true exactly
-- when there is still a contact to log against, which is the real condition,
-- and it needs nothing to be remembered or set anywhere else.
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
