"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Plus, Search, Users } from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { MeetingPane } from "@/components/meetings/meeting-pane";
import { MeetingDetails, type DetailValues } from "@/components/meetings/meeting-details";
import {
  createMeeting,
  findMeetings,
  loadMeeting,
  meetingTasks,
  setMeetingDeleted,
} from "@/app/meetings/actions";
import {
  NO_MEETING_FILTERS,
  activeFilterCount,
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
      metOn,
      metAt: "",
      companyId: null,
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
      router.refresh();
    });
  }, [open, router, showToast]);

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

  const canEdit = open ? open.mine || !open.created_by : false;

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

      <Button size="md" onClick={startMeeting} disabled={isPending} className="w-auto self-start">
        <Plus aria-hidden className="size-5" strokeWidth={2.2} />
        New meeting
      </Button>

      {/*
        No filter narrows another's options — the rule the contacts book
        arrived at the hard way. Every company that has a meeting stays on
        offer whatever else is switched on, and an impossible combination
        shows the empty line below rather than a control that disappears
        while you are still using it.
      */}
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="meeting-company-filter" className="sr-only">
          Filter by company
        </label>
        <select
          id="meeting-company-filter"
          value={filters.companyId ?? ""}
          onChange={(event) =>
            setFilters((f) => ({ ...f, companyId: event.target.value || null }))
          }
          className="h-11 max-w-full rounded-full border-[1.5px] border-border bg-card px-3 text-timestamp font-bold text-fg"
        >
          <option value="">Any company</option>
          {companyOptions.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </select>

        <FilterToggle
          on={filters.mineOnly}
          onClick={() => setFilters((f) => ({ ...f, mineOnly: !f.mineOnly }))}
        >
          Mine
        </FilterToggle>
        <FilterToggle
          on={filters.internalOnly}
          onClick={() => setFilters((f) => ({ ...f, internalOnly: !f.internalOnly }))}
        >
          Internal
        </FilterToggle>

        {activeFilters > 0 && (
          <button
            type="button"
            onClick={() => setFilters(NO_MEETING_FILTERS)}
            className="h-11 cursor-pointer border-none bg-transparent px-2 text-timestamp font-bold text-brand underline underline-offset-[3px]"
          >
            Clear
          </button>
        )}
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
        disabled={isPending}
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
                  canEdit={canEdit}
                  isPending={isPending}
                  onBin={binMeeting}
                  onSaved={() => router.refresh()}
                />
              )}
            </div>
          ) : (
            <p className="mx-auto mt-12 max-w-[36ch] text-center text-[17px] leading-6 text-sub text-pretty">
              Pick a meeting, or start a new one.
            </p>
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
        {internal ? (
          <Chip className="border-accent text-accent">
            <Users aria-hidden className="size-4" strokeWidth={1.75} />
            Internal
          </Chip>
        ) : (
          meeting.company_name && <Chip className="border-tag text-tag">{meeting.company_name}</Chip>
        )}
        <Chip className="border-border text-sub tabular-nums">
          {meetingWhen(meeting.met_on, meeting.met_at, formatMeetingDay)}
        </Chip>
      </span>

      {meeting.snippet && (
        <span className="line-clamp-2 text-timestamp text-sub text-pretty">{meeting.snippet}</span>
      )}

      {meeting.attendees.length > 0 && (
        <span className="flex items-center">
          {meeting.attendees.slice(0, 5).map((a) => (
            <span key={`${a.kind}-${a.id}`} className="-mr-2 last:mr-0 rounded-full ring-2 ring-card">
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

function FilterToggle({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "h-11 cursor-pointer rounded-full border-[1.5px] px-3.5 text-timestamp font-bold",
        on ? "border-fg bg-prim text-on-prim" : "border-border bg-card text-sub hover:bg-muted"
      )}
    >
      {children}
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
