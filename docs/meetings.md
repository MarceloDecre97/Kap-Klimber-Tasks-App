# Meetings

The Word-document-per-meeting, replaced. Built in four phases from Marcelo's
brief; this is the reasoning, and the things that nearly went wrong.

## What the design is answering

Marcelo named the four things that would send him back to Word:

- hard to find past minutes
- saving fails, things get lost
- not intuitive
- hard to reach

Those drove the running order rather than sitting in a later phase. Search
and the nav tab are in phase 1, not phase 3, because two of the four are
about finding and reaching.

The case for building it at all is something he said almost in passing:
*"instead of having a long task description."* A task's context had nowhere to
live but its own description, so the description grew until the task stopped
being a task. Meetings are the missing middle between a company and the work
that comes out of it.

## The shape, and why

**A meeting is an occurrence, not a folder.** The idea grew from "one Word
document per company, split by dates". That is a *reading experience*, not a
storage format — so the company pane lists meetings newest-first, which looks
exactly like that document, while each stays a row a task can point at and
search can return on its own. A single growing document can do neither.
Industry guidance agrees: one artefact per meeting, and the running-page
pattern is reported to break down past roughly a hundred accounts.

**The company is optional and usually derived** from who was in the room. That
one choice covers an internal meeting (members only) and a call with two
suppliers (contacts from both) without either needing a mode of its own. Two
companies in the room returns null rather than picking one — the same rule
`outreachTaskTitle` already follows for its "from X" suffix.

**The body has no event log**, where every other table here has one. Autosave
writes every few seconds; a log of that is noise, not history. What it gets
instead is that only its author can change it, so there is never a question of
who wrote it. Title, date, time and company *are* logged.

**Everyone reads, one person writes.** Marcelo's call. Two people typing into
one document is how a paragraph disappears and nobody finds out. Comments
(phase 3) are the release valve: Dee sat in on the call and remembers the bit
about the second depot, and her note changes not a word of his.

**Desktop and phone both write.** The first draft of this design assumed
read-on-phone, write-on-desktop. Marcelo corrected it: the laptop dies at an
in-person meeting, or the call is on speaker. So the phone layout gives the
paper the full width with nothing floating over it.

## The editor is the feature

Everything else is plumbing. The rules are about never losing a sentence:

1. **No Save button.** One you have to remember mid-call is one you forget
   mid-call. It saves on a pause and says so.
2. **A copy in `localStorage` on every keystroke.** The server save is
   debounced and can fail — a dead tunnel, a yard with no signal, a closed
   laptop. The local copy has none of those failure modes and is offered back
   on the way in, never applied silently.
3. **The save state on screen in words**, always. Silence is what makes people
   reach for a Ctrl-S that does not exist.
4. **A second screen never flattens the first.** `save_meeting_body` carries
   the `updated_at` the page last saw and raises SQLSTATE 40001 when the row
   has moved on; the page then offers to reload rather than overwriting work
   it never had. Last-write-wins is the default everywhere and is exactly
   wrong for a document.

## The phases

**1 — Write it, and never lose it** (0046). Meetings, attendees, optional
company, the log. The editor above. Search from day one, server-side over
trigram indexes — trigram not full-text, because minutes are half sentences
and half part-numbers and `to_tsvector` stems "mounting" to "mount" while
refusing to match "53-footer". Meetings on the company and contact panes. A
nav tab.

**2 — The work that came out of them** (0047). `tasks.meeting_id`, one column
rather than a join table: a task comes out of at most one meeting, the
conversation it was decided in. `on delete set null`, so erasing a meeting
does not take the work with it. Pinned after insert like `is_outreach`, so a
finished "fix their address" can never be recast as an action item from a
conversation it was not part of.

**3 — The rest of the team** (0048). Comments, and filters by company / mine /
internal. No filter narrows another's options, the rule the contacts book
arrived at the hard way.

**4 — Formatting** — the cheap half only. A line starting `- ` or `* ` renders
as a bullet, with no editor library at all, and a Write/Read toggle so the
author can see their own minutes rendered. The expensive half is **not built**
and deliberately so: bold and headings need a real editor (~165–245KB), and
pasting screenshots needs file storage this app does not have — logos are
squeezed into a 200KB database column that screenshots would burst. Both wait
until a fortnight of real meetings says they are missed.

## Things that nearly went wrong

**A nav tab that does not fit.** Four segments needed the labels to give
ground, not the padding: "Tasklist" and "Dashboard" became "Tasks" and
"Board". Measured at 320–1280px before shipping — one line, no clipping, no
overflow.

**`notifications_kind_check`, retyped from memory.** The draft dropped
`restored` and `reminder_nudge`, and `reminder_nudge` has rows in production,
so the ALTER would have failed on validation. **This is the second time** —
0044 did the same to `task_events_kind_check`. The rule now: never retype one
of these, read it off the live constraint first.

**`notifications_subject_check`, which nobody remembered.** 0025 requires a
`task_id` unless the kind is one that concerns something else. Caught by the
local test, not by reading.

**The bell's icon map.** Keyed by notification kind, so an unhandled kind
renders blank — caught by TypeScript. It also had no destination for a
notification with no task, which would have made the one notification whose
entire purpose is to be followed a dead end.

**`guard_task_edit` restated without 0041's line.** The first draft of 0047
defined the function twice, and the earlier definition was missing
`new.is_outreach = old.is_outreach`. Two migrations edit one function and the
last to run wins, so that would have silently undone 0041. Caught by reading
the live function before writing rather than after.

**Tests that run as superuser prove nothing about RLS.** The lesson from 0045.
Every test for 0046–0048 does `set role authenticated` first.
