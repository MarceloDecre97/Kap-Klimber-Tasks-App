"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  AtSign,
  Bell,
  BellOff,
  ChevronDown,
  GitCommitHorizontal,
  Hourglass,
  Contact,
  Link as LinkIcon,
  MessageSquare,
  Pencil,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TaskContactPill } from "@/components/contacts/task-contact-pill";
import { MentionTextarea } from "@/components/tasks/mention-textarea";
import { NoteBody } from "@/components/tasks/note-body";
import { PRIORITIES, STATUSES, STATUS_ORDER } from "@/lib/constants";
import { toDisplayBody, toStorageBody, visibleLength } from "@/lib/mentions";
import { reminderState } from "@/lib/reminders";
import { buildEventLog } from "@/lib/task-timeline";
import { countNotes, daysSince } from "@/lib/tasks-view";
import {
  cn,
  daysBetweenKeys,
  formatCalendarDate,
  formatDateGroup,
  formatTimestamp,
  toZonedDateInput,
  toZonedTimeInput,
  zonedDateKey,
  zonedWallClockToIso,
} from "@/lib/utils";
import {
  addNote,
  addTaskLink,
  clearTaskReminder,
  deleteNote,
  editNote,
  nudgeTaskReminder,
  removeTaskLink,
  setReminderDismissed,
  setTaskReminder,
  toggleNoteLike,
} from "@/app/tasks/actions";
import type {
  MemberSummary,
  TaskLink,
  TaskNote,
  TaskReminder,
  TaskWithRelations,
} from "@/lib/data/tasks";
import type { TaskStatus } from "@/lib/supabase/database.types";

/** Both match 0032_task_links.sql, which is what actually enforces them. */
const MAX_TASK_LINKS = 3;
const TASK_LINK_LABEL_MAX = 40;

/**
 * Past this length a title steps down one size. Character count is a proxy
 * for line count — imprecise, but free to compute and impossible to make
 * flicker, and the two-line clamp is what actually bounds the card.
 */
const COMPACT_TITLE_CHARS = 55;

/** Matches the `task_notes.body` check constraint and the zod schema. */
const NOTE_MAX = 2000;
/** Where the counter starts warning rather than just informing. */
const NOTE_LONG = 1800;

