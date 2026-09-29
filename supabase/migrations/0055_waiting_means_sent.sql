-- ---------------------------------------------------------------------------
-- 0055 — "Waiting" is what sending an email looks like
--
-- The Contact button made a task, and the contact only turned Contacted when
-- that task was COMPLETED. Which meant Marcelo had to finish a task he was
-- not finished with: the email had gone, the reply had not come, and the one
-- gesture the app offered him filed the whole thing away.
--
-- His correction, and it is the right one: the status already says this.
--
--   not started / in progress   the email has not gone yet   "Reaching out"
--   waiting                     it has gone, no reply yet     "Contacted"
--   complete                    the chase is over             stays as it was
--
-- So a round counts as SENT when the task reaches `waiting`. Everything
-- already completed still counts as a round, so no history moves and no
-- pill on any contact changes — there is nothing to backfill, because the
-- moment a task reached `waiting` is already in task_events.
--
-- What this migration changes is only who may act and what ends a chase. The
-- reminder is untouched on purpose: Marcelo asked for seven days from when
-- the task is CREATED, whatever its status, so nothing here re-arms it.
-- ---------------------------------------------------------------------------

/*
  The three buttons — Sent again, Replied, No reply — hang off a round that
  has gone out. That used to mean a completed task and now means a sent one.
*/
create or replace function public.can_set_contact_outcome(p_contact_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.task_contacts tc
    join public.tasks t on t.id = tc.task_id
    join public.members c on c.id = t.created_by
    left join public.task_assignees a
      on a.task_id = t.id and a.member_id = public.current_member_id()
    where tc.contact_id = p_contact_id
      and t.is_outreach
      and t.status in ('waiting', 'complete')
      and t.deleted_at is null
      and public.is_team_member()
      and (c.id = public.current_member_id() or a.member_id is not null or not c.is_active)
  );
$$;

comment on function public.can_set_contact_outcome(uuid) is
  'Whether the viewer may say how an outreach ended: they are on an outreach task for this contact that has gone out — waiting for a reply, or finished.';

