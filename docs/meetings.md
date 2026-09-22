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

## Round three: two permissions, one dropdown, and a month

**The minutes and the details are different things.** Marcelo's correction
after using round two: "meeting details like participants, time, description
and title can be modified by any assigned Opus Kap user; the actual meeting
minutes textbox is only for the creator." 0051 draws that line. Dee
remembering that Keith was there too is a correction to the record of a
meeting she sat in, not an edit to Marcelo's paper. "Assigned" means listed in
`meeting_members` — not the whole team, because a meeting Keith never attended
is not Keith's to relabel.

**Which turned a wasteful save into a trap.** Attendees were four statements:
delete the contacts, delete the members, insert the contacts, insert the
members. Under the old rule that merely cost three extra round trips. Under
the new one, statement two deletes the row that *gives Dee her permission*,
and statement four is then refused — she would have wiped the attendee list
and been unable to put it back. It is one `set_meeting_attendees` function
now, with the permission check taken before anything is deleted, and the write
policies on both tables are gone so there is no second path to keep in step.
The local test proves the whole sequence from Dee's side.

**One consequence worth knowing:** taking yourself off a meeting you did not
create is a one-way door — being on it is what lets you edit it. The screen
does not offer the X for your own name unless you wrote the minutes.

**Erasing for good** (`purge_meeting`). The bin made binning reversible; this
is the other end, and the only irreversible thing about a meeting. Same shape
as `purge_contact`: it refuses anything not already binned, so it is always
the second of two deliberate acts, and it returns what it destroyed so the
screen can name it. Tasks that came out of the meeting survive —
`tasks.meeting_id` is `on delete set null`, so the work stays and only its
origin is forgotten.

**One app, one dropdown.** The meetings screen was using the browser's own
`<select>`, which on Windows is a grey rectangle in a typeface this app does
not otherwise use, sitting two inches from the address book's filter menus.
The filter is the Tasklist's `FilterDropdown` now, with an optional group
heading added for "Companies"; the attendee and company fields are the same
floating panel underneath. All of them portal into `document.body`, which
is not decoration: the details panel lives in a column with `overflow-y:
auto`, and per the CSS spec overflow on one axis clips the other too, so a
menu drawn inside it would be silently cut off.

**The pickers open on a press, and the company leads.** They listed every
option the moment the panel opened, which for the team meant three names and
a face each taking a third of the screen above the thing you were trying to
reach. Now: press the box, get a menu. The address book's menu shows the
chosen company's people when you have typed nothing and the whole book the
moment you type — you know who you met before you know their name is spelled
Housman, and the supplier who brought somebody from another firm is exactly
the meeting you would otherwise have to undo the company to record. When a
company has nobody linked to it, the menu says so rather than being empty,
which is what the first version did and what made this look broken.

**Two companies, finally honest.** `MeetingSummary.companies` is every
company in the room; `company_id` stays the single one a meeting *belongs*
to, null when two firms were present. The card draws the list, so a meeting
with somebody from AAA and somebody from ADV Mobil stops claiming ADV Mobil,
and the filter matches against the list, so that meeting turns up under both
rather than under neither.

**Typing, round two.** Three things Marcelo found. A line is usually finished
before it is left — "- called eric." and Enter has the caret after a full
stop, not a letter — so the trailing punctuation is captured rather than
ending the match, and leaving a line now also settles its first word. `1- `
is a numbered list, not only `1. ` and `1) `. And `autoCapitalize` is off:
Android's own sentence capitals fire on the *first letter* of a word, before
there is a word to judge, so "iPhone" became "IPhone" on the phone while
staying "iPhone" on the desktop. Ours waits for the space or the Enter, by
which time it can see the whole word and leave anything carrying a capital
alone. Thirty-three cases are measured in a real browser against the shipped
source.

**The month, where the empty right pane was.** It said "Pick a meeting, or
start a new one", which is a sentence telling you to do the thing you were
already trying to do. The list on the left is ordered by recency, which finds
the meeting you had this morning; a month finds the one you had sometime
before the Louisville trip. Built from the meetings already on the page, with
days compared as the plain `YYYY-MM-DD` strings the database stores — a
calendar day has no time zone, and turning one into a `Date` is how a meeting
held on the 1st starts showing on the 31st.

**A probe that measured itself.** The layout check reported the New meeting
button shrinking and a horizontal scrollbar. Both were the probe: `Button`'s
base class is three string literals joined with `+`, and taking the span from
the first quote to the last kept the `" + "` between them — those quotes then
terminated the `class` attribute in the probe's HTML, so everything after,
including `shrink-0`, never reached the button. Measured properly: the button
holds 161px at every width from 320 to 768, the dropdown gives up the
difference, and there is no horizontal scroll.

## Round four: a meeting can be with four companies

**`meetings.company_id` was a lie the schema told.** A call with somebody from
AAA and somebody from ADV Mobil had to pick one company or be filed as
nobody's. 0052 replaces the column with `meeting_companies` — up to four,
chosen by hand — and the column is *dropped* rather than kept alongside,
because two answers to "which company is this meeting with" means the one you
get depends on which query you happened to write. Four is a real limit: five
companies is a conference, and its minutes want a title rather than five chips
on a 360px card.

