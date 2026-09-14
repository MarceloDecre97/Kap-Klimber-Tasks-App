# Dashboard — two panes on desktop

Agreed 2026-09-14. Desktop only; the phone is untouched.

## What is already true

The dashboard **already has the two-column grid** — `lg:grid-cols-[400px
minmax(0,1fr)]` at dashboard-app.tsx:255. What it does not have is two
scrollers: both columns sit inside one `flex-1 overflow-y-auto` at :254, so
the whole page moves as a unit and the personal panel scrolls away with the
Team overview.

Contacts already solved this in the same codebase (contacts-app.tsx:344):
the row takes `lg:overflow-hidden`, then each pane owns its own
`overflow-y-auto`. Same approach here.

The left column's head is **already a single block** (:257) holding the
greeting, the attention banner and the scope toggle, with the buckets
following as siblings from :331. So pinning the head needs no
restructuring — the buckets get wrapped, and that is the whole change.

## The rule

| | mobile (`< lg`) | desktop (`lg+`) |
|---|---|---|
| page | one scroller, as today | `overflow-hidden` |
| left: greeting, "N reminders need your attention", the toggle | scrolls | **pinned** |
| left: Overdue / Today / This week / Next week / Later / No date set | scrolls | **its own scroller** |
| right: Team overview | scrolls | **its own scroller** |

Two scrollbars on desktop, one on the phone. Two independent scrollers on a
phone is a trap — an outer one that catches the drag you meant for the
inner — and there is no second column there to need it.

All three of the head's parts stay pinned, per the answers: the banner
because an alert that scrolls away has stopped alerting, and the greeting
because it anchors the panel even at the cost of its height.

## How

1. **The page container** (:254) keeps `overflow-y-auto` below `lg` and
   takes `lg:overflow-hidden lg:min-h-0`. Its padding moves inward on `lg`,
   so each pane scrolls under its own padding rather than sharing one that
   sits outside both.
2. **The grid** (:255) gains `lg:h-full lg:min-h-0`. Without `min-h-0` a
   grid child refuses to shrink below its content and neither pane ever
   scrolls — it is the whole reason this sort of layout usually fails.
3. **The left column** (:256) gains `lg:h-full lg:min-h-0
   lg:overflow-hidden`. Its head block (:257) is left exactly as it is,
   which pins it by construction.
4. **The buckets** (:331–:488) are wrapped in one container taking
   `lg:flex-1 lg:min-h-0 lg:overflow-y-auto`, plus the padding that keeps a
   scrollbar off the cards.
5. **The right column** (:491) gains `lg:h-full lg:min-h-0
   lg:overflow-y-auto`.

No data, no props, no migration. One file.

## Verified before it is called done

- Screenshotted at 1280 and 1440 with the left pane scrolled to the bottom
  and the right pane at the top, and the reverse — proving they are
  genuinely independent rather than merely tall.
- The head measured as fixed: the toggle's viewport position identical
  before and after the left pane is scrolled.
- 390px unchanged: one scroller, everything moves together.
- A short left pane (few tasks) and a long one (many) both correct — a
  common failure is the pane collapsing when its content is shorter than
  the space.
- Both themes; `tsc`, `eslint`, `next build`.
