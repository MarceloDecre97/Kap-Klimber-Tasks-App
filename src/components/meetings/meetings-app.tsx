"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BookOpen,
  Check,
  ChevronLeft,
  ListPlus,
  PenLine,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { MeetingEditor } from "@/components/meetings/meeting-editor";
import { MeetingComments } from "@/components/meetings/meeting-comments";
import { MeetingDetails, detailsFrom, type DetailValues } from "@/components/meetings/meeting-details";
import {
  createMeeting,
  findMeetings,
  loadMeeting,
  meetingTasks,
  setMeetingDeleted,
  updateMeeting,
} from "@/app/meetings/actions";
import {
  NO_MEETING_FILTERS,
  activeFilterCount,
  companiesIn,
  groupMeetings,
  matchesFilters,
  renderBody,
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
  const [details, setDetails] = useState<DetailValues | null>(null);
  const [detailsDirty, setDetailsDirty] = useState(false);
  const [tasks, setTasks] = useState<MeetingTask[]>([]);
  /*
    Writing or reading your own minutes.

    The author only ever saw a text area, which means the one person who
    types "- " at the start of a line was the one person who never saw it
    become a bullet. Reading is also what you do after the meeting — you
    write during it and read it back before sending the follow-up.

    Defaults to writing, because that is what you opened it for; and it
    resets whenever a different meeting is opened, since the mode belongs to
    what you are doing rather than to the app.
  */
  const [reading, setReading] = useState(false);

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
        setDetails(detailsFrom(result.meeting));
        setDetailsDirty(false);
        setReading(false);
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
  const startMeeting = useCallback(() => {
    const today = new Date();
    const metOn = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
      today.getDate()
    ).padStart(2, "0")}`;
    startTransition(async () => {
      const result = await createMeeting({
        title: "Untitled meeting",
        metOn,
        metAt: "",
        companyId: null,
        contactIds: [],
        memberIds: [meId],
      });
      if (!result.ok) {
        showToast({ message: result.error });
        return;
      }
      router.refresh();
      openMeeting(result.meetingId);
    });
  }, [meId, openMeeting, router, showToast]);

  const saveDetails = useCallback(() => {
    if (!open || !details) return;
    startTransition(async () => {
      const result = await updateMeeting(open.id, details);
      if (!result.ok) {
        showToast({ message: result.error });
        return;
      }
      setDetailsDirty(false);
      showToast({ message: "Details saved" });
      router.refresh();
      openMeeting(open.id);
    });
  }, [open, details, openMeeting, router, showToast]);

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

  const paper = open && details && (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-section-heading text-fg text-pretty wrap-anywhere">{open.title}</h1>
          <p className="text-timestamp text-sub">
            {meetingWhen(open.met_on, open.met_at, formatMeetingDay)}
            {open.company_name ? ` · ${open.company_name}` : ""}
            {open.created_by ? ` · ${open.created_by.display_name}` : ""}
          </p>
        </div>
        {canEdit && (
          <Button variant="link" onClick={binMeeting} disabled={isPending} className="text-timestamp">
            <Trash2 aria-hidden className="size-4" strokeWidth={1.75} />
            Bin
          </Button>
        )}
      </div>

      <MeetingDetails
        values={details}
        disabled={!canEdit || isPending}
        onChange={(next) => {
          setDetails(next);
          setDetailsDirty(true);
        }}
        contacts={contacts}
        companies={companies}
        roster={roster}
        startOpen={open.title === "Untitled meeting"}
      />

      {detailsDirty && canEdit && (
        <Button size="sm" onClick={saveDetails} disabled={isPending} className="w-auto self-start">
          Save details
        </Button>
      )}

      {/*
          What came out of it, and the way to add to that.

          Below the paper rather than above: during the meeting the paper is
          the only thing that matters, and the action items are what you
          reach for once the talking has stopped.
      */}
      <div className="flex flex-col gap-2">
        <Link
          href={`/tasks/new?meeting=${open.id}&from=/meetings`}
          className="inline-flex h-11 w-auto items-center gap-2 self-start rounded-xl border-[1.5px] border-fg bg-card px-3 text-timestamp font-bold text-fg no-underline hover:bg-muted"
        >
          <ListPlus aria-hidden className="size-4" strokeWidth={1.75} />
          Task from this meeting
        </Link>

        {tasks.length > 0 && (
          <ul className="flex flex-col gap-2">
            {tasks.map((task) => (
              <li key={task.id}>
                <Link
                  href={`/tasks?task=${task.id}`}
                  className="flex flex-col gap-1.5 rounded-2xl border-[1.5px] border-border bg-card p-3 no-underline hover:bg-muted"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    {task.status === "complete" ? (
                      <Chip className="border-ok text-ok">
                        <Check aria-hidden className="size-4" strokeWidth={2.5} />
                        Done
                      </Chip>
                    ) : (
                      <Chip className="border-accent text-accent">
                        {TASK_STATUS_WORDS[task.status] ?? "Open"}
                      </Chip>
                    )}
                    {task.due_date && (
                      <Chip className="border-border text-sub tabular-nums">
                        Due {formatMeetingDay(task.due_date)}
                      </Chip>
                    )}
                  </span>
                  <span className="text-[17px] leading-6 text-fg text-pretty wrap-anywhere">
                    {task.title}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {canEdit && open.body.trim() !== "" && (
        <div className="flex gap-1 self-start rounded-full bg-muted p-1">
          <ModeTab on={!reading} onClick={() => setReading(false)}>
            <PenLine aria-hidden className="size-4" strokeWidth={1.75} />
            Write
          </ModeTab>
          <ModeTab on={reading} onClick={() => setReading(true)}>
            <BookOpen aria-hidden className="size-4" strokeWidth={1.75} />
            Read
          </ModeTab>
        </div>
      )}

      {canEdit && !reading ? (
        <MeetingEditor
          meetingId={open.id}
          initialBody={open.body}
          initialStamp={open.updated_at}
          canEdit
        />
      ) : (
        /*
          Somebody else's minutes: read, never typed into. A rendered view
          rather than a greyed-out box — a text area you cannot use still
          looks like one you should be able to, and this is the one place a
          line starting "- " can become an actual bullet without the app
          reformatting what its author is in the middle of typing.
        */
        <MeetingReader body={open.body} />
      )}

      {/*
        Last on the card. The minutes are what you came for; the margin is
        what somebody else added afterwards, and putting it above the paper
        would make every meeting open on the commentary rather than the
        record.
      */}
      <MeetingComments meetingId={open.id} />
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
            open && "hidden lg:block"
          )}
        >
          <div className="mx-auto w-full max-w-[900px] lg:max-w-none">
            <h1 className="mb-4 text-screen-title text-fg lg:sr-only">Meetings</h1>
            {list}
          </div>
        </div>

        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-6",
            !open && "hidden lg:flex"
          )}
        >
          {open ? (
            <div className="mx-auto flex min-h-0 w-full max-w-[900px] flex-1 flex-col gap-3">
              <button
                type="button"
                onClick={() => setOpen(null)}
                className="inline-flex h-11 w-auto cursor-pointer items-center gap-1 self-start rounded-xl border-none bg-transparent px-1 text-[17px] font-bold text-brand lg:hidden"
              >
                <ChevronLeft aria-hidden className="size-5" strokeWidth={2.2} />
                Meetings
              </button>
              {paper}
            </div>
          ) : (
            <p className="m-auto max-w-[36ch] text-center text-[17px] leading-6 text-sub text-pretty">
              Pick a meeting, or start a new one. It saves itself as you type.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** The status words, matching what the Tasklist calls them. */
const TASK_STATUS_WORDS: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  for_review: "For review",
  waiting: "Waiting",
  complete: "Done",
};

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

/**
 * Minutes as somebody else reads them.
 *
 * Bullets for lines that start "- " or "* ", because that is how these get
 * typed anyway; everything else exactly as written. No other formatting: a
 * record of what was said should look like what was written, not like a
 * document somebody designed.
 */
function MeetingReader({ body }: { body: string }) {
  const lines = renderBody(body);
  if (body.trim() === "") {
    return (
      <p className="rounded-2xl border-[1.5px] border-border bg-card p-4 text-[17px] leading-6 text-sub">
        Nothing written here yet.
      </p>
    );
  }
  return (
    <div className="flex flex-col rounded-2xl border-[1.5px] border-border bg-card p-4 text-[17px] leading-[26px] text-fg">
      {lines.map((line, i) => {
        if (line.kind === "blank") return <span key={i} className="h-[13px]" aria-hidden />;
        if (line.kind === "bullet") {
          return (
            <span key={i} className="flex gap-2 text-pretty">
              <span aria-hidden className="select-none text-sub">
                •
              </span>
              <span className="min-w-0 wrap-anywhere">{line.text}</span>
            </span>
          );
        }
        return (
          <span key={i} className="text-pretty wrap-anywhere">
            {line.text}
          </span>
        );
      })}
    </div>
  );
}

function ModeTab({
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
        "inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-full border-none px-3.5 text-timestamp font-bold",
        on ? "bg-prim text-on-prim" : "bg-transparent text-muted-fg hover:text-fg"
      )}
    >
      {children}
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
