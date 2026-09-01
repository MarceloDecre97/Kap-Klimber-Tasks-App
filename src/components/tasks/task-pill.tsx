"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Bell,
  BellOff,
  ChevronDown,
  GitCommitHorizontal,
  Hourglass,
  MessageSquare,
  Pencil,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { MentionTextarea } from "@/components/tasks/mention-textarea";
import { NoteBody } from "@/components/tasks/note-body";
import { PRIORITIES, STATUSES, STATUS_ORDER } from "@/lib/constants";
import { visibleLength } from "@/lib/mentions";
import { reminderState } from "@/lib/reminders";
import { buildTimeline } from "@/lib/task-timeline";
import { countNotes, daysSince } from "@/lib/tasks-view";
import {
  cn,
  daysBetweenKeys,
  formatCalendarDate,
  formatDateGroup,
  formatTimestamp,
  zonedDateKey,
} from "@/lib/utils";
import { addNote, deleteNote, editNote, toggleNoteLike } from "@/app/tasks/actions";
import type { MemberSummary, TaskNote, TaskWithRelations } from "@/lib/data/tasks";
import type { TaskStatus } from "@/lib/supabase/database.types";

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
}) {
  const priority = PRIORITIES[task.priority];
  const status = STATUSES[task.status];
  const [noteBody, setNoteBody] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Amber while a reminder is still ahead of you, red once it has fired and
  // nobody has dealt with it, muted once handled.
  const rState = reminderState(task);
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
  const canDecide = task.created_by === meId || !creatorActive;
  const pending = task.deletion_requested_at !== null;
  const requester = roster.find((m) => m.id === task.deletion_requested_by) ?? null;
  const creator = roster.find((m) => m.id === task.created_by) ?? null;
  const iRequested = task.deletion_requested_by === meId;

  const timeline = buildTimeline(task);
  const noteCount = countNotes(task.notes);
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
    const body = noteBody.trim();
    if (!body) return;
    setNoteError(null);
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
              "flex-1 text-fg text-pretty",
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
        {task.reminder_at && (
          <button
            type="button"
            onClick={() => onToggleReminder?.()}
            disabled={!onToggleReminder || isPending}
            aria-pressed={dismissed}
            title={
              dismissed
                ? `Reminder handled — ${formatTimestamp(task.reminder_at)}. Click to un-dismiss.`
                : `Reminder set for ${formatTimestamp(task.reminder_at)}. Click once handled.`
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
            <span className={cn(dismissed && "line-through")}>{formatTimestamp(task.reminder_at)}</span>
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
            {task.due_date && (
              <div className="flex min-w-0 flex-col gap-0.5 sm:contents">
                <dt className="text-[16px] leading-7 font-bold text-sub">Due date</dt>
                <dd className="min-w-0 break-words text-[18px] leading-7 text-fg">
                  {formatCalendarDate(task.due_date)}
                </dd>
              </div>
            )}
            {task.reminder_at && (
              <div className="flex min-w-0 flex-col gap-0.5 sm:contents">
                <dt className="text-[16px] leading-7 font-bold text-sub">Reminder</dt>
                <dd
                  className={cn(
                    "min-w-0 break-words text-[18px] leading-7",
                    dismissed ? "text-sub line-through" : "text-fg"
                  )}
                >
                  {formatTimestamp(task.reminder_at)}
                </dd>
              </div>
            )}
          </dl>

          {task.description && <p className="text-[18px] leading-7 text-fg text-pretty">{task.description}</p>}

          <div className="flex flex-col gap-2">
            <div className="text-field-label">Move status on</div>
            <div className="flex flex-wrap gap-2">
              {STATUS_ORDER.filter((value) => value !== task.status && value !== "complete").map((value) => {
                const spec = STATUSES[value];
                const Icon = spec.icon;
                return (
                  <Chip
                    key={value}
                    showCheckWhenSelected={false}
                    icon={<Icon aria-hidden className="size-4" />}
                    onClick={() => onSetStatus(value)}
                  >
                    {spec.label}
                  </Chip>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="text-section-heading">Activity</div>
            {/*
              Notes and status changes in one chronological list. Kept apart,
              a note saying "blocked on the supplier" read as news when it was
              really a consequence of the move to Waiting an hour earlier.
            */}
            {timeline.length === 0 && (
              <p className="text-[18px] leading-7 text-sub">Nothing here yet — add the first note.</p>
            )}
            {timeline.map((item) =>
              item.kind === "note" ? (
                <NoteRow
                  key={item.note.id}
                  note={item.note}
                  taskId={task.id}
                  meId={meId}
                  roster={roster}
                  lastReadAt={task.last_read_at}
                />
              ) : (
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
              )
            )}
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

          <div className="flex items-center justify-between gap-3 text-timestamp text-sub">
            <span>Updated {formatTimestamp(task.updated_at)}</span>
          </div>

          <div className="flex flex-col gap-3">
            <Button onClick={() => onSetStatus(task.status === "complete" ? "not_started" : "complete")}>
              {task.status === "complete" ? "Mark not complete" : "Mark complete"}
            </Button>
            <Link href={`/tasks/${task.id}/edit`} className="block">
              <Button variant="secondary" className="w-full">
                <Pencil aria-hidden className="size-5" />
                Edit task
              </Button>
            </Link>
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
  const [draft, setDraft] = useState(note.body);
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
    const body = draft.trim();
    if (!body || body === note.body) {
      setEditing(false);
      setDraft(note.body);
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
    const body = replyBody.trim();
    if (!body) return;
    setError(null);
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
                  setDraft(note.body);
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
