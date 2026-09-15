-- ---------------------------------------------------------------------------
-- 0043 — "In touch" cannot outlive the task that earned it
--
-- 0041 got half of this right. "Contacted" is derived from tasks, so binning
-- the task takes it away on its own. "In touch" is stored on the contact,
-- and nothing was clearing it — so a contact whose outreach task had been
-- deleted and then erased kept the pill for ever, with no evidence anywhere
-- behind it.
--
-- Worse than untidy: can_confirm_in_touch asks for a completed outreach task
-- that still exists, so once the task was gone the undo button went with it.
-- The claim could not be taken back by anybody, through any screen. A state
-- you can enter and cannot leave is a bug however it reads.
--
-- Two halves, and they are deliberately different:
--
--   Binning a task hides the claim rather than destroying it — the app reads
--   the state as "not in touch" while no live completed task backs it, so
--   putting the task back brings the claim back with it. That is what a bin
--   is for.
--
--   Erasing one destroys it. The link row goes with the task, and this
--   trigger clears the stamp behind it, so a fresh outreach months later
--   starts at Contacted like anybody else instead of leaping to In touch on
--   the strength of a task nobody can see.
-- ---------------------------------------------------------------------------

create or replace function public.clear_in_touch_without_evidence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  /*
    Only when nothing is left to stand on. A contact dropped from one
    outreach task but still on another keeps the claim the other one earns.
  */
  if exists (
    select 1
    from public.task_contacts tc
    join public.tasks t on t.id = tc.task_id
    where tc.contact_id = old.contact_id
      and t.is_outreach
      and t.status = 'complete'
      and t.deleted_at is null
  ) then
    return old;
  end if;

  /* The key guard_contact_in_touch holds, used from the inside. */
  perform set_config('app.in_touch_write', 'on', true);

  update public.contacts
     set in_touch_at = null,
         in_touch_by = null
   where id = old.contact_id
     and in_touch_at is not null;

  perform set_config('app.in_touch_write', 'off', true);
  return old;
end;
$$;

comment on function public.clear_in_touch_without_evidence() is
  'Takes back "in touch" when the last completed outreach task linking that contact is erased. Fires on the cascade from purging a task as well as on somebody unlinking a contact by hand.';

drop trigger if exists task_contacts_clear_in_touch on public.task_contacts;
create trigger task_contacts_clear_in_touch
  after delete on public.task_contacts
  for each row execute function public.clear_in_touch_without_evidence();

-- ---------------------------------------------------------------------------
-- The contacts already stranded by the gap
--
-- Anybody carrying the stamp with no live completed outreach task behind it
-- today. Marcelo found the first one by deleting a task and watching the
-- pill stay; there is no reason to leave the rest of them for him to find.
--
-- With the log trigger off: this is 0041's omission being tidied, not
-- somebody changing their mind, and it should not read as an edit in
-- anybody's history.
-- ---------------------------------------------------------------------------
alter table public.contacts disable trigger contacts_record_event_update;

do $$
begin
  perform set_config('app.in_touch_write', 'on', true);

  update public.contacts c
     set in_touch_at = null,
         in_touch_by = null
   where c.in_touch_at is not null
     and not exists (
       select 1
       from public.task_contacts tc
       join public.tasks t on t.id = tc.task_id
       where tc.contact_id = c.id
         and t.is_outreach
         and t.status = 'complete'
         and t.deleted_at is null
     );

  perform set_config('app.in_touch_write', 'off', true);
end $$;

alter table public.contacts enable trigger contacts_record_event_update;

-- ---------------------------------------------------------------------------
-- Confirming what is already confirmed writes nothing
--
-- 0041's version updated the row whatever state it was in, so re-confirming
-- somebody moved the timestamp and left "In touch: Yes → Yes" in their
-- history. That was theoretical while the button hid itself once the claim
-- was made; it stopped being theoretical when one press could cover three
-- people at once, one of whom had already answered an earlier round.
--
-- The permission check is unchanged and still runs first: this is about not
-- writing a no-op, not about who may write.
-- ---------------------------------------------------------------------------
create or replace function public.set_contact_in_touch(p_contact_id uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public.current_member_id();
begin
  if me is null then
    raise exception 'Not on the team.';
  end if;

  if p_on and not public.can_confirm_in_touch(p_contact_id) then
    raise exception 'Only the people on a completed outreach task can say they answered.';
  end if;

  /*
    Turning it off is held to the same rule as turning it on. An undo that
    anybody could press would make the record worth less than the button
    that set it.
  */
  if not p_on and not public.can_confirm_in_touch(p_contact_id) then
    raise exception 'Only the people on a completed outreach task can take that back.';
  end if;

  perform set_config('app.in_touch_write', 'on', true);

  update public.contacts
     set in_touch_at = case when p_on then now() else null end,
         in_touch_by = case when p_on then me else null end
   where id = p_contact_id
     and deleted_at is null
     /* Already where it is being asked to go: nothing to write, nothing to log. */
     and (case when p_on then in_touch_at is null else in_touch_at is not null end);

  perform set_config('app.in_touch_write', 'off', true);
end;
$$;

revoke all on function public.set_contact_in_touch(uuid, boolean) from public;
grant execute on function public.set_contact_in_touch(uuid, boolean) to authenticated;
