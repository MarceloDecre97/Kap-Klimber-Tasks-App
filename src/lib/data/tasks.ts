import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { DELETED_VISIBLE_DAYS } from "@/lib/tasks-view";
import type { Database, Priority, TaskEventKind, TaskStatus } from "@/lib/supabase/database.types";

export interface MemberSummary {
  id: string;
  display_name: string;
  initials: string;
  color: string;
}

/**
 * Something the system recorded about a task, as opposed to something a
 * person wrote. Rendered in the same timeline as notes so a task has one
 * history rather than two.
 */
export interface TaskEvent {
  id: string;
  kind: TaskEventKind;
  from_value: string | null;
  to_value: string | null;
  created_at: string;
  member: MemberSummary | null;
}

/**
 * Just enough of a contact to draw a pill: who they are, one number to show,
 * and whether the book still has them. Anything more belongs on the contact's
 * own page, which the pill links to.
 */
export interface TaskContact {
  id: string;
  first_name: string;
  last_name: string;
  job_title: string | null;
  company: string | null;
  mobile: string | null;
  office_phone: string | null;
  /** Set while the contact is in Recently deleted — still attached, not gone. */
  deleted_at: string | null;
}

export interface TaskNote {
  id: string;
  body: string;
  created_at: string;
  /** Null unless the author has changed it since posting. */
  edited_at: string | null;
  /**
   * True only for a removed note that still has replies under it — it is kept
   * as a marker so the surviving replies are not left answering nothing. A
   * removed note with no replies never reaches the component at all.
   */
  deleted: boolean;
  member: MemberSummary | null;
  likedByMemberIds: string[];
  /** Replies to this note, oldest first. Only ever one level deep. */
  replies: TaskNote[];
}

/**
 * A named link on a task — a document in the shared Drive, most often.
 *
 * Only the label is ever drawn. That is the point of the table: a Drive URL
 * is eighty unbroken characters, and putting one in the description is what
 * made it overflow its card.
 */
export interface TaskLink {
  id: string;
  label: string;
  url: string;
  position: number;
}

/**
 * One person's reminder on a task.
 *
 * Since 0034 a reminder has an owner. What arrives here is filtered by RLS
 * rather than by this query: you see your own on every task, and every one
 * on a task you created. A non-creator is handed nothing of anybody else's,
 * so `reminders` below is safe to render as-is.
 */
export interface TaskReminder {
  id: string;
  member_id: string;
  remind_at: string;
  created_by: string | null;
  dismissed_at: string | null;
  dismissed_by: string | null;
  nudged_at: string | null;
}

export interface TaskWithRelations {
  id: string;
  title: string;
  description: string | null;
  priority: Priority;
  status: TaskStatus;
  /**
   * Set while somebody who did not create this task is waiting on its
   * creator to approve deleting it. The task carries on working normally
   * meanwhile — only the cleanup waits, never the work.
   */
  deletion_requested_by: string | null;
  deletion_requested_at: string | null;
  deletion_reason: string | null;
  /** Set only in the creator's own Recently deleted list. */
  deleted_at: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  created_by: string;
  category: { id: string; label: string } | null;
  assignees: MemberSummary[];
  /**
   * The contacts attached to this task, at most two. Always an array: a task
   * with none is the overwhelmingly common case and must render exactly as it
   * did before contacts existed, so absence is an empty list rather than a
   * null anything downstream has to remember to check.
   */
  contacts: TaskContact[];
  notes: TaskNote[];
  /**
   * Up to three, in the order they were added. Always an array for the same
   * reason `contacts` is: a task with no links is the common case and has to
   * render exactly as it did before links existed.
   */
  links: TaskLink[];
  /**
   * Every reminder the signed-in member is allowed to see on this task:
   * their own, plus everybody's if they created it. Ordered by whose it is
   * so the creator's list does not reshuffle between refreshes.
   */
  reminders: TaskReminder[];
  /**
   * The signed-in member's own reminder, or null. Pulled out because almost
   * everything — the chip, the amber line, the dashboard — wants exactly
   * this and should not have to search a list for it.
   */
  my_reminder: TaskReminder | null;
  /** Status and due-date changes, oldest first. Empty until 0007 is applied. */
  events: TaskEvent[];
  /**
   * When the signed-in member last opened this task, or null if never. RLS on
   * `task_reads` only returns the caller's own row, so this is always theirs.
   */
  last_read_at: string | null;
}

const TASK_SELECT = `
  id, title, description, priority, status,
  deletion_requested_by, deletion_requested_at, deletion_reason, deleted_at,
  due_date, created_at, updated_at, completed_at, created_by,
  category:categories(id, label),
  reads:task_reads(last_read_at),
  events:task_events(id, kind, from_value, to_value, created_at, member:members!task_events_member_id_fkey(id, display_name, initials, color)),
  assignees:task_assignees(member:members(id, display_name, initials, color)),
  links:task_links(id, label, url, position),
  reminders:task_reminders(id, member_id, remind_at, created_by, dismissed_at, dismissed_by, nudged_at),
  contacts:task_contacts(contact:contacts(id, first_name, last_name, job_title, company, mobile, office_phone, deleted_at)),
  notes:task_notes(id, body, created_at, edited_at, parent_note_id, deleted_at, member:members!task_notes_member_id_fkey(id, display_name, initials, color), likes:task_note_likes(member_id))
`;

