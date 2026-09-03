import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isQuietNow,
  listPendingEmails,
  listPendingPushes,
  loadPrefs,
  markEmailed,
  markPushed,
} from "@/lib/data/notifications";
import { getCronSecret, getVapidConfig } from "@/lib/push/config";
import { sendPush, type PushTarget } from "@/lib/push/send";
import { appOrigin, getEmailConfig } from "@/lib/email/config";
import { sendEmail } from "@/lib/email/send";
import { isEmailable, renderDigest } from "@/lib/email/render";
import { describeNotification } from "@/lib/notifications-view";
import type { PendingPush } from "@/lib/data/notifications";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

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
  const admin = createAdminClient();

  /*
    Two channels, run one after the other, each independently skippable.

    They used to be one, and the route returned early when push was not
    configured — which would now have meant that setting up email did nothing
    at all until VAPID keys existed too. Neither channel is a prerequisite for
    the other, and the route should not invent a dependency between them.
  */
  const email = await dispatchEmail(admin);

  if (!getVapidConfig()) {
    // Not an error: the app runs perfectly well before anyone has set the
    // keys up. Saying so plainly beats a 500 that looks like a bug.
    return Response.json({ ok: true, push: "not configured", email });
  }
  const pending = await listPendingPushes(admin);
  if (pending.length === 0) {
    return Response.json({ ok: true, considered: 0, sent: 0, email });
  }

  // One query for every device involved, rather than one per notification: a
  // busy minute is usually several notifications for the same few people.
  const memberIds = [...new Set(pending.map((p) => p.memberId))];

  /*
    What each of these people has asked not to be sent, and whether it is the
    middle of their night. Loaded once for everyone rather than per
    notification: a busy minute is usually several notifications for the same
    few people.
  */
  const prefs = await loadPrefs(admin, memberIds);
  const quiet = new Map<string, boolean>();
  for (const id of memberIds) {
    const p = prefs.get(id);
    quiet.set(id, p ? await isQuietNow(admin, p) : false);
  }

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
  /** Deliberately not delivered: switched off, or inside quiet hours. */
  let suppressed = 0;

  await Promise.all(
    pending.map(async (entry) => {
      const targets = devices.get(entry.memberId);
      if (!targets || targets.length === 0) return;

      /*
        Two reasons to stay silent, and both leave the row stamped below
        rather than pending. A push that was deliberately declined is not a
        push that failed, and re-examining it every minute for an hour would
        be the same treadmill 0017 fixed.
      */
      const p = prefs.get(entry.memberId);
      if (p && p.pushOff.includes(entry.item.kind)) {
        suppressed += 1;
        return;
      }
      /*
        Quiet hours drop the push, they do not queue it. Nine notifications
        arriving in a burst at 07:00 is worse than the 02:00 buzz they were
        avoiding, and the bell has been holding them the whole time — nothing
        is lost, only the noise.
      */
      if (quiet.get(entry.memberId)) {
        suppressed += 1;
        return;
      }

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
    suppressed,
    expired: expired.length,
    failed: failed.length,
    email,
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

/**
 * The email half.
 *
 * Runs on the same tick as push, because a second cron job would mean a
 * second URL and a second secret for one more thing that can be mistyped —
 * and the two channels are reading the same table anyway.
 *
 * Deliberately narrow. Only the dated, scheduled kinds and completions are
 * emailed; the chatter stays on the bell and the phone. See isEmailable.
 */
async function dispatchEmail(admin: SupabaseClient<Database>) {
  if (!getEmailConfig()) return { skipped: "not configured" };

  const pending = await listPendingEmails(admin);
  if (pending.length === 0) return { considered: 0, sent: 0, stamped: 0 };

  /*
    Everything is stamped, including what was never worth an email. A comment
    is not emailable and never will be, so leaving its row unstamped would
    have the emailer re-examine it every minute until it aged out of the
    window — the same treadmill the push dispatcher was stuck on.
  */
  const prefs = await loadPrefs(admin, [...new Set(pending.map((p) => p.memberId))]);

  const quiet = new Map<string, boolean>();
  for (const [id, p] of prefs) quiet.set(id, await isQuietNow(admin, p));

  /*
    Emailable by kind, and not switched off by the person receiving it.

    Quiet hours count here too, which they did not at first. The old
    reasoning was that an email waiting at 2am costs nobody anything — but
    an email does not wait quietly on a phone. Outlook announces it, so a
    correctly silenced push was followed by a buzz from the mail app, and
    quiet hours delivered exactly the thing they exist to prevent.

    So they are held, not dropped. Push is discarded during quiet hours
    because nine buzzes at 07:00 are worse than the one at 02:00 they
    replace; email has no such problem — it is already batched per person,
    so a whole night becomes one digest waiting in the morning. Nothing is
    lost, it simply arrives when it is welcome.
  */
  const emailable: typeof pending = [];
  /** Worth an email, but not now: waiting for quiet hours to end. */
  const held = new Set<string>();
  /** Never going to be emailed. Stamped, or the emailer re-reads it forever. */
  const dropped: string[] = [];

  for (const entry of pending) {
    const wanted =
      isEmailable(entry.item) &&
      !(prefs.get(entry.memberId)?.emailOff ?? []).includes(entry.item.kind);
    if (!wanted) dropped.push(entry.item.id);
    else if (quiet.get(entry.memberId)) held.add(entry.item.id);
    else emailable.push(entry);
  }

  // One message per person, not one per notification. Three things in one
  // minute is three lines in one email.
  const byMember = new Map<string, typeof emailable>();
  for (const entry of emailable) {
    const list = byMember.get(entry.memberId) ?? [];
    list.push(entry);
    byMember.set(entry.memberId, list);
  }

  const origin = appOrigin();
  const delivered: string[] = [];
  const rejected: string[] = [];

  for (const [, entries] of byMember) {
    const { email, name } = entries[0]!;
    const { subject, html, text } = renderDigest(
      name,
      entries.map((entry) => entry.item),
      origin
    );

    const result = await sendEmail({ to: email, subject, html, text });
    if (result.ok) {
      delivered.push(...entries.map((entry) => entry.item.id));
    } else if (result.permanent) {
      // A bad address will not become good by being retried every minute.
      console.error("email rejected permanently", email, result.reason);
      rejected.push(...entries.map((entry) => entry.item.id));
    } else {
      // Left unstamped on purpose: a rate limit or a blip is worth one more
      // attempt on the next tick, and the hour window bounds how long that
      // can go on.
      console.error("email failed, will retry", email, result.reason);
    }
  }

  /*
    Sent, permanently rejected, or never going to be emailed at all — all
    stamped, or the emailer re-reads them every minute until they age out.
    Held rows are the one exception and the whole point of the change above:
    leaving them unstamped is what makes holding different from dropping.
    They were sorted into their three buckets in one pass, so no row can end
    up in two of them, or in none.
  */
  const stamped = await markEmailed(admin, [
    ...new Set([...delivered, ...rejected, ...dropped]),
  ]);

  return {
    considered: pending.length,
    emailable: emailable.length,
    // Waiting for somebody's quiet hours to end. Reported so a number that
    // never comes back down is visible rather than looking like silence.
    held: held.size,
    people: byMember.size,
    sent: delivered.length,
    rejected: rejected.length,
    stamped,
  };
}
