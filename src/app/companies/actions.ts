"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentMember } from "@/lib/get-current-member";
import { companyInputSchema } from "@/lib/validation";
import { canonicalCountry } from "@/lib/countries";

type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const companyIdSchema = z.string().uuid();

/**
 * A company's name is copied onto every contact at it, and a contact's name
 * shows on a task pill. So a rename here reaches further than it looks: the
 * book, every contact page, and both task views all have to be told.
 */
function revalidateCompanyViews(companyId?: string) {
  revalidatePath("/contacts");
  revalidatePath("/companies");
  if (companyId) revalidatePath(`/companies/${companyId}`);
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}

/**
 * A value used as a whole `ilike` pattern, with its wildcards defused.
 * See the note on the twin of this in the contact actions.
 */
function likeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

/**
 * The type a company should end up with.
 *
 * A typed name wins over a picked one, and an existing label is matched
 * case-insensitively before a new row is made — the same flow, and the same
 * reasoning, as the contact categories. Anything somebody invents mid-save
 * becomes a real type everybody can pick next time.
 */
async function resolveCompanyType(
  supabase: Awaited<ReturnType<typeof getCurrentMember>>["supabase"],
  memberId: string,
  typeId: string | null | undefined,
  newLabel: string | undefined
): Promise<string | null> {
  const label = newLabel?.trim();
  if (!label) return typeId ?? null;

  const { data: existing } = await supabase
    .from("company_types")
    .select("id")
    .ilike("label", likeLiteral(label))
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("company_types")
    // The neutral icon, sorting just above Other — where "the one I had to
    // invent" belongs.
    .insert({ label, icon: "building", sort_order: 90, created_by: memberId })
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
}

function dbError(error: unknown, fallback: string): string {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" && message.trim() ? message : fallback;
}

/**
 * Correcting a company, in the one place that fixes it for everybody.
 *
 * Anyone on the team may: a wrong address should be fixable by whoever
 * notices it, which is the same rule contacts follow. Renaming is allowed
 * too, and the trigger in 0024_companies.sql carries the new name out to
 * every contact at it.
 */
export async function updateCompany(
  companyIdInput: string,
  input: unknown
): Promise<ActionResult<{ companyId: string }>> {
  const companyId = companyIdSchema.safeParse(companyIdInput);
  if (!companyId.success) return { ok: false, error: "Invalid company." };

  const parsed = companyInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the details." };
  }

  const v = parsed.data;
  try {
    const { supabase, member } = await getCurrentMember();
    const typeId = await resolveCompanyType(supabase, member.id, v.typeId, v.newTypeLabel);

    const { error } = await supabase
      .from("companies")
      .update({
        name: v.name,
        about: v.about,
        website: v.website,
        company_number: v.companyNumber,
        street: v.street,
        suite: v.suite,
        city: v.city,
        state: v.state,
        postal_code: v.postalCode,
        country: canonicalCountry(v.country),
        type_id: typeId,
      })
      .eq("id", companyId.data);

    if (error) throw error;
    revalidateCompanyViews(companyId.data);
    return { ok: true, companyId: companyId.data };
  } catch (error) {
    console.error("updateCompany failed", error);
    // The unique index is the only thing here a person can trip, and the
    // constraint's own message says nothing they could act on.
    if ((error as { code?: string }).code === "23505") {
      return { ok: false, error: "Another company is already in the book under that name." };
    }
    return { ok: false, error: dbError(error, "Couldn't save those changes.") };
  }
}

/**
 * A company added directly, rather than as a side effect of a contact.
 *
 * Both doors lead to the same room. Adding a contact still creates the
 * company you type on them — that was never a step to be got rid of — but a
 * company you have only just heard of, with nobody named at it yet, now has
 * somewhere to go instead of waiting for a person to hang it on.
 */
export async function createCompany(input: unknown): Promise<ActionResult<{ companyId: string }>> {
  const parsed = companyInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the details." };
  }

  const v = parsed.data;
  try {
    const { supabase, member } = await getCurrentMember();
    const typeId = await resolveCompanyType(supabase, member.id, v.typeId, v.newTypeLabel);

    const { data, error } = await supabase
      .from("companies")
      .insert({
        name: v.name,
        about: v.about,
        website: v.website,
        company_number: v.companyNumber,
        street: v.street,
        suite: v.suite,
        city: v.city,
        state: v.state,
        postal_code: v.postalCode,
        country: canonicalCountry(v.country),
        type_id: typeId,
        created_by: member.id,
      })
      .select("id")
      .single();

    if (error) throw error;

    revalidateCompanyViews(data.id);
    return { ok: true, companyId: data.id };
  } catch (error) {
    console.error("createCompany failed", error);
    if ((error as { code?: string }).code === "23505") {
      return { ok: false, error: "That company is already in the book." };
    }
    return { ok: false, error: dbError(error, "Couldn't add that company.") };
  }
}

/**
 * Removing a company, which is only ever tidying up a typo.
 *
 * There is no bin: a company with nobody at it is not a record anybody will
 * come looking for. The refusal while people are still at it comes from
 * delete_company, so the rule has one home rather than two.
 */
export async function deleteCompany(companyIdInput: string): Promise<ActionResult<object>> {
  const companyId = companyIdSchema.safeParse(companyIdInput);
  if (!companyId.success) return { ok: false, error: "Invalid company." };

  const { supabase } = await getCurrentMember();
  const { error } = await supabase.rpc("delete_company", { p_company_id: companyId.data });
  if (error) {
    console.error("deleteCompany failed", error);
    return { ok: false, error: dbError(error, "Couldn't remove that company.") };
  }

  revalidateCompanyViews();
  return { ok: true };
}
