# Task Banner — Plan, Phase 2

Drafted 2026-09-10. Two changes that arrived together and are worth naming
apart, because only one of them is about reminders.

**A. Reminders become per-person.** Today a reminder is a property of the
task — one `reminder_at`, one dismissal, fired at everyone assigned. It
becomes an appointment with a named recipient.

**B. A permission model.** Creator and assignee stop being the same thing.
This was not in the original Phase 2 sketch and is the larger half.

Not executed. Awaiting answers to the questions at the end, then approval.

---

## What already exists

Worth stating before anything is built, because two of the requests are
partly done and one is done entirely.

**Delete is already creator-only.** 0014 built the whole flow: the creator
deletes, everyone else sees **Request delete**, and the creator approves or
declines with a reason that lands in the task's history. Nothing to change
unless the request path should go too — see question 1.

**`can_decide_task_deletion` already handles the orphan case.** If the
creator has been deactivated, anyone may decide. Without that, a task
created by someone who has left is undeletable forever. The same hole
applies to editing, so the new rule has to inherit the same escape hatch.

**Column pinning is an established pattern here.** 0014 notes that RLS
"decides which rows may be updated and cannot restrict which columns", and
guards the deletion columns with a BEFORE UPDATE trigger that pins them
unless a transaction-local setting says the write came from a sanctioned
function. The edit restriction in B is the same shape, and pinning beats
raising for the same reason given there: an ordinary save sends every
column, and rejecting would turn a harmless no-op into a failed save.

---

## A. Reminders

### The model

New table `task_reminders`:

| column | |
|---|---|
| `id` | |
| `task_id` | cascades with the task |
| `member_id` | **whose reminder it is** — the person notified |
| `remind_at` | |
| `created_by` | who set it: themselves, or the creator |
| `dismissed_at`, `dismissed_by` | handled, per person |
| `created_at` | |

**One live reminder per person per task**, enforced by a partial unique
index on `(task_id, member_id) where dismissed_at is null`. "Live" means
not yet dismissed: dismissing frees the slot, so a second nudge after the
first is handled is fine, and the cap is never a dead end.

Setting a reminder when one already exists **replaces** it rather than
being refused — that is what "edit my reminder" means, and it matches how
`reminder_at` behaves today.

### Who may do what

- An **assignee** sets, changes and dismisses **their own** reminder.
- The **creator** sets, changes, dismisses and removes a reminder for **any
  assignee**, and is the only person who can see the whole set.
- Nobody may set a reminder for a person who is not assigned to the task.
  Enforced in the database, not only in the form.

All of it in a `SECURITY DEFINER` function rather than table policies: the
rule is "creator, or yourself, and only for an assignee", which is a
sentence about three tables and does not fit a `with check`.

### What each person sees

- **Everyone** keeps what they have now: their own reminder as the chip on
  the card, the amber line under it, and the click-to-dismiss behaviour —
  except it is now *their* reminder rather than the task's.
- **The creator** additionally gets a **Reminders** section listing every
  assignee and their reminder, or "none set". Their own reminder appears
  there too, so the list is the whole picture.
- **A non-creator sees no trace** of anybody else's reminder. Not a count,
  not a hint.

### Notifications — unchanged, but narrower

The existing rules stay exactly as they are: one at twelve hours out, one
when it fires, nothing after it is dismissed or the task is complete. The
only change is the audience — `notify_task_audience` gives way to the
reminder's own recipient. No notification at set-time (question 2 answered:
you tell them on the call).

The dedupe key gains the reminder's id, so two people's reminders on the
same task at the same minute cannot collide.

### Migrating the 5 live reminders

Each becomes **one row per assignee** on that task, keeping `remind_at`,
`dismissed_at` and `reminder_set_by` as `created_by`. Everyone who is
notified today is still notified tomorrow; nothing changes under your feet.

`tasks.reminder_at` is **left in place and stops being read**. It is not
dropped in the same migration that replaces it — that column was declared
deprecated in 0005 and brought back in 0011, and the cost of keeping a dead
column for a few weeks is nothing against the cost of being wrong.

### Everything downstream

`reminder` appears in 17 files. Each has to change from "does this task have
a reminder?" to "do I have one?":