revoke all on function public.can_set_contact_outcome(uuid) from public;
grant execute on function public.can_set_contact_outcome(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The guard learns one exception
--
-- `guard_task_edit` pins the status for anybody who is not an assignee, which
-- is right: status is the assignee's to move. But set_contact_outcome below
-- has to close a task on behalf of whoever pressed Replied, and that person
-- may be the task's CREATOR without being on it — they made the task, gave it
-- to Dee, and sent the email themselves.
--
-- Without this the completion would be pinned away silently and the task
-- would stay open for ever with nothing on screen to say why. A
-- transaction-local flag, set either side of the one write, is the same shape
-- 0044 already uses for `app.outcome_write` and 0046 for the meeting bin: the
-- key is held by one SECURITY DEFINER function and cannot be set by a caller.
--
-- Restated in full from the live definition, as every change to this function
-- has been.
-- ---------------------------------------------------------------------------
create or replace function public.guard_task_edit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  /*
    Both pinned unconditionally, above the creator check: not even the person
    who made the task may move it to another meeting, or turn an ordinary
    task into an outreach round. Each is a fact about how the task came to
    exist rather than a field on it.
  */
  new.is_outreach = old.is_outreach;
  new.meeting_id  = old.meeting_id;

  if not public.can_edit_task(new.id) then
    new.title       = old.title;
    new.description = old.description;
    new.category_id = old.category_id;
    new.priority    = old.priority;
    new.due_date    = old.due_date;
    new.reminder_at = old.reminder_at;

    /*
      Status is the assignee's to move. Somebody neither assigned nor the
      creator has no business marking a task complete — and since 0037 they
      are looking at it on the team timeline, where the buttons are.

      Nested inside the creator check on purpose: a creator who is not an
      assignee still moves their own task.
    */
    if not public.is_task_assignee(new.id) then
      new.status       = old.status;
      new.completed_at = old.completed_at;
      new.completed_by = old.completed_by;
    end if;
  end if;

  /*
    The one exception, and it is narrow: set_contact_outcome closing a chase
    that has just been answered. Nothing else sets this flag, it lasts one
    transaction, and the permission was already checked before it was set.
  */
  if coalesce(current_setting('app.outreach_complete', true), '') = 'on' then
    new.status       = 'complete';
    new.completed_at = coalesce(new.completed_at, old.completed_at, now());
    new.completed_by = coalesce(new.completed_by, old.completed_by);
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Replied ends the chase, and the task with it
--
-- Marcelo: "if I click replied, that should mark the task complete
-- automatically and remove any live reminders." No reply does the same —
-- giving up is also an ending, and a task you have given up on sitting open
-- with a live clock on it is the app arguing with you.
--
-- Only tasks in `waiting`, and only once NOBODY on them is still owed a
-- chase. One email to three people gets one reply; that reply does not close
-- the other two, which is the rule outreach_still_owed already encodes for
-- the reminder. A task still owed stays open, and closes by itself when the
-- last person on it has an answer.
--
-- A task that is `not_started` is deliberately left alone: a fresh round you
-- have only just created is not something an answer to the last one should
-- quietly finish.
-- ---------------------------------------------------------------------------
create or replace function public.set_contact_outcome(p_contact_id uuid, p_outcome text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public.current_member_id();
  t record;
begin
  if me is null then
    raise exception 'Not on the team.';
  end if;
  if p_outcome is not null and p_outcome not in ('in_touch', 'no_reply') then
    raise exception 'Unknown outcome.';
  end if;
  if not public.can_set_contact_outcome(p_contact_id) then
    raise exception 'Only the people on an outreach task that has gone out can say how it ended.';
  end if;

  perform set_config('app.outcome_write', 'on', true);

  update public.contacts
     set outcome    = p_outcome,
         outcome_at = case when p_outcome is null then null else now() end,
         outcome_by = case when p_outcome is null then null else me end
   where id = p_contact_id
     and deleted_at is null
     /* Already where it is being asked to go: nothing to write, nothing to log. */
     and outcome is distinct from p_outcome;

  perform set_config('app.outcome_write', 'off', true);

  /*
    Taking an outcome OFF does not reopen anything. Completing a task is a
    decision somebody made, and un-saying "they replied" is not the same as
    saying "carry on chasing" — the Contact button is there for that.
  */
  if p_outcome is null then
    return;
  end if;

  for t in
    select tk.id
    from public.tasks tk
    join public.task_contacts tc on tc.task_id = tk.id
    where tc.contact_id = p_contact_id
      and tk.is_outreach
      and tk.deleted_at is null
      and tk.status = 'waiting'
      and not public.outreach_still_owed(tk.id)
  loop
    perform set_config('app.outreach_complete', 'on', true);
    update public.tasks
       set status       = 'complete',
           completed_at = now(),
           completed_by = me
     where id = t.id;
    perform set_config('app.outreach_complete', 'off', true);

    /* And the clock stops. The chase is over; there is nothing to come back to. */
    delete from public.task_reminders where task_id = t.id and dismissed_at is null;
  end loop;
end;
$$;

comment on function public.set_contact_outcome(uuid, text) is
  'Records how an outreach ended, and closes the waiting task it ended — but only once nobody on that task is still owed a chase. Clearing an outcome never reopens anything.';

revoke all on function public.set_contact_outcome(uuid, text) from public;
grant execute on function public.set_contact_outcome(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Another round, from a task that is still waiting
--
-- Restated with one clause widened. Everything else — the reminder moved
-- rather than added, written directly rather than through set_task_reminder,
-- and why — is 0044's and is unchanged. Marcelo's instruction for this button
-- was exactly "sent again does nothing rather than updating the reminder date
-- and time", which is what it already did; it simply could not be reached
-- from a task that had not been filed away.
-- ---------------------------------------------------------------------------
create or replace function public.record_outreach_sent(p_task_id uuid)
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

  if not exists (
    select 1
    from public.tasks t
    join public.members c on c.id = t.created_by
    left join public.task_assignees a on a.task_id = t.id and a.member_id = me
    where t.id = p_task_id
      and t.is_outreach
      and t.status in ('waiting', 'complete')
      and t.deleted_at is null
      and (c.id = me or a.member_id is not null or not c.is_active)
  ) then
    raise exception 'Only the people on an outreach task that has gone out can add a round to it.';
  end if;

  insert into public.task_events (task_id, member_id, kind)
  values (p_task_id, me, 'outreach_sent');

  delete from public.task_reminders
  where task_id = p_task_id and member_id = me and dismissed_at is null;

  insert into public.task_reminders (task_id, member_id, remind_at, created_by)
  values (p_task_id, me, now() + interval '7 days', me);
end;
$$;

comment on function public.record_outreach_sent(uuid) is
  'Records another round on an outreach task that has gone out, and moves the caller''s follow-up reminder seven days on. Changes nothing else — not the status, not who is on it.';
