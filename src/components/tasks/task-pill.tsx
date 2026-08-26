"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Bell, ChevronDown, Pencil, Send, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { PRIORITIES, STATUSES, STATUS_ORDER } from "@/lib/constants";
import { formatReminder, formatTimestamp } from "@/lib/utils";
import { addNote } from "@/app/tasks/actions";
import type { TaskWithRelations } from "@/lib/data/tasks";
import type { TaskStatus } from "@/lib/supabase/database.types";

export function TaskPill({
  task,
  expanded,
  onToggleExpand,
  onSetStatus,
  onRequestDelete,
}: {
  task: TaskWithRelations;
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
        <ChevronDown
          aria-hidden
          className={`mt-0.5 size-5 shrink-0 text-sub transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      <div className="flex items-center gap-2 overflow-hidden">
        <Badge spec={priority} />
        <Badge spec={status} />
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
              {formatReminder(task.reminder_at)}
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
              <div key={note.id} className="flex flex-col gap-1 rounded-2xl border-[1.5px] border-border bg-bg p-4">
                <div className="text-timestamp text-sub">
                  {note.member?.display_name ?? "Someone"} · {formatTimestamp(note.created_at)}
                </div>
                <div className="text-[18px] leading-7 text-fg text-pretty">{note.body}</div>
              </div>
            ))}
            <div className="flex gap-2">
              <Input
                value={noteBody}
                onChange={(event) => setNoteBody(event.target.value)}
                placeholder="What happened?"
                aria-label="Add a note"
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
