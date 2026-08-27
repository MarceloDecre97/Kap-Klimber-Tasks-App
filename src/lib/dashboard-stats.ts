import { PRIORITY_RANK, STATUSES, STATUS_ORDER } from "@/lib/constants";
import { getLastActivityAt } from "@/lib/tasks-view";
import { daysBetweenKeys, zonedDateKey } from "@/lib/utils";
import type { MemberSummary, TaskWithRelations } from "@/lib/data/tasks";

/** Statuses that count as "open" — everything except complete. */
export const OPEN_STATUSES = STATUS_ORDER.filter((s) => s !== "complete");

/** A task is "stale" once nothing has happened on it for this many days. */
export const STALE_AFTER_DAYS = 14;

export type PersonalScope = "assigned" | "created";

export interface BucketSpec {
  key: string;
  title: string;
  tasks: TaskWithRelations[];
  emptyCopy: string;
  /** Open by default — the buckets that need attention today. */
  defaultOpen: boolean;
  /** Overdue gets a danger rail + filled count, per the design reference. */
  urgent?: boolean;
  prompt?: string;
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
 * Day offset of a task's due date relative to today, both resolved in the
 * viewer's selected timezone. Negative = overdue, 0 = today, null = no due
 * date set.
 */
export function dueOffset(task: TaskWithRelations, todayKey: string): number | null {
  if (!task.due_date) return null;
  return daysBetweenKeys(todayKey, task.due_date);
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

  const byOffset = (predicate: (offset: number | null) => boolean) =>
    mine.filter((task) => predicate(dueOffset(task, todayKey))).sort(sortByUrgency(todayKey));

  const buckets: BucketSpec[] = [
    {
      key: "overdue",
      title: "Overdue",
      tasks: byOffset((o) => o !== null && o < 0),
      emptyCopy: "Nothing overdue.",
      defaultOpen: true,
      urgent: true,
    },
    {
      key: "today",
      title: "Due today",
      tasks: byOffset((o) => o === 0),
      emptyCopy: "Nothing due today.",
      defaultOpen: true,
    },
    {
      key: "soon",
      title: "Next 5 days",
      tasks: byOffset((o) => o !== null && o >= 1 && o <= 5),
      emptyCopy: "Nothing scheduled for the next five days.",
      defaultOpen: false,
    },
    {
      key: "nodate",
      title: "No date set",
      tasks: byOffset((o) => o === null),
      emptyCopy: "Every task has a date.",
      defaultOpen: false,
      prompt: "Give these a deadline",
    },
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
      fg: spec.fg,
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

/** "3 days overdue" / "Today" / "Fri 28 Aug" / "No date set" */
export function formatDueLabel(task: TaskWithRelations, todayKey: string): string {
  const offset = dueOffset(task, todayKey);
  if (offset === null) return "No date set";
  if (offset < 0) return `${Math.abs(offset)} ${Math.abs(offset) === 1 ? "day" : "days"} overdue`;
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  return new Intl.DateTimeFormat("en-US", { weekday: "short", day: "numeric", month: "short" }).format(
    new Date(`${task.due_date!}T00:00:00`)
  );
}

export function isOverdue(task: TaskWithRelations, todayKey: string): boolean {
  const offset = dueOffset(task, todayKey);
  return offset !== null && offset < 0;
}
