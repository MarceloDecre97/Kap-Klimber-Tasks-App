import type { TaskNote, TaskWithRelations } from "@/lib/data/tasks";
import { PRIORITY_RANK } from "@/lib/constants";
import type { Priority, TaskStatus } from "@/lib/supabase/database.types";

export type SortMode = "priority" | "due" | "updated";

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

/**
 * Every note actually shown on a task, replies included, markers excluded.
 *
 * Lives here rather than beside the note types in `data/tasks.ts`, because
 * that module is `server-only` and the task card that renders this count is a
 * client component.
 */
export function countNotes(notes: TaskNote[]): number {
  return notes.reduce((n, note) => n + (note.deleted ? 0 : 1) + note.replies.length, 0);
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
    case "due": {
      const ad = a.due_date ? Date.parse(a.due_date) : Infinity;
      const bd = b.due_date ? Date.parse(b.due_date) : Infinity;
      if (ad !== bd) return ad - bd;
      return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    }
    case "updated":
      return Date.parse(b.updated_at) - Date.parse(a.updated_at);
    case "priority":
    default: {
      const rank = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (rank !== 0) return rank;
      const ad = a.due_date ? Date.parse(a.due_date) : Infinity;
      const bd = b.due_date ? Date.parse(b.due_date) : Infinity;
      if (ad !== bd) return ad - bd;
      return Date.parse(b.updated_at) - Date.parse(a.updated_at);
    }
  }
}

export interface TaskGroup {
  key: string;
  label: string;
  tasks: TaskWithRelations[];
}

/**
 * The task list is a single running "Update Log" — every task appears in
 * it regardless of whether it has a due date, sorted by the chosen mode.
 * (Grouping by due date was retired: due dates no longer drive the rail,
 * only the last-activity timestamp shown per task does.)
 */
export function groupTasks(tasks: TaskWithRelations[], sort: SortMode): TaskGroup[] {
  if (tasks.length === 0) return [];
  return [{ key: "update-log", label: "Update Log", tasks: tasks.slice().sort((a, b) => compareTasks(a, b, sort)) }];
}

/**
 * How long a deleted task stays in its creator's Recently deleted list.
 *
 * Lives here rather than beside the query that uses it because the dialog
 * quotes the number to the person deleting, and data/tasks.ts is server-only
 * — a client component importing from there fails at bundle time, which
 * typecheck does not catch.
 */
export const DELETED_VISIBLE_DAYS = 15;
