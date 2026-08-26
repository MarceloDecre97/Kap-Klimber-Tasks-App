import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "./env";

/**
 * Service-role client. Bypasses RLS entirely — use it ONLY for the narrow,
 * explicitly-reviewed server-side operations that genuinely need it (today:
 * resolving a member id to an email during the passwordless login handshake,
 * before the caller has a session). Never import this from a Client
 * Component, never return its results to the browser unfiltered, and never
 * reach for it as a shortcut around RLS for ordinary reads/writes — those
 * belong on the request-scoped client from `./server`.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
