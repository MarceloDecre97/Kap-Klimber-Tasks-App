"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Bell, ChevronDown, Hourglass, Pencil, Send, ThumbsUp, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { PRIORITIES, STATUSES, STATUS_ORDER } from "@/lib/constants";
import { daysSince } from "@/lib/tasks-view";
import { cn, formatDateGroup, formatReminder, formatTimestamp } from "@/lib/utils";
import { addNote, toggleNoteAck } from "@/app/tasks/actions";
import type { TaskNote, TaskWithRelations } from "@/lib/data/tasks";
import type { TaskStatus } from "@/lib/supabase/database.types";

export function TaskPill({
  task,
  meId,
  timeZone,
  expanded,
  onToggleExpand,
  onSetStatus,
  onRequestDelete,
}: {
  task: TaskWithRelations;
  meId: string;
  timeZone?: string;
  expanded: boolean;
  onToggleExpand: () => void;
  onSetStatus: (status: TaskStatus) => void;
  onRequestDelete: () => void;
}) {
  const priority = PRIORITIES[task.priority];
  const status = STATUSES[task.status];
  const [noteBody, setNoteBody] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
        className="flex w-full min-h-14 items-start gap-3 border-none bg-transparent p-0 text-left cursor-pointer"
      >
        <span className="text-card-title flex-1 text-fg text-pretty">{task.title}</span>
        <div className="flex shrink-0 flex-col items-end gap-0.5 pt-1 text-[12px] leading-[14px] font-bold text-sub tabular-nums whitespace-nowrap">
          <span>Created On {formatDateGroup(task.created_at, timeZone)}</span>
          {task.reminder_at && <span className="text-accent">Due For {formatDateGroup(task.reminder_at, timeZone)}</span>}
        </div>
        <ChevronDown
          aria-hidden
          className={`mt-0.5 size-5 shrink-0 text-sub transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}
        />
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
      </div>

      {expanded && (
        <div className="flex flex-col gap-4 border-t-[1.5px] border-border pt-3">
          <dl className="grid grid-cols-[104px_1fr] gap-x-3 gap-y-2 items-baseline">
            <dt className="text-[16px] leading-7 font-bold text-sub">Assigned to</dt>
            <dd className="flex flex-wrap items-center gap-2">
              {task.assignees.map((person) => (
                <span key={person.id} className="inline-flex items-center gap-1.5">
                  <Avatar initials={person.initials} color={person.color} size={24} />
                  <span className="text-[18px] leading-7 text-fg">{person.display_name}</span>
                </span>
              ))}
            </dd>
            <dt className="text-[16px] leading-7 font-bold text-sub">Category</dt>
            <dd className="text-[18px] leading-7 text-fg">{task.category?.label ?? "None"}</dd>
          </dl>

          {task.reminder_at && (
            <div className="flex items-center gap-2 text-[18px] leading-7 font-bold text-accent">
              <Bell aria-hidden className="size-5" />
              {formatReminder(task.reminder_at, timeZone)}
            </div>
          )}

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