- `reminders.ts` — `reminderState` takes a reminder row, not a task
- `task-pill.tsx` — chip, amber line, dismissal, and the creator's section
- `dashboard-stats.ts` — 46 references; every reminder statistic becomes the
  viewer's own
- `notification-bell.tsx` — the attention count
- `email/render.ts`, `notifications-view.ts`, `notification-prefs.ts`
- `data/tasks.ts` — a `reminders` relation, plus `myReminder` for the viewer
- `task-timeline.ts` — a reminder event now names whose it was
- `validation.ts`, `actions.ts` — the new set/dismiss/clear actions
- `0018_scheduled_notifications.sql` — both reminder rules rewritten

---

## B. Permissions

### The rule

| | creator | assignee |
|---|---|---|
| Edit task (title, description, priority, category, assignees, due date) | ✅ | ❌ |
| Delete task | ✅ | asks — already built |
| Change status / Mark complete | ✅ | ✅ |
| Add and remove links | ✅ | ✅ |
| Add notes, like, reply | ✅ | ✅ |
| Set own reminder | ✅ | ✅ |
| See and set everyone's reminders | ✅ | ❌ |

A creator who is also an assignee is simply both; nothing special is needed.

If the creator is **deactivated**, everyone gets the creator's powers —
the same escape hatch `can_decide_task_deletion` already uses. A task
belonging to someone who has left must not become frozen.

### Enforced where it counts

Hiding the Edit button is not the rule; it is the signpost. The rule is a
BEFORE UPDATE trigger on `tasks`, modelled on `guard_task_deletion`: unless
the writer is the creator (or the creator is inactive), every column except
`status`, `completed_at` and `completed_by` is pinned to its old value.
So an assignee's status change goes through, and a crafted request that
tries to rename the task quietly does nothing.

### Links move to the banner

This one follows from the rule rather than being asked for directly.
Assignees may add links, but links are edited on the **task form**, which
assignees will no longer be able to open. So the banner's External Links
section gains **Add link** and a remove control, available to everyone.

The form keeps its copy for the creator, so a task can still be created
with its links in one pass.

### "Created by"

A new row above **Assigned to**, showing the creator with their avatar.
Once who-created-it decides what you may do, it stops being trivia and
belongs on the face of the card rather than only in the history.

---

## Complexity

Roughly **three times Phase 1**, and the two halves are separable.

- **A** — new table, RLS, a definer function, a data migration, the cron
  rewrite, and 17 files following the change.
- **B** — one guard trigger, the banner's buttons, the links control moving,
  and the "Created by" row.

They are independent: B does not need A, and A does not need B.

---

## Questions

1. **The delete request path.** You said Edit and Delete should be
   creator-only. Delete already is — an assignee sees "Request delete" and
   you approve or decline. Does that stay, or should an assignee have no
   delete-shaped button at all? I would keep it: it is how somebody tells
   you a task is dead without being able to act on it.

2. **Editing when you are not the creator.** With the Edit button gone, an
   assignee who spots a wrong due date has no way to say so except a note.
   Fine, or would you rather they could ask, the way they can for deletion?
   My call: leave it — a note is enough for four people, and a second
   request-and-approve flow is a lot of machinery for a typo.

3. **"Nudge".** You said the creator can dismiss *or nudge* another
   assignee's reminder. I read nudge as "send their reminder notification
   now, ahead of its time, without moving it". Right? Or did you mean push
   the reminder later?

4. **Whose reminders can the creator dismiss?** Any reminder on the task,
   including one an assignee set for themselves — or only ones the creator
   set? I would say any: you can see them all, and a half-owned list is
   confusing.

5. **Removing an assignee who has a reminder.** Their reminder goes with
   them, silently. Agreed? The alternative is a reminder that fires at
   somebody about a task they are no longer on.

6. **The creator's own reminder.** It shows as the normal chip *and* in the
   Reminders section. Correct, or would you rather it were listed once?

7. **A completed task.** The cron already skips completed tasks, so
   reminders on one go quiet without being deleted — and come back if it is
   reopened. Keep that, or should completing a task clear its reminders
   outright?

8. **Order of work.** A and B are independent. I would ship **B first**: it
   is much smaller, it is a visible change you can test in a few minutes,
   and it does not touch the notification path. A then lands on a banner
   whose permissions are already settled. Two rounds of tests instead of one
   large one. Your call — the alternative is one round with everything in it.
