import { STATUSES } from "@/lib/constants";
import type { TaskEvent, TaskNote, TaskWithRelations } from "@/lib/data/tasks";
import type { TaskStatus } from "@/lib/supabase/database.types";
import { formatCalendarDate } from "@/lib/utils";

/**
 * A task's history had been kept in two places that never met: notes, which
 * people wrote, and status changes, which only ever existed as the task's
 * current state. Reading "we're blocked on the supplier" without seeing that
 * the task moved to Waiting an hour earlier makes the note look like news
 * when it was a consequence.
 *
 * This merges the two into one chronological list. Notes keep their replies;
 * events are single lines with no interaction of their own.
 */
export type TimelineItem =
  | { kind: "note"; at: string; note: TaskNote }
  | { kind: "event"; at: string; event: TaskEvent; label: string };

function statusLabel(value: string | null): string {
  if (!value) return "nothing";
  return STATUSES[value as TaskStatus]?.label ?? value;
}

/**
 * Past tense and specific, because this sits inside a conversation: it should
 * read as another line in the thread, not as a log entry someone pasted in.
 */
export function describeEvent(event: TaskEvent): string | null {
  const who = event.member?.display_name ?? "Someone";

  switch (event.kind) {
    case "created":
      return `${who} created this task`;
    case "status":
      return `${who} moved this to ${statusLabel(event.to_value)}`;
    case "due_date": {
      if (!event.to_value) return `${who} removed the due date`;
      const to = formatCalendarDate(event.to_value);
      // Naming the old date is what makes a slipping deadline visible: three
      // of these in a row is the thing worth noticing, and "changed the due
      // date" alone would hide it.
      if (!event.from_value) return `${who} set the due date to ${to}`;
      return `${who} moved the due date from ${formatCalendarDate(event.from_value)} to ${to}`;
    }
    default:
      return null;
  }
}

/**
 * One chronological history. Ties resolve to the event first: a status change
 * and the note explaining it, saved in the same second, read correctly in
 * that order.
 */
export function buildTimeline(task: TaskWithRelations): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const event of task.events) {
    const label = describeEvent(event);
    if (label) items.push({ kind: "event", at: event.created_at, event, label });
  }
  for (const note of task.notes) {
    items.push({ kind: "note", at: note.created_at, note });
  }

  return items.sort((a, b) => {
    if (a.at !== b.at) return a.at.localeCompare(b.at);
    if (a.kind === b.kind) return 0;
    return a.kind === "event" ? -1 : 1;
  });
}
