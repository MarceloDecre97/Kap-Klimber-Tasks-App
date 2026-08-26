import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Priority, TaskStatus } from "@/lib/supabase/database.types";

export interface MemberSummary {
  id: string;
  display_name: string;
  initials: string;
  color: string;
}

export interface TaskNote {
  id: string;
  body: string;
  created_at: string;
  member: MemberSummary | null;
  ackedByMemberIds: string[];
}

export interface TaskWithRelations {
  id: string;
  title: string;
  description: string | null;
  priority: Priority;
  status: TaskStatus;
  reminder_at: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  created_by: string;
  category: { id: string; label: string } | null;
  assignees: MemberSummary[];
  notes: TaskNote[];
}

const TASK_SELECT = `
  id, title, description, priority, status, reminder_at, created_at, updated_at, completed_at, created_by,
  category:categories(id, label),
  assignees:task_assignees(member:members(id, display_name, initials, color)),
  notes:task_notes(id, body, created_at, member:members!task_notes_member_id_fkey(id, display_name, initials, color), acks:task_note_acks(member_id))
`;

type RawTaskNote = {
  id: string;
  body: string;
  created_at: string;
  member: MemberSummary | null;
  acks: { member_id: string }[] | null;
};

type RawTask = {
  id: string;
  title: string;
  description: string | null;
  priority: Priority;
  status: TaskStatus;
  reminder_at: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  created_by: string;
  category: { id: string; label: string } | null;
  assignees: { member: MemberSummary | null }[] | null;
  notes: RawTaskNote[] | null;
};

function mapTask(row: RawTask): TaskWithRelations {
  return {
    ...row,
    assignees: (row.assignees ?? []).map((a) => a.member).filter((m): m is MemberSummary => !!m),
    notes: (row.notes ?? [])
      .map((note) => ({ ...note, ackedByMemberIds: (note.acks ?? []).map((a) => a.member_id) }))
      .sort((a, b) => a.created_at.localeCompare(b.created_at)),
  };
}

export async function listTasks(supabase: SupabaseClient<Database>): Promise<TaskWithRelations[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as unknown as RawTask[]).map(mapTask);
}

export async function getTask(
  supabase: SupabaseClient<Database>,
  taskId: string
): Promise<TaskWithRelations | null> {
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("id", taskId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  return data ? mapTask(data as unknown as RawTask) : null;
}

export async function listRoster(supabase: SupabaseClient<Database>): Promise<MemberSummary[]> {
  const { data, error } = await supabase
    .from("members")
    .select("id, display_name, initials, color")
    .eq("is_active", true)
    .order("display_name");

  if (error) throw error;
  return data ?? [];
}

export async function listCategories(supabase: SupabaseClient<Database>) {
  const { data, error } = await supabase.from("categories").select("id, label, is_default").order("label");
  if (error) throw error;
  return data ?? [];
}
