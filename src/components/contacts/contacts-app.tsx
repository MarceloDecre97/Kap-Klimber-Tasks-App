"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, ChevronDown, ChevronUp, Plus, Search, Sheet, Tag, Trash2, X } from "lucide-react";
import Link from "next/link";
import { AppHeader } from "@/components/layout/app-header";
import { useToast } from "@/components/ui/toast";
import { DeleteContactDialog } from "@/components/contacts/delete-contact-dialog";
import { restoreContact } from "@/app/contacts/actions";
import { Avatar } from "@/components/ui/avatar";
import { ContactRow } from "@/components/contacts/contact-row";
import { FilterDropdown, type FilterOption } from "@/components/tasks/filter-dropdown";
import {
  CATEGORY_ICONS,
  DEFAULT_CATEGORY_ICON,
  DELETED_CONTACTS_VISIBLE_DAYS,
  EMPTY_CONTACT_FILTERS,
  avatarColor,
  companiesIn,
  countActiveContactFilters,
  fullName,
  groupContacts,
  initialsOf,
  matchesContact,
  type ContactFilters,
} from "@/lib/contacts-view";
import { cn, formatDateGroup } from "@/lib/utils";
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
  deletedContacts,
  categories,
  notifications,
}: {
  contacts: ContactSummary[];
  /** The bin, shared: it names who deleted each one, and anyone can act. */
  deletedContacts: ContactSummary[];
  categories: ContactCategory[];
  notifications: NotificationFeed;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [filters, setFilters] = useState<ContactFilters>(EMPTY_CONTACT_FILTERS);
  const [showBin, setShowBin] = useState(false);
  const [erasing, setErasing] = useState<ContactSummary | null>(null);
  const [, startTransition] = useTransition();

  function putBack(contact: ContactSummary) {
    startTransition(async () => {
      const result = await restoreContact(contact.id);
      if (!result.ok) {
        showToast({ message: result.error });
        return;
      }
      router.refresh();
      showToast({ message: `${fullName(contact)} put back` });
    });
  }

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

  /*
    The same three values the list is filtered by, handed to the export route
    so the spreadsheet is exactly what is on screen. Built here rather than
    read from the URL because these filters live in component state — the
    list has never put them in the address bar.
  */
  const exportQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.query.trim()) params.set("q", filters.query.trim());
    if (filters.company) params.set("company", filters.company);
    if (filters.categoryId) params.set("category", filters.categoryId);
    const query = params.toString();
    return query ? `?${query}` : "";
  }, [filters]);

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

          <div className="flex flex-wrap gap-3">
          <Link
            href="/contacts/new"
            className="inline-flex h-[60px] items-center justify-center gap-2.5 rounded-2xl bg-btn px-5 text-[20px] leading-7 font-bold text-on-btn transition-transform duration-150 active:scale-[0.97] hover:bg-btn-hover"
          >
            <Plus aria-hidden className="size-5" strokeWidth={2.5} />
            Add contact
          </Link>
          {/*
            A plain link, not a fetch-and-blob: the browser handles the
            download itself, which is what makes it work in an installed
            app on Android as well as in a tab. The current filters ride
            along in the query string so the file matches the screen.
          */}
          {!isEmptyBook && (
            <a
              href={`/contacts/export${exportQuery}`}
              className="inline-flex h-[60px] shrink-0 items-center justify-center gap-2 rounded-2xl border-[1.5px] border-fg bg-transparent px-4 text-[18px] leading-7 font-bold text-fg hover:bg-muted"
            >
              <Sheet aria-hidden className="size-5" strokeWidth={1.75} />
              Export
            </a>
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
          {deletedContacts.length > 0 && (
            <div className="flex flex-col gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowBin((open) => !open)}
                aria-expanded={showBin}
                className="flex min-h-14 w-full cursor-pointer items-center gap-2 rounded-2xl border-[1.5px] border-border bg-card px-4 py-3 text-left text-section-heading text-fg"
              >
                {showBin ? (
                  <ChevronUp aria-hidden className="size-[22px] shrink-0" />
                ) : (
                  <ChevronDown aria-hidden className="size-[22px] shrink-0" />
                )}
                Recently deleted ({deletedContacts.length})
              </button>

              {showBin && (
                <div className="flex flex-col gap-2.5">
                  {/*
                    Says what it does and, just as deliberately, what it does
                    not: nothing here disappears on its own. The fortnight is
                    how long a row stays listed, not a countdown to erasure —
                    a clock quietly taking a contact pill off a finished task
                    is an action nobody asked for.
                  */}
                  <p className="px-1 text-[16px] leading-6 text-sub text-pretty">
                    Deleted in the last {DELETED_CONTACTS_VISIBLE_DAYS} days. Nothing is erased
                    unless somebody erases it.
                  </p>
                  {deletedContacts.map((contact) => (
                    <div
                      key={contact.id}
                      className="flex min-h-14 items-center gap-3 rounded-2xl border-[1.5px] border-border bg-card p-3.5"
                    >
                      <Avatar
                        initials={initialsOf(contact)}
                        color={avatarColor(contact)}
                        size={44}
                        className="opacity-60"
                      />
                      <div className="flex min-w-0 grow flex-col">
                        <span className="text-[17px] leading-6 text-fg text-pretty wrap-anywhere">
                          {fullName(contact)}
                        </span>
                        <span className="text-timestamp text-sub">
                          Deleted {contact.deleted_at ? formatDateGroup(contact.deleted_at) : ""}
                          {contact.deleted_by ? ` by ${contact.deleted_by.display_name}` : ""}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => putBack(contact)}
                          className="inline-flex h-11 shrink-0 cursor-pointer items-center rounded-xl border-[1.5px] border-border bg-card px-3 text-[16px] leading-[22px] font-bold text-fg hover:bg-muted"
                        >
                          Put back
                        </button>
                        <span aria-hidden className="h-8 w-px shrink-0 bg-line" />
                        <button
                          type="button"
                          aria-label={`Erase ${fullName(contact)} for good`}
                          title="Erase for good"
                          onClick={() => setErasing(contact)}
                          className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-muted-fg transition-colors duration-150 hover:bg-danger-hover-bg hover:text-danger"
                        >
                          <Trash2 aria-hidden className="size-5" strokeWidth={1.75} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <DeleteContactDialog
        contact={erasing}
        mode="erase"
        blocking={[]}
        onClose={() => setErasing(null)}
        onDeleted={() => setErasing(null)}
        onErased={(contact) => {
          setErasing(null);
          router.refresh();
          showToast({ message: `${fullName(contact)} erased` });
        }}
        onError={(message) => showToast({ message })}
      />
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
