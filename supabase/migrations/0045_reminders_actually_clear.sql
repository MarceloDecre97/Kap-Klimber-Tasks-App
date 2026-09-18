-- ---------------------------------------------------------------------------
-- 0045 — The reminder cleanups have never deleted anything
--
-- Marcelo found it in one line of a test list: complete an ordinary task and
-- its reminder chip is still on the card. It should have gone since 0034.
--
-- Both cleanup triggers do `delete from public.task_reminders`, and neither
-- is SECURITY DEFINER. task_reminders has RLS enabled and exactly one policy,
-- task_reminders_select, for SELECT. Under RLS a DELETE with no policy does
-- not raise — it matches no rows and reports success. So both triggers have
-- been running, finding nothing, and returning happily for as long as they
-- have existed.
--
-- Everything that *writes* reminders is SECURITY DEFINER already
-- (set_task_reminder, set_reminder_dismissed, clear_task_reminder), which is
-- why setting one always worked and only the automatic clearing was silently
-- dead. The deliberate absence of write policies — noted in the app's own
-- actions.ts — is the right design: reminders are written through functions
-- that check permission, never by direct table access. These two triggers
-- were simply never let in on it.
--
-- Two consequences, one of them worse than the one that was reported:
--
-- 1. Completing a task left its reminders behind. Mostly cosmetic until now,
--    because 0035's rules skipped completed tasks — but the chip stayed on
--    the card saying a reminder was set when the app had no intention of
--    honouring it.
--
-- 2. Taking somebody off a task left their reminder behind too. 0034 wrote
--    that "a reminder that fires at someone about work that is no longer
--    theirs is worse than none", and then shipped exactly that. It has not
--    bitten yet — production has no such rows today — and 0044 is what makes
--    it urgent, because outreach reminders now survive completion, so an
--    unassigned person could be nagged about a chase that is not theirs with
--    nothing to stop it.
--
-- Worth recording how it got through: the migration test harness runs as the
-- superuser, which bypasses RLS, so the local run of this exact scenario
-- passed. An RLS-dependent failure is invisible to a test that is not subject
-- to RLS. The tests for this migration run as `authenticated`.
-- ---------------------------------------------------------------------------

create or replace function public.clear_reminders_on_complete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'complete' and old.status is distinct from 'complete'
     and not new.is_outreach then
    delete from public.task_reminders where task_id = new.id;
  end if;
  return new;
end;
$$;

comment on function public.clear_reminders_on_complete() is
  'Completing a task deletes its reminders, because a nag about finished work should stop existing. Outreach tasks are exempt (0044): there, completion is when the email went out and the reminder is the follow-up. SECURITY DEFINER since 0045 — task_reminders has no delete policy, so without it this deleted nothing at all.';

create or replace function public.clear_reminder_on_unassign()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  /*
    Guarded against the cascade, which is the trap 0031 was written to fix: an
    erased task removes its assignees, this trigger fires for each of them, and
    without the check it would be deleting from a table the cascade is already
    emptying. Kept verbatim from 0034 — the only change here is the line above
    that lets the delete reach a row.
  */
  if exists (select 1 from public.tasks t where t.id = old.task_id) then
    delete from public.task_reminders
    where task_id = old.task_id and member_id = old.member_id;
  end if;
  return old;
end;
$$;

comment on function public.clear_reminder_on_unassign() is
  'Taking somebody off a task takes their reminder with them. SECURITY DEFINER since 0045, for the same reason as its neighbour: without it the delete matched no rows.';

-- ---------------------------------------------------------------------------
-- The rows the triggers should already have removed
--
-- Only reminders on completed, non-outreach tasks — exactly what
-- clear_reminders_on_complete would have deleted had it been able to. That
-- set is unambiguous: an ordinary task that is finished, holding an
-- appointment the scheduler has been declining to honour anyway.
--
-- Deliberately NOT sweeping reminders held by non-assignees, even though the
-- other trigger should have taken those. Since 0044 a creator who is not an
-- assignee legitimately holds one on an outreach task — record_outreach_sent
-- gives them one on purpose — so a blanket sweep would delete live, wanted
-- appointments to tidy up a fault that has produced no rows. The trigger is
-- fixed going forward; history is left alone.
-- ---------------------------------------------------------------------------
delete from public.task_reminders r
 using public.tasks t
 where t.id = r.task_id
   and t.status = 'complete'
   and not t.is_outreach;
