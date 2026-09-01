import { PRIORITY_RANK, STATUSES, STATUS_ORDER } from "@/lib/constants";
import { reminderState } from "@/lib/reminders";
import { getLastActivityAt } from "@/lib/tasks-view";
import { daysBetweenKeys, formatClockTime, readableTextOn, zonedDateKey } from "@/lib/utils";
import type { MemberSummary, TaskWithRelations } from "@/lib/data/tasks";

/** Statuses that count as "open" — everything except complete. */
export const OPEN_STATUSES = STATUS_ORDER.filter((s) => s !== "complete");

/** A task is "stale" once nothing has happened on it for this many days. */
export const STALE_AFTER_DAYS = 14;

export type PersonalScope = "assigned" | "created";

/**
 * A task in a bucket, with everything the row needs already resolved so the
 * component never has to re-derive why the task landed where it did.
 */
export interface BucketEntry {
  task: TaskWithRelations;
  /** Calendar day, in app time, that decided this task's bucket. */
  attentionKey: string | null;
  hasReminder: boolean;
  /**
   * The single line under the card. Reminders only — the due date is the
   * card's own business, so printing it twice just made the two dates
   * compete for the same glance.
   */
  reminderLabel: string | null;
  /** Colours that line, whole: amber ahead, red missed, grey handled. */
  reminderTone: ReminderTone | null;
  /** A deadline that has passed — drives the bucket's count colour. */
  missedDeadline: boolean;
  /** The reminder has been marked dealt with (shared across the team). */
  reminderDismissed: boolean;
  /**
   * The reminder has fired and nobody has dealt with it. This is what makes
   * a missed reminder findable without re-bucketing the task: a reminder
   * that fired last week on a task due next week still needs surfacing,
   * even though the deadline correctly keeps it in "Next week".
   */
  reminderNeedsAttention: boolean;
}

/** How the reminder line under a card reads at a glance. */
export type ReminderTone = "upcoming" | "missed" | "handled";

/** How a bucket's count should read at a glance. */
export type CountTone = "quiet" | "neutral" | "amber" | "danger";

/**
 * Volume means different things in different buckets, so one scale across
 * all six would lie. Ten tasks in "Today" is real pressure; ten in "Later"
 * is a healthy backlog, and colouring it red would train you to ignore red.
 */
type ToneRule =
  /** A missed deadline is bad at any count — never scaled. */
  | "urgent"
  /** Near-term commitment, where "how many" really is "how much pressure". */
  | "load"
  /** Informational: a big number here is planning, not a problem. */
  | "info";

const LOAD_BUSY = 4;
const LOAD_HEAVY = 10;

function toneFor(rule: ToneRule, entries: BucketEntry[]): CountTone {
  const count = entries.length;
  // A zero is the absence of something, not an achievement — keep it quiet
  // so the counts that carry information are the ones that stand out.
  if (count === 0) return "quiet";

  switch (rule) {
    case "urgent":
      // Red for anything actually demanding action now: a missed deadline,
      // or a reminder that fired and nobody handled. Amber is left for the
      // case where everything here has already been dealt with.
      return entries.some((e) => e.missedDeadline || e.reminderNeedsAttention) ? "danger" : "amber";
    case "load":
      if (count >= LOAD_HEAVY) return "danger";
      if (count >= LOAD_BUSY) return "amber";
      return "neutral";
    case "info":
    default:
      return "neutral";
  }
}

export interface BucketSpec {
  key: string;
  title: string;
  entries: BucketEntry[];
  emptyCopy: string;
  /** Open by default — the buckets that need attention today. */
  defaultOpen: boolean;
  /** Overdue gets a danger rail, per the design reference. */
  urgent?: boolean;
  prompt?: string;
  countTone: CountTone;
  /** Lets a collapsed header show that something inside is waiting. */
  remindersNeedingAttention: number;
  /** Reminders still ahead of you in this section — an amber bell. */
  remindersUpcoming: number;
}

export interface SegmentDatum {
  key: string;
  label: string;
  count: number;
  /** Percentage width as a CSS string, e.g. "37.5%". */
  width: string;
  fill: string;
  fg: string;
}

/** A week in the created-vs-completed chart. */
export interface FlowWeek {
  key: string;
  /** "4 Aug" — the Monday that starts the week. */
  label: string;
  created: number;
  completed: number;
  /** Bar heights as CSS percentages of the tallest bar on the chart. */
  createdHeight: string;
  completedHeight: string;
}

