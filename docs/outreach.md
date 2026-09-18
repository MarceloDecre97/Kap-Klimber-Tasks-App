# Outreach, and why it is not a checkbox

## The idea that was rejected

The first shape was a "contacted" flag on the contact, with a button on the
row to toggle it. It would have been half a day's work and wrong within a
month, for one reason: a flag records that **somebody remembered to press a
button**, not that anybody was contacted. Three weeks after a trade show,
looking at a ticked box, you cannot tell who reached out or when — and the
moment one person forgets to tick, the book is lying.

## What replaced it

Marcelo's design: a **Contact** button on the person makes a task, prefilled
and linked to them. When the task is completed, the contact shows as
contacted — by whoever finished it, on the day they finished it.

Nothing is stored for that. `tasks` already carry `status`, `completed_at`
and `completed_by`, and `task_contacts` has linked tasks to people since the
address book was built. "Contacted" is a question asked of data that already
exists, so there is no second copy to drift out of step with the first.

It also pays for itself twice over:

- **In progress is visible.** An open outreach task shows on the contact, so
  two people don't ring the same man on the same afternoon.
- **It counts.** Two completed rounds read "Contacted ×2" without anything
  extra being recorded.

## The wrinkle, and the marker

Not every task linked to a contact is outreach. "Update Mandy's phone
number" would complete and quietly claim she had been emailed.

So `tasks.is_outreach` is set once, by the Contact button, and **pinned by a
trigger for everybody** — not as a permission, but because nobody should
have it. A task that could become outreach afterwards would let a finished
"fix their address" be turned into evidence of an email that never happened.

The marker is deliberately **not** the category. The button also sets the
category to Client outreach, but somebody changing that later does not
change what the task was made for.

## The one thing that is stored

A reply lands in somebody's inbox, which the app cannot see. So "in touch" is
an assertion, and it is treated as one: stamped with who said it and when,
reversible, and written into the contact's activity log like any other
change.

Two rules narrow it:

1. **It is only offered after a completed outreach task.** Somebody who
   emails you out of the blue gets a task made and ticked off — thirty
   seconds, and the record stays evidence-based throughout.
2. **Only the task's creator or its assignees may press it.** Those are the
   people who did the outreach. Not "anyone on the team", because nothing in
   the app can check the claim and the narrower the set of people who can
   make it, the more it is worth. The inactive-creator escape hatch matches
   `can_edit_task`.

Enforced in the database, not in the button. RLS chooses rows and cannot
protect columns, so `set_contact_in_touch` is the only writer and a
BEFORE UPDATE trigger pins both columns against everybody else — the same
shape as the task-deletion guard in 0014, down to the transaction-local flag.

## Wording

**"In touch"**, not "Successful". A reply can be a polite no, and that is
still a reply and still ends the chase. A label that claims victory would be
wrong the moment somebody declines, and a pill people learn to distrust is
worse than no pill.

## One reply, three people

An email to three people at one company gets one reply, and that reply
usually speaks for all three. Marking each of them by hand is busywork
describing something that happened once; marking all three automatically is a
claim nobody made, and in six months it is the kind of wrong that sends
somebody into a conversation believing they have a relationship they do not.

So the question is asked rather than assumed: press **They replied** on a
task that went to more than one person and it asks who it counts for, with
everybody on that task already ticked. Two taps for the common case, one
untick for the honest one. A task that went to one person is still one tap.

## Decisions worth recording

**The pill shows the furthest state reached.** Somebody who answered in
September and picks up a fresh outreach task in November still reads "In
touch". Going backwards would say the relationship had been lost, which is
not what a new task means.

**Open rounds are never counted.** An intention is not an outreach. A round
running on top of a finished one shows as a clock beside the pill rather
than in words — the pill shares a 390px row with a relationship chip.

**Four contacts per task, up from two.** One email to four people you met on
the same stand is one outreach each.

**"Not contacted" is shown on every untouched row**, at Marcelo's request and
against my advice — it costs each row about 36px on a phone, which over 57
contacts is real scrolling. He is testing it live; dropping it is a one-line
change.

**"Outreach open" was never a bigger pill.** All four states are 30px tall
with the same padding and type size as the relationship chip beside them —
the label was simply thirteen letters against eight, so it became "Reaching
out". What was genuinely wrong was `text-timestamp` missing from `TEXT_SIZES`
in utils.ts: tailwind-merge files an unknown `text-x` under colour, so the
state colour in the same `cn()` call deleted the size and the pill inherited
the row's 18px. The same trap the file already documents for colour names,
from the other end. `screen-title` was missing too.

