"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronLeft, Flame, Plus, RotateCcw, Search, Trash2, Users } from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { MeetingCalendar } from "@/components/meetings/meeting-calendar";
import { MeetingPane } from "@/components/meetings/meeting-pane";
import { MeetingDetails, type DetailValues } from "@/components/meetings/meeting-details";
import { FilterDropdown } from "@/components/tasks/filter-dropdown";
import {
  binnedMeetings,
  createMeeting,
  eraseMeeting,
  findMeetings,
  loadMeeting,
  meetingTasks,
  setMeetingDeleted,
} from "@/app/meetings/actions";
import {
  INTERNAL_SCOPE,
  NO_MEETING_FILTERS,
  activeFilterCount,
  canEditBody,
  canEditDetails,
  companiesIn,
  groupMeetings,
  matchesFilters,
  isInternal,
  matchesMeeting,
  formatMeetingDay,
  meetingWhen,
  type Meeting,
  type MeetingFilters,
  type MeetingSummary,
} from "@/lib/meetings-view";
import { cn } from "@/lib/utils";
import type { ContactSummary } from "@/lib/data/contacts";
import type { CompanySummary } from "@/lib/companies-view";
import type { MemberSummary } from "@/lib/data/tasks";
import type { MeetingTask } from "@/lib/data/meetings";
import type { NotificationFeed } from "@/lib/data/notifications";

/**
 * Meetings.
 *
 * The layout is the opposite way round from Contacts, on purpose. There the
 * list gets the wide side and the detail a 440px pane, because you READ a
 * contact. You WRITE a meeting, so here the list is a narrow column for
 * switching between them and the paper takes everything else — Teams on one
 * half of the screen, this on the other, and nothing else open.
 *
 * On a phone it is one screen at a time: the list, or the meeting. Writing
 * has to work on a phone too — a laptop dies, a call is on speaker — so the
 * paper gets the full width and nothing floats over it.
 */
/** Matches the Tasklist and the address book. Nothing is erased at the end of it. */
const BIN_DAYS = 14;

/** The "no filter" row. Its own value rather than "", which reads as unset. */
const ALL_SCOPE = "all";

