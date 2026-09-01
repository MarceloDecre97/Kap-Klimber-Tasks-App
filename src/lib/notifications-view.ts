import { STATUSES } from "@/lib/constants";
import { stripMentions } from "@/lib/mentions";
import { formatCalendarDate, formatTimestamp } from "@/lib/utils";
import type { NotificationItem } from "@/lib/data/notifications";
import type { TaskStatus } from "@/lib/supabase/database.types";

/**
 * The one place a notification becomes English.
 *
 * Nothing is worded in the database. Three consumers have to say the same
 * thing about the same row — the inbox, the push payload, and the email —
 * and the moment the wording lives in a trigger, the status labels from
 * constants.ts exist in two places and drift. So the table stores who, what
 * and which task, and this renders it.
 *
 * `headline` is a whole sentence naming the task, because a push notification
 * arrives with no surrounding page to explain it. `detail` is the second line
 * where there is one: it should always be safe to drop.
 */
export interface NotificationCopy {
  headline: string;
  detail: string | null;
}

/** How much of a note survives into a notification before it is cut. */
const EXCERPT_LIMIT = 140;

function statusLabel(value: unknown): string {
  if (typeof value !== "string") return "nothing";
  return STATUSES[value as TaskStatus]?.label ?? value;
}

function reasonOf(item: NotificationItem): string | null {
  const reason = item.payload.reason;
  return typeof reason === "string" && reason.trim() ? reason.trim() : null;
}

function dateLabel(value: unknown): string | null {
  return typeof value === "string" && value ? formatCalendarDate(value) : null;
}

/**
 * Notes are multi-line now, and a notification is one or two lines. Take the
 * first line rather than the first N characters: "Ordered 4 anchors" followed
 * by a shopping list reads far better cut at the newline than mid-list.
 */
function excerpt(raw: string): string {
  // Mentions are stored as `@[Keith B](uuid)`. Quoted flat — here, and later
  // in a push body or an email — they have to read as "@Keith B" or the
  // notification shows a teammate a uuid.
  const body = stripMentions(raw);
  const firstLine = body.split("\n").find((line) => line.trim().length > 0)?.trim() ?? "";
  const hasMore = body.trim().includes("\n");
  if (firstLine.length > EXCERPT_LIMIT) return `${firstLine.slice(0, EXCERPT_LIMIT).trimEnd()}…`;
  return hasMore ? `${firstLine} …` : firstLine;
}

function noteDetail(item: NotificationItem): string | null {
  if (!item.note) return null;
  if (item.note.deleted) return "This note was removed.";
  return excerpt(item.note.body);
}

export function describeNotification(item: NotificationItem): NotificationCopy {
  const who = item.actor?.display_name ?? "Someone";
  const task = item.task.title;

  switch (item.kind) {
    case "note":
      return { headline: `${who} commented on ${task}`, detail: noteDetail(item) };
    case "reply":
      return { headline: `${who} replied on ${task}`, detail: noteDetail(item) };
    case "mention":
      return { headline: `${who} mentioned you on ${task}`, detail: noteDetail(item) };
    case "assigned":
      return { headline: `${who} assigned you to ${task}`, detail: null };
    case "delete_requested":
      return {
        headline: `${who} wants to delete ${task}`,
        // The reason is the whole point of the notification: it is what turns
        // "somebody wants this gone" into a decision you can make from a phone.
        detail: reasonOf(item) ?? "No reason given",
      };
    case "delete_denied":
      return { headline: `${who} kept ${task}`, detail: reasonOf(item) };
    case "deleted":
      return { headline: `${who} deleted ${task}`, detail: null };
    case "status": {
      const from = statusLabel(item.payload.from);
      return {
        headline: `${who} moved ${task} to ${statusLabel(item.payload.to)}`,
        detail: `Was ${from}`,
      };
    }
    case "due_date": {
      const to = dateLabel(item.payload.to);
      const from = dateLabel(item.payload.from);
      if (!to) return { headline: `${who} removed the due date on ${task}`, detail: null };
      return {
        headline: `${who} set ${task} due ${to}`,
        detail: from ? `Was due ${from}` : null,
      };
    }
    // The four below are written by the scheduled rules rather than by an
    // action someone took, so they never name an actor — "Someone" would be
    // a lie, and the clock is not a someone.
    case "reminder_upcoming": {
      const at = typeof item.payload.at === "string" ? formatTimestamp(item.payload.at) : null;
      return {
        headline: `Reminder coming up on ${task}`,
        detail: at ? `Set for ${at}` : null,
      };
    }
    case "reminder_due":
      return { headline: `Reminder: ${task}`, detail: null };
    case "due_soon": {
      const due = dateLabel(item.payload.due);
      return { headline: `${task} is due soon`, detail: due ? `Due ${due}` : null };
    }
    case "overdue": {
      const due = dateLabel(item.payload.due);
      return { headline: `${task} is overdue`, detail: due ? `Was due ${due}` : null };
    }
    default:
      return { headline: task, detail: null };
  }
}
