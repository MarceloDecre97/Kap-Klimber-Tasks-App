import type { TaskReminder } from "@/lib/data/tasks";

/**
 * The four states a reminder can be in. Single source of truth so the
 * Tasklist chip, the Dashboard row, the creator's Reminders section and the
 * attention count can never disagree about whether one is still waiting.
 */
export type ReminderState =
  /** No reminder set for this person. */
  | "none"
  /** Set, but its moment hasn't arrived — informational. */
  | "upcoming"
  /** Fired and nobody has dealt with it — this is the one that nags. */
  | "due"
  /** Someone marked it handled. */
  | "handled";

/**
 * Compared against the clock rather than the calendar: a reminder set for
 * 2pm today is still "upcoming" at 1pm, and only becomes "due" once it has
 * actually fired.
 *
 * Takes the reminder rather than the task, since 0034: a task no longer has
 * *a* reminder, it has one per person, and which of them this is depends on
 * who is looking.
 */
export function reminderState(
  reminder: TaskReminder | null | undefined,
  now: Date = new Date()
): ReminderState {
  if (!reminder) return "none";
  if (reminder.dismissed_at) return "handled";
  return Date.parse(reminder.remind_at) <= now.getTime() ? "due" : "upcoming";
}
