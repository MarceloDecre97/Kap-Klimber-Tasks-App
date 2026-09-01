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
   * The task this is about can no longer be opened — it was deleted, and a
   * deleted task is visible only to its creator. The row still belongs in the
   * inbox (that is the news), it just has nowhere to send you.
   */
  taskGone: boolean;
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
  task_id: string;
  kind: NotificationKind;
  payload: Record<string, unknown> | null;
  created_at: string;
  read_at: string | null;
  actor: MemberSummary | null;
  task: { id: string; title: string; deleted_at: string | null } | null;
  note: { id: string; body: string; deleted_at: string | null } | null;
};

const NOTIFICATION_SELECT = `
  id, task_id, kind, payload, created_at, read_at,
  actor:members!notifications_actor_id_fkey(id, display_name, initials, color),
  task:tasks(id, title, deleted_at),
  note:task_notes(id, body, deleted_at)
`;

/*
  A deleted task normally takes its notifications with it — there is nothing
  left to open, and the rows stay in the table so a restore puts them back.

  "This task was deleted" is the exception, and it has to be: it is the only
  way the people who were working on it ever find out. A deleted task is also
  invisible to everyone but its creator, so the join comes back empty for
  exactly the people who need this row — which is why the title travels in the
  payload rather than being read from the task.
*/
function toItem(row: RawNotification): NotificationItem | null {
  const payload = row.payload ?? {};
  const gone = !row.task || row.task.deleted_at !== null;
  if (gone && row.kind !== "deleted") return null;

  const title = row.task?.title ?? (typeof payload.title === "string" ? payload.title : null);
  if (!title) return null;

  return {
    id: row.id,
    kind: row.kind,
    created_at: row.created_at,
    read_at: row.read_at,
    actor: row.actor,
    task: { id: row.task_id, title },
    taskGone: gone,
    note: row.note
      ? { id: row.note.id, body: row.note.body, deleted: row.note.deleted_at !== null }
      : null,
    payload,
  };
}

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
    const item = toItem(row);
    if (item) items.push(item);
  }

  return { items, unread: items.filter((item) => item.read_at === null).length };
}

/* -------------------------------------------------------------------------
   For the dispatcher

   Read as the service role, so this sees everybody's rows — which is the
   point, and also why it is the one query here that RLS does not constrain.
   It returns the same NotificationItem the inbox renders, so the wording
   that reaches a phone and the wording waiting in the app come from one
   function and cannot drift apart.
   ------------------------------------------------------------------------- */

export interface PendingPush {
  /** Who to send to. */
  memberId: string;
  item: NotificationItem;
}

/**
 * Anything unsent from the last hour.
 *
 * The window matters: if the dispatcher has been down, a phone should not
 * suddenly buzz forty times about an afternoon that has already happened.
 * Older rows are left unstamped and simply never pushed — the inbox still
 * holds them.
 */
const PUSH_WINDOW_MINUTES = 60;
const PUSH_BATCH = 200;

export async function listPendingPushes(
  admin: SupabaseClient<Database>
): Promise<PendingPush[]> {
  const since = new Date(Date.now() - PUSH_WINDOW_MINUTES * 60_000).toISOString();

  const { data, error } = await admin
    .from("notifications")
    .select(`member_id, ${NOTIFICATION_SELECT}`)
    .is("pushed_at", null)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(PUSH_BATCH);

  if (error) throw error;

  const pending: PendingPush[] = [];
  for (const row of (data ?? []) as unknown as (RawNotification & { member_id: string })[]) {
    const item = toItem(row);
    // Same rule as the inbox: a notification about a task that is gone has
    // nowhere to send you, unless being gone is the news.
    if (item) pending.push({ memberId: row.member_id, item });
  }
  return pending;
}

/**
 * Marks rows as pushed whether or not a message actually went anywhere.
 *
 * Deliberate: a member with no device, or one whose only phone has been
 * wiped, must not leave rows the dispatcher re-examines every minute forever.
 * The inbox is what guarantees nothing is lost; push is best-effort on top.
 */
export async function markPushed(
  admin: SupabaseClient<Database>,
  ids: string[]
): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await admin
    .from("notifications")
    .update({ pushed_at: new Date().toISOString() })
    .in("id", ids);
  if (error) throw error;
}