/** Team-wide deadline pressure — the whole roster, not just me. */
export interface TeamDeadlines {
  overdue: TaskWithRelations[];
  dueToday: number;
  dueThisWeek: number;
  asap: number;
  noDueDate: number;
}

/** Work that nobody is going to move without an intervention. */
export interface NotMovingRow {
  task: TaskWithRelations;
  /** Why it is here — a person is waiting, or nobody owns it. */
  reason: "waiting" | "unowned";
  untouchedDays: number;
}

/** Did we finish what we said we would, when we said we would? */
export interface OnTimeStats {
  /** Tasks with a due date completed inside the window. */
  completed: number;
  onTime: number;
  /** Null when nothing has completed yet — not zero, which would read as failure. */
  rate: number | null;
}

export interface WorkloadRow {
  member: MemberSummary;
  total: number;
  /** Started but unfinished — the number a WIP limit is about. */
  inProgress: number;
  segments: { key: string; fill: string; width: string; count: number; label: string }[];
}

export interface BarRow {
  key: string;
  label: string;
  count: number;
  width: string;
}

export interface DashboardStats {
  openTasks: TaskWithRelations[];
  completeCount: number;
  buckets: BucketSpec[];
  /** Fired, undismissed reminders across the personal panel. */
  remindersNeedingAttention: number;
  asapCount: number;
  asapTasks: TaskWithRelations[];
  statusSegments: SegmentDatum[];
  workload: WorkloadRow[];
  ageRows: BarRow[];
  oldest: { task: TaskWithRelations; ageDays: number } | null;
  staleTasks: { task: TaskWithRelations; untouchedDays: number }[];
  teamDeadlines: TeamDeadlines;
  flowWeeks: FlowWeek[];
  notMoving: NotMovingRow[];
  onTime: OnTimeStats;
}

function pct(n: number, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.round((n / total) * 1000) / 10}%`;
}

/**
 * Day offset of a task's due date relative to today. Negative = overdue,
 * 0 = today, null = no due date set.
 */
export function dueOffset(task: TaskWithRelations, todayKey: string): number | null {
  if (!task.due_date) return null;
  return daysBetweenKeys(todayKey, task.due_date);
}

/** The calendar day a task's reminder falls on, in app time. */
function reminderKey(task: TaskWithRelations): string | null {
  return task.reminder_at ? zonedDateKey(new Date(task.reminder_at)) : null;
}

/**
 * The day a task next wants attention — what decides its bucket. Whichever
 * of the two dates comes first governs, but only counting dates that still
 * want something from you:
 *
 *   due date            always counts — an obligation does not expire
 *   reminder, upcoming  counts, and wins if it lands before the due date
 *   reminder, fired     does not count — its bell surfaces it instead
 *   reminder, dismissed does not count — it has been dealt with
 *
 * The last two are what stop a nudge from inventing urgency. A fired
 * reminder on a task with no deadline used to land in Overdue, which
 * claimed a deadline had been missed when the task never had one; and a
 * reminder someone dismissed used to keep holding the task in Today long
 * after it was handled.
 */
function attentionKeyOf(task: TaskWithRelations, now: Date): string | null {
  const due = task.due_date ?? null;
  const rem = reminderState(task, now) === "upcoming" ? reminderKey(task) : null;

  if (due && rem) return rem < due ? rem : due;
  return due ?? rem;
}

/** Monday-start Sunday that ends the week containing `dayKey`, `weeksAhead` on. */
function endOfWeekKey(dayKey: string, weeksAhead = 0): string {
  const d = new Date(`${dayKey}T00:00:00Z`);
  const mondayIndex = (d.getUTCDay() + 6) % 7; // Mon = 0 … Sun = 6
  d.setUTCDate(d.getUTCDate() + (6 - mondayIndex) + weeksAhead * 7);
  return d.toISOString().slice(0, 10);
}

/** "Fri 28 Aug" from a plain "YYYY-MM-DD", with no timezone shifting. */
function formatDayKey(dayKey: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${dayKey}T00:00:00Z`));
}