export function TaskPill({
  task,
  meId,
  expanded,
  onToggleExpand,
  onSetStatus,
  onRequestDelete,
  onResolveDeletion,
  onCancelDeletion,
  onToggleReminder,
  roster,
  lastActivityAt,
  mentionsYou = false,
}: {
  task: TaskWithRelations;
  meId: string;
  expanded: boolean;
  onToggleExpand: () => void;
  onSetStatus: (status: TaskStatus) => void;
  onRequestDelete: () => void;
  /** The creator's answer to a pending request: delete it, or keep it. */
  onResolveDeletion?: (approve: boolean) => void;
  /** The requester withdrawing their own ask. */
  onCancelDeletion?: () => void;
  /** Omitted where the reminder should render read-only. */
  onToggleReminder?: () => void;
  /** Needed to name and picture whoever liked a note. */
  roster: MemberSummary[];
  /**
   * Last activity on the task. Rendered in the card's own date line below
   * `lg`, where the Tasklist's left rail is hidden; from `lg` up the rail
   * shows it instead, so the card hides it rather than printing the same
   * date twice.
   */
  lastActivityAt?: string;
  /**
   * Somebody named you in a note here and you have not opened it yet.
   *
   * The bell already says so, but the bell is somewhere else. Being named is
   * the one kind of note that is addressed to you specifically, and finding
   * out about it required either the panel or opening the card — so the card
   * says it too, where you are already looking.
   */
  mentionsYou?: boolean;
}) {
  const priority = PRIORITIES[task.priority];
  const status = STATUSES[task.status];
  const [noteBody, setNoteBody] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Amber while a reminder is still ahead of you, red once it has fired and
  // nobody has dealt with it, muted once handled.
  /*
    The viewer's own reminder, and only theirs. Since 0034 a task can carry
    one per person; the chip, the amber line and the dismiss gesture have
    always been about "my reminder" and now say so.
  */
  const myReminder = task.my_reminder;
  const rState = reminderState(myReminder);
  const dismissed = rState === "handled";
  /*
    Whole days a still-open task is past its due date. A finished task is
    never late — it was delivered, and stamping it red forever would make
    the Complete list read as a wall of failures.
  */
  /*
    Who may decide. Normally the creator — but a task whose creator has been
    deactivated would otherwise be undeletable by anybody, with any pending
    request stuck against it forever. listRoster only returns active members,
    so a creator missing from it is one who has been switched off.
  */
  const creatorActive = roster.some((m) => m.id === task.created_by);
  /*
    The creator, or anybody once the creator has been switched off.

    Deciding a deletion and editing the task are separate permissions that
    happen to share this rule, so they are named separately and computed
    once. Both mirror can_edit_task / can_decide_task_deletion in the
    database, which are what actually enforce them — this only decides which
    buttons are worth showing.
  */
  const isCreatorOrOrphan = task.created_by === meId || !creatorActive;
  const canDecide = isCreatorOrOrphan;
  const canEdit = isCreatorOrOrphan;
  const pending = task.deletion_requested_at !== null;
  const requester = roster.find((m) => m.id === task.deletion_requested_by) ?? null;
  const creator = roster.find((m) => m.id === task.created_by) ?? null;
  const iRequested = task.deletion_requested_by === meId;

  /*
    Two lists where there was one merged timeline: what people said, and what
    changed. buildTimeline still merges them for anything that wants the old
    single stream; these are the two halves the banner draws.
  */
  const notes = task.notes;
  const events = buildEventLog(task);
  /* Oldest-first is the natural order to build; the card reads the other way. */
  const newestFirst = events.slice().reverse();
  const [activityOpen, setActivityOpen] = useState(false);

  /*
    The description's fold.

    Whether six lines is a fold or the whole thing depends on the width of
    the phone and the length of the words, so it is measured rather than
    guessed at: scrollHeight is the full text, clientHeight is what the clamp
    leaves visible. Re-measured on resize because rotating the phone changes
    the answer.
  */
  const descriptionRef = useRef<HTMLParagraphElement | null>(null);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [descriptionOverflows, setDescriptionOverflows] = useState(false);

  useEffect(() => {
    const node = descriptionRef.current;
    if (!node) {
      setDescriptionOverflows(false);
      return;
    }
    const measure = () => {
      const el = descriptionRef.current;
      if (!el) return;
      // Only meaningful while clamped; once open the element is its full height.
      if (descriptionOpen) return;
      setDescriptionOverflows(el.scrollHeight > el.clientHeight + 1);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [task.description, descriptionOpen, expanded]);
  const noteCount = countNotes(task.notes);
  const contacts = task.contacts;
  const overdueDays =
    task.due_date && task.status !== "complete"
      ? Math.max(0, -daysBetweenKeys(zonedDateKey(new Date()), task.due_date))
      : 0;

  /*
    Counted as it reads, not as it is stored: a mention is about fifty
    characters on disk and eight on screen, and charging the writer fifty for
    typing a teammate's name would make the limit inexplicable.
  */
  const noteLength = visibleLength(noteBody);

  function submitNote() {
    const typed = noteBody.trim();
    if (!typed) return;
    setNoteError(null);
    /*
      The names become ids here, at the moment of sending, rather than while
      somebody types. The box holds "@Keith Maslowski"; the database holds
      "@[Keith Maslowski](uuid)". Doing it in the box meant forty characters
      of uuid sat visible in the note you were writing, and backspacing over
      a name took forty presses.
    */
    const body = toStorageBody(typed, roster);
    startTransition(async () => {
      const result = await addNote({ taskId: task.id, body });
      if (!result.ok) {
        setNoteError(result.error);
        return;
      }
      setNoteBody("");
    });
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-[26px] border-[1.5px] border-border bg-card p-3.5 shadow-[0_1px_3px_rgba(2,6,23,0.08)]">
      <button
        type="button"
        onClick={onToggleExpand}
        aria-expanded={expanded}
        className="flex w-full min-h-14 flex-col gap-2 border-none bg-transparent p-0 text-left cursor-pointer"
      >
        <span className="flex w-full items-start gap-3">
          {/*
            Collapsed, the title is capped at two lines so one long title can
            never push the rest of the list off screen; expanding shows it in
            full. The dates moved below rather than beside it, which roughly
            doubles the width the title gets on a phone — worth far more than
            shrinking the type. The size step is a small extra assist for
            middling-length titles.
          */}
          <span
            title={task.title}
            className={cn(
              // wrap-anywhere, because line-clamp does not break words: one
              // unbroken 60-character string ran straight out of the card
              // and under the chevron.
              "flex-1 text-fg text-pretty wrap-anywhere",
              task.title.length > COMPACT_TITLE_CHARS ? "text-card-title-compact" : "text-card-title",
              !expanded && "line-clamp-2"
            )}
          >
            {task.title}
          </span>
          <ChevronDown
            aria-hidden
            className={cn(
              "mt-0.5 size-5 shrink-0 text-sub transition-transform duration-150",
              expanded && "rotate-180"
            )}
          />
        </span>

        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] leading-[14px] font-bold text-sub tabular-nums">
          <span>Created On {formatDateGroup(task.created_at)}</span>
          {/*
            Normal ink rather than amber: amber is the reminder's colour
            everywhere else in the app, and two different meanings sharing
            one colour is how you learn to ignore both. Red, with the days
            counted, is reserved for a date that has actually passed.
          */}
          {task.due_date && (
            <span className={cn(overdueDays > 0 ? "text-danger" : "text-fg")}>
              Due For {formatCalendarDate(task.due_date)}
              {overdueDays > 0 && ` (Overdue: ${overdueDays} ${overdueDays === 1 ? "Day" : "Days"})`}
            </span>
          )}
          {lastActivityAt && <span className="lg:hidden">Updated {formatDateGroup(lastActivityAt)}</span>}
        </span>
      </button>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge spec={priority} />
        <Badge spec={status} />
        <span
          className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border-[1.5px] border-border px-2.5 text-[15px] leading-5 font-bold text-sub"
          title="Days since this task was created"
        >
          <Hourglass aria-hidden className="size-3.5 shrink-0" strokeWidth={2.5} />
          {daysSince(task.created_at)}d
        </span>
        {/*
          Without this you had to expand a task to discover whether anyone had
          said anything about it, which meant opening every card to find the
          one with news.
        */}
        {noteCount > 0 && (
          <span
            className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border-[1.5px] border-border px-2.5 text-[15px] leading-5 font-bold text-sub"
            title={`${noteCount} ${noteCount === 1 ? "note" : "notes"} on this task`}
          >
            <MessageSquare aria-hidden className="size-3.5 shrink-0" strokeWidth={2.5} />
            {noteCount}
          </span>
        )}
        {/*
          Says a contact is attached without opening the card, so a task you
          could act on right now is distinguishable from one you would have
          to expand to find out about. Brand-coloured, like the mention
          marker: this is a resource on the task, not a fact about its state.
        */}
        {contacts.length > 0 && (
          <span
            className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border-[1.5px] border-brand px-2.5 text-[15px] leading-5 font-bold text-brand"
            title={`${contacts.length} ${contacts.length === 1 ? "contact" : "contacts"} on this task`}
          >
            <Contact aria-hidden className="size-3.5 shrink-0" strokeWidth={2.5} />
            {contacts.length}
          </span>
        )}
        {/*
          Brand-coloured rather than grey: unlike the counter beside it, this
          is not a fact about the task, it is a message for one person. It
          goes as soon as the card is opened, because opening it marks the
          notification read.
        */}
        {mentionsYou && (
          <span
            className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border-[1.5px] border-brand px-2.5 text-[15px] leading-5 font-bold text-brand"
            title="You were mentioned in a note here"
          >
            <AtSign aria-hidden className="size-3.5 shrink-0" strokeWidth={2.5} />
            You
          </span>
        )}
        {/*
          A pending request is visible without opening the card. The task
          itself carries on working normally — same bucket, same reminder,
          same everything — because only the cleanup is waiting, never the
          work.
        */}
        {pending && (
          <span className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border-[1.5px] border-danger px-2.5 text-[15px] leading-5 font-bold text-danger">
            <Trash2 aria-hidden className="size-3.5 shrink-0" strokeWidth={2.5} />
            {canDecide ? "Delete requested" : "Delete pending"}
          </span>
        )}
        {/*
          The reminder chip doubles as its own dismiss control, so a fired
          reminder can be marked handled from wherever the task appears —
          this component renders in both the Tasklist and the Dashboard.
          Dismissal is shared across the team and never changes the task's
          status, dates, or dashboard bucket.
        */}
        {myReminder && (
          <button
            type="button"
            onClick={() => onToggleReminder?.()}
            disabled={!onToggleReminder || isPending}
            aria-pressed={dismissed}
            title={
              dismissed
                ? `Reminder handled — ${formatTimestamp(myReminder.remind_at)}. Click to un-dismiss.`
                : `Reminder set for ${formatTimestamp(myReminder.remind_at)}. Click once handled.`
            }
            className={cn(
              "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border-[1.5px] px-2.5",
              "text-[15px] leading-5 font-bold transition-transform duration-150",
              onToggleReminder && "cursor-pointer active:scale-[0.97]",
              rState === "handled" && "border-border bg-muted text-sub",
              rState === "due" && "border-danger text-danger",
              rState === "upcoming" && "border-accent text-accent"
            )}
          >
            {dismissed ? (
              <BellOff aria-hidden className="size-3.5 shrink-0" strokeWidth={2.5} />
            ) : (
              <Bell aria-hidden className="size-3.5 shrink-0" strokeWidth={2.5} />
            )}
            <span className="sr-only">{dismissed ? "Reminder handled, was set for " : "Reminder set for "}</span>
            <span className={cn(dismissed && "line-through")}>{formatTimestamp(myReminder.remind_at)}</span>
          </button>
        )}
      </div>

      {expanded && (
        <div className="flex flex-col gap-4 border-t-[1.5px] border-border pt-3">
          {/*
            The decision, where the task is — not in the notification that
            announced it. Deciding whether something should exist needs to see
            what it is, who is on it, and what has been happening on it, and a
            dropdown row shows none of that.
          */}
          {pending && (
            <div className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-danger bg-card p-3.5">
              <p className="text-[17px] leading-6 text-fg text-pretty">
                <span className="font-bold">
                  {iRequested ? "You asked" : `${requester?.display_name ?? "Someone"} asked`}
                </span>{" "}
                to delete this task.
              </p>
              {task.deletion_reason && (
                <p className="text-[17px] leading-6 text-sub text-pretty">
                  &ldquo;{task.deletion_reason}&rdquo;
                </p>
              )}

              {canDecide && onResolveDeletion ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="destructive"
                    size="md"
                    className="w-auto px-4"
                    disabled={isPending}
                    onClick={() => onResolveDeletion(true)}
                  >
                    Delete it
                  </Button>
                  <Button
                    variant="secondary"
                    size="md"
                    className="w-auto px-4"
                    disabled={isPending}
                    onClick={() => onResolveDeletion(false)}
                  >
                    Keep it
                  </Button>
                </div>
              ) : iRequested && onCancelDeletion ? (
                <>
                  {/*
                    The sentence first, the button under it — same shape as
                    the creator's version above. Side by side, a long name
                    wrapped and left the button sitting above its own
                    explanation.
                  */}
                  <p className="text-[16px] leading-6 text-sub">
                    Waiting on {creator?.display_name ?? "the creator"}.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      size="md"
                      className="w-auto px-4"
                      disabled={isPending}
                      onClick={onCancelDeletion}
                    >
                      Withdraw
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-[16px] leading-6 text-sub">
                  Waiting on {creator?.display_name ?? "the creator"}.
                </p>
              )}
            </div>
          )}
          {/*
            Below `sm` the label sits above its value rather than beside it:
            a 104px label column leaves roughly 150px for the value inside a
            phone-width card, which is not enough for a full name or a
            timestamp. Each pair is wrapped so the stacked spacing can be
            tighter than the spacing between pairs; `sm:contents` dissolves
            the wrappers again so the two-column grid sees dt/dd directly.
          */}
          <dl className="flex flex-col gap-3 sm:grid sm:grid-cols-[104px_minmax(0,1fr)] sm:gap-x-3 sm:gap-y-2 sm:items-baseline">
            {/*
              Created by, first.

              It sat only in the history until now. Since 0033 it decides who
              may change the task at all, so it belongs on the face of the
              card rather than eight lines down in Task Activity.
            */}
            <div className="flex min-w-0 flex-col gap-0.5 sm:contents">
              <dt className="text-[16px] leading-7 font-bold text-sub">Created by</dt>
              <dd className="flex min-w-0 items-center gap-1.5">
                {creator ? (
                  <>
                    <Avatar initials={creator.initials} color={creator.color} size={24} />
                    <span className="min-w-0 break-words text-[18px] leading-7 text-fg">
                      {creator.display_name}
                    </span>
                  </>
                ) : (
                  /* Not on the roster any more — listRoster only returns active members. */
                  <span className="min-w-0 break-words text-[18px] leading-7 text-sub">
                    No longer with the team
                  </span>
                )}
              </dd>
            </div>
            <div className="flex min-w-0 flex-col gap-0.5 sm:contents">
              <dt className="text-[16px] leading-7 font-bold text-sub">Assigned to</dt>
              <dd className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                {task.assignees.map((person) => (
                  <span key={person.id} className="inline-flex min-w-0 items-center gap-1.5">
                    <Avatar initials={person.initials} color={person.color} size={24} />
                    <span className="min-w-0 break-words text-[18px] leading-7 text-fg">{person.display_name}</span>
                  </span>
                ))}
              </dd>
            </div>
            <div className="flex min-w-0 flex-col gap-0.5 sm:contents">
              <dt className="text-[16px] leading-7 font-bold text-sub">Category</dt>
              <dd className="min-w-0 break-words text-[18px] leading-7 text-fg">{task.category?.label ?? "None"}</dd>
            </div>
            {/*
              The due date and the reminder used to be repeated here. Both are
              already above — the due date in the "Due For …" header line, the
              reminder as its own chip — and the second copy was most of what
              made this block feel long.
            */}
          </dl>

          {task.description && (
            <div className="flex flex-col gap-1.5">
              {/*
                `break-words` is the whole of the overflow fix.

                The paragraph was never the problem. A Drive URL pasted into a
                description is eighty characters with no spaces in it, so the
                browser has nowhere to wrap and it runs off the side of the
                card. A character limit would not have helped: 200 characters
                of unbroken URL overflow exactly the same.
              */}
              <p
                ref={descriptionRef}
                className={cn(
                  "text-[18px] leading-7 text-fg text-pretty break-words",
                  !descriptionOpen && "line-clamp-6"
                )}
              >
                {task.description}
              </p>
              {/*
                Measured, not counted. The button appears when the text
                actually overflows six lines at this phone's width, which a
                character count cannot know.
              */}
              {descriptionOverflows && (
                <button
                  type="button"
                  onClick={() => setDescriptionOpen((open) => !open)}
                  className="self-start text-[16px] leading-[22px] font-bold text-brand cursor-pointer bg-transparent border-none p-0"
                >
                  {descriptionOpen ? "Show less" : "Show more"}
                </button>
              )}
            </div>
          )}

          {/*
            §3 — External links.

            Hidden entirely when a task has none, which is most of them. Only
            the label is drawn; the URL behind it is the reason this section
            exists at all.
          */}
          {/*
            §3 — External links.

            Everyone assigned may add and remove one, creator or not: since
            0033 an assignee cannot open the form, so without a control here
            that permission would exist on paper and nowhere else.
          */}
          <TaskLinks taskId={task.id} links={task.links} />

          {/*
            Everyone gets a way to set their own reminder; the creator also
            gets everybody else's. Below the links and above the status
            buttons, because it is about the work rather than about the task.
          */}
          <TaskReminders task={task} meId={meId} canManageAll={canEdit} />

          <div className="flex flex-col gap-2">
            <div className="text-section-heading">Change Task&apos;s Status To:</div>
            {/*
              Always exactly three — five statuses less the current one, less
              Complete, which has its own button at the foot of the card.

              A three-column grid rather than a wrapping row: equal columns
              keep them on one line at 390px and stop the widest label
              ("Not started") from pushing the third one under.

              Colours come from STATUSES as inline styles, not classes. The
              tones are hex values in constants.ts rather than Tailwind
              colour names, and routing them through className would hand
              tailwind-merge classes it does not recognise — which it drops.
            */}
            <div className="grid grid-cols-3 gap-2">
              {STATUS_ORDER.filter((value) => value !== task.status && value !== "complete").map((value) => {
                const spec = STATUSES[value];
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onSetStatus(value)}
                    disabled={isPending}
                    style={{ backgroundColor: spec.bg, color: spec.fg, borderColor: spec.border }}
                    className={cn(
                      "flex min-w-0 items-center justify-center rounded-full border-[1.5px] px-1.5 py-2",
                      "text-[14px] leading-tight font-bold cursor-pointer",
                      "transition-transform duration-150 ease-out active:scale-[0.97]"
                    )}
                  >
                    {/*
                      Wraps rather than truncates, and carries no icon.

                      Measured: at 390px the card gives this row 320px, so a
                      column is 101px. "In progress" is the widest of the five
                      labels — wider than "Not started", which is the mistake
                      the first cut of this made — and with an icon beside it
                      the word "progress" overran its column by 7px even at
                      390. Dropping the icon buys 20px and leaves 17px spare
                      at 390, 7px at 360.

                      The word still carries the meaning without the colour,
                      which is the rule in constants.ts; the icon was the
                      redundant half of that pair, and it is the half that
                      does not fit.
                    */}
                    <span className="min-w-0 text-center">{spec.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {contacts.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="text-field-label">
                {contacts.length === 1 ? "Contact" : "Contacts"}
              </div>
              <div className="flex flex-col gap-2.5">
                {contacts.map((contact) => (
                  <TaskContactPill key={contact.id} contact={contact} taskId={task.id} />
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <div className="text-section-heading">Team Chat</div>
            {/*
              Notes only, and all of them.

              These used to be merged with the status changes into one
              chronological Activity list, so that "blocked on the supplier"
              could be read next to the move to Waiting that caused it. That
              reason still holds — what changed is that the merged list grew
              into a wall nobody read. Task Activity sits directly below this
              one and always shows the latest change, so the connection is
              still on screen; it is just no longer interleaved.

              No "show more": under two notes per task across the whole book,
              a fold would be a control that only ever gets in the way.
            */}
            {notes.length === 0 && (
              <p className="text-[18px] leading-7 text-sub">Nothing here yet — add the first note.</p>
            )}
            {notes.map((note) => (
              <NoteRow
                key={note.id}
                note={note}
                taskId={task.id}
                meId={meId}
                roster={roster}
                lastReadAt={task.last_read_at}
              />
            ))}
            {/*
              A text box, not a single line. Enter now does what Enter should
              do in a box — start a new line — so one update with four points
              is one note instead of four. The button submits; ⌘/Ctrl+Enter
              does too, for anyone typing at a keyboard.
            */}
            <div className="flex flex-col gap-2">
              <MentionTextarea
                value={noteBody}
                onValueChange={setNoteBody}
                roster={roster}
                onSubmit={submitNote}
                placeholder="What happened? Type @ to name someone."
                aria-label="Add a note"
                rows={3}
                className="min-h-[104px] resize-y"
              />
              <div className="flex items-center justify-between gap-3">
                <span
                  aria-live="polite"
                  className={cn(
                    "text-[15px] leading-5 font-bold tabular-nums",
                    noteLength >= NOTE_MAX
                      ? "text-danger"
                      : noteLength > NOTE_LONG
                        ? "text-accent"
                        : "text-sub"
                  )}
                >
                  {/* Only worth showing once it is close to mattering. */}
                  {noteLength > NOTE_LONG ? `${noteLength}/${NOTE_MAX}` : ""}
                </span>
                <Button
                  variant="secondary"
                  size="md"
                  className="w-auto shrink-0 px-5"
                  disabled={isPending || !noteBody.trim() || noteLength > NOTE_MAX}
                  onClick={submitNote}
                >
                  Add note
                </Button>
              </div>
            </div>
            {noteError && <p className="text-[16px] leading-[22px] font-bold text-danger">{noteError}</p>}
          </div>

          {/*
            §6 — Task Activity: the record of what changed, not what was said.

            Collapsed to the single most recent entry. The full history is
            worth keeping and worth reading occasionally; it is not worth
            eight lines of every task, every time it is opened.
          */}
          {events.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="text-section-heading">Task Activity</div>
              <div className="text-[16px] leading-[22px] font-bold text-brand">
                {activityOpen ? "All updates" : "Latest"}
              </div>
              {/*
                Newest first, both folded and open. Folded it has to be the
                latest — that is what "Latest" means — and opening it should
                extend the list downwards from there rather than turning it
                upside down. Reading up from the bottom to find what just
                happened is the thing this section was collapsed to avoid.
              */}
              {(activityOpen ? newestFirst : newestFirst.slice(0, 1)).map((item) => (
                <div
                  key={item.event.id}
                  className="flex items-baseline gap-2.5 px-1 text-[16px] leading-6 text-sub"
                >
                  <GitCommitHorizontal aria-hidden className="size-4 shrink-0 translate-y-0.5" />
                  <span className="min-w-0 text-pretty">
                    {item.label}
                    <span className="text-timestamp"> · {formatTimestamp(item.event.created_at)}</span>
                  </span>
                </div>
              ))}
              {/*
                Only offered when there is genuinely more than the one line
                already on screen — a "Read more" that reveals nothing is
                worse than no control at all.
              */}
              {events.length > 1 && (
                <button
                  type="button"
                  onClick={() => setActivityOpen((open) => !open)}
                  className="self-start text-[16px] leading-[22px] font-bold text-brand cursor-pointer bg-transparent border-none p-0"
                >
                  {activityOpen ? "Show less" : "Read more....."}
                </button>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 text-timestamp text-sub">
            <span>Updated {formatTimestamp(task.updated_at)}</span>
          </div>

          <div className="flex flex-col gap-3">
            {/*
              The Complete status green rather than brand red, but its dark
              shade, not the chip's pale background. A pale fill on a
              full-width primary button leaves it lighter than the
              red-outlined Delete beneath it, which reads as disabled.

              Inline for the same reason the status pills are: these are hex
              values in constants.ts, and tailwind-merge drops classes built
              from names it does not know.
            */}
            <Button
              onClick={() => onSetStatus(task.status === "complete" ? "not_started" : "complete")}
              style={
                task.status === "complete"
                  ? undefined
                  : {
                      backgroundColor: STATUSES.complete.border,
                      borderColor: STATUSES.complete.border,
                      /*
                        The label too, not only the ground. In dark mode the
                        primary button is deliberately inverted — a white
                        button with a brand-red label — so overriding the
                        background alone left red text on dark green. White is
                        10:1 on this fill in both themes.
                      */
                      color: "#ffffff",
                    }
              }
            >
              {task.status === "complete" ? "Mark not complete" : "Mark complete"}
            </Button>
            {/*
              Hidden rather than disabled for a non-creator: a greyed-out
              button invites a tap and explains nothing. What an assignee can
              still change — status, links, notes, their own reminder — is
              all present above, so nothing here reads as missing.
            */}
            {canEdit && (
              <Link href={`/tasks/${task.id}/edit`} className="block">
                <Button variant="secondary" className="w-full">
                  <Pencil aria-hidden className="size-5" />
                  Edit task
                </Button>
              </Link>
            )}
            {/*
              Only the creator deletes. Everyone else asks — and the label
              says so, rather than offering an action that would be refused.
            */}
            <Button variant="destructive" onClick={onRequestDelete} disabled={pending}>
              <Trash2 aria-hidden className="size-5" />
              {pending ? "Delete already requested" : canDecide ? "Delete task" : "Request delete"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Reminders on a task.
 *
 * What you see depends on who you are, and that is the whole feature:
 *
 *   Anybody assigned  — their own reminder, and a way to set or change it.
 *   The creator       — every assignee's, with set / change / clear / nudge,
 *                       because chasing people is what the section is for.
 *
 * Nothing here decides permission. RLS on task_reminders already refuses to
 * hand a non-creator anybody else's row, and the four functions in 0034
 * refuse the writes; this arranges what came back.
 */
function TaskReminders({
  task,
  meId,
  canManageAll,
}: {
  task: TaskWithRelations;
  meId: string;
  canManageAll: boolean;
}) {
  const [editingFor, setEditingFor] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  /*
    The creator sees a row per assignee, whether or not they have a reminder
    — "none set" is the information they came for. Everyone else sees only
    themselves, and only if they are actually on the task.
  */
  const people = canManageAll
    ? task.assignees
    : task.assignees.filter((person) => person.id === meId);

  if (people.length === 0) return null;

  function open(memberId: string, existing: TaskReminder | null) {
    setError(null);
    setEditingFor(memberId);
    setDate(existing ? toZonedDateInput(existing.remind_at) : "");
    setTime(existing ? toZonedTimeInput(existing.remind_at) : "09:00");
  }

  function save(memberId: string) {
    if (!date) {
      setError("Pick a day for the reminder.");
      return;
    }
    setError(null);
    startTransition(async () => {
      // Chicago wall-clock, never the browser's zone — the same rule the
      // due date has always followed.
      const result = await setTaskReminder({
        taskId: task.id,
        memberId,
        remindAt: zonedWallClockToIso(date, time || "09:00"),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditingFor(null);
    });
  }

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-section-heading">Reminders</div>

      {people.map((person) => {
        const reminder = task.reminders.find((r) => r.member_id === person.id) ?? null;
        const state = reminderState(reminder);
        const mine = person.id === meId;
        const editing = editingFor === person.id;

        return (
          <div key={person.id} className="flex flex-col gap-1.5 rounded-2xl border-[1.5px] border-border bg-card p-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Avatar initials={person.initials} color={person.color} size={24} />
              <span className="min-w-0 break-words text-[18px] leading-7 font-bold text-fg">
                {mine ? "You" : person.display_name}
              </span>
            </div>

            {/*
              Red once it has fired and nobody has dealt with it, amber while
              it is still ahead, struck through and muted once handled — the
              same three tones reminderState has always meant, so this section
              reads in the app's existing language rather than a new one.

              Red is also the creator's cue: it is the only thing on the card
              that says somebody needs chasing.
            */}
            <div
              className={cn(
                "text-[16px] leading-6",
                state === "due" && "font-bold text-danger",
                state === "upcoming" && "text-accent",
                state === "handled" && "text-sub line-through",
                state === "none" && "text-sub"
              )}
            >
              {reminder ? formatTimestamp(reminder.remind_at) : "None set"}
              {state === "due" && " — not dealt with"}
            </div>

            {editing ? (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <input
                    type="date"
                    aria-label="Reminder date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                    className="h-12 min-w-0 flex-1 rounded-xl border-[1.5px] border-border bg-card px-3 text-[16px] text-fg tabular-nums"
                  />
                  <input
                    type="time"
                    aria-label="Reminder time"
                    value={time}
                    onChange={(event) => setTime(event.target.value)}
                    className="h-12 min-w-0 flex-1 rounded-xl border-[1.5px] border-border bg-card px-3 text-[16px] text-fg tabular-nums"
                  />
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Button variant="ghost" size="md" className="w-auto px-3" disabled={isPending} onClick={() => setEditingFor(null)}>
                    Cancel
                  </Button>
                  <Button variant="secondary" size="md" className="w-auto px-3" disabled={isPending} onClick={() => save(person.id)}>
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <button
                  type="button"
                  onClick={() => open(person.id, reminder)}
                  disabled={isPending}
                  className="text-[16px] leading-[22px] font-bold text-brand cursor-pointer bg-transparent border-none p-0"
                >
                  {reminder ? "Change" : "Set a reminder"}
                </button>

                {reminder && (
                  <button
                    type="button"
                    onClick={() =>
                      run(() => setReminderDismissed(task.id, reminder.id, reminder.dismissed_at === null))
                    }
                    disabled={isPending}
                    className="text-[16px] leading-[22px] font-bold text-brand cursor-pointer bg-transparent border-none p-0"
                  >
                    {reminder.dismissed_at ? "Un-dismiss" : "Mark handled"}
                  </button>
                )}

                {/*
                  Nudge is the creator's alone, and only on a reminder that
                  has fired and gone undealt-with. Anywhere else there is
                  nothing to chase, so the button is not drawn rather than
                  drawn and refused.
                */}
                {canManageAll && !mine && state === "due" && (
                  <button
                    type="button"
                    onClick={() => run(() => nudgeTaskReminder(task.id, reminder!.id))}
                    disabled={isPending}
                    className="text-[16px] leading-[22px] font-bold text-danger cursor-pointer bg-transparent border-none p-0"
                  >
                    Nudge
                  </button>
                )}

                {reminder && (
                  <button
                    type="button"
                    onClick={() => run(() => clearTaskReminder(task.id, reminder.id))}
                    disabled={isPending}
                    className="text-[16px] leading-[22px] font-bold text-sub cursor-pointer bg-transparent border-none p-0"
                  >
                    Remove
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {error && <p className="text-[16px] leading-[22px] font-bold text-danger">{error}</p>}
    </div>
  );
}

/**
 * The links on a task, with the controls to change them.
 *
 * A section rather than a few lines inside the banner because it holds
 * state — an open form, a pending save, an error — and folding that into a
 * component already this size would make both harder to read.
 *
 * Deliberately not gated on who created the task. Adding the document a
 * task refers to is part of doing the work, not part of owning it.
 */
function TaskLinks({ taskId, links }: { taskId: string; links: TaskLink[] }) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const full = links.length >= MAX_TASK_LINKS;

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await addTaskLink(taskId, { label: label.trim(), url: url.trim() });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setLabel("");
      setUrl("");
      setAdding(false);
    });
  }

  function remove(linkId: string) {
    setError(null);
    startTransition(async () => {
      const result = await removeTaskLink(taskId, linkId);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-section-heading">
        {links.length === 1 ? "External Link" : "External Links"}
      </div>

      {links.length === 0 && !adding && (
        <p className="text-[18px] leading-7 text-sub">Nothing linked yet.</p>
      )}

      <ul className="flex flex-col gap-1.5">
        {links.map((link) => (
          <li key={link.id} className="flex min-w-0 items-baseline gap-2">
            <LinkIcon aria-hidden className="size-4 shrink-0 translate-y-0.5 text-sub" />
            {/*
              noreferrer alongside noopener: the first stops the opened page
              reaching back through window.opener, the second keeps the
              task's URL out of its referer header.
            */}
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              title={link.url}
              className="min-w-0 flex-1 truncate text-[18px] leading-7 font-bold text-link underline underline-offset-2"
            >
              {link.label}
            </a>
            <button
              type="button"
              onClick={() => remove(link.id)}
              disabled={isPending}
              aria-label={`Remove ${link.label}`}
              className="shrink-0 px-1 text-[16px] leading-[22px] font-bold text-danger cursor-pointer bg-transparent border-none"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      {adding ? (
        <div className="flex flex-col gap-2 rounded-2xl border-[1.5px] border-border bg-card p-3">
          <Input
            placeholder="Name — e.g. JV Exec Summary"
            maxLength={TASK_LINK_LABEL_MAX}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
          <Input
            placeholder="https://…"
            inputMode="url"
            maxLength={2048}
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="md"
              className="w-auto px-4"
              disabled={isPending}
              onClick={() => {
                setAdding(false);
                setLabel("");
                setUrl("");
                setError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="secondary"
              size="md"
              className="w-auto px-4"
              disabled={isPending || !label.trim() || !url.trim()}
              onClick={submit}
            >
              Save link
            </Button>
          </div>
        </div>
      ) : full ? (
        <p className="text-[16px] leading-[22px] text-sub">
          Three links is the most a task can carry. Remove one to add another.
        </p>
      ) : (
        <Button variant="secondary" size="md" className="w-auto self-start px-4" onClick={() => setAdding(true)}>
          <LinkIcon aria-hidden className="size-5" />
          Add link
        </Button>
      )}

      {error && <p className="text-[16px] leading-[22px] font-bold text-danger">{error}</p>}
    </div>
  );
}

/**
 * One note, plus its replies.
 *
 * Three affordances, all author- or reader-scoped: the author can edit their
 * own text, anyone can reply, and anyone can like. A note written by someone
 * else since you last opened the task is marked unread — automatically, with
 * nothing to press.
 */
function NoteRow({
  note,
  taskId,
  meId,
  roster,
  lastReadAt,
  isReply = false,
}: {
  note: TaskNote;
  taskId: string;
  meId: string;
  roster: MemberSummary[];
  lastReadAt: string | null;
  isReply?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => toDisplayBody(note.body));
  const [replying, setReplying] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const iLiked = note.likedByMemberIds.includes(meId);
  const mine = note.member?.id === meId;
  const unread = !mine && (lastReadAt === null || note.created_at > lastReadAt);

  const likers = note.likedByMemberIds
    .map((id) => roster.find((m) => m.id === id))
    .filter((m): m is MemberSummary => !!m);

  function saveEdit() {
    const typed = draft.trim();
    const body = toStorageBody(typed, roster);
    // Compared in storage form: the two differ by exactly the ids, so a note
    // reopened and closed untouched must not count as an edit.
    if (!typed || body === note.body) {
      setEditing(false);
      setDraft(toDisplayBody(note.body));
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await editNote({ noteId: note.id, body });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(false);
    });
  }

  function confirmDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteNote(note.id);
      if (!result.ok) {
        setError(result.error);
        setConfirmingDelete(false);
      }
    });
  }

  function submitReply() {
    const typed = replyBody.trim();
    if (!typed) return;
    setError(null);
    const body = toStorageBody(typed, roster);
    startTransition(async () => {
      const result = await addNote({ taskId, body, parentNoteId: note.id });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setReplyBody("");
      setReplying(false);
    });
  }

  /*
    A removed note only reaches this component when replies survive under it.
    Leaving a line where it was keeps those replies from appearing to answer
    nothing — and it says the note was removed rather than pretending the
    conversation always looked this way.
  */
  if (note.deleted) {
    return (
      <div className={cn("flex flex-col gap-2", isReply && "ml-4 border-l-[1.5px] border-border pl-3")}>
        <p className="px-1 text-[16px] leading-6 italic text-sub">Note deleted by its author.</p>
        {note.replies.map((reply) => (
          <NoteRow
            key={reply.id}
            note={reply}
            taskId={taskId}
            meId={meId}
            roster={roster}
            lastReadAt={lastReadAt}
            isReply
          />
        ))}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", isReply && "ml-4 border-l-[1.5px] border-border pl-3")}>
      <div
        className={cn(
          "flex flex-col gap-2 rounded-2xl border-[1.5px] p-4",
          // The unread marker is a border, not a badge: it reads at a glance
          // down a column of notes without adding another thing to look at.
          unread ? "border-brand bg-card" : "border-border bg-bg"
        )}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-timestamp text-sub">
          <span>{note.member?.display_name ?? "Someone"}</span>
          <span aria-hidden>·</span>
          <span>{formatTimestamp(note.created_at)}</span>
          {note.edited_at && (
            <span title={`Edited ${formatTimestamp(note.edited_at)}`} className="italic">
              · edited
            </span>
          )}
          {unread && <span className="font-bold text-brand">· new</span>}
        </div>

        {editing ? (
          <div className="flex flex-col gap-2">
            <MentionTextarea
              value={draft}
              onValueChange={setDraft}
              roster={roster}
              onSubmit={saveEdit}
              aria-label="Edit note"
              rows={3}
              className="min-h-[96px] resize-y"
            />
            <div className="flex flex-wrap gap-2">
              <Button size="md" className="w-auto px-4" disabled={isPending || !draft.trim()} onClick={saveEdit}>
                Save
              </Button>
              <Button
                variant="secondary"
                size="md"
                className="w-auto px-4"
                disabled={isPending}
                onClick={() => {
                  setEditing(false);
                  setDraft(toDisplayBody(note.body));
                  setError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <NoteBody body={note.body} className="text-[18px] leading-7 text-fg whitespace-pre-wrap break-words" />
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                await toggleNoteLike(note.id);
              })
            }
            aria-pressed={iLiked}
            title={likers.length > 0 ? `Liked by ${likers.map((m) => m.display_name).join(", ")}` : "Like this note"}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border-[1.5px] px-3 py-1.5",
              "text-[15px] leading-5 font-bold cursor-pointer transition-transform duration-150",
              "active:scale-[0.97] disabled:opacity-60",
              iLiked ? "border-brand bg-brand text-on-brand" : "border-border bg-card text-sub"
            )}
          >
            <ThumbsUp aria-hidden className="size-3.5" fill={iLiked ? "currentColor" : "none"} />
            {/*
              Who liked it, not just how many — the point of a like here is
              knowing which teammate saw it and agreed.
            */}
            <span className="sr-only">{iLiked ? "Unlike this note" : "Like this note"}</span>
            {likers.length > 0 ? likers.length : "Like"}
          </button>

          {likers.length > 0 && (
            <span className="flex items-center gap-1">
              {likers.map((m) => (
                <Avatar key={m.id} initials={m.initials} color={m.color} size={22} />
              ))}
            </span>
          )}

          {mine && !editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-1.5 text-[15px] leading-5 font-bold text-sub cursor-pointer hover:text-fg"
            >
              <Pencil aria-hidden className="size-3.5" />
              Edit
            </button>
          )}

          {mine && !editing && !confirmingDelete && (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-1.5 text-[15px] leading-5 font-bold text-sub cursor-pointer hover:text-danger"
            >
              <Trash2 aria-hidden className="size-3.5" />
              Delete
            </button>
          )}

          {/*
            Confirmed in place rather than with an undo toast: on a phone a
            toast is easy to miss, and this way nothing is gone until the
            second, clearly-labelled tap.
          */}
          {confirmingDelete && (
            <span className="inline-flex flex-wrap items-center gap-2 text-[15px] leading-5">
              <span className="font-bold text-fg">Delete this note?</span>
              <button
                type="button"
                disabled={isPending}
                onClick={confirmDelete}
                className="rounded-full border-[1.5px] border-danger px-3 py-1 font-bold text-danger cursor-pointer disabled:opacity-60"
              >
                Delete
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => setConfirmingDelete(false)}
                className="rounded-full border-[1.5px] border-border px-3 py-1 font-bold text-sub cursor-pointer disabled:opacity-60"
              >
                Keep
              </button>
            </span>
          )}

          {/* One level only, so a reply carries no reply button of its own. */}
          {!isReply && !replying && (
            <button
              type="button"
              onClick={() => setReplying(true)}
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-1.5 text-[15px] leading-5 font-bold text-sub cursor-pointer hover:text-fg"
            >
              <MessageSquare aria-hidden className="size-3.5" />
              Reply
            </button>
          )}
        </div>

        {error && <p className="text-[16px] leading-[22px] font-bold text-danger">{error}</p>}
      </div>

      {note.replies.map((reply) => (
        <NoteRow
          key={reply.id}
          note={reply}
          taskId={taskId}
          meId={meId}
          roster={roster}
          lastReadAt={lastReadAt}
          isReply
        />
      ))}

      {replying && (
        <div className="ml-4 flex flex-col gap-2 border-l-[1.5px] border-border pl-3">
          <MentionTextarea
            value={replyBody}
            onValueChange={setReplyBody}
            roster={roster}
            onSubmit={submitReply}
            placeholder={`Reply to ${note.member?.display_name ?? "this note"}…`}
            aria-label="Write a reply"
            rows={2}
            className="min-h-[80px] resize-y"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="md"
              className="w-auto px-4"
              disabled={isPending || !replyBody.trim()}
              onClick={submitReply}
            >
              Reply
            </Button>
            <Button
              variant="secondary"
              size="md"
              className="w-auto px-4"
              disabled={isPending}
              onClick={() => {
                setReplying(false);
                setReplyBody("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
