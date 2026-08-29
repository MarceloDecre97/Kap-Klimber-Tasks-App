"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Bell, BellOff, ChevronDown, Hourglass, Pencil, Send, ThumbsUp, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { PRIORITIES, STATUSES, STATUS_ORDER } from "@/lib/constants";
import { reminderState } from "@/lib/reminders";
import { daysSince } from "@/lib/tasks-view";
import { cn, formatCalendarDate, formatDateGroup, formatTimestamp } from "@/lib/utils";
import { addNote, toggleNoteAck } from "@/app/tasks/actions";
import type { TaskNote, TaskWithRelations } from "@/lib/data/tasks";
import type { TaskStatus } from "@/lib/supabase/database.types";

/**
 * Past this length a title steps down one size. Character count is a proxy
 * for line count — imprecise, but free to compute and impossible to make
 * flicker, and the two-line clamp is what actually bounds the card.
 */
const COMPACT_TITLE_CHARS = 55;

export function TaskPill({
  task,
  meId,
  expanded,
  onToggleExpand,
  onSetStatus,
  onRequestDelete,
  onToggleReminder,
  lastActivityAt,
}: {
  task: TaskWithRelations;
  meId: string;
  expanded: boolean;
  onToggleExpand: () => void;
  onSetStatus: (status: TaskStatus) => void;
  onRequestDelete: () => void;
  /** Omitted where the reminder should render read-only. */
  onToggleReminder?: () => void;
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
          {task.due_date && <span className="text-accent">Due For {formatCalendarDate(task.due_date)}</span>}
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
            <div className="text-section-heading">Notes</div>
            {task.notes.length === 0 && <p className="text-[18px] leading-7 text-sub">No notes yet.</p>}
            {task.notes.map((note) => (
              <NoteRow key={note.id} note={note} meId={meId} />
            ))}
            <div className="flex min-w-0 gap-2">
              <Input
                value={noteBody}
                onChange={(event) => setNoteBody(event.target.value)}
                placeholder="What happened?"
                aria-label="Add a note"
                className="min-w-0 flex-1"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitNote();
                  }
                }}
              />
              <Button
                variant="secondary"
                className="w-14 shrink-0 px-0"
                aria-label="Add note"
                disabled={isPending || !noteBody.trim()}
                onClick={submitNote}
              >
                <Send aria-hidden className="size-5" />
              </Button>
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
            <Button variant="destructive" onClick={onRequestDelete}>
              <Trash2 aria-hidden className="size-5" />
              Delete task
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function NoteRow({ note, meId }: { note: TaskNote; meId: string }) {
  const [isPending, startTransition] = useTransition();
  const iAcked = note.ackedByMemberIds.includes(meId);
  const count = note.ackedByMemberIds.length;

  return (
    <div className="flex flex-col gap-2 rounded-2xl border-[1.5px] border-border bg-bg p-4">
      <div className="text-timestamp text-sub">
        {note.member?.display_name ?? "Someone"} · {formatTimestamp(note.created_at)}
      </div>
      <div className="text-[18px] leading-7 text-fg text-pretty">{note.body}</div>
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await toggleNoteAck(note.id);
          })
        }
        aria-pressed={iAcked}
        className={cn(
          "inline-flex w-fit items-center gap-1.5 self-start rounded-full border-[1.5px] px-3 py-1.5 text-[15px] leading-5 font-bold cursor-pointer transition-transform duration-150 active:scale-[0.97] disabled:opacity-60",
          iAcked ? "border-prim bg-prim text-on-prim" : "border-border bg-card text-sub"
        )}
      >
        <ThumbsUp aria-hidden className="size-3.5" fill={iAcked ? "currentColor" : "none"} />
        {count > 0 ? count : "Seen"}
      </button>
    </div>
  );
}
