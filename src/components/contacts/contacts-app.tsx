"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  ChevronDown,
  ChevronUp,
  ContactRound,
  Globe,
  Plus,
  Search,
  Sheet,
  Shapes,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { AppHeader } from "@/components/layout/app-header";
import { useToast } from "@/components/ui/toast";
import { DeleteContactDialog } from "@/components/contacts/delete-contact-dialog";
import { contactActivity, restoreContact } from "@/app/contacts/actions";
import { ContactDetail } from "@/components/contacts/contact-detail";
import { Avatar } from "@/components/ui/avatar";
import { ContactRow } from "@/components/contacts/contact-row";
import { CompanyRow } from "@/components/companies/company-row";
import { CompanyDetail } from "@/components/companies/company-detail";
import {
  COMPANY_TYPE_ICONS,
  DEFAULT_COMPANY_TYPE_ICON,
  EMPTY_COMPANY_FILTERS,
  countActiveCompanyFilters,
  countriesIn,
  groupCompanies,
  matchesCompany,
  type CompanyFilters,
  type CompanySummary,
  type CompanyType,
} from "@/lib/companies-view";
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
import type { ContactCategory, ContactEvent, ContactSummary } from "@/lib/data/contacts";
import type { NotificationFeed } from "@/lib/data/notifications";

/** Which of the two books is open. */
export type Book = "contacts" | "companies";

/**
 * The book — both of them.
 *
 * People and companies are two views of one address book, not two places, so
 * they share one screen and one set of mechanics: search at the top, two
 * filters beside it, an A–Z list on the left, and on a wide screen whatever
 * you picked in the panel on the right. The button that used to navigate to
 * a companies page is now the switch between them, and it changes into its
 * opposite once pressed.
 *
 * Search first, because with a few hundred rows that is how anybody actually
 * finds something; the filters are for browsing rather than looking. All of
 * it runs in the browser over the whole book — this is a four-person
 * company's address list, not a dataset, and a round trip per keystroke
 * would be slower and worse.
 */
