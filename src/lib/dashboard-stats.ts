import { PRIORITY_RANK, STATUSES, STATUS_ORDER } from "@/lib/constants";
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
  /** The line explaining placement, e.g. "Due Fri 28 Aug". */
  primaryLabel: string;
  /** The other date, when a task carries both. */
  secondaryLabel: string | null;
  /** A deadline that has passed — rendered red. */
  missedDeadline: boolean;
  /** A reminder that fired on a task with no deadline — rendered amber. */
  passedReminder: boolean;
}

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
      // Preserves the earlier rule: only a genuinely missed deadline is red.
      // A bucket holding just fired reminders stays amber.
      return entries.some((e) => e.missedDeadline) ? "danger" : "amber";
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

export interface WorkloadRow {
  member: MemberSummary;
  total: number;
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
  unseenNoteCount: number;
  buckets: BucketSpec[];
  asapCount: number;
  asapTasks: TaskWithRelations[];
  statusSegments: SegmentDatum[];
  workload: WorkloadRow[];
  ageRows: BarRow[];
  oldest: { task: TaskWithRelations; ageDays: number } | null;
  staleTasks: { task: TaskWithRelations; untouchedDays: number }[];
  categoryRows: BarRow[];
  ownerless: TaskWithRelations[];
  doneThisWeek: number;
  doneLastWeek: number;
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
 * The day a task next wants attention — what decides its bucket.
 *
 * A due date is an obligation; a reminder is a nudge. An *upcoming* nudge
 * can pull a task forward, but a nudge that has already fired never drags a
 * task with a healthy future deadline into Overdue: it did its job, and the
 * deadline governs from then on.
 */
function attentionKeyOf(task: TaskWithRelations, todayKey: string): string | null {
  const due = task.due_date ?? null;
  const rem = reminderKey(task);

  if (due && rem) return rem >= todayKey && rem < due ? rem : due;
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

function toEntry(task: TaskWithRelations, todayKey: string): BucketEntry {
  const due = task.due_date ?? null;
  const rem = reminderKey(task);
  const attentionKey = attentionKeyOf(task, todayKey);
  const remTime = task.reminder_at ? formatClockTime(new Date(task.reminder_at)) : null;

  const missedDeadline = !!due && due < todayKey;
  // Only a reminder-only task can have a "passed reminder" — if there is a
  // deadline, that deadline is the thing being judged.
  const passedReminder = !due && !!rem && rem < todayKey;

  const reminderText = (key: string) => `Reminder ${relativeDay(key, todayKey)}, ${remTime}`;
  const dueText = (key: string) => `Due ${relativeDay(key, todayKey)}`;

  let primaryLabel: string;
  let secondaryLabel: string | null = null;

  if (missedDeadline) {
    primaryLabel = `${plural(Math.abs(daysBetweenKeys(todayKey, due!)), "day")} overdue`;
    if (rem && rem >= todayKey) secondaryLabel = reminderText(rem);
  } else if (passedReminder) {
    primaryLabel = `Reminder passed ${plural(Math.abs(daysBetweenKeys(todayKey, rem!)), "day")} ago`;
  } else if (attentionKey && attentionKey === rem && rem !== due) {
    primaryLabel = reminderText(rem);
    if (due) secondaryLabel = dueText(due);
  } else if (attentionKey) {
    primaryLabel = dueText(attentionKey);
    if (rem && rem >= todayKey) secondaryLabel = reminderText(rem);
  } else {
    primaryLabel = "No date set";
  }

  return {
    task,
    attentionKey,
    hasReminder: !!task.reminder_at,
    primaryLabel,
    secondaryLabel,
    missedDeadline,
    passedReminder,
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

  const entries = mine.map((task) => toEntry(task, todayKey));
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
    return { key, title, entries: bucketEntries, countTone: toneFor(rule, bucketEntries), ...rest };
  };

  const buckets: BucketSpec[] = [
    bucket("overdue", "Overdue", "urgent", (k) => k !== null && k < todayKey, {
      emptyCopy: "Nothing overdue.",
      defaultOpen: true,
      urgent: true,
    }),
    bucket("today", "Today", "load", (k) => k === todayKey, {
      emptyCopy: "Nothing for today.",
      defaultOpen: true,
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

  // Notes written by someone else that I haven't thumbs-upped yet.
  const unseenNoteCount = openTasks.reduce(
    (sum, task) =>
      sum +
      task.notes.filter((note) => note.member?.id !== meId && !note.ackedByMemberIds.includes(meId)).length,
    0
  );

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

  const workload: WorkloadRow[] = roster
    .map((member) => {
      const own = openTasks.filter((t) => t.assignees.some((a) => a.id === member.id));
      return {
        member,
        total: own.length,
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
    })
    .sort((a, b) => b.total - a.total);

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

  // Top five categories by open-task count, with the long tail folded into
  // "Other" so the card never grows unbounded.
  const tally = new Map<string, number>();
  let uncategorized = 0;
  for (const task of openTasks) {
    if (!task.category) uncategorized += 1;
    else tally.set(task.category.label, (tally.get(task.category.label) ?? 0) + 1);
  }
  const named = [...tally.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  const categoryList = named.slice(0, 5);
  const restCount = named.slice(5).reduce((n, r) => n + r.count, 0);
  if (restCount > 0) categoryList.push({ label: "Other", count: restCount });
  if (uncategorized > 0) categoryList.push({ label: "Uncategorized", count: uncategorized });
  const categoryMax = Math.max(1, ...categoryList.map((r) => r.count));
  const categoryRows: BarRow[] = categoryList.map((r) => ({
    key: r.label,
    label: r.label,
    count: r.count,
    width: pct(r.count, categoryMax),
  }));

  // "No owner" means nobody on the *active* roster is on it — a task whose
  // only assignee has since been deactivated still needs picking up.
  const activeIds = new Set(roster.map((m) => m.id));
  const ownerless = openTasks.filter((t) => !t.assignees.some((a) => activeIds.has(a.id)));

  const thisMonday = startOfWeek(now).getTime();
  const lastMonday = thisMonday - 7 * 86_400_000;
  const completedAt = (t: TaskWithRelations) => (t.completed_at ? Date.parse(t.completed_at) : null);
  const doneThisWeek = completeTasks.filter((t) => {
    const at = completedAt(t);
    return at !== null && at >= thisMonday;
  }).length;
  const doneLastWeek = completeTasks.filter((t) => {
    const at = completedAt(t);
    return at !== null && at >= lastMonday && at < thisMonday;
  }).length;

  return {
    openTasks,
    completeCount: completeTasks.length,
    unseenNoteCount,
    buckets,
    asapCount: asapTasks.length,
    asapTasks,
    statusSegments,
    workload,
    ageRows,
    oldest,
    staleTasks,
    categoryRows,
    ownerless,
    doneThisWeek,
    doneLastWeek,
  };
}