/** "today" / "tomorrow" / "Fri 28 Aug" */
function relativeDay(dayKey: string, todayKey: string): string {
  const offset = daysBetweenKeys(todayKey, dayKey);
  if (offset === 0) return "today";
  if (offset === 1) return "tomorrow";
  return formatDayKey(dayKey);
}

function plural(n: number, word: string) {
  return `${n} ${n === 1 ? word : `${word}s`}`;
}

function toEntry(task: TaskWithRelations, todayKey: string, now: Date): BucketEntry {
  const due = task.due_date ?? null;
  const rem = reminderKey(task);
  const attentionKey = attentionKeyOf(task, now);
  const remTime = task.reminder_at ? formatClockTime(new Date(task.reminder_at)) : null;

  const rState = reminderState(task, now);
  const reminderDismissed = rState === "handled";
  const reminderNeedsAttention = rState === "due";

  const missedDeadline = !!due && due < todayKey;

  // One line, one subject, one colour. A missed reminder says how long it
  // has been missed, because that is the part you act on; the others name
  // the moment itself.
  let reminderLabel: string | null = null;
  let reminderTone: ReminderTone | null = null;

  if (rem && remTime) {
    if (rState === "due") {
      reminderTone = "missed";
      reminderLabel = `Reminder passed ${plural(Math.abs(daysBetweenKeys(todayKey, rem)), "day")} ago`;
    } else if (rState === "handled") {
      reminderTone = "handled";
      reminderLabel = `Reminder ${relativeDay(rem, todayKey)}, ${remTime}`;
    } else {
      reminderTone = "upcoming";
      reminderLabel = `Reminder ${relativeDay(rem, todayKey)}, ${remTime}`;
    }
  }

  return {
    task,
    attentionKey,
    hasReminder: !!task.reminder_at,
    reminderLabel,
    reminderTone,
    missedDeadline,
    reminderDismissed,
    reminderNeedsAttention,
  };
}

/** Soonest attention date first, then by priority. */
function byAttention(a: BucketEntry, b: BucketEntry): number {
  const av = a.attentionKey ?? "9999-12-31";
  const bv = b.attentionKey ?? "9999-12-31";
  if (av !== bv) return av < bv ? -1 : 1;
  return PRIORITY_RANK[a.task.priority] - PRIORITY_RANK[b.task.priority];
}

function sortByUrgency(todayKey: string) {
  return (a: TaskWithRelations, b: TaskWithRelations) => {
    const ao = dueOffset(a, todayKey);
    const bo = dueOffset(b, todayKey);
    const av = ao === null ? Number.POSITIVE_INFINITY : ao;
    const bv = bo === null ? Number.POSITIVE_INFINITY : bo;
    if (av !== bv) return av - bv;
    return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  };
}

/** Monday 00:00 of the week containing `date`, in local time. */
function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dayOfWeek = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - dayOfWeek);
  return d;
}

