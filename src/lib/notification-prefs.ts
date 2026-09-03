import type { NotificationKind } from "@/lib/supabase/database.types";

/**
 * What a person can choose to stop hearing, and what they cannot.
 *
 * Grouped rather than listed one kind at a time. Nobody thinks "I would like
 * fewer `delete_denied` notifications" — they think "stop telling me about
 * deletions", and a screen of fourteen switches is a screen nobody finishes
 * reading. Each group is one decision.
 */
export interface PrefGroup {
  id: string;
  label: string;
  /** What it covers, in the words of somebody using the app. */
  detail: string;
  kinds: NotificationKind[];
  /** Whether email can carry this group at all. */
  email: boolean;
  /**
   * Set when this group's *device* notifications cannot be switched off.
   * Being named personally, and being asked to approve a deletion, are both
   * addressed to one person and stall until they answer — a switch that hid
   * them would produce a task nobody can delete and nobody remembers asking
   * about.
   *
   * Deliberately about one channel only. A delete request now carries an
   * email switch, because the request sits waiting whether or not you are
   * near the app, and email is the one channel that reaches you there. What
   * you cannot do is silence it everywhere.
   */
  locked?: string;
}

export const PREF_GROUPS: PrefGroup[] = [
  {
    id: "mentions",
    label: "When someone names you",
    detail: "@mentions, wherever they happen.",
    kinds: ["mention"],
    email: false,
    locked: "Always on: When you are @mentioned in a note personally.",
  },
  {
    id: "asks",
    label: "When someone needs an answer",
    detail: "A request to delete a task you created, and the reply to a request you made.",
    kinds: ["delete_requested", "delete_denied"],
    email: true,
    locked: "Always on: When a task stays on a limbo until you decide.",
  },
  {
    id: "conversation",
    label: "Comments and replies",
    detail: "On tasks you created, are assigned to, or have commented on.",
    kinds: ["note", "reply"],
    email: true,
  },
  {
    id: "assignment",
    label: "Being put on a task",
    detail: "When somebody assigns a task to you.",
    kinds: ["assigned"],
    email: true,
  },
  {
    id: "changes",
    label: "Status and due date changes",
    detail: "On tasks you created or are assigned to.",
    kinds: ["status", "due_date"],
    email: true,
  },
  {
    id: "reminders",
    label: "Reminders",
    detail: "Twelve hours before, and when the reminder fires.",
    kinds: ["reminder_upcoming", "reminder_due"],
    email: true,
  },
  {
    id: "deadlines",
    label: "Due soon and overdue",
    detail: "The morning of the due date, and the morning after the due date.",
    kinds: ["due_soon", "overdue"],
    email: true,
  },
  {
    id: "removals",
    label: "Tasks deleted or brought back",
    detail:
      "When a task you were working on (assigned, created, @mentioned or commented) disappears, or returns.",
    kinds: ["deleted", "restored"],
    email: true,
  },
];

export interface NotificationPrefs {
  pushOff: string[];
  emailOff: string[];
  quietFrom: string | null;
  quietTo: string | null;
}

/** What everybody gets before they touch anything: the lot. */
export const DEFAULT_PREFS: NotificationPrefs = {
  pushOff: [],
  emailOff: [],
  quietFrom: null,
  quietTo: null,
};

/** True when this group is currently switched on for that channel. */
export function groupIsOn(
  group: PrefGroup,
  prefs: NotificationPrefs,
  channel: "push" | "email"
): boolean {
  // Locked pins the device channel on, and only that one.
  if (group.locked && channel === "push") return true;
  const off = channel === "push" ? prefs.pushOff : prefs.emailOff;
  // A group is off only when every kind in it is off. A half-off group can
  // only come from hand-edited data, and reading it as "on" is the safer of
  // the two — it errs towards telling somebody something.
  return !group.kinds.every((kind) => off.includes(kind));
}

/**
 * The opt-out list after flipping one group.
 *
 * Kinds outside the known groups are preserved untouched. Turning a group off
 * must never quietly re-enable something a future version of this screen
 * knows about and this one does not.
 */
export function toggleGroup(
  group: PrefGroup,
  off: string[],
  next: boolean,
  channel: "push" | "email"
): string[] {
  if (group.locked && channel === "push") return off;
  const without = off.filter((kind) => !group.kinds.includes(kind as NotificationKind));
  return next ? without : [...without, ...group.kinds];
}
