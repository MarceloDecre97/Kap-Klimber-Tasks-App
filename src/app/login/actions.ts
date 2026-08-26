"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { maskEmail } from "@/lib/mask-email";
import { otpCodeSchema } from "@/lib/validation";

const memberIdSchema = z.string().uuid();

async function resolveMemberEmail(memberId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("members")
    .select("email, display_name")
    .eq("id", memberId)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

export async function requestOtp(memberIdInput: string) {
  const parsed = memberIdSchema.safeParse(memberIdInput);
  if (!parsed.success) return { ok: false as const, error: "That doesn't look like a valid person." };

  const member = await resolveMemberEmail(parsed.data);
  if (!member) {
    return { ok: false as const, error: "We couldn't find that person. Ask Marcelo to add you." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: member.email,
    options: { shouldCreateUser: false },
  });

  if (error) {
    console.error("signInWithOtp failed", { status: error.status, code: error.code, message: error.message });
    return { ok: false as const, error: "We couldn't send a code right now. Try again in a moment." };
  }

  return { ok: true as const, maskedEmail: maskEmail(member.email), displayName: member.display_name };
}

export async function verifyOtp(memberIdInput: string, codeInput: string) {
  const memberResult = memberIdSchema.safeParse(memberIdInput);
  const codeResult = otpCodeSchema.safeParse(codeInput);

  if (!memberResult.success) return { ok: false as const, error: "That doesn't look like a valid person." };
  if (!codeResult.success) return { ok: false as const, error: codeResult.error.issues[0]?.message ?? "Enter the 6-digit code." };

  const member = await resolveMemberEmail(memberResult.data);
  if (!member) {
    return { ok: false as const, error: "We couldn't find that person. Ask Marcelo to add you." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email: member.email,
    token: codeResult.data,
    type: "email",
  });

  if (error) {
    console.error("verifyOtp failed", { status: error.status, code: error.code, message: error.message });
    return { ok: false as const, error: "That code is wrong or has expired. Request a new one." };
  }

  return { ok: true as const };
}
