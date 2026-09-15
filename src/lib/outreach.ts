import type { MemberSummary } from "@/lib/data/tasks";
import type { TaskStatus } from "@/lib/supabase/database.types";

/**
 * Whether anybody has reached out to a contact, worked out rather than stored.
 *
 * The obvious build was a "contacted" flag on the contact. A flag means
 * "somebody remembered to press a button", and three weeks after a trade show
 * nobody can tell you who pressed it or when. So most of this reads work that
 * actually happened: an outreach task, linked to the person, finished. The
 * date is the task's completion date and the person is whoever finished it,
 * because those are already recorded and cannot drift.
 *
 * The exception is how it ended. A reply lands in somebody's inbox and a
 * silence lands nowhere at all, neither of which the app can see — so the
 * outcome is an assertion, stamped with who made it, reversible, and only
 * offered to the people who did the outreach. See 0044_outreach_outcome.sql.
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
  /** Whether the viewer is the creator or on it — who may record an outcome. */
  mine: boolean;
  /**
   * Everybody the task went to, this contact included.
   *
   * Carried because one email to three people gets one reply, and that reply
   * usually speaks for all three — so confirming it has to be able to reach
   * the other two without making somebody open each of their pages.
   */
  people: { id: string; first_name: string; last_name: string }[];
  /**
   * Rounds recorded on this task after it was completed, newest last.
   *
   * A second email to the same prospect is not a second task — it is another
   * round of this one, which is what record_outreach_sent writes. Kept as the
   * dates rather than a number so the pane can say when the last one went.
   */
  sentAgainAt: string[];
}

/**
 * How an outreach ended, as the database stores it.
 *
 * Not a pair of booleans: "replied" and "gave up" are mutually exclusive
 * answers to one question, and two flags would have been a rule somebody had
 * to remember rather than one column that cannot hold both.
 */
export type OutreachOutcome = "in_touch" | "no_reply";

export type OutreachState = "none" | "open" | "contacted" | "in_touch" | "no_reply";

export interface Outreach {
  state: OutreachState;
  /**
   * Rounds sent, not tasks completed.
   *
   * A completed outreach task is round one; every "Sent another" after it is
   * the next. This is what the ×N counts, because "we have chased this person
   * four times" is the fact worth knowing and it has nothing to do with how
   * many task cards it took.
   */
  contactedCount: number;
  /** Tasks still running. Never counted as an outreach — an intention is not one. */
  openCount: number;
  latestCompleted: OutreachTask | null;
  latestOpen: OutreachTask | null;
  /** Newest first, every task. */
  tasks: OutreachTask[];
  /** When the first round went out. The start of the story the pane tells. */
  firstContactedAt: string | null;
  /** When the most recent round went out — a completion, or a "Sent another". */
  lastContactedAt: string | null;
  outcome: OutreachOutcome | null;
  outcomeAt: string | null;
  outcomeBy: MemberSummary | null;
  /** Mirrors can_set_contact_outcome in the database. The buttons follow this. */
  canConfirm: boolean;
}

export const NO_OUTREACH: Outreach = {
  state: "none",
  contactedCount: 0,
  openCount: 0,
  latestCompleted: null,
  latestOpen: null,
  tasks: [],
  firstContactedAt: null,
  lastContactedAt: null,
  outcome: null,
  outcomeAt: null,
  outcomeBy: null,
  canConfirm: false,
};

/**
 * The state, from the rounds and the outcome.
 *
 * Furthest reached wins for a reply, deliberately: somebody who answered in
 * September and picks up a new outreach task in November still reads "In
 * touch". Going backwards would say the relationship had been lost, which is
 * not what a new task means.
 *
 * "No reply" is the one that does step aside for a new round, and that is the
 * point of it rather than an inconsistency. Giving up is a decision about a
 * silence, so starting a fresh outreach is you changing your mind — the pill
 * should say you are reaching out again, because you are.
 */
