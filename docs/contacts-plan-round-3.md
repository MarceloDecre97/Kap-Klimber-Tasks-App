# Contacts Plan — Round 3

Agreed with Marcelo on 9 September 2026. **Approved to write down, not yet approved
to execute.** One further change is still to come before work starts.

Source: `Address_Book_Tests_Round_2_corrections.docx` — 56 tests, 36 clean, plus a
second table of four issues found outside the script. Sections H, I, J and K passed
entirely: the desktop panel, both flip directions, and the erase notification on all
three channels.

Branch `claude/mobile-task-app-supabase-xq4sq3`, at `d86ce2e` when this was written.

---

## Decisions already settled

| Question | Answer |
|---|---|
| Country names | Official CLDR/ISO English, no overrides — "Congo - Kinshasa", "Côte d'Ivoire" as Google and Apple show them. Aliases carry "DRC", "ivory coast", "USA", "UK". |
| Suite wording | **"Suite 11"**, not "Ste." Marcelo left it to me; "Ste." reads as "Sainte" to some people and this string also lands in the spreadsheet's Address column, where it has to be unambiguous. Three characters is not worth the doubt. |
| Filter narrowing | Fully symmetric. Each dropdown offers only values present given the *other* filter and the search box. |
| vCard | Company address as `TYPE=WORK`, their own as `TYPE=HOME`, both emitted when both exist. |
| Export dialog | My wording, same on phone and desktop. |
| Phone country codes | Only inferred from a literal `+`. |
| 11 digits starting with 1, no plus | Formatted as `+1 (517)-555-0123`. |
| Anything that does not fit a known shape | **Left exactly as typed.** Never guessed at, never mangled. |
| 10-digit mobile rule on old contacts | Accepted: editing an existing contact may require fixing their number first. |

---

## 1 · Phones

New `src/lib/phones.ts` — the single home for the rule, so it cannot drift the way
the "new label" schema did.

**Format**
- `1234567890` → `(123)-456-7890`
- `+52 1234567890` → `+52 (123)-456-7890`
- `15175550123` → `+1 (517)-555-0123`
- 7 digits → `456-7890`
- Anything else (9 digits, an extension, `+41 79 357 33`) → **unchanged**.

**Minimums**, digits only, punctuation ignored:

| Field | Minimum |
|---|---|
| Contact mobile | 10 |
| Contact office phone | 7 |
| Company main line | 7 |

Formatting is applied in the server actions on save, so every path stores one shape.
`mobile_digits` / `office_digits` are generated columns of digits only and are
unaffected, so the duplicate check and `tel:` links keep working.

**Migration 0028** rewrites the phones already in both books. It carries a
throwaway plpgsql `format_phone()` used only for that one backfill and dropped at
the end of the migration, so no second copy of the rule survives it. Its fixtures
must match the TypeScript ones exactly.

## 2 · Countries

- `src/lib/countries.ts` regenerated to the full ISO 3166-1 list (~250) from Node's
  own `Intl.DisplayNames` data rather than hand-typed, plus the alias table.
  Bangladesh and DR Congo were simply missing from my 35-entry starter list.
- `CountryField` becomes controlled on the raw text. A country typed but never
  picked is then *visible* and blocks the save — "Pick a country from the list, or
  clear the box" — instead of being silently dropped by `canonicalCountry()`, which
  is what actually caused test 8.
- The picker goes on the **contact's own address**, which I built and never wired up
  (`contact-form.tsx:314`). Both platforms.

## 3 · Duplicate companies

One `duplicateCompanyMatches()` in `companies-view.ts`, used by all three surfaces:
Add company, the contact form's company box, and **Edit company** — which had no
check at all, and is how a near-duplicate got in.

Rule: at least 3 characters typed, and either name is a prefix of the other, or the
normalised forms match. An **exact** match gets its own stronger message with
*Open that one*, rather than staying silent until save.

- "ADV Mobil" against "ADV Mobil LLC" → warns
- "ADV Mobil COR" against "ADV Mobil CORP" → warns
- "ADV Trailers" → warns at "ADV", stops at "ADV T"
- Test 24 still passes.

## 4 · Company delete