export function ContactsApp({
  contacts,
  deletedContacts,
  categories,
  companies,
  companyTypes,
  notifications,
  initialBook = "contacts",
}: {
  contacts: ContactSummary[];
  /** The bin, shared: it names who deleted each one, and anyone can act. */
  deletedContacts: ContactSummary[];
  categories: ContactCategory[];
  companies: CompanySummary[];
  companyTypes: CompanyType[];
  notifications: NotificationFeed;
  /** Which book to open, read from ?book= on the server. */
  initialBook?: Book;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [filters, setFilters] = useState<ContactFilters>(EMPTY_CONTACT_FILTERS);
  const [showBin, setShowBin] = useState(false);
  const [erasing, setErasing] = useState<ContactSummary | null>(null);
  const [, startTransition] = useTransition();

  /*
    The desktop panel.

    On a laptop a row opens the contact beside the list instead of replacing
    it — the list keeps its place, its scroll and its search, which is the
    whole point of the wider screen. Below `lg` none of this exists and a row
    is the link it has always been.

    Nothing is selected to begin with, deliberately. Auto-opening the first
    contact tells you something about somebody you did not ask about, and
    makes the panel look like it belongs to the top of the list rather than
    to whoever you pick.
  */
  const [wide, setWide] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelEvents, setPanelEvents] = useState<ContactEvent[]>([]);
  /* Which contact the in-flight activity request belongs to. */
  const pendingActivity = useRef<string | null>(null);

  /*
    Which book is open, and what is picked in each.

    Two selections rather than one, so switching to Companies and back leaves
    the person you were reading still open. Losing your place is exactly what
    the panel exists to prevent, and a switch that forgot would be a worse
    version of the page it replaced.
  */
  const [book, setBook] = useState<Book>(initialBook);
  const [companyFilters, setCompanyFilters] = useState<CompanyFilters>(EMPTY_COMPANY_FILTERS);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  /*
    The address bar follows the switch, so a refresh comes back to the book
    you were in and the link is worth sending. Written directly rather than
    through the router: this is a toggle, not a navigation — it should not
    cost a server round trip, and it should not pile up history entries that
    make the back button walk through every press.
  */
  useEffect(() => {
    const url = new URL(window.location.href);
    if (book === "companies") url.searchParams.set("book", "companies");
    else url.searchParams.delete("book");
    window.history.replaceState(null, "", url);
  }, [book]);

  /** Switch books and land on something specific in the other one. */
  function openCompany(companyId: string) {
    setBook("companies");
    setSelectedCompanyId(companyId);
  }

  useEffect(() => {
    /*
      Matched to the `lg` breakpoint the layout below uses, so the two can
      never disagree about whether there is a panel. It starts false and
      corrects itself after mount: the first render is the phone's, which is
      the one that must be right before hydration.
    */
    const query = window.matchMedia("(min-width: 1024px)");
    const sync = () => setWide(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  function select(contact: ContactSummary) {
    setSelectedId(contact.id);
    setPanelEvents([]);
    pendingActivity.current = contact.id;
    startTransition(async () => {
      const result = await contactActivity(contact.id);
      // Clicking down the list faster than the fetches return would
      // otherwise land one person's history under another person's name.
      if (pendingActivity.current !== contact.id) return;
      if (result.ok) setPanelEvents(result.events);
    });
  }

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

  const companyNames = useMemo(() => companiesIn(contacts), [contacts]);
  const matching = useMemo(
    () => contacts.filter((c) => matchesContact(c, filters)),
    [contacts, filters]
  );
  const groups = useMemo(() => groupContacts(matching), [matching]);
  const activeFilters = countActiveContactFilters(filters);

  const companyOptions: FilterOption<string>[] = useMemo(
    () => companyNames.map((name) => ({ value: name, label: name })),
    [companyNames]
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
    Looked up in the list rather than stored, so a contact that has just been
    deleted, restored or edited empties or updates the panel on its own
    rather than leaving a stale copy of themselves in it.
  */
  const selected = useMemo(
    () => (selectedId ? contacts.find((c) => c.id === selectedId) ?? null : null),
    [contacts, selectedId]
  );

  /* ---- the companies book ---- */

  const matchingCompanies = useMemo(
    () => companies.filter((c) => matchesCompany(c, companyFilters)),
    [companies, companyFilters]
  );
  const companyGroups = useMemo(() => groupCompanies(matchingCompanies), [matchingCompanies]);
  const activeCompanyFilters = countActiveCompanyFilters(companyFilters);

  const countryOptions: FilterOption<string>[] = useMemo(
    () => countriesIn(companies).map((name) => ({ value: name, label: name })),
    [companies]
  );

  const typeOptions: FilterOption<string>[] = useMemo(
    () =>
      companyTypes.map((type) => {
        const Icon = COMPANY_TYPE_ICONS[type.icon] ?? DEFAULT_COMPANY_TYPE_ICON;
        return { value: type.id, label: type.label, icon: <Icon aria-hidden className="size-4" /> };
      }),
    [companyTypes]
  );

  const selectedCompany = useMemo(
    () => (selectedCompanyId ? companies.find((c) => c.id === selectedCompanyId) ?? null : null),
    [companies, selectedCompanyId]
  );

  /*
    Who works at the company in the panel, worked out from the book already
    in memory rather than fetched. The contacts are all here; asking the
    server again for a subset of them would be a round trip to learn
    something this page already knows.
  */
  const peopleAtSelectedCompany = useMemo(
    () => (selectedCompany ? contacts.filter((c) => c.company_id === selectedCompany.id) : []),
    [contacts, selectedCompany]
  );

  const showingCompanies = book === "companies";
  const isEmptyCompanyBook = companies.length === 0;

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

  const companyExportQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (companyFilters.query.trim()) params.set("q", companyFilters.query.trim());
    if (companyFilters.country) params.set("country", companyFilters.country);
    if (companyFilters.typeId) params.set("type", companyFilters.typeId);
    const query = params.toString();
    return query ? `?${query}` : "";
  }, [companyFilters]);

  return (
    <div className="flex h-full flex-col bg-bg">
      <AppHeader current="/contacts" notifications={notifications} />

      {/*
        One column on a phone, two from `lg`. The row below is the only thing
        that changes: it stops being the page's scroller and becomes a pair
        of panes that scroll independently, so reading somebody's details
        never moves the list you were working down.
      */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:overflow-hidden">
      <div className="flex-1 overflow-y-auto px-5 py-6">
        <div className="mx-auto flex w-full max-w-[900px] flex-col gap-4 lg:max-w-[620px]">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h1 className="text-screen-title text-fg">
              {showingCompanies ? "Companies" : "Contacts"}
            </h1>
            {showingCompanies
              ? !isEmptyCompanyBook && (
                  <span className="text-[16px] leading-[22px] font-bold tabular-nums text-sub">
                    {matchingCompanies.length === companies.length
                      ? `${companies.length} ${companies.length === 1 ? "company" : "companies"}`
                      : `${matchingCompanies.length} of ${companies.length}`}
                  </span>
                )
              : !isEmptyBook && (
                  <span className="text-[16px] leading-[22px] font-bold tabular-nums text-sub">
                    {matching.length === contacts.length
                      ? `${contacts.length} ${contacts.length === 1 ? "contact" : "contacts"}`
                      : `${matching.length} of ${contacts.length}`}
                  </span>
                )}
          </div>

          <div className="flex flex-wrap gap-3">
            {/*
              Both doors into the same room. A company is still created by
              typing it on a contact — that was never the step worth
              removing — but one you have just heard of, with nobody named at
              it yet, needs somewhere to go too.
            */}
            <Link
              href={showingCompanies ? "/companies/new" : "/contacts/new"}
              className="inline-flex h-[60px] items-center justify-center gap-2.5 rounded-2xl bg-btn px-5 text-[20px] leading-7 font-bold text-on-btn transition-transform duration-150 active:scale-[0.97] hover:bg-btn-hover"
            >
              <Plus aria-hidden className="size-5" strokeWidth={2.5} />
              {showingCompanies ? "Add company" : "Add contact"}
            </Link>

            {/*
              The switch, which is what this button always should have been.
              Companies were never a different place — they are the same book
              read the other way round — so pressing this changes what the
              list is, not what page you are on. The button then reads as its
              own opposite, which is how you know it will take you back.
            */}
            <button
              type="button"
              onClick={() => setBook(showingCompanies ? "contacts" : "companies")}
              aria-pressed={showingCompanies}
              className="inline-flex h-[60px] shrink-0 cursor-pointer items-center justify-center gap-2 rounded-2xl border-[1.5px] border-fg bg-transparent px-4 text-[18px] leading-7 font-bold text-fg hover:bg-muted"
            >
              {showingCompanies ? (
                <ContactRound aria-hidden className="size-5" strokeWidth={1.75} />
              ) : (
                <Building2 aria-hidden className="size-5" strokeWidth={1.75} />
              )}
              {showingCompanies ? "Contacts" : "Companies"}
            </button>

            {/*
              A plain link, not a fetch-and-blob: the browser handles the
              download itself, which is what makes it work in an installed
              app on Android as well as in a tab. The current filters ride
              along in the query string so the file matches the screen — and
              it exports whichever book you are looking at, because a button
              that quietly exported the other one would be worse than none.
            */}
            {(showingCompanies ? !isEmptyCompanyBook : !isEmptyBook) && (
              <a
                href={
                  showingCompanies
                    ? `/companies/export${companyExportQuery}`
                    : `/contacts/export${exportQuery}`
                }
                className="inline-flex h-[60px] shrink-0 items-center justify-center gap-2 rounded-2xl border-[1.5px] border-fg bg-transparent px-4 text-[18px] leading-7 font-bold text-fg hover:bg-muted"
              >
                <Sheet aria-hidden className="size-5" strokeWidth={1.75} />
                Export
              </a>
            )}
          </div>

          {showingCompanies ? (
            isEmptyCompanyBook ? (
              <EmptyCompanyBook />
            ) : (
              <>
                <div className="flex flex-col gap-3 lg:flex-row">
                  <label className="relative flex min-w-0 flex-1 items-center">
                    <Search
                      aria-hidden
                      className="pointer-events-none absolute left-4 size-[22px] text-sub"
                      strokeWidth={1.75}
                    />
                    <span className="sr-only">Search companies</span>
                    <input
                      type="search"
                      value={companyFilters.query}
                      onChange={(event) =>
                        setCompanyFilters((f) => ({ ...f, query: event.target.value }))
                      }
                      placeholder="Name, city, what they do"
                      className={cn(
                        "h-[60px] w-full rounded-2xl border-[1.5px] border-border bg-card pl-[50px] pr-4",
                        "text-[18px] leading-7 text-fg placeholder:text-sub"
                      )}
                    />
                  </label>

                  <div className="flex shrink-0 flex-wrap items-center gap-3">
                    {/*
                      Country and type, the two things you browse a company
                      book by — where they are and what they do. The country
                      list can only ever hold real countries, spelled one
                      way, because the field that fills it is a picker.
                    */}
                    <FilterDropdown
                      label="Country"
                      icon={<Globe aria-hidden className="size-4" />}
                      options={countryOptions}
                      selected={companyFilters.country ? [companyFilters.country] : []}
                      onChange={(next) =>
                        setCompanyFilters((f) => ({ ...f, country: next[next.length - 1] ?? null }))
                      }
                    />
                    <FilterDropdown
                      label="Type"
                      icon={<Shapes aria-hidden className="size-4" />}
                      options={typeOptions}
                      selected={companyFilters.typeId ? [companyFilters.typeId] : []}
                      onChange={(next) =>
                        setCompanyFilters((f) => ({ ...f, typeId: next[next.length - 1] ?? null }))
                      }
                    />
                    {activeCompanyFilters > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setCompanyFilters((f) => ({ ...f, country: null, typeId: null }))
                        }
                        className="inline-flex h-12 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[16px] leading-[22px] font-bold text-sub hover:text-fg"
                      >
                        <X aria-hidden className="size-4" />
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {companyGroups.length === 0 ? (
                  <p className="rounded-2xl border-[1.5px] border-border bg-card px-4 py-6 text-[18px] leading-7 text-sub text-pretty">
                    No company matches that. Try part of the name, or the city they are in.
                  </p>
                ) : (
                  companyGroups.map((group) => (
                    <div key={group.letter} className="flex flex-col gap-2.5">
                      <div className="flex items-center gap-3">
                        <span className="text-field-label text-sub">{group.letter}</span>
                        <span aria-hidden className="h-[1.5px] flex-1 bg-border" />
                      </div>
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-1">
                        {group.companies.map((company) => (
                          <CompanyRow
                            key={company.id}
                            company={company}
                            onSelect={wide ? () => setSelectedCompanyId(company.id) : undefined}
                            selected={wide && company.id === selectedCompanyId}
                          />
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </>
            )
          ) : isEmptyBook ? (
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
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-1">
                      {group.people.map((contact) => (
                        <ContactRow
                          key={contact.id}
                          contact={contact}
                          onSelect={wide ? () => select(contact) : undefined}
                          selected={wide && contact.id === selectedId}
                        />
                      ))}
                    </div>
                  </div>
                ))
              )}
            </>
          )}

          {!showingCompanies && deletedContacts.length > 0 && (
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

      {/*
        The panel. Empty until somebody is picked, and quiet about it — this
        is a place for a contact to appear, not a thing to read.
      */}
      <aside className="hidden shrink-0 flex-col border-l-[1.5px] border-border bg-card lg:flex lg:w-[440px] xl:w-[520px]">
        {showingCompanies ? (
          selectedCompany ? (
            <CompanyDetail
              key={selectedCompany.id}
              company={selectedCompany}
              people={peopleAtSelectedCompany}
              types={companyTypes}
              embedded
              onGone={() => setSelectedCompanyId(null)}
              /* Opening somebody flips back to the contacts book rather
                 than leaving the screen. Two books, one place. */
              onOpenContact={(contact) => {
                setBook("contacts");
                select(contact);
              }}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center px-8">
              <p className="max-w-[280px] text-center text-[17px] leading-6 text-sub text-pretty">
                Pick a company from the list and it will show up here.
              </p>
            </div>
          )
        ) : selected ? (
          /*
            Keyed on the contact so switching people starts the panel at the
            top rather than halfway down the last person's notes.
          */
          <ContactDetail
            key={selected.id}
            contact={selected}
            events={panelEvents}
            embedded
            onGone={() => setSelectedId(null)}
            onOpenCompany={openCompany}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center px-8">
            <p className="max-w-[280px] text-center text-[17px] leading-6 text-sub text-pretty">
              Pick somebody from the list and they will show up here.
            </p>
          </div>
        )}
      </aside>
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
 * Says what the companies book is for, and how one gets into it — which is
 * the part nobody guesses, because a company usually arrives sideways.
 */
function EmptyCompanyBook() {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-border bg-card px-5 py-8">
      <span className="text-section-heading text-fg text-pretty">No companies yet.</span>
      <p className="text-[18px] leading-7 text-sub text-pretty">
        Type where somebody works when you add them and the company appears here on its own — or
        add one directly, if you have heard of them before you have met anybody there. Fix an
        address here and it is fixed for everyone who works there.
      </p>
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
