"use client";

import { useMemo, useState } from "react";
import { Building2, Search, Tag, X } from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { ContactRow } from "@/components/contacts/contact-row";
import { FilterDropdown, type FilterOption } from "@/components/tasks/filter-dropdown";
import {
  CATEGORY_ICONS,
  DEFAULT_CATEGORY_ICON,
  EMPTY_CONTACT_FILTERS,
  companiesIn,
  countActiveContactFilters,
  groupContacts,
  matchesContact,
  type ContactFilters,
} from "@/lib/contacts-view";
import { cn } from "@/lib/utils";
import type { ContactCategory, ContactSummary } from "@/lib/data/contacts";
import type { NotificationFeed } from "@/lib/data/notifications";

/**
 * The book.
 *
 * Search first, because with a few hundred rows that is how anybody actually
 * finds somebody; the two filters are for browsing rather than looking. All
 * three run in the browser over the whole book — this is a four-person
 * company's address list, not a dataset, and a round trip per keystroke
 * would be slower and worse.
 */
export function ContactsApp({
  contacts,
  categories,
  notifications,
}: {
  contacts: ContactSummary[];
  categories: ContactCategory[];
  notifications: NotificationFeed;
}) {
  const [filters, setFilters] = useState<ContactFilters>(EMPTY_CONTACT_FILTERS);

  const companies = useMemo(() => companiesIn(contacts), [contacts]);
  const matching = useMemo(
    () => contacts.filter((c) => matchesContact(c, filters)),
    [contacts, filters]
  );
  const groups = useMemo(() => groupContacts(matching), [matching]);
  const activeFilters = countActiveContactFilters(filters);

  const companyOptions: FilterOption<string>[] = useMemo(
    () => companies.map((name) => ({ value: name, label: name })),
    [companies]
  );

  const categoryOptions: FilterOption<string>[] = useMemo(
    () =>
      categories.map((cat) => {
        const Icon = CATEGORY_ICONS[cat.icon] ?? DEFAULT_CATEGORY_ICON;
        return { value: cat.id, label: cat.label, icon: <Icon aria-hidden className="size-4" /> };
      }),
    [categories]
  );

  const isEmptyBook = contacts.length === 0;

  return (
    <div className="flex h-full flex-col bg-bg">
      <AppHeader current="/contacts" notifications={notifications} />

      <div className="flex-1 overflow-y-auto px-5 py-6">
        <div className="mx-auto flex w-full max-w-[900px] flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h1 className="text-screen-title text-fg">Contacts</h1>
            {!isEmptyBook && (
              <span className="text-[16px] leading-[22px] font-bold tabular-nums text-sub">
                {matching.length === contacts.length
                  ? `${contacts.length} ${contacts.length === 1 ? "contact" : "contacts"}`
                  : `${matching.length} of ${contacts.length}`}
              </span>
            )}
          </div>

          {isEmptyBook ? (
            <EmptyBook />
          ) : (
            <>
              <div className="flex flex-col gap-3 lg:flex-row">
                <label className="relative flex min-w-0 flex-1 items-center">
                  <Search
                    aria-hidden
                    className="pointer-events-none absolute left-4 size-[22px] text-sub"
                    strokeWidth={1.75}
                  />
                  <span className="sr-only">Search contacts</span>
                  <input
                    type="search"
                    value={filters.query}
                    onChange={(event) => setFilters((f) => ({ ...f, query: event.target.value }))}
                    placeholder="Name, company, email, phone"
                    className={cn(
                      "h-[60px] w-full rounded-2xl border-[1.5px] border-border bg-card pl-[50px] pr-4",
                      "text-[18px] leading-7 text-fg placeholder:text-sub"
                    )}
                  />
                </label>

                <div className="flex shrink-0 flex-wrap items-center gap-3">
                  <FilterDropdown
                    label="Company"
                    icon={<Building2 aria-hidden className="size-4" />}
                    options={companyOptions}
                    /*
                      The dropdown is multi-select by design; these two are
                      single. Passing an array of one and taking the last
                      chosen keeps one shared control rather than a second
                      near-identical one that then drifts from it.
                    */
                    selected={filters.company ? [filters.company] : []}
                    onChange={(next) =>
                      setFilters((f) => ({ ...f, company: next[next.length - 1] ?? null }))
                    }
                  />
                  <FilterDropdown
                    label="Category"
                    icon={<Tag aria-hidden className="size-4" />}
                    options={categoryOptions}
                    selected={filters.categoryId ? [filters.categoryId] : []}
                    onChange={(next) =>
                      setFilters((f) => ({ ...f, categoryId: next[next.length - 1] ?? null }))
                    }
                  />
                  {activeFilters > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilters((f) => ({ ...f, company: null, categoryId: null }))}
                      className="inline-flex h-12 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[16px] leading-[22px] font-bold text-sub hover:text-fg"
                    >
                      <X aria-hidden className="size-4" />
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {groups.length === 0 ? (
                <p className="rounded-2xl border-[1.5px] border-border bg-card px-4 py-6 text-[18px] leading-7 text-sub text-pretty">
                  Nobody here matches that. Try part of a name, a company, or the last four
                  digits of a number.
                </p>
              ) : (
                groups.map((group) => (
                  <div key={group.letter} className="flex flex-col gap-2.5">
                    <div className="flex items-center gap-3">
                      <span className="text-field-label text-sub">{group.letter}</span>
                      <span aria-hidden className="h-[1.5px] flex-1 bg-border" />
                    </div>
                    {/*
                      Two columns from `sm` up. The row is built to survive
                      390px, so on a laptop one column of them across a
                      900px page is mostly whitespace.
                    */}
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      {group.people.map((contact) => (
                        <ContactRow key={contact.id} contact={contact} />
                      ))}
                    </div>
                  </div>
                ))
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Says what the book is for and why it matters on a task, rather than
 * announcing that a list is empty — which the empty list already does.
 */
function EmptyBook() {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-border bg-card px-5 py-8">
      <span className="text-section-heading text-fg text-pretty">The book is empty.</span>
      <p className="text-[18px] leading-7 text-sub text-pretty">
        Add the people you deal with most — fleet contacts, partners, suppliers. Once someone
        is in here you can attach them to a task, so whoever picks it up already has the number.
      </p>
    </div>
  );
}
