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

/*
  How long a notification you have already dealt with stays in the list.

  Unread rows are never dropped by age — an ask that has been sitting for
  three weeks is exactly the one that must not quietly disappear. Read ones
  are history, and history belongs in the task's Activity log, which keeps it
  properly. Without this the panel becomes a scroll of things you handled a
  month ago, and the one row that matters is somewhere below them.
*/
const READ_VISIBLE_DAYS = 14;

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
  const cutoff = new Date(Date.now() - READ_VISIBLE_DAYS * 86_400_000).toISOString();

  const { data, error } = await supabase
    .from("notifications")
    .select(NOTIFICATION_SELECT)
    // Everything unread, plus anything recent whether read or not.
    .or(`read_at.is.null,created_at.gte.${cutoff}`)
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
 *
 * Through an RPC rather than a plain update, and that is not a style choice.
 * A direct update here did nothing at all: the service role bypasses row-level
 * security but not triggers, and guard_notification_update pins pushed_at back
 * to its old value on every write. Postgres reported success, the route
 * returned ok, and the same notifications were re-sent every minute for an
 * hour. See 0017_mark_pushed.sql.
 *
 * Returns the number of rows actually stamped, so a repeat of that failure
 * shows up in the route's own response instead of hiding behind a 200.
 */
export async function markPushed(
  admin: SupabaseClient<Database>,
  ids: string[]
): Promise<number> {
  if (ids.length === 0) return 0;
  const { data, error } = await admin.rpc("mark_notifications_pushed", { p_ids: ids });
  if (error) throw error;
  return data ?? 0;
}

/* -------------------------------------------------------------------------
   For the emailer

   Email is the slow channel and a narrow one: only the dated, scheduled kinds
   and completions reach it. The filtering happens in TypeScript rather than
   in the query, because `isEmailable` also has to answer the "status change
   that landed on Complete" case, and splitting that rule between a SQL
   `where` and a function is how the two drift apart.
   ------------------------------------------------------------------------- */

export interface PendingEmail {
  memberId: string;
  email: string;
  name: string;
  item: NotificationItem;
}

/**
 * How far back the emailer will still reach.
 *
 * Much wider than push's hour, and for two reasons. Email is batched into one
 * digest per person, so a backlog of forty notifications is forty lines in one
 * message rather than forty messages — the flood this window guards against
 * on the push side cannot happen here. And quiet hours now hold emails back
 * rather than dropping them, so a night's worth has to still be reachable in
 * the morning; an hour would silently discard everything that happened before
 * about 06:00.
 */
const EMAIL_WINDOW_MINUTES = 24 * 60;
const EMAIL_BATCH = 200;

export async function listPendingEmails(
  admin: SupabaseClient<Database>
): Promise<PendingEmail[]> {
  const since = new Date(Date.now() - EMAIL_WINDOW_MINUTES * 60_000).toISOString();

  const { data, error } = await admin
    .from("notifications")
    .select(`member_id, recipient:members!notifications_member_id_fkey(email, display_name, is_active), ${NOTIFICATION_SELECT}`)
    .is("emailed_at", null)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(EMAIL_BATCH);

  if (error) throw error;

  type Row = RawNotification & {
    member_id: string;
    recipient: { email: string; display_name: string; is_active: boolean } | null;
  };

  const pending: PendingEmail[] = [];
  for (const row of (data ?? []) as unknown as Row[]) {
    // A deactivated member keeps their inbox — being switched off in the app
    // should not mean still being mailed by it.
    if (!row.recipient?.is_active || !row.recipient.email) continue;
    const item = toItem(row);
    if (!item) continue;
    pending.push({
      memberId: row.member_id,
      email: row.recipient.email,
      name: row.recipient.display_name,
      item,
    });
  }
  return pending;
}

/**
 * Stamps rows as emailed, through the RPC for the same reason markPushed
 * uses one: the guard trigger pins emailed_at against a direct update, and a
 * silent no-op here would email the same thing every minute for an hour.
 * See 0019_mark_emailed.sql.
 */
export async function markEmailed(
  admin: SupabaseClient<Database>,
  ids: string[]
): Promise<number> {
  if (ids.length === 0) return 0;
  const { data, error } = await admin.rpc("mark_notifications_emailed", { p_ids: ids });
  if (error) throw error;
  return data ?? 0;
}

/* -------------------------------------------------------------------------
   Preferences

   Read as the service role, for everyone the dispatcher is about to notify.
   A member with no row is not an error and not a gap: it is the default, and
   the default is everything on. That is why this returns a Map rather than
   throwing on a miss — the absence *is* the answer.
   ------------------------------------------------------------------------- */

export interface MemberPrefs {
  pushOff: string[];
  emailOff: string[];
  quietFrom: string | null;
  quietTo: string | null;
}

export async function loadPrefs(
  admin: SupabaseClient<Database>,
  memberIds: string[]
): Promise<Map<string, MemberPrefs>> {
  const prefs = new Map<string, MemberPrefs>();
  if (memberIds.length === 0) return prefs;

  const { data, error } = await admin
    .from("notification_prefs")
    .select("member_id, push_off, email_off, quiet_from, quiet_to")
    .in("member_id", memberIds);
  if (error) throw error;

  for (const row of data ?? []) {
    prefs.set(row.member_id, {
      pushOff: row.push_off ?? [],
      emailOff: row.email_off ?? [],
      quietFrom: row.quiet_from,
      quietTo: row.quiet_to,
    });
  }
  return prefs;
}

/**
 * Whether we are inside somebody's quiet hours right now.
 *
 * Asked of the database rather than worked out here, because the window can
 * wrap midnight and one implementation of that is one thing to get wrong.
 * See in_quiet_hours in 0020_notification_prefs.sql.
 */
export async function isQuietNow(
  admin: SupabaseClient<Database>,
  prefs: MemberPrefs
): Promise<boolean> {
  if (!prefs.quietFrom || !prefs.quietTo) return false;
  const { data, error } = await admin.rpc("in_quiet_hours", {
    p_from: prefs.quietFrom,
    p_to: prefs.quietTo,
  });
  if (error) throw error;
  return data === true;
}
