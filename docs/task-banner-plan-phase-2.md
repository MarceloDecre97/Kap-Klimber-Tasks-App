# Task Banner — Plan, Phase 2

Agreed 2026-09-10 after two rounds of questions. Two changes that arrived
together, shipped as **two rounds**, B first.

- **Round B — permissions.** Creator and assignee stop being the same
  thing. Smaller, testable in minutes, touches nothing that sends mail.
- **Round A — reminders.** A reminder stops being a property of the task
  and becomes an appointment with a named recipient.

They are independent. B first means A lands on a banner whose permissions
are already settled, and two short test rounds instead of one long one.

---

## Already true, and staying that way

**Delete is already creator-only.** 0014 built it: the creator deletes,
everyone else sees **Request delete**, the creator approves or declines
with a reason that lands in the task's history. Confirmed as keeping.

**A deactivated creator hands their powers to everyone.**
`can_decide_task_deletion` already does this, so a task belonging to
someone who has left is not frozen. The new edit rule inherits the same
escape hatch. Noted as an interim answer: this becomes an admin-panel
concern later, and is deliberately not designed for that here.

**Pinning columns is how this codebase restricts writes.** 0014 says it
outright — RLS "decides which rows may be updated and cannot restrict which
columns" — and guards the deletion columns with a BEFORE UPDATE trigger
that pins them unless a transaction-local setting marks the write as
sanctioned. Round B is the same shape.

---

# Round B — Permissions

## The rule

| | creator | assignee |
|---|---|---|
| Edit title, description, priority, category, due date | ✅ | ❌ |
| Add or remove assignees | ✅ | ❌ |
| Delete | ✅ | asks — unchanged |
| Change status (the three pills) | ✅ | ✅ |
| Mark complete / not complete | ✅ | ✅ |
| Add, edit, remove links | ✅ | ✅ |
| Notes: write, edit own, delete own, like, reply | ✅ | ✅ |
| Set / change / dismiss own reminder | ✅ | ✅ |
| See and manage everyone's reminders | ✅ | ❌ |

A creator who is also an assignee is simply both.

## Two guards, not one

**`can_edit_task(p_task_id)`** — a `SECURITY DEFINER` mirror of
`can_decide_task_deletion`: true for the creator, or for anyone when the
creator is inactive.

**1. The content columns, on `tasks`.** A BEFORE UPDATE trigger pins
`title`, `description`, `category_id`, `priority`, `due_date` and
`reminder_at` to their old values unless `can_edit_task`.

It deliberately does **not** touch `status`, `completed_at`,
`completed_by`, or any of the deletion columns:

- status and completion are exactly what an assignee is allowed to change;
- the deletion columns already have `guard_task_deletion`, and
  `request_task_deletion` is *by definition* a non-creator writing to the
  task. A guard that pinned everything would silently break the request
  path — the two triggers stay in separate lanes so they cannot fight.

Pinned rather than rejected, following 0014's reasoning: an ordinary save
sends every column, and raising would turn a harmless no-op into a failed
save.

**2. The assignee list, on `task_assignees`.** This is the one that would
be missed by looking only at the Edit button. `task_assignees_insert` and
`task_assignees_delete` in 0002 admit any team member, so hiding the Edit
page would leave reassignment reachable straight through PostgREST —
including adding yourself to a task. Both policies are narrowed to
`can_edit_task(task_id)`.

`task_links` stays open to every member, because assignees are meant to add
links.

## The banner

- **"Created by"** — a new row with avatar, directly above **Assigned to**.
  Once who created a task decides what you may do to it, it stops being
  trivia.
- **Edit task** is hidden for non-creators. Delete / Request delete
  unchanged.
- **Links move into the banner.** Assignees may add links but will no
  longer be able to open the form, so External Links gains **Add link** and
  a remove control for everyone. The form keeps its copy so the creator can
  still create a task with its links in one pass.

## Round B, verified

- The guard proved on a local Postgres from both sides: a non-creator's
  attempt to change the title is pinned while their status change goes
  through, and `request_task_deletion` still works for a non-creator with
  the new trigger in place.
- A non-creator attempting to insert into `task_assignees` refused by RLS.
- A task whose creator is deactivated fully editable by everyone.
- 390px screenshots of both views: creator and assignee.

---

# Round A — Reminders

## The table

`task_reminders`: `id`, `task_id` (cascade), `member_id` (**whose it is**),
`remind_at`, `created_by`, `dismissed_at`, `dismissed_by`, `nudged_at`,
`created_at`.

**One live reminder per person per task**, enforced by a partial unique
index on `(task_id, member_id) where dismissed_at is null`. Dismissing
frees the slot, so the cap is never a dead end. Setting one when a live one
exists **replaces** it — that is what editing a reminder means.

`member_id` must be an assignee of that task, checked in the database.

## Who may do what

