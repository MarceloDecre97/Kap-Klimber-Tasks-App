/**
 * Provisions team members: creates each an auth.users row (email, no
 * password) and a matching public.members row. This is the stand-in for the
 * future admin panel — until that exists, editing scripts/members.json and
 * re-running `npm run seed:members` is how the roster is managed.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY, which this script is the only place
 * in the codebase allowed to use. Run locally / in CI only — never ship
 * this key to a client or a Vercel serverless function that serves users.
 */
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Match Next.js's own env file precedence: .env.local wins over .env.
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

interface MemberConfig {
  email: string;
  displayName: string;
  initials: string;
  color: string;
}

function loadMembers(): MemberConfig[] {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(path.join(dir, "members.json"), "utf8");
  return JSON.parse(raw) as MemberConfig[];
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (in .env.local) before seeding."
    );
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const members = loadMembers();

  for (const member of members) {
    const email = member.email.trim().toLowerCase();

    const { data: existing, error: lookupError } = await admin
      .from("members")
      .select("id, user_id")
      .eq("email", email)
      .maybeSingle();

    if (lookupError) {
      console.error(`Failed to look up ${email}:`, lookupError.message);
      continue;
    }

    let userId = existing?.user_id ?? null;

    if (!userId) {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
      });

      if (createError) {
        console.error(`Failed to create auth user for ${email}:`, createError.message);
        continue;
      }

      userId = created.user.id;
      console.log(`Created auth user for ${email}`);
    }

    const { error: upsertError } = await admin
      .from("members")
      .upsert(
        {
          email,
          user_id: userId,
          display_name: member.displayName,
          initials: member.initials,
          color: member.color,
          is_active: true,
        },
        { onConflict: "email" }
      );

    if (upsertError) {
      console.error(`Failed to upsert member row for ${email}:`, upsertError.message);
      continue;
    }

    console.log(`Provisioned ${member.displayName} <${email}>`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
