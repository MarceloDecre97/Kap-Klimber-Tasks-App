"use server";

import { z } from "zod";
import { getCurrentMember } from "@/lib/get-current-member";
import { PREF_GROUPS } from "@/lib/notification-prefs";
import type { NotificationKind } from "@/lib/supabase/database.types";

type Result = { ok: true } | { ok: false; error: string };

/** HH:MM, or null for "no quiet hours". */
const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
  .nullable();

/*
  Only kinds this version of the app knows about, and never a locked one.

  The client sends the whole list, so this is the boundary where "what the
  screen offered" is enforced rather than assumed. Without it, a hand-made
  request could switch off a mention or a deletion request — the two things
  that are addressed to one person and stall until they answer — and the
  result would be a task nobody can delete and nobody remembers silencing.
*/
const OPTIONAL_KINDS = new Set<string>(
  PREF_GROUPS.filter((group) => !group.locked).flatMap((group) => group.kinds)
);

const prefsSchema = z.object({
  pushOff: z.array(z.string()).max(40),
  emailOff: z.array(z.string()).max(40),
  quietFrom: timeSchema,
  quietTo: timeSchema,
});

export async function saveNotificationPrefs(input: unknown): Promise<Result> {
  const parsed = prefsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Those settings aren't valid." };

  const { pushOff, emailOff, quietFrom, quietTo } = parsed.data;

  // Half a window is not a window. Rather than guess which end was meant,
  // refuse it and say so — the screen sets both together, so this only ever
  // fires on a malformed request.
  if ((quietFrom === null) !== (quietTo === null)) {
    return { ok: false, error: "Set both a start and an end for quiet hours." };
  }

  const clean = (kinds: string[]): NotificationKind[] =>
    [...new Set(kinds.filter((kind) => OPTIONAL_KINDS.has(kind)))] as NotificationKind[];

  try {
    const { supabase, member } = await getCurrentMember();
    const { error } = await supabase.from("notification_prefs").upsert(
      {
        member_id: member.id,
        push_off: clean(pushOff),
        email_off: clean(emailOff),
        quiet_from: quietFrom,
        quiet_to: quietTo,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "member_id" }
    );
    if (error) throw error;
    return { ok: true };
  } catch (error) {
    console.error("saveNotificationPrefs failed", error);
    return { ok: false, error: "Couldn't save that. Try again." };
  }
}