export function outreachStateOf(o: Omit<Outreach, "state">): OutreachState {
  /*
    The claim only stands while something backs it.

    The outcome is the one stored fact here and it was outliving its evidence:
    bin the outreach task and the contact kept the pill, while the button to
    take it back — which asks for a live completed task — disappeared with
    the task. A state you can enter and cannot leave.

    So a binned task hides the claim and restoring the task brings it back,
    which is what a bin is for. Erasing the task destroys it outright, in the
    database, so a later round starts from Contacted rather than leaping
    straight to In touch. See 0043 and 0044.
  */
  if (o.contactedCount > 0) {
    if (o.outcome === "in_touch") return "in_touch";
    /*
      A live round outranks a silence. You gave up in March, you are emailing
      again today — "No reply" is last month's conclusion and saying it now
      would hide the thing you are actually doing.
    */
    if (o.outcome === "no_reply") return o.openCount > 0 ? "open" : "no_reply";
    return "contacted";
  }
  if (o.openCount > 0) return "open";
  return "none";
}

/*
  Kept short because these sit on a row beside a relationship chip, and the
  pill is the same height, padding and type size as that chip — measured, all
  five are 30px tall. The only thing that made "Outreach open" look bigger
  was that it is more letters. "Reaching out" says the same in less.
*/
export const OUTREACH_LABELS: Record<OutreachState, string> = {
  none: "Not contacted",
  open: "Reaching out",
  contacted: "Contacted",
  in_touch: "In touch",
  no_reply: "No reply",
};

/**
 * What the pill says: the state, and the count once there is more than one.
 *
 * "Contacted ×1" is noise — the state already says it happened once. From two
 * upwards the number is the whole point, because "we have chased this person
 * three times" is a different fact from "we emailed them".
 *
 * "No reply" carries it too, and carries it hardest: ×4 is the difference
 * between a prospect who ignored one email and one who ignored a month of
 * them, and that is exactly the judgement you are making when you read it.
 */
export function outreachLabel(o: Outreach): string {
  const base = OUTREACH_LABELS[o.state];
  const counts = o.state === "contacted" || o.state === "in_touch" || o.state === "no_reply";
  if (o.contactedCount > 1 && counts) return `${base} ×${o.contactedCount}`;
  return base;
}

/**
 * True when there is a round running on top of a finished one.
 *
 * Shown as a clock beside the pill rather than in words. The pill has to hold
 * its own on a 390px row next to a relationship chip, and "Contacted ×2, one
 * open" is a sentence, not a label. The sentence belongs in the pane.
 *
 * Not shown for "open", where the pill already says a round is running, and
 * not for "no_reply", which by the rule above cannot have one.
 */
export function hasOpenRound(o: Outreach): boolean {
  return o.openCount > 0 && (o.state === "contacted" || o.state === "in_touch");
}

/**
 * Whether another round may be recorded on what is already there.
 *
 * Needs a completed task of the viewer's to hang off, and stops once the
 * outreach has an ending: sending another email to somebody you have marked
 * "In touch" is a conversation, not a chase, and sending one to somebody you
 * have given up on means you have not given up — take the outcome off first
 * and the button comes back.
 */
export function canSendAnother(o: Outreach): boolean {
  return o.canConfirm && o.latestCompleted !== null && o.outcome === null;
}

/**
 * Whether giving up is worth offering yet.
 *
 * One round is enough to reach for it — a single cold email that went nowhere
 * is a real thing to park — but it is never offered before that, because
 * "No reply" to a prospect nobody has emailed is not a silence, it is a
 * mistake waiting to be made.
 */
export function canGiveUp(o: Outreach): boolean {
  return o.canConfirm && o.contactedCount > 0 && o.outcome === null;
}

/** Every state, in the order they happen — for the filter. */
export const OUTREACH_ORDER: OutreachState[] = ["none", "open", "contacted", "in_touch", "no_reply"];

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

/**
 * How long a reminder the Contact button arms, in days.
 *
 * A week: long enough that chasing does not look automated, short enough that
 * a warm introduction has not gone cold. It matches the gap
 * record_outreach_sent re-arms, so every round of a chase is paced the same
 * whether it was the first or the fifth.
 */
export const OUTREACH_FOLLOW_UP_DAYS = 7;

/** The reminder the Contact button sets, as an instant. */
export function outreachFollowUpAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + OUTREACH_FOLLOW_UP_DAYS * 24 * 60 * 60 * 1000);
}
