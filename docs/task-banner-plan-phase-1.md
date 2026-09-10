# Task Banner — Plan, Phase 1

Agreed 2026-09-10. Nine changes to the expanded task banner, plus one bug
fix. Phase 2 (per-person reminders) is a separate plan and is deliberately
not started here.

Answers already given: links editable on **create and edit**; link name
capped to one line, URL allowed 2,048; links are **expanded-only**, no chip
on the collapsed pill.

Open, with a default: **Mark complete** uses the dark green `#00531E` with
white text rather than the pale chip green. Say otherwise and it flips.

---

## 0. The bug: the description overflows

`task-pill.tsx:444` renders the description with `text-pretty` and no
`break-words`. The note bodies twelve lines further down (`:752`) have it.
So the paragraph is not the problem — a pasted Google Drive URL is. A URL
has no spaces, the browser has nowhere to wrap, and it runs off the card.

A character limit would not have fixed this: 200 characters of unbroken URL
overflow exactly the same.

**Fix:** add `break-words` to the description paragraph, matching the notes.

---

## 1. Task information

Keep the header, the chip row (priority, status, age, note count, reminder),
Assigned to and Category.

**Drop** the `Due date` and `Reminder` rows from the definition list below
Category. Both are already shown above — the due date in the "Due For …"
header line, the reminder as its own chip — and the second copy is what
makes the block feel long.

One consequence, accepted: a *dismissed* reminder currently shows struck
through in that list. After this it reads as dismissed only on the chip.

## 2. Task description

No new character limit. `validation.ts:40` already caps it at 4,000, and
lowering that now would either reject descriptions that exist or cut them
silently.

Instead: clamp the display to six lines with **Show more / Show less**, the
same control Task Activity gets in §6.

The button appears based on the *rendered height* of the paragraph, not a
character count — so it shows up only when there is genuinely more to read,
at whatever width the phone is.

## 3. External Links — new

A task carries up to **three** links. Each is a name and a URL; only the
name is shown, underlined and in link blue, and it opens in a new tab.

**Storage** — `0032_task_links.sql`:

- `task_links`: `id`, `task_id` (cascade delete), `label`, `url`,
  `position`, `created_at`, `created_by`.
- `label` capped at the measured one-line length (~30 characters — measured
  at 390px before it is fixed, not guessed).
- `url` capped at 2,048 and constrained to `^https?://` **in the database**,
  not only in the form.
- Three per task, enforced by the same trigger pattern that already caps
  contacts at two — the form says so in words, the database guarantees it.
- RLS mirroring `task_notes`: any team member may read and write.

**Safety.** A link is somebody's pasted text that becomes clickable, so the
scheme is checked on the way in (`javascript:` and `data:` refused, not
escaped) and every link renders with `rel="noopener noreferrer"` and
`target="_blank"`.

**Form.** An "Add link" button on the task form reveals a name box and a URL
box, up to three times, on both create and edit.

**Display.** The section is hidden entirely when a task has no links. Long
names truncate with an ellipsis as a second line of defence behind the cap.

**Decided against:** logging link changes into Task Activity. §6 exists to
make that section quieter; new event types would work against it.

## 4. "Change Task's Status To:"

- Retitle from "Move status on".
- The three pills (always three: five statuses less the current one, less
  Complete) sit on **one line** via an equal-width three-column grid rather
  than a wrapping flex row.
- Each pill takes its own colour from `STATUSES` in `constants.ts` —
  background, text and border — instead of today's uniform outline. This
  needs a coloured variant on `Chip`, which currently has one look.

Measured at 390px before it is called done. The worst case is "Not started ·
For review · Waiting". If it will not fit, the type shrinks before any word
is shortened, and if that is not enough I come back rather than quietly
dropping to icons.

## 5. Team Chat — notes only

Notes move out of the merged Activity list into their own section, in
chronological order, with the compose box and Add note button at the end
where they are today.

**No "show more".** 33 notes across 21 tasks is under two per task; a fold
on a two-note thread is a control that only ever gets in the way. Revisit if
a thread ever gets long.

**This reverses a deliberate decision**, recorded here so it stays a
decision. `task-timeline.ts` merged notes and status changes because
"blocked on the supplier" reads as news when it was really a consequence of
the move to Waiting an hour earlier. The mitigation is in the layout: Task
Activity sits directly beneath Team Chat and always shows the latest change,
so the most recent status move stays visible next to the conversation. The
file comment gets rewritten to say this rather than left describing a design
that no longer exists.

## 6. Task Activity — events only

Status changes, due-date moves, reminder changes, the deletion story.

Collapsed to the **single latest** entry under a "Latest" label, with
**Read more…** beneath. Clicking it shows the full history and turns the
control into **Show less**, which returns it to one.

## 7. The buttons

Mark complete / Edit task / Delete task all stay. Mark complete moves from
brand red to the Complete status green.

Using the pale chip background (`#88FFB1`) on a full-width button leaves the
primary action lighter than the red-outlined Delete beneath it, which reads
as disabled. So: `#00531E` fill, white text — the same family, the same
weight as the red it replaces.

The amber reminder line below the card is untouched, expanded and collapsed
alike.

---

## Verification, before it is called done

- `0032` applied to the local Postgres from a clean database and in sequence
  behind 0001–0031, including the three-link cap and the URL constraint
  being refused as expected.
- The 390px viewport screenshotted for: the status row on one line, a long
  link name, a long description with and without the fold, and a task with
  no links and no description.
- `tsc`, `eslint`, `next build`.
- Both themes checked — every new colour name added to `COLORS` in
  `src/lib/utils.ts`, or `tailwind-merge` deletes the class.

A numbered test list follows execution, as with previous rounds.
