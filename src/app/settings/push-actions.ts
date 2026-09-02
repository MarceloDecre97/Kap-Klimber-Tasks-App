"use server";

import { z } from "zod";
import { getCurrentMember } from "@/lib/get-current-member";
import { createAdminClient } from "@/lib/supabase/admin";
import { getVapidConfig } from "@/lib/push/config";
import { sendPush } from "@/lib/push/send";

type Result = { ok: true } | { ok: false; error: string };

/**
 * What the browser hands back when somebody agrees to notifications: an
 * address at Apple, Google or Mozilla, and two keys that let a message be
 * encrypted so only that browser can read it. None of it is a credential for
 * anything else, and none of it can be used to read anything back.
 */
const subscriptionSchema = z.object({
  endpoint: z.string().url().max(1000),
  p256dh: z.string().min(1).max(256),
  auth: z.string().min(1).max(256),
  userAgent: z.string().max(400).optional(),
});

export async function savePushSubscription(input: unknown): Promise<Result> {
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That subscription isn't valid." };

  try {
    const { supabase, member } = await getCurrentMember();
    /*
      Keyed on the endpoint, because re-subscribing the same browser returns
      the same endpoint — an insert would pile up rows that all deliver to one
      phone, and the person would get four buzzes for one note.
    */
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        member_id: member.id,
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.p256dh,
        auth: parsed.data.auth,
        user_agent: parsed.data.userAgent ?? null,
        failure_count: 0,
      },
      { onConflict: "endpoint" }
    );
    if (error) throw error;

    return { ok: true };
  } catch (error) {
    console.error("savePushSubscription failed", error);
    return { ok: false, error: "Couldn't turn notifications on. Try again." };
  }
}

export async function removePushSubscription(endpointInput: unknown): Promise<Result> {
  const endpoint = z.string().url().max(1000).safeParse(endpointInput);
  if (!endpoint.success) return { ok: false, error: "Invalid subscription." };

  try {
    const { supabase } = await getCurrentMember();
    // RLS limits this to the caller's own rows, so a stale endpoint belonging
    // to somebody else simply matches nothing.
    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", endpoint.data);
    if (error) throw error;

    return { ok: true };
  } catch (error) {
    console.error("removePushSubscription failed", error);
    return { ok: false, error: "Couldn't turn notifications off. Try again." };
  }
}

/**
 * Sends a notification to this member's own devices, right now.
 *
 * Built because verifying push otherwise took two people, a comment, and up
 * to a minute of waiting — and because the switch reading "on" turned out not
 * to be evidence that anything would arrive. This is the evidence: it goes
 * through the same encryption, the same push services and the same service
 * worker as a real notification, and the only thing it skips is the cron tick.
 *
 * Own devices only. The member id comes from the session, never from the
 * caller, so this cannot be used to buzz a teammate's phone.
 */
export async function sendTestPush(): Promise<
  { ok: true; devices: number } | { ok: false; error: string }
> {
  try {
    const { member } = await getCurrentMember();

    if (!getVapidConfig()) {
      return { ok: false, error: "Notifications aren't set up on the server yet." };
    }

    /*
      Read as the service role rather than as the member. The columns needed
      to encrypt a message — the endpoint and the two keys — are exactly the
      ones RLS keeps a member from reading in bulk, and this is the same
      privileged send the dispatcher does, just triggered by a tap.
    */
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("member_id", member.id);
    if (error) throw error;

    const targets = data ?? [];
    if (targets.length === 0) {
      return { ok: false, error: "This device isn't registered yet. Turn notifications on first." };
    }

    let delivered = 0;
    const gone: string[] = [];
    for (const target of targets) {
      const result = await sendPush(target, {
        title: "Kap Klimber Tasks",
        body: "Notifications are working on this device.",
        url: "/settings",
        // Its own tag, so a test never replaces a real notification somebody
        // has not read yet.
        tag: "kap-klimber-test",
        at: new Date().toISOString(),
      });
      if (result.ok) delivered += 1;
      else if (result.gone) gone.push(target.id);
    }

    // A device the push service says no longer exists is removed here, exactly
    // as the dispatcher does — otherwise the test would keep reporting a
    // device that cannot receive anything.
    if (gone.length > 0) {
      await admin.from("push_subscriptions").delete().in("id", gone);
    }

    if (delivered === 0) {
      return {
        ok: false,
        error:
          gone.length > 0
            ? "This device's registration has expired. Turn notifications off and on again."
            : "The push service wouldn't take it. Try again in a moment.",
      };
    }
    return { ok: true, devices: delivered };
  } catch (error) {
    console.error("sendTestPush failed", error);
    return { ok: false, error: "Couldn't send the test. Try again." };
  }
}
