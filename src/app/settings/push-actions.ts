"use server";

import { z } from "zod";
import { getCurrentMember } from "@/lib/get-current-member";

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