**"In touch" cannot outlive the task that earned it.** 0041 got half of this
right: "Contacted" is derived, so binning the task took it away on its own,
while "In touch" is stored and nothing cleared it. A contact whose outreach
task had been deleted and erased kept the pill for ever — and because the
undo asks for a live completed task, the button to take it back had gone too.
A state you can enter and cannot leave. Now a binned task **hides** the claim
and restoring brings it back, while erasing the last one **clears** it in the
database (0043), so a later round starts at Contacted instead of leaping to
In touch on the strength of a task nobody can see.

**No filter narrows another.** Every dropdown offers everything in the book,
whatever else is switched on. The old rule — offer only what somebody in view
carries — reads well until two filters are on at once: pick Partner and the
trade show list empties, so the control vanishes mid-thought. The honest
answer to "Partner, from MATS" is an empty list and the line that already
says so. This reverses the note that used to sit in contacts-app.tsx arguing
both books should narrow identically; they still behave identically, they
just both stopped narrowing.

**No filter hides while it is switched on.** Each dropdown lists only values
somebody in view carries, which is right for browsing and a trap with two
filters at once: pick a trade show, then an outreach state nobody at that
show is in, and the show falls out of its own dropdown — still filtering,
with nothing left to switch it off. The current selection now survives the
narrowing in all three lists.

**The generated title is derived, not stored in form state.** It keeps itself
in step with who is on the task until somebody types their own wording, at
which point it is theirs for good. Written as an effect it fought the input
on every render; derived, the box simply shows the generated words and the
first keystroke hands it over.

## Rounds, and the two ways it ends (0044)

The chase used to cost one task per email, and only had one ending.

**A round is not a task.** Four emails to a cold prospect was four task cards
that all said much the same thing, times a few dozen prospects — a task list
nobody could read. So a chase is now rounds on one task: completing the
outreach task is round one, and **Sent another** on the contact records each
one after it. `record_outreach_sent` writes an `outreach_sent` event on the
task's own timeline, so the evidence is still the task's history rather than a
counter somebody remembered to tick, and `Contacted ×4` counts rounds instead
of cards.

**"No reply" is a decision, parked.** `in_touch_at`/`in_touch_by` became
`outcome`/`outcome_at`/`outcome_by`, because "they answered" and "they never
did" are two answers to one question and two booleans would have been a rule
somebody had to remember. The pane names both dates Marcelo asked for: when
the first round went out, and when the silence was called.

**A new round outranks a silence.** `no_reply` is the one state that steps
aside: give up in March, start a fresh outreach today and the pill reads
"Reaching out" again, because that is what is happening. "In touch" does not
step aside — a relationship is not lost by emailing somebody again.

**Giving up is offered after one round, and is the quietest thing in the row.**
One cold email that went nowhere is a real thing to park, so the threshold is
one; but it is a link rather than a button, because it should never be what a
thumb finds first on a chase that still has life in it. It is never offered
before any round has been sent — "No reply" from somebody nobody emailed is
not a silence, it is a mistake waiting to happen.

**Both endings ask who they count for**, when the email went to more than one
person, and for symmetrical reasons read in opposite directions: marking Mike
"In touch" because Sheena replied is a claim nobody made, and giving up on
Sheena because Mike never answered throws away a live thread.

### The reminder was the hard part

Marcelo asked the question that broke the first design: *does the reminder
stay active even though the task is completed?*

No — and worse than no. Two separate rules killed it:

1. `run_scheduled_notifications()` skipped reminders on completed tasks
   (0035, rules 1 and 2).
2. `clear_reminders_on_complete()` **deleted** them outright (0034).

For ordinary work both are right: a nag about finished work should stop, and
deleting it is more honest than leaving it to lurk. For outreach both are
exactly backwards, because **completing the task is when the email went out** —
the event the week's wait is measured from. The reminder the Contact button
arms was being destroyed by the very act that starts it counting, so the first
week's chase could never once fire. Loosening the scheduler alone would have
fixed nothing: there would have been no row left to find.

So 0044 exempts outreach from both, and adds the stop condition that keeps it
from nagging for ever: `outreach_still_owed(task)` — true while at least one
live contact on the task has no outcome. It is read every minute rather than
switched off once, so marking In touch or No reply ends the chase by itself
with nothing to remember to cancel. Three people on one email and one of them
answers: the reminder keeps coming, because two of them haven't.

`record_outreach_sent` re-arms that reminder seven days on, and writes it
directly rather than through `set_task_reminder` — that function requires its
subject to be an assignee, which is right for putting a reminder on somebody
else's plate and wrong here. You can create an outreach task, assign it to
Dee, and still be the one who sends the email; refusing you a reminder for
yourself would have meant the round inserted and the reminder threw, rolling
back the whole call and losing the round.