type RawTaskNote = {
  id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  parent_note_id: string | null;
  deleted_at: string | null;
  member: MemberSummary | null;
  likes: { member_id: string }[] | null;
};

type RawTask = {
  id: string;
  title: string;
  description: string | null;
  priority: Priority;
  status: TaskStatus;
  deletion_requested_by: string | null;
  deletion_requested_at: string | null;
  deletion_reason: string | null;
  deleted_at: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  created_by: string;
  category: { id: string; label: string } | null;
  assignees: { member: MemberSummary | null }[] | null;
  contacts: { contact: TaskContact | null }[] | null;
  links: TaskLink[] | null;
  reminders: TaskReminder[] | null;
  notes: RawTaskNote[] | null;
  reads: { last_read_at: string }[] | null;
  events: RawTaskEvent[] | null;
};

type RawTaskEvent = {
  id: string;
  kind: TaskEventKind;
  from_value: string | null;
  to_value: string | null;
  created_at: string;
  member: MemberSummary | null;
};

/**
 * Postgres returns every note on the task in one flat list, replies included.
 * Nest them here rather than in the query: one round trip, and the component
 * receives the shape it renders.
 *
 * A reply whose parent is missing is promoted to top level rather than
 * dropped. That should not happen — the parent cascades to its replies — but
 * silently losing someone's writing is the worse failure of the two.
 */
function nestNotes(rows: RawTaskNote[]): TaskNote[] {
  const byCreated = (a: TaskNote, b: TaskNote) => a.created_at.localeCompare(b.created_at);
  const toNote = (row: RawTaskNote): TaskNote => ({
    id: row.id,
    body: row.body,
    created_at: row.created_at,
    edited_at: row.edited_at,
    deleted: row.deleted_at !== null,
    member: row.member,
    likedByMemberIds: (row.likes ?? []).map((l) => l.member_id),
    replies: [],
  });

  const notes = new Map(rows.map((row) => [row.id, toNote(row)]));
  const top: TaskNote[] = [];

  for (const row of rows) {
    const note = notes.get(row.id)!;
    const parent = row.parent_note_id ? notes.get(row.parent_note_id) : undefined;
    if (parent) parent.replies.push(note);
    else top.push(note);
  }

  for (const note of notes.values()) {
    // A removed reply just goes. Nothing hangs off it.
    note.replies = note.replies.filter((reply) => !reply.deleted).sort(byCreated);
  }

  // A removed note disappears entirely — unless replies survive under it, in
  // which case a marker stays so the thread still reads as a conversation.
  return top.filter((note) => !note.deleted || note.replies.length > 0).sort(byCreated);
}

function mapTask(row: RawTask, meId: string): TaskWithRelations {
  const reminders = (row.reminders ?? [])
    .slice()
    .sort((a, b) => a.member_id.localeCompare(b.member_id));

  return {
    ...row,
    reminders,
    /*
      Found rather than assumed: RLS hands a creator everybody's rows, so the
      first one in the list is not necessarily theirs.
    */
    my_reminder: reminders.find((r) => r.member_id === meId) ?? null,
    assignees: (row.assignees ?? []).map((a) => a.member).filter((m): m is MemberSummary => !!m),
    /*
      Ordered by surname so two pills on one task keep a stable order rather
      than whatever the join happened to return — a list that reshuffles
      between refreshes reads as something having changed.
    */
    contacts: (row.contacts ?? [])
      .map((c) => c.contact)
      .filter((c): c is TaskContact => !!c)
      .sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name)),
    /*
      Sorted here rather than trusted from the query: PostgREST does not
      promise an order on an embedded table, and links that reshuffle between
      refreshes read as somebody having changed them.
    */
    links: (row.links ?? []).slice().sort((a, b) => a.position - b.position),
    notes: nestNotes(row.notes ?? []),
    last_read_at: row.reads?.[0]?.last_read_at ?? null,
    events: (row.events ?? []).slice().sort((a, b) => a.created_at.localeCompare(b.created_at)),
  };
}

export async function listTasks(
  supabase: SupabaseClient<Database>,
  meId: string
): Promise<TaskWithRelations[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as unknown as RawTask[]).map((row) => mapTask(row, meId));
}

export async function getTask(
  supabase: SupabaseClient<Database>,
  taskId: string,
  meId: string
): Promise<TaskWithRelations | null> {
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("id", taskId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  return data ? mapTask(data as unknown as RawTask, meId) : null;
}

/**
 * The creator's own bin.
 *
 * Only their tasks, and only for a fortnight — long enough to notice a
 * mistake, short enough that the list stays a list. Nothing is erased when
 * the window closes: the rows simply stop appearing here, so a genuine
 * disaster is still recoverable from the database itself.
 *
 * RLS already refuses to return anyone else's deleted tasks, so the
 * created_by filter below is belt to that braces rather than the rule.
 */
export async function listDeletedTasks(
  supabase: SupabaseClient<Database>,
  memberId: string
): Promise<TaskWithRelations[]> {
  const since = new Date(Date.now() - DELETED_VISIBLE_DAYS * 86_400_000).toISOString();

  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("created_by", memberId)
    .not("deleted_at", "is", null)
    .gte("deleted_at", since)
    .order("deleted_at", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as unknown as RawTask[]).map((row) => mapTask(row, memberId));
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
