/**
 * Provisions team members: creates each an auth.users row and a matching
 * public.members row, and sets (or resets) their password from
 * SEED_INITIAL_PASSWORD. This is the stand-in for the future admin panel —
 * until that exists, editing scripts/members.json and re-running
 * `npm run seed:members` is how the roster is managed.
 *
 * Password login is a temporary simplification while email deliverability
 * for the passwordless OTP flow gets sorted out — that flow's code
 * (src/app/login/actions.ts: requestOtp/verifyOtp) is untouched and still
 * there to switch back to later. Everything else (RLS, sessions, per-user
 * auth.uid()) is unchanged; this only changes how a session gets started.
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
  const initialPassword = process.env.SEED_INITIAL_PASSWORD;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (in .env.local) before seeding."
    );
  }
  if (!initialPassword || initialPassword.length < 8) {
    throw new Error(
      "Set SEED_INITIAL_PASSWORD (in .env.local) to a password of 8+ characters before seeding. " +
        "This is the password every seeded member starts with — share it with the team out of band."
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
        password: initialPassword,
        email_confirm: true,
      });

      if (createError) {
        console.error(`Failed to create auth user for ${email}:`, createError.message);
        continue;
      }

      userId = created.user.id;
      console.log(`Created auth user for ${email}`);
    } else {
      const { error: passwordError } = await admin.auth.admin.updateUserById(userId, {
        password: initialPassword,
      });

      if (passwordError) {
        console.error(`Failed to set password for ${email}:`, passwordError.message);
        continue;
      }
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