**A near miss worth recording.** The first draft of 0044 rewrote
`task_events_kind_check` from memory and invented `deletion_requested`,
`deletion_cancelled`, `deletion_approved`, `deletion_declined` — dropping the
real `delete_requested`, `delete_denied`, `delete_cancelled`, `deleted` and
`reminder_nudge`. Every future deletion request and nudge would have been
rejected by the constraint. The local tests all passed because none of them
exercised a deletion or a nudge; it was caught by comparing the app's
`TaskEventKind` against the migration and then reading 0014 and 0034. There is
now a test that inserts all eleven kinds.

## The reminder cleanups had never deleted anything (0045)

Marcelo found it in one line of a test list: complete an ordinary task, and
its reminder chip is still on the card. It should have gone since 0034.

`clear_reminders_on_complete` and `clear_reminder_on_unassign` both do
`delete from public.task_reminders`, and **neither was SECURITY DEFINER**.
`task_reminders` has RLS enabled and exactly one policy —
`task_reminders_select`, for SELECT. Under RLS a DELETE with no policy does
not raise: it matches no rows and reports success. So both triggers had been
running, finding nothing, and returning happily for as long as they existed.

Everything that *writes* reminders is SECURITY DEFINER already
(`set_task_reminder`, `set_reminder_dismissed`, `clear_task_reminder`), which
is why setting one always worked and only the automatic clearing was silently
dead. The deliberate absence of write policies is the right design — reminders
are written through functions that check permission, never by direct table
access. These two triggers were never let in on it.

The reported symptom was the mild one. The twin was worse: taking somebody off
a task never removed their reminder either, which 0034's own comment calls
"worse than none". It had produced no rows in production yet, and 0044 is what
made it urgent — outreach reminders now survive completion, so an unassigned
person could have been nagged indefinitely about a chase that was not theirs.

**Why it got through.** The migration test harness runs as the superuser,
which bypasses RLS, so the local run of this exact scenario passed. An
RLS-dependent failure is invisible to a test that is not subject to RLS. The
tests for 0045 `set role authenticated` first, and the diagnosis was proved by
running the same script against a database built without 0045 (reminder
survives) and with it (reminder goes, outreach one stays).

**Two lessons, recorded because they will recur.** Anything that writes to an
RLS-protected table from inside a trigger needs SECURITY DEFINER or a policy —
there is no third option, and the failure is silent. And a permission test that
does not run under the permissions it is testing proves nothing; an audit of
every non-SECURITY-DEFINER trigger function that writes to a `public.` table
found exactly these two and nothing else.

## The action row, measured — and three corrections

At a 360px phone the row inside the outreach card has **290px**; the page's
`px-5` and the card's `p-3.5` and border take the other 70px. The three
buttons at `sm` with icons need 348px. So they wrap, and the only real
question was *where*.

Where it lands now, with all four actions in one wrapping container:

| width | lines |
|---|---|
| 320 – 412px (every phone) | `Contact · Sent again` / `Replied · No reply` |
| 430px | the three buttons / `No reply` |
| 560px and up | all four on one line |

**Three arrangements, each corrected by Marcelo**, and the corrections are the
useful part. First: `md` buttons with icons, which took three lines on a phone
and two on his desktop. Second: icons removed to force a single line
everywhere — the arithmetic was right and the trade was wrong, because a
second line costs a second line while an icon carries meaning every time the
card is opened. Third: two containers, so the link was *stated* to be on its
own row — which spent a whole third line on one link. One container, and the
wrapping decides; what should share a line depends on how much room there is.

`sm` is `h-11 px-3 text-timestamp`. 44px rather than smaller because that is
the floor for something a thumb has to hit; going under it to win layout
pixels is a bad trade. Everything shorter in this app is a chip you read, not
a control you press.

**The `link` variant had no size at all.** It deliberately takes no size class
— a link inside a paragraph should be the size of that paragraph — so when the
buttons dropped to 15px, "No reply" and "Chase them again" carried on
inheriting the card's body size and rendered at **18px**, a fifth larger than
the buttons beside them. Measured: 18px/98px wide against the buttons'
15px/80px. They now say `text-timestamp` explicitly.

### Two ways this measurement went wrong

Worth recording, because both produced confident and false readings.

**Measuring a mock instead of the component.** An earlier round measured a
hand-written approximation of the pill and declared it fine while the real one
was wrong. The probe now reads the `base`, `secondary`, `link` and `sm` class
strings out of button.tsx itself and reproduces the real nesting (`px-5` →
`max-w` → card `p-3.5 border-[1.5px]` → row) against the built CSS in `.next`.

**Grouping flex items by `top` to count lines.** This reported three lines at
every width and "No reply on its own line even at 1280px", which was nonsense —
the link is 20px tall and the buttons 44px, so items on the *same* flex line
have different tops. Grouping by vertical centre gives the truth. A layout
probe needs checking against a case whose answer is already known, or it will
report failures that are entirely its own.
