-- ---------------------------------------------------------------------------
-- 0025 — "Your contact was erased"
--
-- Erasing a contact is the only irreversible thing in the address book, and
-- anybody on the team can do it. Until now the person who put that contact
-- in the book found out by looking for them and finding nothing — the
-- activity log goes with the row, so there was not even a trace left to
-- explain it.
--
-- One notification, to one person: whoever added the contact. Not the whole
-- team — a supplier somebody else added and then tidied away is not four
-- people's news — and not the person doing the erasing, who already knows.
--
-- Deliberately only on erase. Moving a contact to Recently deleted is
-- reversible and visible in the bin, so announcing it would train people to
-- ignore the one message here that cannot be undone.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- A notification is not always about a task
--
-- task_id has been NOT NULL since 0012, when every notification was about a
-- task. This is the first that is not, and rather than invent a task for it
-- the column becomes what it always meant: the task this concerns, where
-- there is one.
-- ---------------------------------------------------------------------------
alter table public.notifications alter column task_id drop not null;

comment on column public.notifications.task_id is
  'The task this is about, where there is one. Null for kinds that concern something else — see contact_erased.';

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check
  check (kind in (
    'note', 'reply', 'assigned', 'status', 'due_date', 'mention',
    'delete_requested', 'delete_denied', 'deleted', 'restored',
    'reminder_upcoming', 'reminder_due', 'due_soon', 'overdue',
    'contact_erased'
  ));

/*
  Every notification has to be about *something*, and now that task_id can be
  absent, "something" has to be spelled out. Without this, a bug that dropped
  the task id would write a row the inbox silently discards — the failure
  nobody sees, which is the worst kind.
*/
alter table public.notifications drop constraint if exists notifications_subject_check;
alter table public.notifications
  add constraint notifications_subject_check
  check (
    case when kind = 'contact_erased' then task_id is null else task_id is not null end
  );

-- ---------------------------------------------------------------------------
-- Written where the erasing happens
--
-- Replaces purge_contact from 0022. The whole function is restated rather
-- than patched: it is the one irreversible path in the book, and reading it
-- in one piece is worth more than a shorter diff.
--
-- The name is copied into the payload because by the time anybody reads this
-- there is no contact row left to join to — the same reason a deleted task
-- carries its title.
-- ---------------------------------------------------------------------------
create or replace function public.purge_contact(p_contact_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.contacts;
  erased jsonb;
  actor uuid;
  full_name text;
begin
  actor := public.current_member_id();
  if actor is null then
    raise exception 'Not signed in.';
  end if;

  select * into c from public.contacts where id = p_contact_id;
  if not found then
    raise exception 'That contact no longer exists.';
  end if;
  if c.deleted_at is null then
    raise exception 'Move the contact to Recently deleted first.';
  end if;

  full_name := trim(c.first_name || ' ' || c.last_name);

  select jsonb_build_object(
           'name', full_name,
           'phones', (case when nullif(trim(c.mobile), '') is not null then 1 else 0 end)
                   + (case when nullif(trim(c.office_phone), '') is not null then 1 else 0 end),
           'emails', (case when c.email is not null then 1 else 0 end)
                   + (case when c.email2 is not null then 1 else 0 end),
           'addresses', (case when nullif(trim(coalesce(c.street, '')), '') is not null then 1 else 0 end),
           'tasks', (select count(*) from public.task_contacts where contact_id = p_contact_id)
         )
    into erased;

  /*
    Before the delete, so the row is still there to read from — and only to
    the person who added them, if that is somebody else and they are still
    active. Nobody is ever told about their own action.
  */
  insert into public.notifications (member_id, actor_id, task_id, kind, payload)
  select m.id, actor, null, 'contact_erased',
         jsonb_build_object('contact_name', full_name, 'company', c.company)
  from public.members m
  where m.id = c.created_by
    and m.id <> actor
    and m.is_active;

  delete from public.contacts where id = p_contact_id;
  return erased;
end;
$$;

revoke all on function public.purge_contact(uuid) from public, anon;
grant execute on function public.purge_contact(uuid) to authenticated;
