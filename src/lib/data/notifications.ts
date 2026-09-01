import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MemberSummary } from "@/lib/data/tasks";
import type { Database, NotificationKind } from "@/lib/supabase/database.types";

/**
 * One thing the app has to tell you, with everything it needs to say it
 * already resolved. The wording is not stored — see notifications-view.ts —
 * so this is the raw material for it.
 */
export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  created_at: string;
  read_at: string | null;
  /** Null when nobody caused it: the scheduled rules act on their own. */
  actor: MemberSummary | null;
  task: { id: string; title: string };
  /**
   * The note itself, read live rather than copied at write time — so an
   * edited note shows what it now says, and a removed one stops showing text
   * its author deleted.
   */
  note: { id: string; body: string; deleted: boolean } | null;
  payload: Record<string, unknown>;
}

export interface NotificationFeed {
  items: NotificationItem[];
  unread: number;
}

/*
  Deliberately not "every notification ever". The inbox is a list of what has
  happened lately, not an archive: past this depth the rows are of no use to
  anybody and the query stops being free. The unread count is taken from the
  same page rather than from a second COUNT query, which keeps the two
  numbers incapable of disagreeing — at the cost of capping a count nobody on
  a five-person team will reach, and which the bell renders as "99+" anyway.
*/
const FEED_LIMIT = 100;

type RawNotification = {
  id: string;
  kind: NotificationKind;
  payload: Record<string, unknown> | null;
  created_at: string;
  read_at: string | null;
  actor: MemberSummary | null;
  task: { id: string; title: string; deleted_at: string | null } | null;
  note: { id: string; body: string; deleted_at: string | null } | null;
};

const NOTIFICATION_SELECT = `
  id, kind, payload, created_at, read_at,
  actor:members!notifications_actor_id_fkey(id, display_name, initials, color),
  task:tasks(id, title, deleted_at),
  note:task_notes(id, body, deleted_at)
`;

/**
 * RLS already limits this to the caller's own rows — there is no member
 * filter here because there is no way to ask for anyone else's.
 */
export async function listNotifications(
  supabase: SupabaseClient<Database>
): Promise<NotificationFeed> {
  const { data, error } = await supabase
    .from("notifications")
    .select(NOTIFICATION_SELECT)
    .order("created_at", { ascending: false })
    .limit(FEED_LIMIT);

  if (error) throw error;

  const items: NotificationItem[] = [];
  for (const row of (data ?? []) as unknown as RawNotification[]) {
    // A deleted task takes its notifications out of the inbox with it. The
    // rows stay in the table so an undo puts them back.
    if (!row.task || row.task.deleted_at) continue;
    items.push({
      id: row.id,
      kind: row.kind,
      created_at: row.created_at,
      read_at: row.read_at,
      actor: row.actor,
      task: { id: row.task.id, title: row.task.title },
      note: row.note
        ? { id: row.note.id, body: row.note.body, deleted: row.note.deleted_at !== null }
        : null,
      payload: row.payload ?? {},
    });
  }

  return { items, unread: items.filter((item) => item.read_at === null).length };
}
