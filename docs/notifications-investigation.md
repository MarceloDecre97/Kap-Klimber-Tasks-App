# Notifications — what we know, and what to measure

Parked 2026-09-14, to be picked up around 2026-10-05 with three weeks of
real traffic behind it. Phase 2 (the two-pane desktop dashboard) goes first.

## The trigger for this

Dee had ~58 unread notifications and did not clear them. Marcelo cleared
them for him.

## A measurement trap, recorded so nobody falls in twice

**Dismissing a notification deletes the row** (`dismissNotification` in
`src/app/notifications/actions.ts`). So counting `public.notifications`
after somebody has tidied up measures the tidying, not the traffic. The
first pass at this counted 30 rows, 2 of them Dee's, and concluded there
was no volume problem — from a table that had just been emptied.

When this is picked up again: **look before anyone clears anything.**

## Where the volume actually comes from

Five triggers and four scheduled rules write notifications, and
`task_audience` is *creator + every assignee* (plus note writers, for
replies):

| source | fires on |
|---|---|
| `task_notes_notify` | every note |
| `task_notes_notify_edit` | mentions added by an edit |
| `task_assignees_notify` | being put on a task |
| `tasks_notify_change` | every status change, every due-date change |
| cron rule 1 | twelve hours before each reminder |
| cron rule 2 | each reminder firing |
| cron rules 3 & 4 | due tomorrow, and overdue |
| `nudge_task_reminder` | a nudge |

The engine is this: **creating a task subscribes you to it permanently,
with no way off.** Someone who creates a lot of tasks receives every note
and every status change on all of them, indefinitely.

## Three candidate fixes — different problems, do not conflate

1. **Group the bell by task.** Display only: "4 updates on X" as one row
   that expands. Rows stay 1:1 underneath, nothing is lost, the badge
   counts conversations rather than events. Lowest risk. Fixes a full
   inbox; does nothing for a buzzing phone.
2. **Generate fewer.** The twelve-hour reminder warning is roughly half of
   all scheduled volume and announces something that has not happened yet.
   `due_soon` / `overdue` currently reach creators as well as the people
   who have to act.
3. **A way off a task.** A mute, or creators stop receiving routine status
   changes on tasks they are not assigned to.

## Already built, possibly just unknown to its users

`src/lib/notification-prefs.ts` has **nine per-kind switches** in Settings:
mentions, asks, comments and replies, assignment, status and due-date
changes, reminders, deadlines, removals, contacts. Part of this may be a
conversation with Dee rather than a release.

There is **"Mark all read" but no bulk dismiss**, which is why clearing 58
fell to Marcelo one at a time.

## Questions still open

1. Inbox clutter, or the phone buzzing? Grouping fixes the first only.
2. Has anyone actually enabled push on a phone? If not, this is purely an
   inbox problem.
3. Should creating a task subscribe you to it forever?
4. Is a "clear all" wanted?
5. What does Dee actually have switched on in Settings?

## What to do when this is picked up

Log in as Dee **before clearing anything** and capture:

```sql
-- per person, per kind, and how much of it is unread
select m.display_name, n.kind, count(*),
       count(*) filter (where n.read_at is null) as unread
from public.notifications n join public.members m on m.id = n.member_id
group by 1, 2 order by 1, 3 desc;

-- how bursty it is: several rows for one task inside a few minutes is
-- what grouping would collapse
select task_id, member_id, date_trunc('hour', created_at) as hour, count(*)
from public.notifications
group by 1, 2, 3 having count(*) > 1 order by 4 desc;
```

The second query is the one that decides whether grouping is worth
building. If almost nothing repeats within an hour, the answer is (2) and
(3), not (1).