**Migration 0027.** `company_contact_count()` counts people in Recently deleted too,
so the Remove button stays hidden and `delete_company()` refuses with *"Someone at
this company is in Recently deleted. Erase them for good first."*

The count excluded soft-deleted contacts but the foreign key did not, which is how a
raw Postgres error reached the screen. A guard goes in so no database error can ever
be shown to a person again.

## 5 · Filters

Both dropdowns in the companies book derived from the companies currently in view,
cross-filtered. `countryOptions` already worked this way; `typeOptions` came from the
whole table.

## 6 · The panel

An **X** top-right beside *Open full page*, in both books, clearing the selection
back to the empty-panel message.

## 7 · Export

A confirm dialog, both books, both platforms.

- Nothing filtered: *"Export the whole address book? If you only want some of it,
  use the search or filters first."* → **Go back** / **Export .xlsx**
- Filtered: *"Export the 3 contacts you are looking at?"* → **Go back** / **Export .xlsx**

## 8 · The small ones

- `formatAddress()` gains "Suite" — "199 Markham road, Suite 11 · …"
- The vCard emits two addresses, Work and Home.
- The email error names what is actually wrong — missing `@`, missing dot, a space
  in it — instead of one message for every failure.

---

## Execution order

1. Phones (module, validation, actions, migration 0028)
2. Countries (full list, contact picker, typed-but-unpicked)
3. Duplicate companies (all three surfaces)
4. Company delete (migration 0027, no raw DB errors)
5. Filters
6. Panel X
7. Export dialog
8. Address, vCard, email message

Then: every schema change against local Postgres first; the form-draft test extended
with phone and country fixtures; typecheck, lint, build; commit and push; rewrite the
test document as **Round 3**, covering only what changed.

Marcelo will have **two migrations to run**, 0027 then 0028, in that order.

---

## 9 · Chips: what a company is, what a person is to us

The defect: `contact_categories` (Fleets, Partners, Suppliers, Industry,
Investors) described *organisations*, not people. Tagging Mike Morrison meant
classifying a human being with a vocabulary built for businesses — and the answer
was always guessable from his company, so the chip carried nothing.

The test that settles it: **can you guess the chip from the company?** The old list
failed. The new one passes — nothing about Royal Truck & Utility Trailer says
whether Mike is our client contact or our consultant.

**Two axes, neither derivable from the other.**

- **Company type** — what this business is in the industry. Multi-select, because
  Royal genuinely is a Trailer Dealer *and* a Parts Dealer *and* an Upfitter, and a
  single `type_id` makes the book lie about companies like it.
  Fleet · OEM Manufacturer · Trailer Dealer · Parts Dealer · Upfitter · Installer ·
  Service · Supplier · Institution · Other
- **Contact relationship** — what this person is to Opus Kap. Also multi-select, for
  one mechanic rather than two.
  Investor · Consultant · Lawyer · Partner · Client · Private installer · Other

Both still extend by typing, as now. "Client or KAM" became **Client**: KAM is a job
title, and job titles are already typed in full. **Installer** stays on the company
list so Corebridge does not need retagging — a company that installs and a person who
installs privately are both real.

**Where each chip appears** — one set per row, or the list turns to confetti:

| Surface | Shows |
|---|---|
| Contact row | the person's relationship chips, on line 4 beside the phone |
| Company row | the company's type chips, capped at 2 + "+n" |
| Contact page / panel | relationship at the top; the company's types under *Where they work* |

**The collapsed contact row** becomes three lines plus chips, which also fixes the
title wrapping that orphaned the company name:

```
Mike Morrison
Royal Truck & Utility Trailer
Vice President of Aftermarket Sales and Operations
Client                          (313)-304-0028
```

**Migration 0029.** Company types go many-to-many. Contact categories are replaced by
relationships, mapped: Partners → Partner, Investors → Investor. **Fleets** and
**Suppliers** describe companies, so they move onto the contact's company as a type
and the person's chip is left blank rather than inventing a relationship Marcelo never
chose. The contacts filter is renamed from "Category" to "Type" so both books use one
word.

Executed **last**, as its own commit: it is larger than 1–8 combined and rewrites the
same files as items 3 and 5. Fixing first and redesigning second means each half can
be tested for what it is.

---

## Migrations, in order

**0027** company delete vs the bin · **0028** phone backfill · **0029** chips
