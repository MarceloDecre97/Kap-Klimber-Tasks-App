import { STATUSES } from "@/lib/constants";
import type { TaskEvent, TaskNote, TaskWithRelations } from "@/lib/data/tasks";
import type { TaskStatus } from "@/lib/supabase/database.types";
import { formatCalendarDate, formatTimestamp } from "@/lib/utils";

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
    case "reminder": {
      // Unlike a due date, a reminder is a specific moment, so it prints with
      // its time — "Sep 5" would be useless for something meant to fire at 3pm.
      if (!event.to_value) return `${who} removed the reminder`;
      const to = formatTimestamp(event.to_value);
      if (!event.from_value) return `${who} set a reminder for ${to}`;
      return `${who} moved the reminder from ${formatTimestamp(event.from_value)} to ${to}`;
    }
    /*
      The deletion story, kept on the task rather than only in the
      notifications that announced it — a notification gets dismissed, and
      then nobody can say why something was or was not removed.
    */
    case "delete_requested":
      return event.to_value
        ? `${who} asked to delete this — ${event.to_value}`
        : `${who} asked to delete this`;
    case "delete_denied":
      // "Kept this task" was too soft: somebody asked for something and was
      // told no, and the log is where that answer has to survive.
      return event.to_value
        ? `${who} declined the request to delete this — ${event.to_value}`
        : `${who} declined the request to delete this`;
    case "delete_cancelled":
      return `${who} withdrew the request to delete this`;
    /*
      Deleting your own task and approving somebody else's request are the
      same row with one difference: the request carried a reason, and
      delete_own_task has nothing to put there. So a to_value here means this
      was an answer to an ask, and saying so is the whole point — otherwise
      the requester reads "Keith deleted this task" and never learns their
      request was why.
    */
    case "deleted":
      return event.to_value
        ? `${who} approved the request and deleted this — ${event.to_value}`
        : `${who} deleted this task`;
    case "restored":
      return `${who} brought this task back`;
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