export function computeDashboardStats({
  tasks,
  roster,
  meId,
  scope,
  now = new Date(),
}: {
  tasks: TaskWithRelations[];
  roster: MemberSummary[];
  meId: string;
  scope: PersonalScope;
  now?: Date;
}): DashboardStats {
  const todayKey = zonedDateKey(now);
  const openTasks = tasks.filter((t) => t.status !== "complete");
  const completeTasks = tasks.filter((t) => t.status === "complete");

  // ---- Personal panel -----------------------------------------------------
  const mine = openTasks.filter((task) =>
    scope === "assigned" ? task.assignees.some((a) => a.id === meId) : task.created_by === meId
  );

  // Calendar weeks, Monday-start — the same week boundary the "Completed
  // this week" card uses, so the phrase means one thing across the screen.
  const endOfThisWeek = endOfWeekKey(todayKey);
  const endOfNextWeek = endOfWeekKey(todayKey, 1);

  const entries = mine.map((task) => toEntry(task, todayKey, now));
  const inRange = (predicate: (key: string | null) => boolean) =>
    entries.filter((e) => predicate(e.attentionKey)).sort(byAttention);

  const bucket = (
    key: string,
    title: string,
    rule: ToneRule,
    predicate: (key: string | null) => boolean,
    rest: { emptyCopy: string; defaultOpen: boolean; urgent?: boolean; prompt?: string }
  ): BucketSpec => {
    const bucketEntries = inRange(predicate);
    return {
      key,
      title,
      entries: bucketEntries,
      countTone: toneFor(rule, bucketEntries),
      remindersNeedingAttention: bucketEntries.filter((e) => e.reminderNeedsAttention).length,
      remindersUpcoming: bucketEntries.filter((e) => e.reminderTone === "upcoming").length,
      ...rest,
    };
  };

  const buckets: BucketSpec[] = [
    bucket("overdue", "Overdue", "urgent", (k) => k !== null && k < todayKey, {
      emptyCopy: "Nothing overdue.",
      defaultOpen: true,
      urgent: true,
    }),
    bucket("today", "Today", "load", (k) => k === todayKey, {
      emptyCopy: "Nothing for today.",
      defaultOpen: false,
    }),
    bucket("thisWeek", "This week", "load", (k) => k !== null && k > todayKey && k <= endOfThisWeek, {
      emptyCopy: "Nothing else this week.",
      defaultOpen: false,
    }),
    bucket("nextWeek", "Next week", "info", (k) => k !== null && k > endOfThisWeek && k <= endOfNextWeek, {
      emptyCopy: "Nothing scheduled for next week.",
      defaultOpen: false,
    }),
    bucket("later", "Later", "info", (k) => k !== null && k > endOfNextWeek, {
      emptyCopy: "Nothing scheduled further out.",
      defaultOpen: false,
    }),
    bucket("nodate", "No date set", "info", (k) => k === null, {
      emptyCopy: "Every task has a date.",
      defaultOpen: false,
      prompt: "Give these a deadline",
    }),
  ];

  // ---- Team overview ------------------------------------------------------
  const asapTasks = openTasks.filter((t) => t.priority === "asap").sort(sortByUrgency(todayKey));

  const statusSegments: SegmentDatum[] = OPEN_STATUSES.map((status) => {
    const spec = STATUSES[status];
    const count = openTasks.filter((t) => t.status === status).length;
    return {
      key: status,
      label: spec.label,
      count,
      width: pct(count, openTasks.length),
      fill: spec.border,
      // The count sits on the bar itself, so it needs contrast against the
      // fill — not the badge's text colour, which is tuned for the pale
      // badge background instead.
      fg: readableTextOn(spec.border),
    };
  });

  /*
    Roster order, deliberately not sorted by count. Sorted descending it read
    as a leaderboard, and a leaderboard of task counts is the classic way to
    make a metric worse than useless: it rewards taking on many small things
    and quietly punishes helping someone else finish theirs. This card is for
    spotting imbalance, not ranking people.
  */
  const workload: WorkloadRow[] = roster
    .map((member) => {
      const own = openTasks.filter((t) => t.assignees.some((a) => a.id === member.id));
      return {
        member,
        total: own.length,
        inProgress: own.filter((t) => t.status === "in_progress").length,
        segments: OPEN_STATUSES.map((status) => {
          const count = own.filter((t) => t.status === status).length;
          return {
            key: status,
            count,
            label: STATUSES[status].label,
            fill: STATUSES[status].border,
            width: pct(count, own.length),
          };
        }).filter((s) => s.count > 0),
      };
    });

  const ageOf = (task: TaskWithRelations) => daysBetweenKeys(zonedDateKey(new Date(task.created_at)), todayKey);
  const untouchedFor = (task: TaskWithRelations) =>
    daysBetweenKeys(zonedDateKey(new Date(getLastActivityAt(task))), todayKey);

  const ageDefs: { key: string; label: string; test: (days: number) => boolean }[] = [
    { key: "fresh", label: "0–7 days", test: (d) => d <= 7 },
    { key: "mid", label: "8–30 days", test: (d) => d > 7 && d <= 30 },
    { key: "old", label: "30+ days", test: (d) => d > 30 },
  ];
  const ageCounts = ageDefs.map((def) => openTasks.filter((t) => def.test(ageOf(t))).length);
  const ageMax = Math.max(1, ...ageCounts);
  const ageRows: BarRow[] = ageDefs.map((def, i) => ({
    key: def.key,
    label: def.label,
    count: ageCounts[i]!,
    width: pct(ageCounts[i]!, ageMax),
  }));

  const oldestTask = openTasks.slice().sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))[0];
  const oldest = oldestTask ? { task: oldestTask, ageDays: ageOf(oldestTask) } : null;

  const staleTasks = openTasks
    .map((task) => ({ task, untouchedDays: untouchedFor(task) }))
    .filter((row) => row.untouchedDays >= STALE_AFTER_DAYS)
    .sort((a, b) => b.untouchedDays - a.untouchedDays);

  // ---- Team-wide deadline pressure ---------------------------------------
  // The personal panel above is filtered to one person; this is the same
  // question asked of everyone, which nothing on the screen answered before.
  const teamDeadlines: TeamDeadlines = {
    overdue: openTasks
      .filter((t) => t.due_date !== null && t.due_date < todayKey)
      .sort(sortByUrgency(todayKey)),
    dueToday: openTasks.filter((t) => t.due_date === todayKey).length,
    dueThisWeek: openTasks.filter(
      (t) => t.due_date !== null && t.due_date > todayKey && t.due_date <= endOfThisWeek
    ).length,
    asap: openTasks.filter((t) => t.priority === "asap").length,
    // A task with no date cannot be late, which is exactly why work hides here.
    noDueDate: openTasks.filter((t) => t.due_date === null).length,
  };

  // ---- Created vs completed, four weeks -----------------------------------
  // The clearest read on whether the team is keeping up: if intake outruns
  // completion week after week, no amount of effort inside one week fixes it.
  const thisMonday = startOfWeek(now);
  const flowRaw: { key: string; label: string; created: number; completed: number }[] = [];
  for (let i = 3; i >= 0; i--) {
    const start = new Date(thisMonday);
    start.setDate(start.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const from = start.getTime();
    const to = end.getTime();
    const within = (iso: string | null) => {
      if (!iso) return false;
      const at = Date.parse(iso);
      return at >= from && at < to;
    };
    flowRaw.push({
      key: start.toISOString().slice(0, 10),
      label: new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short" }).format(start),
      created: tasks.filter((t) => within(t.created_at)).length,
      completed: tasks.filter((t) => within(t.completed_at)).length,
    });
  }
  // One shared scale across both series, or the two bars in a week would not
  // be comparable — which is the entire point of putting them side by side.
  const flowMax = Math.max(1, ...flowRaw.flatMap((w) => [w.created, w.completed]));
  const flowWeeks: FlowWeek[] = flowRaw.map((w) => ({
    ...w,
    createdHeight: pct(w.created, flowMax),
    completedHeight: pct(w.completed, flowMax),
  }));

  // ---- Not moving ---------------------------------------------------------
  // "No owner" means nobody on the *active* roster is on it — a task whose
  // only assignee has since been deactivated still needs picking up. Waiting
  // and unowned are one card because they read the same to whoever is
  // looking: this will not move unless you do something, and the something
  // is the same in both cases — name a person.
  const activeIds = new Set(roster.map((m) => m.id));
  const notMoving: NotMovingRow[] = openTasks
    .filter((t) => t.status === "waiting" || !t.assignees.some((a) => activeIds.has(a.id)))
    .map((task) => ({
      task,
      reason: (!task.assignees.some((a) => activeIds.has(a.id)) ? "unowned" : "waiting") as
        | "waiting"
        | "unowned",
      untouchedDays: untouchedFor(task),
    }))
    .sort((a, b) => b.untouchedDays - a.untouchedDays);

  // ---- On-time rate -------------------------------------------------------
  // Only tasks that carried a due date can be judged against one. Comparing
  // calendar days, not instants: finishing at 11pm on the due date is on time.
  const windowStart = now.getTime() - 30 * 86_400_000;
  const judged = completeTasks.filter(
    (t) => t.due_date !== null && t.completed_at !== null && Date.parse(t.completed_at) >= windowStart
  );
  const onTimeCount = judged.filter(
    (t) => zonedDateKey(new Date(t.completed_at!)) <= t.due_date!
  ).length;
  const onTime: OnTimeStats = {
    completed: judged.length,
    onTime: onTimeCount,
    rate: judged.length === 0 ? null : Math.round((onTimeCount / judged.length) * 100),
  };

  return {
    openTasks,
    completeCount: completeTasks.length,
    buckets,
    remindersNeedingAttention: buckets.reduce((n, b) => n + b.remindersNeedingAttention, 0),
    asapCount: asapTasks.length,
    asapTasks,
    statusSegments,
    workload,
    ageRows,
    oldest,
    staleTasks,
    teamDeadlines,
    flowWeeks,
    notMoving,
    onTime,
  };
}