All of it through `SECURITY DEFINER` functions, because "the creator, or
yourself, and only for an assignee" is a sentence about three tables and
does not fit a `with check`.

- **Assignee** — set, change, dismiss **their own**.
- **Creator** — set, change, dismiss, remove, and **nudge** for anyone
  assigned; the only person who sees the whole set.

## Nudge

Only on a reminder that has **fired and not been dismissed**. There is
nothing to chase before that, so nudging an upcoming one is refused.

It re-sends the "your reminder is due" notification to its owner. This
needs a **new notification kind** rather than re-firing the old one: the
existing dedupe key is `reminder_due:<task>:<at>`, which by design admits
exactly one row per reminder, so a repeat of the original would be
swallowed. `reminder_nudge` carries the nudge's own timestamp in its key.

**One nudge per reminder per hour**, enforced by `nudged_at` in the
database, and **recorded in Task Activity** — "Marcelo nudged Dee's
reminder" — so chasing somebody is visible rather than silent. That needs a
new `task_events.kind`; the constraint is a plain
`check (kind in (...))` that 0011 and 0014 have each already widened, so
this follows the same pattern.

## What each person sees

- **Everyone** keeps exactly what they have now — the chip on the card, the
  amber line beneath it, click-to-dismiss — except it is now *their*
  reminder rather than the task's. No change in behaviour, and the
  creator's own works the same as everyone's.
- **The creator** additionally gets a **Reminders** section: every assignee,
  their reminder or "none set", and for each one a set / change / dismiss /
  nudge control. Their own is listed there too, so the list is the whole
  picture.
  - **Fired and not dismissed shows in red**, upcoming in amber, handled in
    muted grey — the colours `reminderState` already uses, so the section
    inherits the app's existing language rather than inventing one. Red is
    how the creator spots what needs a nudge.
- **A non-creator sees no trace** of anyone else's. Not a count, not a hint.

## Notifications — unchanged, only narrower

Twelve hours out, and again when it fires. Nothing after it is dismissed.
Nothing at set-time — you tell people on the call. The only change is the
audience: `notify_task_audience` gives way to the reminder's own owner, so
you are never buzzed for a reminder you set for Dee.

**No notification to the creator when a reminder goes undismissed.**
Decided explicitly: the red row in the Reminders section is how you find
out, which means nudging is something you do when you look. Recorded here
because it is the one place the answers pulled against each other.

The dedupe key gains the reminder's id, so two people's reminders on the
same task at the same minute cannot collide.

## Reminders that should stop existing

- **Completing a task deletes every reminder on it** — fired-but-undismissed
  ones included. Reopening starts clean; new reminders must be set. This
  replaces the current behaviour, where the cron merely skips completed
  tasks and a reminder waits quietly for the task to come back.
- **Removing an assignee deletes their reminder**, silently. A reminder
  that fires at somebody about a task they are no longer on is worse than
  no reminder.

## The five live reminders

Each becomes **one row per assignee** on its task, keeping `remind_at`,
`dismissed_at`, and `reminder_set_by` as `created_by`. Everyone notified
today is notified tomorrow.

`tasks.reminder_at` is **left in place and stops being read**. Not dropped
in the same migration that replaces it: that column was declared deprecated
in 0005 and brought back in 0011, and a dead column for a few weeks costs
nothing next to being wrong. Its form field is removed — the banner becomes
the only place a reminder is set.

## The 17 files

Each changes from "does this task have a reminder?" to "do I have one?":

`reminders.ts` (takes a row, not a task) · `task-pill.tsx` (chip, amber
line, dismissal, plus the creator's section) · `dashboard-stats.ts` (46
references — every statistic becomes the viewer's own) ·
`notification-bell.tsx` (attention count) · `email/render.ts` ·
`notifications-view.ts` · `notification-prefs.ts` · `data/tasks.ts` (a
`reminders` relation plus `myReminder`) · `task-timeline.ts` (a reminder
event names whose it was) · `validation.ts` · `actions.ts` ·
`0018_scheduled_notifications.sql` (both reminder rules rewritten).

## Round A, verified

- Migrations applied to a clean local Postgres and in sequence.
- The partial unique index proved: a second live reminder for the same
  person refused, and accepted once the first is dismissed.
- A reminder for a non-assignee refused; an assignee setting one for
  somebody else refused; the creator setting one for an assignee accepted.
- Nudge refused on an upcoming reminder, accepted on a fired one, refused
  twice within the hour.
- Completing a task and removing an assignee each shown to clear the right
  rows and no others.
- The data migration run against a copy of the real five, with the
  before/after audience compared row by row.
- The cron's two reminder rules exercised against fixed clock values.
- 390px screenshots, both themes, of the creator's Reminders section with a
  red fired row, an amber upcoming one and a handled one.

---

## Order

**B, tested and deployed. Then A.** Each round ends with a numbered test
list here in the chat, as before.
