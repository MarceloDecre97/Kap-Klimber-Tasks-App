# Where they came from, and the show they came from

## The problem

"Where they came from" (`contacts.source`) is free text. Asked whether it
could become a filter, the live data answered the question:

| Value | Contacts |
|---|---|
| `MATS 2026` | 1 |
| `Instagram message` | 1 |
| `Website Email` | 1 |
| `Site visit from Dee Kapur` | 1 |

One of the four is a trade show. Two are channels. One is a sentence about a
single person that will never repeat. A dropdown built from distinct values
would list all four as equals, and after an import of several hundred rows it
would be mostly one-of-a-kind sentences — useless for the thing it was asked
for.

## The shape

Marcelo's call, and the right one: leave the free-text box exactly as it is
and add a separate, optional trade show beside it. Two columns rather than
one — `trade_show` and `trade_show_year`.

The split is what makes it work. A single "MATS 2026" string makes MATS 2025
and MATS 2026 unrelated text, and "everyone we have ever met at MATS" cannot
be asked. Apart, the show is the show and the year hangs off it.

A year with no show is refused by the database, the schema and the form. A
show with no year is fine — you met them at MATS and cannot remember which.

## Keeping the spelling straight

The filter is only as good as the spelling, and four people fill this book
in. Three things hold it together, none of them a locked list:

1. The form suggests shows already written down.
2. The server snaps a typed name onto an existing spelling when the two
   differ only in case or spacing, so "mats" is stored as "MATS".
3. The import template's Trade show column carries a dropdown seeded with
   the shows already in the book.

A show nobody has been to yet passes straight through all three. There is no
list of trade shows to be on, and the first person to go to one has to be
able to write it down. This is the deliberate difference from the country
field, which refuses anything off its list.

## Decisions worth recording

**Filter entries are the whole label — "MATS 2026", not "MATS".** Asked for,
and the narrower of the two. Filtering by a show across every year is the
obvious next want; `tradeShowsIn` already groups by label, so widening it
later is a change to one function.

**Sorted newest year first, not alphabetically.** The show you have just come
back from is the one you filter by. Shows with no year sort last.

**The dropdown is hidden until somebody has been to a show.** An empty
dropdown beside two full ones reads as broken rather than as
nothing-to-show-yet.

**The free text and the show are both searchable now.** Neither was. Typing
"MATS" into the contacts search found nobody — and, because the contact
picker in the task form runs through the same `matchesContact`, building a
follow-up task for everyone met at a show found nobody either. That was the
second half of what this was asked for.

**The activity log treats the two columns as one line.** Somebody who sets a
show and its year at once did one thing; a log reporting it as two has
stopped describing what happened. `trade_show_label()` in SQL and
`tradeShowLabel()` in TypeScript exist so the log and the screen cannot spell
a show differently.

**The backfill runs with the log trigger disabled.** Moving Mandy's
"MATS 2026" out of the free-text box would otherwise write "changed Where
they came from" into her history as an edit by nobody — `current_member_id()`
is null in a migration. Same spurious-activity problem 0036 cleaned up, and
easier not to create than to delete.

## What this does not solve

Somebody can still type "MATS 2026" into the free-text box out of habit, and
the filter will not see them. The hint on that field no longer mentions trade
shows, and the search covers both boxes, but the two can drift. If it turns
out to happen in practice the fix is to retire the free-text box — not a
decision to make in advance.

## Order of operations

The app's contact query selects the two new columns, so **0039 has to be run
before the code that reads it is deployed.** Run the migration, then deploy.