Companies are still derived from whoever from the address book was in the
room. The two halves compose: `companies` on a summary is the chosen set plus
the attendees', and the address book picker offers the people at any of the
chosen ones.

**Who may take whom off.** 0051 let anybody who was at the meeting change its
details, which let Dee take Marcelo off his own meeting. The rule now: you may
add anybody, and remove only the people *you* added. The author may remove
anybody. Nobody but the author may remove themselves — being on the meeting is
what gives you the right to change it, so that X would be a button revoking
your own access with no way back.

That rule needs `added_by` to survive a save, which meant `set_meeting_attendees`
could no longer delete everything and re-insert: rows that are staying are now
left alone. Worth noting that the delete-and-reinsert shape has caused two
distinct bugs in two rounds — the 0051 lockout and this one.

**The focus ring was drawn around the wrong box.** globals.css gives every
`:focus-visible` a 3px outline with a 2px offset and says it is never removed,
rightly. But the focusable element in the attendee picker is the `<input>`
inside the control, so the ring stopped short of the chevron and sat inside
the border — the short, misaligned box in Marcelo's screenshot. It is drawn
from `focus-within` on the container now: same ring, same rule, around the
thing a person would say has the focus.

**"New meeting" became "Meeting", at 48px.** The plus already says new, and
two controls sharing a line at 56px and 48px read as a mistake rather than as
a pair. Measured after: both 48px, same line from 320px to 768px, and the
filter gains 39px at the narrowest width.

**iPhone, again.** The notes box has had `autoCapitalize="off"` since round
three and its own rule leaves any word containing a capital alone — but the
title and description inputs did not, and a product name typed into a title
is exactly where this bites. Both are `off` now. If it still happens *in the
notes box* on the phone, that is Gboard's own device-level auto-capitalisation,
which some keyboards apply regardless of the attribute; the test is whether
the same thing happens in another app's text field.

## Round five: the card's one line, and the ring that was two

**Two borders, and the layered-CSS rule behind them.** Round four moved the
picker's focus ring from the inner `<input>` to the box, using Tailwind's
`focus-visible:outline-none` on the input. It lost. `globals.css` declares
`:focus-visible { outline: 3px solid ... }` outside any cascade layer, and
Tailwind's utilities live inside `@layer utilities` — **an unlayered rule
beats a layered one however specific the layered one is.** So both rings drew:
the new one around the box and the old one still around the text. The
suppression is an unlayered rule in `globals.css` now, beside the rule it has
to beat. It also takes `--color-btn` rather than `--color-prim`, which is
brand red on white and white on the dark ground — Marcelo's call, and the one
token in the palette that already means "this is the live thing". Measured in
both themes: one outline, `rgb(135,37,43)` light and `rgb(255,255,255)` dark,
`none` on the input.

**Three chips on a 356px column.** Two company names and a date do not fit,
and wrapping them gave the ragged three-line card in Marcelo's screenshot. The
row shows as many company chips as fit and counts the rest — `ADV Mobil +1
Sep 21` — with the date and the count never shrinking, because they are the
short load-bearing halves.

How many fit is estimated rather than measured: measuring means rendering the
row, reading it back and rendering again, which is two frames of visibly wrong
layout on a list that holds fifty cards. The estimate is deliberately
pessimistic — over-guessing drops a chip that would just have fitted, which is
a smaller card; under-guessing wraps the row, which is the bug. A probe
renders real chips against the built CSS and asserts the estimate never reads
short of one; the first constants read 1–2px short on three of nine labels and
were raised. And `truncate` on the names absorbs whatever is still wrong: the
row cannot wrap, so the worst case is an ellipsis. Measured at 320, 360 and
412px: one line every time, nothing clipped, no horizontal scroll.

**A screen that showed one of two true answers.** Marcelo set a meeting to AAA
Industrias, added Eric Housman from ADV Mobil, and the card grew an ADV Mobil
chip while the details panel still showed one. Both were right — one is what
was chosen, the other is worked out from who was in the room — but showing
only half of that looks like a bug. The panel now names the derived half and
where it came from: *"Also on the card: ADV Mobil (from Eric Housman)."* The
pane's own header had the same hole for a different reason: it printed
`company_name`, which is null the moment two firms are present, so it went
quiet on exactly the meetings that needed it. It lists them all now.

**"+ Meeting" at `gap-1`.** 8px between a plus and its word reads as two
things sharing a button rather than one centred label.

## Round six: mentions, likes, and one device at a time

**Mentions** (0053). The margin was deliberately plainer than a task's notes.
Two of the three omissions earned their place after use: a mention is the
difference between Dee's note about the second depot reaching Marcelo and
sitting in a list he might scroll, and a like closes the loop without a second
comment saying "yes" — which is what people write instead, and it is worse.
Threaded replies stay out: a thread is a conversation, and a conversation
between four people who sit in the same room is machinery for a problem this
team does not have.

