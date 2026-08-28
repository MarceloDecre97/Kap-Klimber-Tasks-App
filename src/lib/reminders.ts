/**
 * The four states a task's reminder can be in. Single source of truth so
 * the Tasklist chip, the Dashboard row and the attention count can never
 * disagree about whether a reminder is still waiting.
 */
export type ReminderState =
  /** No reminder set. */
  | "none"
  /** Set, but its moment hasn't arrived — informational. */
  | "upcoming"
  /** Fired and nobody has dealt with it — this is the one that nags. */
  | "due"
  /** Someone marked it handled. */
  | "handled";

interface ReminderFields {
  reminder_at: string | null;
  reminder_dismissed_at: string | null;
}

/**
 * Compared against the clock rather than the calendar: a reminder set for
 * 2pm today is still "upcoming" at 1pm, and only becomes "due" once it has
 * actually fired.
 */
export function reminderState(task: ReminderFields, now: Date = new Date()): ReminderState {
  if (!task.reminder_at) return "none";
  if (task.reminder_dismissed_at) return "handled";
  return Date.parse(task.reminder_at) <= now.getTime() ? "due" : "upcoming";
}
