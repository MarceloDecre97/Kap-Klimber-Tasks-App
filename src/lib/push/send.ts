import "server-only";

import webpush, { type PushSubscription } from "web-push";
import { getVapidConfig } from "@/lib/push/config";

export interface PushTarget {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushMessage {
  title: string;
  body: string;
  /** Where a tap lands. */
  url: string;
  /** Notifications sharing a tag replace each other instead of stacking. */
  tag: string;
  at: string;
}

export type PushResult =
  | { ok: true }
  /** The push service says this subscription no longer exists. Delete it. */
  | { ok: false; gone: true }
  /** Something else went wrong; the device may still be fine. */
  | { ok: false; gone: false; reason: string };

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;
  const vapid = getVapidConfig();
  if (!vapid) return false;
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  configured = true;
  return true;
}

/**
 * One message to one browser.
 *
 * The 404/410 case is the one worth handling precisely: it is the push
 * service telling us this endpoint is dead — the app was deleted, the phone
 * was wiped, or the person turned notifications off — and the only correct
 * response is to forget it. Everything else is treated as possibly temporary,
 * because a network blip should not cost somebody their subscription.
 */
export async function sendPush(target: PushTarget, message: PushMessage): Promise<PushResult> {
  if (!ensureConfigured()) return { ok: false, gone: false, reason: "push is not configured" };

  const subscription: PushSubscription = {
    endpoint: target.endpoint,
    keys: { p256dh: target.p256dh, auth: target.auth },
  };

  try {
    await webpush.sendNotification(subscription, JSON.stringify(message), {
      // A notification about something that happened an hour ago is not worth
      // waking a phone that has been off; the inbox still has it.
      TTL: 3600,
      urgency: "normal",
    });
    return { ok: true };
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return { ok: false, gone: true };
    return {
      ok: false,
      gone: false,
      reason: `${status ?? "no status"}: ${(error as Error)?.message ?? "unknown"}`,
    };
  }
}