export function MeetingsApp({
  meetings,
  contacts,
  companies,
  roster,
  notifications,
  meId,
}: {
  meetings: MeetingSummary[];
  contacts: ContactSummary[];
  companies: CompanySummary[];
  roster: MemberSummary[];
  notifications: NotificationFeed;
  meId: string;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [query, setQuery] = useState("");
  /** Meetings the server found that the list in hand didn't have. */
  const [found, setFound] = useState<MeetingSummary[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [filters, setFilters] = useState<MeetingFilters>(NO_MEETING_FILTERS);

  const [open, setOpen] = useState<Meeting | null>(null);
  /* The bin: fetched when it is opened, not carried by every page load. */
  const [binOpen, setBinOpen] = useState(false);
  const [binned, setBinned] = useState<MeetingSummary[] | null>(null);
  /** The binned meeting whose "erase for good" has been asked but not answered. */
  const [erasing, setErasing] = useState<string | null>(null);
  /* The create form, when one is open instead of a meeting. */
  const [creating, setCreating] = useState<DetailValues | null>(null);
  const [tasks, setTasks] = useState<MeetingTask[]>([]);

  /*
    Two searches over the same fields. The list already in hand is narrowed
    as you type, which is what makes it feel instant; the server query is
    what finds the meeting from March that was never loaded. Both look at the
    same things, so they cannot disagree about what a word means.
  */
  const narrowed = useMemo(
    () => meetings.filter((m) => matchesMeeting(m, query) && matchesFilters(m, filters)),
    [meetings, query, filters]
  );

  const shown = useMemo(() => {
    if (!found) return narrowed;
    const byId = new Map(narrowed.map((m) => [m.id, m]));
    /* What the server found is still subject to the filters on screen. */
    for (const m of found) if (!byId.has(m.id) && matchesFilters(m, filters)) byId.set(m.id, m);
    return [...byId.values()];
  }, [narrowed, found, filters]);

  /* Offered from every meeting loaded, never narrowed by the other filters. */
  const companyOptions = useMemo(() => companiesIn(meetings), [meetings]);
  const activeFilters = activeFilterCount(filters);

  const groups = useMemo(() => groupMeetings(shown), [shown]);

  const runSearch = useCallback(
    (value: string) => {
      setQuery(value);
      setFound(null);
      if (value.trim().length < 2) return;
      setSearching(true);
      startTransition(async () => {
        const result = await findMeetings(value);
        setSearching(false);
        if (result.ok) setFound(result.meetings);
      });
    },
    []
  );

  const openMeeting = useCallback(
    (id: string) => {
      startTransition(async () => {
        const result = await loadMeeting(id);
        if (!result.ok || !result.meeting) {
          showToast({ message: result.ok ? "Those minutes are gone." : result.error });
          return;
        }
        setOpen(result.meeting);
        setCreating(null);
        const withTasks = await meetingTasks(id);
        setTasks(withTasks.ok ? withTasks.tasks : []);
      });
    },
    [showToast]
  );

  /*
    Three seconds from "we're starting" to a cursor in the paper. Title empty
    — Marcelo's call, and the right one: being made to say what it was about
    is what makes it findable in six months, where "Royal Truck — 17 Sep"
    would not be. Today's date is already filled in.
  */
  /*
    A new meeting is a form, not a row.

    The first version made the row immediately and dropped you into an
    "Untitled meeting" — fast, and wrong in a way that only showed in use:
    every abandoned thought left a card in the list, and the thing you had
    actually come to do (say who it was with) was folded away behind a panel.
    Marcelo asked for the reverse, and he is right. Say what it is, save it,
    and then write.
  */
  const startMeeting = useCallback(() => {
    const today = new Date();
    const metOn = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
      today.getDate()
    ).padStart(2, "0")}`;
    setOpen(null);
    setCreating({
      title: "",
      description: "",
      metOn,
      metAt: "",
      companyIds: [],
      contactIds: [],
      /* You were at your own meeting. Everyone else is a choice. */
      memberIds: [meId],
    });
  }, [meId]);

  const createIt = useCallback(() => {
    if (!creating) return;
    startTransition(async () => {
      const result = await createMeeting(creating);
      if (!result.ok) {
        showToast({ message: result.error });
        return;
      }
      setCreating(null);
      router.refresh();
      openMeeting(result.meetingId);
    });
  }, [creating, openMeeting, router, showToast]);

  const binMeeting = useCallback(() => {
    if (!open) return;
    startTransition(async () => {
      const result = await setMeetingDeleted(open.id, true);
      if (!result.ok) {
        showToast({ message: result.error });
        return;
      }
      setOpen(null);
      showToast({ message: "Minutes binned" });
      setBinned(null);
      router.refresh();
    });
  }, [open, router, showToast]);

  const loadBin = useCallback(() => {
    startTransition(async () => {
      const result = await binnedMeetings();
      if (!result.ok) {
        showToast({ message: result.error });
        return;
      }
      setBinned(result.meetings);
    });
  }, [showToast]);

  const toggleBin = useCallback(() => {
    setBinOpen((wasOpen) => {
      if (!wasOpen && binned === null) loadBin();
      return !wasOpen;
    });
  }, [binned, loadBin]);

  const restoreMeeting = useCallback(
    (id: string) => {
      startTransition(async () => {
        const result = await setMeetingDeleted(id, false);
        if (!result.ok) {
          showToast({ message: result.error });
          return;
        }
        setBinned((rows) => (rows ?? []).filter((m) => m.id !== id));
        showToast({ message: "Back in the list" });
        router.refresh();
      });
    },
    [router, showToast]
  );

  /*
    The only irreversible thing about a meeting, and it is asked twice: once
    by pressing Erase, once by pressing it again on the row that replaces it.
    No toast offering an Undo afterwards — there would be nothing to bring
    back and the button would be a lie.
  */
  const eraseIt = useCallback(
    (id: string) => {
      startTransition(async () => {
        const result = await eraseMeeting(id);
        if (!result.ok) {
          showToast({ message: result.error });
          return;
        }
        setBinned((rows) => (rows ?? []).filter((m) => m.id !== id));
        setErasing(null);
        showToast({
          message: result.erased ? `Erased "${result.erased.title}"` : "Erased for good",
        });
        router.refresh();
      });
    },
    [router, showToast]
  );

  /*
    A link from a company or a contact pane lands here with ?open=<id>.
    Followed once per id: re-running it every render would reopen the meeting
    the moment somebody pressed Back, which is the opposite of what Back means.
  */
  const followed = useRef<string | null>(null);
  const wanted = search.get("open");
  useEffect(() => {
    if (!wanted || followed.current === wanted) return;
    followed.current = wanted;
    openMeeting(wanted);
  }, [wanted, openMeeting]);

  /*
    Two permissions since 0051: the minutes are their author's, the details
    around them belong to everybody who was in the room. Mirrored from the
    database rather than decided here — `save_meeting` and
    `guard_meeting_edit` are what actually enforce it, and this is only so
    the screen does not offer a control that would be refused.
  */
  const mayEditBody = open ? canEditBody(open) : false;
  const mayEditDetails = open ? canEditDetails(open) : false;

  /*
    One question — whose meetings am I looking at — and one list of answers.
    "Internal" is not a property a meeting has ALONGSIDE a company, it is what
    it has instead of one, so it belongs in the same list, above the rule.
  */
  const scopeOptions = useMemo(
    () => [
      { value: ALL_SCOPE, label: "All meetings" },
      { value: INTERNAL_SCOPE, label: "Internal — Opus Kap only" },
      ...companyOptions.map((company, i) => ({
        value: company.id,
        label: company.name,
        heading: i === 0 ? "Companies" : undefined,
      })),
    ],
    [companyOptions]
  );

  const scopeLabel =
    scopeOptions.find((option) => option.value === filters.scope)?.label ?? "All meetings";

  const list = (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-sub"
          strokeWidth={2}
        />
        <label htmlFor="meeting-search" className="sr-only">
          Search meetings
        </label>
        <input
          id="meeting-search"
          value={query}
          onChange={(event) => runSearch(event.target.value)}
          placeholder="Search titles and notes"
          className="h-14 w-full rounded-2xl border-[1.5px] border-border bg-card pl-11 pr-3 text-[17px] text-fg placeholder:text-sub"
        />
      </div>

      {/*
        One row, two controls: start one, or narrow to the ones you want.
        `flex` rather than `flex-wrap`, so they stay on the line Marcelo
        asked for — the dropdown gives up width instead, and its label
        truncates rather than the pair breaking apart.

        The menu is the app's own, not the browser's. A native `<select>` on
        Windows is a grey rectangle in a typeface this app does not otherwise
        use, and it sat two inches from the address book's filter menus. One
        app, one dropdown: this is the same component the Tasklist and the
        book use, with a heading added so "Internal" and the companies read
        as the two kinds of answer they are.
      */}
      <div className="flex items-center gap-2">
        {/*
          "Meeting", not "New meeting", and 48px to match the dropdown beside
          it. Marcelo's call: the plus already says new, and two controls on
          one line that are nearly the same height read as a mistake rather
          than as a pair. The shapes stay different — a square-ish button is
          an action, a pill is a filter.
        */}
        <Button
          size="md"
          onClick={startMeeting}
          disabled={isPending}
          className="h-12 w-auto shrink-0"
        >
          <Plus aria-hidden className="size-5" strokeWidth={2.2} />
          Meeting
        </Button>
        <FilterDropdown
          label={scopeLabel}
          single
          className="min-w-0 shrink"
          options={scopeOptions}
          selected={filters.scope ? [filters.scope] : []}
          onChange={(next) => {
            const picked = next[next.length - 1] ?? null;
            setFilters({ scope: picked === ALL_SCOPE ? null : picked });
          }}
        />
      </div>

      {searching && <p className="text-timestamp text-sub">Looking through every meeting…</p>}

      {shown.length === 0 && (
        <p className="rounded-2xl border-[1.5px] border-border bg-card px-4 py-6 text-[17px] leading-6 text-sub text-pretty">
          {query || activeFilters > 0
            ? "Nothing matches that. Try part of a title, a company, or a word you remember writing."
            : "No meetings yet. The first one takes about three seconds."}
        </p>
      )}

      {groups.map(({ group, meetings: rows }) => (
        <div key={group} className="flex flex-col gap-2.5">
          <h2 className="text-timestamp font-bold uppercase tracking-wider text-sub">{group}</h2>
          {rows.map((meeting) => (
            <MeetingCard
              key={meeting.id}
              meeting={meeting}
              selected={open?.id === meeting.id}
              onOpen={() => openMeeting(meeting.id)}
            />
          ))}
        </div>
      ))}

      {/*
        The bin, which Marcelo asked for three times.

        Binning something with nowhere to look at it afterwards is worse than
        having no bin at all, and that is what this was. It sits at the foot
        of the list, folded, like Recently deleted on the Tasklist — the same
        place, the same fortnight and the same promise: nothing is erased,
        and anyone can put anything back.
      */}
      <div className="mt-2 flex flex-col gap-2 border-t-[1.5px] border-border pt-4">
        <button
          type="button"
          onClick={toggleBin}
          aria-expanded={binOpen}
          className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-2xl border-none bg-transparent px-1 text-left text-timestamp font-bold text-sub"
        >
          <ChevronDown
            aria-hidden
            className={cn("size-4 transition-transform duration-150", !binOpen && "-rotate-90")}
            strokeWidth={2.2}
          />
          <Trash2 aria-hidden className="size-4" strokeWidth={1.75} />
          Bin{binned ? ` (${binned.length})` : ""}
        </button>

        {binOpen && (
          <div className="flex flex-col gap-2">
            {binned === null ? (
              <p className="px-1 text-timestamp text-sub">Looking…</p>
            ) : binned.length === 0 ? (
              <p className="px-1 text-timestamp text-sub text-pretty">
                Nothing in the bin. Minutes stay here for {BIN_DAYS} days after they are binned,
                and the record itself is never erased.
              </p>
            ) : (
              <>
                <p className="px-1 text-timestamp text-sub text-pretty">
                  Binned in the last {BIN_DAYS} days. Anyone can put these back.
                </p>
                {binned.map((meeting) => (
                  <div
                    key={meeting.id}
                    className="flex items-center gap-3 rounded-2xl border-[1.5px] border-border bg-card p-3"
                  >
                    <span className="flex min-w-0 grow flex-col">
                      <span className="line-clamp-2 text-[16px] leading-[22px] text-fg text-pretty wrap-anywhere">
                        {meeting.title}
                      </span>
                      <span className="text-timestamp text-sub tabular-nums">
                        {meetingWhen(meeting.met_on, meeting.met_at, formatMeetingDay)}
                        {meeting.company_name ? ` · ${meeting.company_name}` : ""}
                      </span>
                    </span>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="w-auto px-3"
                        disabled={isPending}
                        onClick={() => restoreMeeting(meeting.id)}
                      >
                        <RotateCcw aria-hidden className="size-4" strokeWidth={1.75} />
                        Put back
                      </Button>
                      {erasing === meeting.id ? (
                        <span className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            className="w-auto px-3"
                            disabled={isPending}
                            onClick={() => eraseIt(meeting.id)}
                          >
                            <Flame aria-hidden className="size-4" strokeWidth={1.75} />
                            Erase it
                          </Button>
                          <Button
                            variant="link"
                            className="text-timestamp"
                            onClick={() => setErasing(null)}
                          >
                            Keep
                          </Button>
                        </span>
                      ) : (
                        <Button
                          variant="link"
                          className="text-timestamp"
                          onClick={() => setErasing(meeting.id)}
                        >
                          Erase for good
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {erasing && (
                  <p className="px-1 text-timestamp text-sub text-pretty">
                    Erasing destroys the minutes, the comments and the record of who was there.
                    Tasks that came out of the meeting stay. Nothing brings it back.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );

  /* The create form: the same fields, before there is anything to save into. */
  const createForm = creating && (
    <div className="flex flex-col gap-4">
      <h1 className="text-section-heading text-fg">New meeting</h1>
      <MeetingDetails
        values={creating}
        onChange={setCreating}
        contacts={contacts}
        companies={companies}
        roster={roster}
        alwaysOpen
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="md"
          onClick={createIt}
          disabled={isPending || creating.title.trim().length === 0}
          className="w-auto"
        >
          Create meeting
        </Button>
        <Button variant="link" className="text-timestamp" onClick={() => setCreating(null)}>
          Cancel
        </Button>
      </div>
      {creating.title.trim().length === 0 && (
        <p className="text-timestamp text-sub text-pretty">
          A title is all that&apos;s needed to start — it&apos;s what makes these findable in six
          months.
        </p>
      )}
    </div>
  );

  return (
    <div className="flex h-full flex-col bg-bg">
      <AppHeader current="/meetings" notifications={notifications} />

      {/*
        One screen at a time on a phone; two columns from `lg`, with the
        narrow one holding the list. The reverse of Contacts, and deliberately
        so — see the note at the top of this file.
      */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:overflow-hidden">
        <div
          className={cn(
            "flex-1 overflow-y-auto px-5 py-6 lg:w-[356px] lg:flex-none lg:border-r-[1.5px] lg:border-border",
            (open || creating) && "hidden lg:block"
          )}
        >
          <div className="mx-auto w-full max-w-[900px] lg:max-w-none">
            <h1 className="mb-4 text-screen-title text-fg lg:sr-only">Meetings</h1>
            {list}
          </div>
        </div>

        <div
          className={cn(
            "flex-1 overflow-y-auto px-5 py-6",
            !open && !creating && "hidden lg:block"
          )}
        >
          {open || creating ? (
            <div className="mx-auto w-full max-w-[900px]">
              <button
                type="button"
                onClick={() => {
                  setOpen(null);
                  setCreating(null);
                }}
                className="mb-3 inline-flex h-11 w-auto cursor-pointer items-center gap-1 rounded-xl border-none bg-transparent px-1 text-[17px] font-bold text-brand lg:hidden"
              >
                <ChevronLeft aria-hidden className="size-5" strokeWidth={2.2} />
                Meetings
              </button>
              {creating ? (
                createForm
              ) : open && (
                /*
                  Keyed by the meeting. Everything in there — the text, whether
                  it is saved, the timestamp the stale check compares against —
                  belongs to one meeting, so switching starts over rather than
                  resetting field by field.
                */
                <MeetingPane
                  key={open.id}
                  meeting={open}
                  contacts={contacts}
                  companies={companies}
                  roster={roster}
                  tasks={tasks}
                  canEditBody={mayEditBody}
                  canEditDetails={mayEditDetails}
                  meId={meId}
                  isPending={isPending}
                  onBin={binMeeting}
                  onClose={() => setOpen(null)}
                  onSaved={() => router.refresh()}
                />
              )}
            </div>
          ) : (
            /*
              Nothing open: the month. It used to be a line telling you to
              pick a meeting, which is a sentence telling you to do the thing
              you were already trying to do. The X on an open meeting brings
              you back here.
            */
            <MeetingCalendar meetings={meetings} onOpen={openMeeting} />
          )}
        </div>
      </div>
    </div>
  );
}

function MeetingCard({
  meeting,
  selected,
  onOpen,
}: {
  meeting: MeetingSummary;
  selected: boolean;
  onOpen: () => void;
}) {
  const internal = isInternal(meeting);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex w-full cursor-pointer flex-col gap-2 rounded-2xl border-[1.5px] bg-card p-3.5 text-left",
        selected ? "border-fg" : "border-border hover:bg-muted"
      )}
    >
      <span className="text-card-title-compact text-fg text-pretty wrap-anywhere">
        {meeting.title}
      </span>

      <span className="flex flex-wrap items-center gap-2">
        {/*
          Every company that was in the room, not just the one the meeting
          files under. Marcelo had a meeting with somebody from AAA and
          somebody from ADV Mobil, and the card said ADV Mobil.
        */}
        {internal ? (
          <Chip className="border-accent text-accent">
            <Users aria-hidden className="size-4" strokeWidth={1.75} />
            Internal
          </Chip>
        ) : (
          meeting.companies.map((company) => (
            <Chip key={company.id} className="border-tag text-tag">
              {company.name}
            </Chip>
          ))
        )}
        <Chip className="border-border text-sub tabular-nums">
          {meetingWhen(meeting.met_on, meeting.met_at, formatMeetingDay)}
        </Chip>
      </span>

      {/*
        The description, written on purpose — not the opening of the minutes.
        The snippet was whatever happened to be typed first, which on a set of
        minutes is a register of who was in the room, so every card read the
        same. Nothing at all when nobody wrote one: a card with a title and a
        date says more than a card quoting its own first line.
      */}
      {meeting.description && (
        <span className="line-clamp-2 text-timestamp text-sub text-pretty">
          {meeting.description}
        </span>
      )}

      {meeting.attendees.length > 0 && (
        <span className="flex items-center">
          {meeting.attendees.slice(0, 5).map((a) => (
            /*
              `inline-flex`, not the default inline: an inline box takes the
              line's height, not its content's, so the ring was drawn around a
              26px circle inside a taller box and stood off it at the top and
              bottom. Marcelo's SS4 — the outline bigger than the icon.
            */
            <span
              key={`${a.kind}-${a.id}`}
              className="-mr-2 inline-flex rounded-full ring-2 ring-card last:mr-0"
            >
              <Avatar initials={a.initials} color={a.color ?? "#87252b"} size={26} />
            </span>
          ))}
          {meeting.attendees.length > 5 && (
            <span className="ml-3 text-timestamp text-sub">+{meeting.attendees.length - 5}</span>
          )}
        </span>
      )}
    </button>
  );
}

function Chip({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border-[1.5px] px-2.5 py-1 text-timestamp font-bold",
        className
      )}
    >
      {children}
    </span>
  );
}
