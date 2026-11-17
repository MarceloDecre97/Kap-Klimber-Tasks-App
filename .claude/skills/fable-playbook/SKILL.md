---
name: fable-playbook
description: How to work on Kap Klimber Tasks — planning, step order, self-verification before claiming done, and the specific mistakes this codebase has already produced. Read this at the start of every task in this repository, before planning or writing any code, whatever the task is.
---

# Fable playbook

For Kap Klimber Tasks: a production app, used daily by four people at Opus Kap.
Marcelo tests every change himself on an Android phone and a Windows desktop and
reports back in numbered rounds. He has no local dev environment. Everything you
ship he will find within a day.

Read this before planning. Then work the ladder below.

---

## 1. Before you start

**Read the live thing, never your memory of it.** This is the single most
expensive mistake available here, and it has been made more than once.

- Restating a database function? `pg_get_functiondef` first, from production.
- Changing a CHECK constraint? `pg_get_constraintdef` first. Retyping a `kind`
  list from memory dropped live values twice (0044, 0048) and would have failed
  validation against real rows.
- Editing a component? Read the file. Class strings, props and comments carry
  decisions you will otherwise undo.

**Find out what already exists before building a second one.** Mentions, the
floating dropdown panel, the chip picker, the avatar, the bin pattern, the
purge pattern — all of these existed before someone needed them again. A second
copy of the mention grammar is a second thing to keep in step with the trigger
that parses it.

**Read `docs/` for the area you are touching.** `docs/meetings.md` and
`docs/outreach.md` hold the reasoning behind decisions that look arbitrary from
the code alone. Re-deriving them costs more than reading them.

**Ask only questions whose answers change the work.** Two or three, batched, at
the point where different answers mean different code. Not "shall I proceed".
Marcelo answers batched questions well and resents being stopped for choices
with an obvious default.

**State your assumptions and keep building.** If something is ambiguous but one
reading is clearly likelier, say which you took and carry on.

---

## 2. Breaking it into steps

Order the work so each step is verifiable before the next depends on it.

1. **Schema first, in a migration file.** Numbered, `supabase/migrations/NNNN_name.sql`.
2. **Test the migration on a real local Postgres, from empty.** Always. See §5.
3. **Apply to production** via the Supabase connection, then verify with a query
   that asserts the shape (column exists, N overloads, policy count).
4. **Types** — `src/lib/supabase/database.types.ts` by hand. TypeScript will then
   find every call site you have to change, which is the point of it.
5. **Data layer** (`src/lib/data/*.ts`) → **actions** (`src/app/*/actions.ts`) →
   **components**. Follow the type errors; they are the task list.
6. **Verify** (§3).
7. **Commit, push, write the test list.**

A migration and the code that needs it ship together. If a migration drops a
column the deployed app still selects, say so loudly in the reply —
"**redeploy before anyone opens Meetings**" — because there is a window.

---

## 3. Before you say it is done

Never write "it works". Write what you ran and what it said.

**Always, every task:**

```bash
npm run build                         # FIRST: Next generates types tsc needs
npx tsc --noEmit                      # the whole type surface
npx eslint                            # React rules are enforced here, see §4
npx tsx scripts/check-select-strings.ts   # a comment in a PostgREST select = a prod 500
```

`npm run build` goes first in a fresh container. Next writes `.next/types`, and
without them `tsc` reports a `LayoutProps` error that is about the build never
having run, not about your change.

**For a migration:** the eight-or-so numbered checks in §5, every one under
`set role authenticated`.

**For a layout or visual claim:** measure it. Do not reason about it.
Playwright is at `/opt/pw-browsers/chromium`; build first, then point the probe
at the real built CSS (`find .next -name "*.css"`). Read the class strings out
of the component source — never retype them into the probe — and run the result
through the app's own `cn()` so `tailwind-merge` resolves conflicts the way the
browser will.

**When a probe disagrees with Marcelo's screenshot, the probe is wrong until
proven otherwise.** It has been, three times:
- grouping flex items by `top` instead of vertical centre → reported one line
  where there were three;
- concatenating a `base` string whose source is three literals joined with `+`,
  so `" + "` landed inside the HTML `class` attribute and terminated it;
- skipping `cn()`, so `shrink-0` and `shrink` were both live and stylesheet
  order decided.

**When your test expectation differs from the code's output, work out which is
wrong before changing either.** Several "failures" in the editor and
notification suites were correct behaviour and a wrong expectation. Say so
plainly when that is the answer.

