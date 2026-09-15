import type { MemberSummary } from "@/lib/data/tasks";
import type { TaskStatus } from "@/lib/supabase/database.types";

/**
 * Whether anybody has reached out to a contact, worked out rather than stored.
 *
 * The obvious build was a "contacted" flag on the contact. A flag means
 * "somebody remembered to press a button", and three weeks after a trade show
 * nobody can tell you who pressed it or when. So the only thing this reads is
 * work that actually happened: an outreach task, linked to the person,
 * finished. The date is the task's completion date and the person is whoever
 * finished it, because those are already recorded and cannot drift.
 *
 * The exception is the last state. A reply lands in somebody's inbox, which
 * the app cannot see, so "in touch" is an assertion — stamped with who made
 * it, reversible, and only offered to the people who did the outreach. See
 * 0041_outreach.sql.
 */

/** One outreach task, as a contact's record of it. */
export interface OutreachTask {
  task_id: string;
  title: string;
  status: TaskStatus;
  created_at: string;
  created_by: MemberSummary | null;
  completed_at: string | null;
  completed_by: MemberSummary | null;
  /** Whether the viewer is the creator or on it — who may confirm a reply. */
  mine: boolean;
  /**
   * Everybody the task went to, this contact included.
   *
   * Carried because one email to three people gets one reply, and that reply
   * usually speaks for all three — so confirming it has to be able to reach
   * the other two without making somebody open each of their pages.
   */
  people: { id: string; first_name: string; last_name: string }[];
}

export type OutreachState = "none" | "open" | "contacted" | "in_touch";

export interface Outreach {
  state: OutreachState;
  /** Completed outreach tasks. What the ×N counts. */
  contactedCount: number;
  /** Tasks still running. Never counted as an outreach — an intention is not one. */
  openCount: number;
  latestCompleted: OutreachTask | null;
  latestOpen: OutreachTask | null;
  /** Newest first, every round. */
  tasks: OutreachTask[];
  inTouchAt: string | null;
  inTouchBy: MemberSummary | null;
  /** Mirrors can_confirm_in_touch in the database. The button follows this. */
  canConfirm: boolean;
}

export const NO_OUTREACH: Outreach = {
  state: "none",
  contactedCount: 0,
  openCount: 0,
  latestCompleted: null,
  latestOpen: null,
  tasks: [],
  inTouchAt: null,
  inTouchBy: null,
  canConfirm: false,
};

/**
 * The state, from the tasks and the assertion.
 *
 * Furthest reached wins, deliberately: somebody who answered in September and
 * picks up a new outreach task in November still reads "In touch". Going
 * backwards would say the relationship had been lost, which is not what a new
 * task means.
 */
export function outreachStateOf(o: Omit<Outreach, "state">): OutreachState {
  /*
    The claim only stands while something backs it.

    "In touch" is the one stored fact here and it was outliving its evidence:
    bin the outreach task and the contact kept the pill, while the button to
    take it back — which asks for a live completed task — disappeared with
    the task. A state you can enter and cannot leave.

    So a binned task hides the claim and restoring the task brings it back,
    which is what a bin is for. Erasing the task destroys it outright, in the
    database, so a later round starts from Contacted rather than leaping
    straight to In touch. See 0043.
  */
  if (o.inTouchAt && o.contactedCount > 0) return "in_touch";
  if (o.contactedCount > 0) return "contacted";
  if (o.openCount > 0) return "open";
  return "none";
}

/*
  Kept short because these sit on a row beside a relationship chip, and the
  pill is the same height, padding and type size as that chip — measured, all
  four are 30px tall. The only thing that made "Outreach open" look bigger
  was that it is more letters. "Reaching out" says the same in less.
*/
export const OUTREACH_LABELS: Record<OutreachState, string> = {
  none: "Not contacted",
  open: "Reaching out",
  contacted: "Contacted",
  in_touch: "In touch",
};

/**
 * What the pill says: the state, and the count once there is more than one.
 *
 * "Contacted ×1" is noise — the state already says it happened once. From two
 * upwards the number is the whole point, because "we have chased this person
 * three times" is a different fact from "we emailed them".
 */
export function outreachLabel(o: Outreach): string {
  const base = OUTREACH_LABELS[o.state];
  if (o.contactedCount > 1 && (o.state === "contacted" || o.state === "in_touch")) {
    return `${base} ×${o.contactedCount}`;
  }
  return base;
}

/**
 * True when there is a round running on top of a finished one.
 *
 * Shown as a clock beside the pill rather than in words. The pill has to hold
 * its own on a 390px row next to a relationship chip, and "Contacted ×2, one
 * open" is a sentence, not a label. The sentence belongs in the pane.
 */
export function hasOpenRound(o: Outreach): boolean {
  return o.openCount > 0 && (o.state === "contacted" || o.state === "in_touch");
}

/** Every state, in the order they happen — for the filter. */
export const OUTREACH_ORDER: OutreachState[] = ["none", "open", "contacted", "in_touch"];

/**
 * What the Contact button calls the task.
 *
 * "Contact Mandy, Bob from Brazos Trailers" — first names only, because the
 * task list is read at a glance and the surnames are one tap away on the
 * contact pills the task already carries.
 *
 * The company is dropped when the people are not all from the same one. A
 * title that names a company three of the four recipients do not work at is
 * worse than a title that names none.
 */
export function outreachTaskTitle(
  people: { first_name: string; company: string | null }[]
): string {
  if (people.length === 0) return "Contact";
  /*
    "Eric, Mike and Sheena" — a list the way a person writes one, with the
    last comma turned into an "and". A task title is read out loud in
    somebody's head; a trailing comma before the last name reads as a
    spreadsheet.
  */
  const first = people.map((p) => p.first_name.trim()).filter(Boolean);
  const names =
    first.length > 1
      ? `${first.slice(0, -1).join(", ")} and ${first[first.length - 1]}`
      : first.join("");
  const companies = new Set(people.map((p) => p.company?.trim() ?? ""));
  const company = companies.size === 1 ? [...companies][0] : "";
  return company ? `Contact ${names} from ${company}` : `Contact ${names}`;
}
