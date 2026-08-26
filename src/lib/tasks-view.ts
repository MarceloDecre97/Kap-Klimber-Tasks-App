import type { TaskWithRelations } from "@/lib/data/tasks";
import { PRIORITY_RANK } from "@/lib/constants";
import { formatDateGroup } from "@/lib/utils";
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

export function groupTasks(tasks: TaskWithRelations[], sort: SortMode): TaskGroup[] {
  const groups = new Map<string, TaskWithRelations[]>();

  for (const task of tasks) {
    const key = task.reminder_at ? new Date(task.reminder_at).toDateString() : NO_DATE_KEY;
    const bucket = groups.get(key);
    if (bucket) bucket.push(task);
    else groups.set(key, [task]);
  }

  const dated = [...groups.entries()]
    .filter(([key]) => key !== NO_DATE_KEY)
    .sort(([a], [b]) => Date.parse(a) - Date.parse(b));

  const result: TaskGroup[] = dated.map(([key, groupTasks]) => ({
    key,
    label: formatDateGroup(groupTasks[0]!.reminder_at!),
    tasks: groupTasks.slice().sort((a, b) => compareTasks(a, b, sort)),
  }));

  const noDate = groups.get(NO_DATE_KEY);
  if (noDate) {
    result.push({ key: NO_DATE_KEY, label: "No date", tasks: noDate.slice().sort((a, b) => compareTasks(a, b, sort)) });
  }

  return result;
}