**Then write the test list.** Numbered, concrete, each one something Marcelo can
do and see in under a minute, with the expected result stated. Continue the
numbering he used if he is mid-round. Say which test matters most and why.

---

## 4. The mistakes this codebase has already made

**A feature is two pieces of work: the thing that writes and the thing that
reads.** `meeting_comment` notifications were written correctly for two rounds
and silently dropped by the reader — no `task_id` meant no joined task, which
the feed read as "deleted" and discarded. It looked green at every layer
anybody checked. When a user says "I never got X", **query production first**:
if the row is there, the writer was never the suspect.

**Delete-everything-and-reinsert has caused two separate bugs.** It destroyed
the row that granted the caller permission (so the re-insert was refused,
mid-save), and it lost `added_by`. Diff instead: delete what is leaving, insert
what is arriving, leave the rest alone.

**RLS chooses rows; it cannot protect columns.** Every new column on a guarded
table needs a line in that table's `guard_*` trigger, or anyone can write it
with one API call. Adding the column and the UI without the guard line is the
easy version of this to ship.

**Tests that run as superuser prove nothing about RLS.** `set role authenticated`
and `set_config('test.uid', ...)` first, always. A policy bug passed locally and
failed in production exactly once; that is once too many.

**`set_config(..., true)` is transaction-local.** psql commits each statement, so
a test harness needs `false` or an explicit transaction.

**A stored object is a wire format between two versions of the app.** The
localStorage draft had no version, so after the shape changed, recovering an old
one called `.includes` on `undefined` and took the page down. Version it; ignore
anything older.

**`tailwind-merge` deletes classes it does not recognise.** Colours must be in
`COLORS` and type scales in `TEXT_SIZES` in `src/lib/utils.ts`. A missing entry
is not a visual glitch, it is a class silently removed.

**Unlayered CSS beats layered CSS.** `globals.css` rules outside `@layer` win
over any Tailwind utility, however specific. A `focus-visible:outline-none`
utility lost to the global focus ring and drew two borders.

**A flex item will not shrink below its content.** Any row with text beside a
control needs `min-w-0` on the text, or the row's only way to fit is to break
apart. Twice now.

**React rules that bite here:** no `setState` in an effect body (derive it, or
set it from an async callback); no reading a ref during render; no
self-referencing `useCallback`. When state belongs to one entity, key the
component by its id and let React remount rather than resetting field by field.

**Derived beats stored.** Outreach state from tasks, company from attendees,
"sent" from the status log. A flag means somebody remembered to press a button.

---

## 5. The local database harness

**Nothing in the container survives between sessions — `node_modules` and the
test database both go.** Run `npm install` before you trust a single type
error: a fresh container reports thousands of them, all of them "cannot find
module", none of them real.

Rebuild the database too. It is five minutes and it is the difference between
testing and hoping.

```bash
mkdir -p /tmp/kkpg/data && chown -R postgres:postgres /tmp/kkpg && chmod 700 /tmp/kkpg/data
su postgres -c "/usr/lib/postgresql/16/bin/initdb -D /tmp/kkpg/data -A trust"
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /tmp/kkpg/data -l /tmp/kkpg/pg.log -o '-k /tmp/kkpg -h \"\"' start"
```

Then a `shim.sql` (pgcrypto, an `auth` schema, `auth.uid()` reading
`test.uid`, the three Supabase roles), a `seed.sql` (three members, a couple of
contacts), and a `rebuild.sh` that drops the database, runs the shim, runs
**every** migration in order, then the seed. Test files must live under
`/tmp/kkpg/` — the scratchpad is not readable by the `postgres` user.

Write each test as a numbered block that prints what it checked and what it got,
and cover both sides of every permission rule: the person who may, and the
person who may not.

---

## 6. Working with Marcelo

- He gives numbered results. Answer in the same numbering.
- He is usually right about his own product. When he pushes back on a design
  call, take it — fitting is not the same as being better, and removing the
  button icons to win a line was a mistake he had to reverse.
- Explain mechanisms, not just outcomes. He reads them and uses them.
- When you broke something, say so plainly in one or two sentences, say what you
  changed, and move on. No throat-clearing.
- Never paste secrets into chat. Keys go into Vercel or Supabase directly.
- `docs/<area>.md` gets a short section each round: the decision and why, and
  the thing that nearly went wrong. That file is what makes a fresh session
  cheap.
