-- ---------------------------------------------------------------------------
-- 0037 — Reminders become visible to the team
--
-- 0034 gave a reminder an owner and kept it close: you saw your own, plus
-- every one on a task you created, and a non-creator saw no trace of anybody
-- else's — "not a count, not a hint". That was the right rule for a card
-- whose reminder controls only its owner and the task's creator can work.
--
-- The dashboard's new "Assigned to team" timeline changes the question. It
-- places a task in Overdue / Today / This week by the earliest of its due
-- date and any assignee's upcoming reminder, exactly as each person's own
-- panel does. Which means a task due the 22nd appearing under Today has one
-- possible explanation, and anybody reading it will draw it: somebody has a
-- reminder today.
--
-- So the placement discloses the reminder whether or not the label is drawn.
-- Hiding the line would broadcast the fact and withhold the explanation —
-- the worst of the three options rather than a compromise between them. And
-- it is not even available: the rows have to be readable before they can be
-- bucketed.
--
-- The honest version is this one. Visibility widens to the whole team; the
-- line is shown, naming whose reminder it is, so the placement explains
-- itself.
--
-- What does NOT change, and this is the part worth protecting:
--
--   set / change / dismiss   still yourself, or the creator for an assignee
--   nudge                    still the creator alone
--   notifications            still the reminder's owner and nobody else
--
-- can_manage_reminder is untouched. Everything 0034 was actually defending
-- survives; the clause that goes is the one the timeline was about to break.
--
-- The app filters by person where it needs to — the Reminders section on a
-- card still shows a non-creator only their own row — so widening the policy
-- does not change what any existing screen draws.
-- ---------------------------------------------------------------------------
drop policy if exists "task_reminders_select" on public.task_reminders;
create policy "task_reminders_select"
  on public.task_reminders for select
  to authenticated
  using (public.is_team_member());

comment on table public.task_reminders is
  'One reminder per person per task, at most one undismissed at a time. Readable by the whole team since 0037 — the dashboard''s team timeline buckets by them. Still written only through the functions in 0034, which decide who may set, dismiss and nudge.';
