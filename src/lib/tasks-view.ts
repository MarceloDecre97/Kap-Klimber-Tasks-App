import type { TaskWithRelations } from "@/lib/data/tasks";
import { PRIORITY_RANK } from "@/lib/constants";
import { formatDateGroup, zonedDateKey } from "@/lib/utils";
import type { Priority, TaskStatus } from "@/lib/supabase/database.types";

export type SortMode = "priority" | "reminder" | "updated";

export interface TaskFilters {
  mine: boolean;
  query: string;
  status: TaskStatus[];
  priority: Priority[];
  categoryIds: string[];
  assigneeIds: string[];
}

export const EMPTY_FILTERS: TaskFilters = {
  mine: false,
  query: "",
  status: [],
  priority: [],
  categoryIds: [],
  assigneeIds: [],
};

export function countActiveFilters(filters: TaskFilters): number {
  return filters.status.length + filters.priority.length + filters.categoryIds.length + filters.assigneeIds.length;
}

/**
 * Most recent activity on a task: its own last update (status/field
 * changes, via the DB's `tasks_set_updated_at` trigger) or its newest
 * note, whichever is later — notes don't bump `tasks.updated_at` in the
 * schema, so this is computed client-side instead of a migration.
 */
export function getLastActivityAt(task: TaskWithRelations): string {
  const latestNote = task.notes[task.notes.length - 1];
  if (!latestNote) return task.updated_at;
  return Date.parse(latestNote.created_at) > Date.parse(task.updated_at) ? latestNote.created_at : task.updated_at;
}

/** Whole days elapsed since `iso`, floored (0 on the day it was created). */
export function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86_400_000));
}

function matchesQuery(task: TaskWithRelations, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystacks = [
    task.title,
    task.description ?? "",
    task.category?.label ?? "",
    ...task.assignees.map((a) => a.display_name),
    ...task.notes.map((n) => n.body),
  ];
  return haystacks.some((h) => h.toLowerCase().includes(q));
}

export function matchesFilters(task: TaskWithRelations, filters: TaskFilters, meId: string | null): boolean {
  if (filters.mine && !(meId && task.assignees.some((a) => a.id === meId))) return false;
  if (!matchesQuery(task, filters.query)) return false;
  if (filters.status.length && !filters.status.includes(task.status)) return false;
  if (filters.priority.length && !filters.priority.includes(task.priority)) return false;
  if (filters.categoryIds.length && !(task.category && filters.categoryIds.includes(task.category.id))) return false;
  if (filters.assigneeIds.length && !task.assignees.some((a) => filters.assigneeIds.includes(a.id))) return false;
  return true;
}

function compareTasks(a: TaskWithRelations, b: TaskWithRelations, sort: SortMode): number {
  switch (sort) {
    case "reminder": {
      const ar = a.reminder_at ? Date.parse(a.reminder_at) : Infinity;
      const br = b.reminder_at ? Date.parse(b.reminder_at) : Infinity;
      if (ar !== br) return ar - br;
      return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    }
    case "updated":
      return Date.parse(b.updated_at) - Date.parse(a.updated_at);
    case "priority":
    default: {
      const rank = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (rank !== 0) return rank;
      const ar = a.reminder_at ? Date.parse(a.reminder_at) : Infinity;
      const br = b.reminder_at ? Date.parse(b.reminder_at) : Infinity;
      if (ar !== br) return ar - br;
      return Date.parse(b.updated_at) - Date.parse(a.updated_at);
    }
  }
}

export interface TaskGroup {
  key: string;
  label: string;
  tasks: TaskWithRelations[];
}

const NO_DATE_KEY = "no-date";

export function groupTasks(tasks: TaskWithRelations[], sort: SortMode, timeZone?: string): TaskGroup[] {
  const groups = new Map<string, TaskWithRelations[]>();

  for (const task of tasks) {
    const key = task.reminder_at ? zonedDateKey(new Date(task.reminder_at), timeZone) : NO_DATE_KEY;
    const bucket = groups.get(key);
    if (bucket) bucket.push(task);
    else groups.set(key, [task]);
  }

  const dated = [...groups.entries()]
    .filter(([key]) => key !== NO_DATE_KEY)
    .sort(([a], [b]) => Date.parse(a) - Date.parse(b));

  const result: TaskGroup[] = dated.map(([key, groupTasks]) => ({
    key,
    label: formatDateGroup(groupTasks[0]!.reminder_at!, timeZone),
    tasks: groupTasks.slice().sort((a, b) => compareTasks(a, b, sort)),
  }));

  const noDate = groups.get(NO_DATE_KEY);
  if (noDate) {
    result.push({ key: NO_DATE_KEY, label: "No date", tasks: noDate.slice().sort((a, b) => compareTasks(a, b, sort)) });
  }

  return result;
}
