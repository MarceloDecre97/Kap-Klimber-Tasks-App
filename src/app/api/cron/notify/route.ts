import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { listPendingPushes, markPushed } from "@/lib/data/notifications";
import { getCronSecret, getVapidConfig } from "@/lib/push/config";
import { sendPush, type PushTarget } from "@/lib/push/send";
import { describeNotification } from "@/lib/notifications-view";
import type { PendingPush } from "@/lib/data/notifications";

/**
 * Node, not edge: web-push signs each request with the VAPID private key and
 * encrypts the payload, both of which need Node's crypto.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The dispatcher.
 *
 * Called every minute by pg_cron inside Supabase rather than by Vercel's own
 * scheduler, which on the free plan runs once a day give or take an hour —
 * useless for a reminder that is supposed to fire at 3pm.
 *
 * It reads notifications nobody has been pushed about yet, renders each with
 * the exact function the bell uses, and sends it to that person's devices.
 * Sharing the renderer is the point: what buzzes in a pocket and what is
 * waiting in the app are then incapable of wording the same event
 * differently.
 */

/** Compared in constant time, so the secret cannot be guessed a byte at a time. */
function authorised(request: Request): boolean {
  const expected = getCronSecret();
  if (!expected) return false;

  const header = request.headers.get("x-cron-secret") ?? "";
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // length — so the lengths are compared first, deliberately and openly.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!authorised(request)) {
    return Response.json({ error: "unauthorised" }, { status: 401 });
  }
  if (!getVapidConfig()) {
    // Not an error: the app runs perfectly well before anyone has set the
    // keys up. Saying so plainly beats a 500 that looks like a bug.
    return Response.json({ ok: true, skipped: "push is not configured" });
  }

  const admin = createAdminClient();
  const pending = await listPendingPushes(admin);
  if (pending.length === 0) {
    return Response.json({ ok: true, considered: 0, sent: 0 });
  }

  // One query for every device involved, rather than one per notification: a
  // busy minute is usually several notifications for the same few people.
  const memberIds = [...new Set(pending.map((p) => p.memberId))];
  const { data: subscriptionRows, error } = await admin
    .from("push_subscriptions")
    .select("id, member_id, endpoint, p256dh, auth")
    .in("member_id", memberIds);
  if (error) throw error;

  const devices = new Map<string, PushTarget[]>();
  for (const row of subscriptionRows ?? []) {
    const list = devices.get(row.member_id) ?? [];
    list.push({ id: row.id, endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth });
    devices.set(row.member_id, list);
  }

  const delivered = new Set<string>();
  const expired: string[] = [];
  const failed: string[] = [];
  let sent = 0;

  await Promise.all(
    pending.map(async (entry) => {
      const targets = devices.get(entry.memberId);
      if (!targets || targets.length === 0) return;

      const message = renderPush(entry);
      for (const target of targets) {
        const result = await sendPush(target, message);
        if (result.ok) {
          sent += 1;
          delivered.add(target.id);
        } else if (result.gone) {
          // Definitive: the app was deleted, the phone wiped, or permission
          // withdrawn. Retrying forever helps nobody.
          expired.push(target.id);
        } else {
          failed.push(target.id);
        }
      }
    })
  );

  /*
    Stamped whether or not anything was delivered. A member with no device —
    or one whose only phone has gone — must not leave rows the dispatcher
    re-reads every minute for the rest of the hour. Nothing is lost by this:
    the inbox is the record, push is best-effort on top of it.
  */
  const stamped = await markPushed(admin, pending.map((p) => p.item.id));

  if (delivered.size > 0) {
    // A device that just worked has no failure history worth keeping.
    await admin
      .from("push_subscriptions")
      .update({ last_success_at: new Date().toISOString(), failure_count: 0 })
      .in("id", [...delivered]);
  }
  if (expired.length > 0) {
    await admin.from("push_subscriptions").delete().in("id", expired);
  }
  if (failed.length > 0) {
    // Counted rather than acted on: a timeout is not evidence a device is
    // gone, but a device that only ever times out should be visible.
    for (const id of new Set(failed)) {
      await admin.rpc("increment_push_failure", { p_id: id });
    }
  }

  return Response.json({
    ok: true,
    considered: pending.length,
    sent,
    // Reported because it once silently stayed at zero while everything else
    // said the run had worked. If `stamped` is ever below `considered`, the
    // same notifications are about to be sent again next minute.
    stamped,
    expired: expired.length,
    failed: failed.length,
  });
}

/**
 * The same words the inbox shows, cut to what a lock screen can hold.
 *
 * The tag is the task, so three notifications about one task replace each
 * other on the phone instead of stacking into a wall somebody swipes away
 * without reading.
 */
function renderPush(entry: PendingPush) {
  const { headline, detail } = describeNotification(entry.item);
  return {
    title: headline,
    body: detail ?? "",
    url: entry.item.taskGone ? "/dashboard" : `/tasks?task=${entry.item.task.id}`,
    tag: `task:${entry.item.task.id}`,
    at: entry.item.created_at,
  };
}
