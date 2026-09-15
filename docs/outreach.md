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
