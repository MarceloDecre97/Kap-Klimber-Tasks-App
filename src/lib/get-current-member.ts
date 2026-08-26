import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Resolves the signed-in Supabase user to their `members` row. Redirects to
 * /login if there is no session, and signs the user out if their account
 * somehow has no active member record (e.g. they were deactivated) rather
 * than leaving them stuck in a half-authenticated state.
 */
export async function getCurrentMember() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: member } = await supabase
    .from("members")
    .select("id, display_name, initials, color, email")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!member) {
    await supabase.auth.signOut();
    redirect("/login");
  }

  return { supabase, member };
}
