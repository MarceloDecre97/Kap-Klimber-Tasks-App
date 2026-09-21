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

1. **One button for the whole meeting** (0049). The first version had none at
   all, on the reasoning that a button you have to remember mid-call is one
   you forget mid-call — and the details panel beside it had one of its own.
   Marcelo set a title, a company and an attendee, left, and came back to
   none of it: one half of the screen saved itself and the other waited for a
   button he had no reason to expect. Details and paper now save together, in
   one write, under one stale check.
2. **The button IS the indicator.** Pressable means something is unsaved;
   greyed means nothing is. No status line to read and nothing to interpret.
3. **Three things save it without the button**: a minute of quiet, clicking
   out of what you were typing in, and the phone going dark
   (`visibilitychange`, which fires on Android where `beforeunload` does not).
4. **A copy in `localStorage` on every keystroke.** The server save can fail —
   a dead tunnel, a yard with no signal, a closed laptop. The local copy has
   none of those failure modes. It is offered back, never applied silently,
   and only when it differs from **what is on screen**: compared against the
   server's copy instead, it was true of every unsaved keystroke and of every
   saved one too, so the panel appeared after ordinary typing and ordinary
   saving until it meant nothing. See the note below.
5. **A second screen never flattens the first.** `save_meeting` carries the
   `updated_at` the page last saw and raises SQLSTATE 40001 when the row has
   moved on; the page then offers to reload rather than overwriting work it
   never had. Last-write-wins is the default everywhere and is exactly wrong
   for a document.

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

**3 — The rest of the team** (0048). Comments, and a filter by company.
Originally three controls — company, "Mine", "Internal" — which is three
things to read and eight combinations, two of which can never match anything.
They are one dropdown now: every meeting, then ours alone, then a rule and the
companies. "Internal" is not a property a meeting has *alongside* a company,
it is what a meeting has *instead* of one, so it belongs in the same list.

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

## Round two, from thirty-four tests

Thirty-one passed. What the other three and seven change requests came to:

**The card was quoting the minutes.** It showed the first 160 characters of
the body, which on a set of minutes is a register of who was in the room — so
every card read the same. 0050 gives a meeting a written `description`, 200
characters, its own field and never derived. Empty is normal and shows
nothing at all: a card with a title and a date says more than a card quoting
its own first line. The snippet still exists, for search to look at.

**Adding a new column is half the job.** `guard_meeting_edit` pins what a
non-author may not change, and a column it has never heard of is a column it
does not pin. `description` had to be added there in the same migration, or
Fred could have rewritten the one line of Marcelo's meeting that shows on the
card with a single API call and no screen at all. The local test now proves
it from Keith's side.

**One picker was doing two jobs.** Typing "p" offered Dee Kapur beside three
contacts from three different companies — a list with no shape. Four
colleagues and several hundred contacts are different kinds of thing: two
boxes now, and the contacts one narrows to the chosen company and shows them
*without* typing, because making somebody search a set of four is making them
work for nothing. Typing still reaches the whole book.

**A greyed-out form is still a form.** Fred could see an X beside each
attendee on somebody else's minutes. The database had always refused him, so
nothing was ever lost — but a control that does nothing is worse than no
control. Somebody else's meeting is now a read-only list of what was decided,
with no inputs and no buttons.

**The bin had nowhere to look.** Marcelo asked where it was three times.
Binning something with no way to get it back is worse than no bin at all. It
needed no migration: 0046's select policy already admits the team to every
row and `delete_meeting(id, false)` already puts one back, so what was missing
was a screen — folded at the foot of the list, like Recently deleted on the
Tasklist, same fortnight and the same promise that nothing is erased. The Bin
button moved off the top-right corner in the same round; that corner is where
every window in the world puts "I'm done looking at this", and it had the one
control here that takes something away. It is an X now, and binning is at the
very bottom, past everything you would read before deciding you no longer
need any of it.

**Two typing habits, because a notes box should behave like a notes box.**
Enter on `- ` gives another `- `, on `3. ` gives `4. `, and on an empty one
ends the list. Space or Enter after the first word of a sentence capitalises
it — but never a word that already contains a capital anywhere in it, which
is what keeps "iPhone", "eLog" and "mySQL" as they were typed. Word would
capitalise those. Both go through `document.execCommand("insertText")`, which
is deprecated and is still the only way to change a textarea from code
without throwing away the browser's undo stack: one Ctrl+Z takes back an
automatic bullet, or the automation is a trap. Twenty-two cases are measured
in a real browser against the shipped source.

**The box stops at fifteen lines.** It grew without limit before, which put
the save button, the action items and the comments a very long way down.
Fifteen is high enough that you have to have written a screenful before the
second scrollbar appears.

**The gear was on a third row for a reason nobody had measured.** Every width
concession had already been made — 286px against the 320px a 360px phone
gives you — and it still wrapped, because the gear and the view switcher both
sat at `order-4`. Equal order is DOM order, the switcher came first, and
`grow` had it fill the whole of row two. Wrapping is decided by the order the
boxes are laid out in, not by how much room they need. Measured again after
the fix: two rows, 126px, with the clock now exactly the same 44px square as
the bell and the gear beside it.