The `@` picker, the storage form `@[Name](uuid)` and the renderer are the
Tasklist's, unchanged. Learning one gesture twice is a waste of the person
using it, and a second copy of the mention grammar is a second thing to keep
in step with the trigger that reads it.

`meeting_mention` is its own notification kind rather than reusing `mention`,
because `notifications_subject_check` requires a `task_id` for that one and a
meeting comment has no task. Loosening the rule would have been the cheap
option; the rule is what stops a notification arriving with nothing to open.
Both constraint lists were read off the live constraint and restated — retyping
one from memory has gone wrong twice in this project.

The author is told once. Named in the comment and also its author, they get
the mention and not the comment notification too: two rows for one comment is
how a notification list stops being read.

**A like is a row, not a counter.** Insert or delete, one per person per
comment, so two people liking at once cannot lose one of the two and there is
no number to drift. The count moves on screen before the server answers and
goes back if the write fails — it is the cheapest gesture in the app and a
round trip to see it land makes it feel broken.

**The write lease** (0054). The stale check has always stopped a second screen
flattening the first, but only after a paragraph has been typed into it.
Marcelo writes on a laptop and, when it dies or the call is on speaker, on a
phone, so the same minutes are genuinely open twice on one account. Whoever
opens the write box holds it; the other device gets the minutes to read and a
line saying where they are being written.

It is a **lease**, and that is the whole design. A phone that dies mid-meeting,
a lid closed, a tab the OS kills — none release anything, and a lock nobody can
take back would lock Marcelo out of his own minutes with no way in. So it is
refreshed every 20 seconds while the box is open and expires 60 seconds after
the refreshes stop: two heartbeats may be lost to a bad tunnel before anybody
else can take it, and walking away costs a minute.

Keyed by **device**, not by member — a lock keyed by person alone would permit
exactly the collision it exists to prevent. `claim_meeting_lock` takes or
refreshes and returns who holds it either way, so the page never asks a second
question and there is no gap between "is it free" and "take it".

Only the BODY is claimed. The details belong to everybody who was in the room
(0051), and two people fixing a date and a title at once is not a document
being overwritten.

**Derived, not corrected.** The pane computes `wantsToWrite` from what the
person asked for and shows the editor only when the lease came back as theirs.
Nothing reaches into the reading state from an effect to put it back — the
second device simply never renders an editor. The hook stores only the answer,
stamped with the question it answers, so "idle" and "checking" are derived and
every `setState` stays inside an async callback. React's lint caught the first
version doing it the other way.

**A test that was wrong, not the code.** The first run reported zero
notifications from a comment that had named two people. Notifications are
private — `notifications_select` shows you only your own rows — and the test
was reading them as the sender. Each recipient checks their own inbox now,
which also proves the policy.

## Round seven: a notification nobody could see

**`meeting_comment` had never once reached the bell.** Not since 0048 shipped
it. The database wrote the row correctly every time — production had three of
them — and `toItem` in `listNotifications` dropped every one:

```
const gone = !row.task || row.task.deleted_at !== null;
if (gone && row.kind !== "deleted") return null;
```

No `task_id` means no joined task row, no task row means `gone`, and `gone`
means dropped. `contact_erased` had an early return above this because it was
written at the same time as the rule; the two meeting kinds were written a
round later and nobody connected them. The lesson is not "add a case": it is
that a notification kind is TWO pieces of work, one in the trigger and one in
the reader, and shipping the first without the second produces something that
tests green at every layer I looked at. It is a `TASKLESS_KINDS` set now,
listed rather than inferred from `task_id === null`, because a missing task is
also what a deleted task looks like from there and those two must not be
treated alike.

Found by querying production rather than by re-reading the trigger — the rows
were there, so the write half was never the suspect.

**A stored draft is a wire format.** Marcelo's phone offered "this device kept
a newer copy", and taking it crashed the page. A draft written before 0052
holds `companyId: null` where the panel now expects `companyIds: []`, so
recovery called `.includes` on `undefined`. `localStorage` is a channel
between two versions of the app and needs a version like any other: drafts
carry one now, and anything older is ignored rather than read. That fixes the
crash and the stale offer in one — the draft that produced it was from an
older shape.

**Companies follow the people.** Marcelo asked the same question three rounds
running: why does ADV Mobil appear on the card when I add Eric, and not in the
panel? Both answers were true — the panel showed what was chosen, the card
showed what is true — and the right fix was to stop making him choose
something the app already knew. Picking somebody from the address book now
adds their company with them. It never passes four, and it never REMOVES a
company when the last person from it comes off: a meeting with a company you
named and nobody from is a real meeting.

**The card's date lost its time.** "17 Sep · 2:30 PM" costs about 70px of a
row that has to hold a company name, and nobody finds a meeting by the hour it
started.

**The ring, everywhere it was asked for.** `.field-ring` now covers a plain
field as well as a box of them: `:focus-within` matches an element that IS
focused as well as one containing the focus, so one class does both jobs.
Title, description, date, time, the minutes and the comment box all ring brand
red, white on the dark ground. Measured in both themes.

**Back and close on one row** on a phone, where they were stacked — two rows
saying the same thing. The pane keeps its own X from `lg` up, where there is
no back link.
