"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentMember } from "@/lib/get-current-member";
import { contactInputSchema } from "@/lib/validation";

type ActionResult<T = { contactId: string }> = ({ ok: true } & T) | { ok: false; error: string };

const contactIdSchema = z.string().uuid();

/**
 * Anything that changes a contact invalidates the book, that contact's own
 * page, and both task views — a contact's name shows on a task pill, so a
 * rename that stopped at /contacts would leave the Tasklist saying the old
 * one until something else happened to refresh it.
 */
function revalidateContactViews(contactId?: string) {
  revalidatePath("/contacts");
  if (contactId) revalidatePath(`/contacts/${contactId}`);
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}

function rpcError(error: unknown, fallback: string): string {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" && message.trim() ? message : fallback;
}

/** Zod's first complaint, which is the one the form should show. */
function firstIssue(error: z.ZodError, fallback: string): string {
  return error.issues[0]?.message ?? fallback;
}

/**
 * Who else already has this number or address.
 *
 * Called before saving so the form can warn, and deliberately not enforced:
 * two people genuinely can share a line. The search reaches into Recently
 * deleted as well and says so, because re-adding somebody who was
 * deliberately removed is the other half of this mistake.
 */
export interface DuplicateMatch {
  id: string;
  first_name: string;
  last_name: string;
  job_title: string | null;
  company: string | null;
  matched_on: string;
  in_bin: boolean;
}

export async function findDuplicates(
  input: unknown,
  excludeId?: string | null
): Promise<ActionResult<{ matches: DuplicateMatch[] }>> {
  const parsed = contactInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error, "Check the details.") };

  const exclude = excludeId ? contactIdSchema.safeParse(excludeId) : null;
  const { supabase } = await getCurrentMember();

  const { data, error } = await supabase.rpc("find_contact_duplicates", {
    p_email: parsed.data.email,
    p_email2: parsed.data.email2,
    p_mobile: parsed.data.mobile,
    p_office: parsed.data.officePhone,
    p_exclude_id: exclude?.success ? exclude.data : null,
  });

  if (error) {
    console.error("findDuplicates failed", error);
    return { ok: false, error: rpcError(error, "Couldn't check for duplicates.") };
  }
  return { ok: true, matches: (data ?? []) as DuplicateMatch[] };
}

export async function createContact(input: unknown): Promise<ActionResult> {
  const parsed = contactInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error, "Check the details.") };

  try {
    const { supabase, member } = await getCurrentMember();
    const v = parsed.data;

    const { data: contact, error } = await supabase
      .from("contacts")
      .insert({
        first_name: v.firstName,
        last_name: v.lastName,
        job_title: v.jobTitle,
        company: v.company,
        mobile: v.mobile,
        office_phone: v.officePhone,
        email: v.email,
        email2: v.email2,
        website: v.website,
        street: v.street,
        city: v.city,
        state: v.state,
        postal_code: v.postalCode,
        category_id: v.categoryId ?? null,
        source: v.source,
        notes: v.notes,
        created_by: member.id,
      })
      .select("id")
      .single();

    if (error) throw error;

    revalidateContactViews(contact.id);
    return { ok: true, contactId: contact.id };
  } catch (error) {
    console.error("createContact failed", error);
    return { ok: false, error: rpcError(error, "Couldn't save that contact.") };
  }
}

/**
 * Anyone on the team can edit anyone's contact — a wrong number should be
 * fixable by whoever spots it. The activity log is what makes that safe, and
 * it is written by a trigger, so nothing here has to remember to record it.
 *
 * deleted_at and deleted_by are deliberately not in this update. They are
 * pinned by a guard trigger anyway; leaving them out means the intent
 * matches the enforcement instead of relying on it.
 */
export async function updateContact(
  contactIdInput: string,
  input: unknown
): Promise<ActionResult> {
  const contactId = contactIdSchema.safeParse(contactIdInput);
  if (!contactId.success) return { ok: false, error: "Invalid contact." };

  const parsed = contactInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error, "Check the details.") };

  try {
    const { supabase } = await getCurrentMember();
    const v = parsed.data;

    const { error } = await supabase
      .from("contacts")
      .update({
        first_name: v.firstName,
        last_name: v.lastName,
        job_title: v.jobTitle,
        company: v.company,
        mobile: v.mobile,
        office_phone: v.officePhone,
        email: v.email,
        email2: v.email2,
        website: v.website,
        street: v.street,
        city: v.city,
        state: v.state,
        postal_code: v.postalCode,
        category_id: v.categoryId ?? null,
        source: v.source,
        notes: v.notes,
      })
      .eq("id", contactId.data);

    if (error) throw error;

    revalidateContactViews(contactId.data);
    return { ok: true, contactId: contactId.data };
  } catch (error) {
    console.error("updateContact failed", error);
    return { ok: false, error: rpcError(error, "Couldn't save those changes.") };
  }
}

/* -------------------------------------------------------------------------
   Deleting a contact

   Every rule here lives in 0022_contacts.sql — who may, when, and what it
   takes with it. These actions carry the call and the message back; they
   deliberately do not re-implement the checks, because two copies of a rule
   is one copy that will be wrong.
   ------------------------------------------------------------------------- */

/**
 * What is standing in the way, if anything.
 *
 * Asked before offering to delete, so the dialog can say which task is
 * holding the contact and offer to open it — rather than refusing and
 * leaving somebody to work out why on their own.
 */
export async function blockingTasksFor(
  contactIdInput: string
): Promise<ActionResult<{ tasks: { task_id: string; title: string; status: string }[] }>> {
  const contactId = contactIdSchema.safeParse(contactIdInput);
  if (!contactId.success) return { ok: false, error: "Invalid contact." };

  const { supabase } = await getCurrentMember();
  const { data, error } = await supabase.rpc("contact_blocking_tasks", {
    p_contact_id: contactId.data,
  });
  if (error) {
    console.error("blockingTasksFor failed", error);
    return { ok: false, error: rpcError(error, "Couldn't check that contact.") };
  }
  return { ok: true, tasks: (data ?? []) as { task_id: string; title: string; status: string }[] };
}

/** Step one: into Recently deleted, where it stays until somebody acts. */
export async function deleteContact(contactIdInput: string): Promise<ActionResult> {
  const contactId = contactIdSchema.safeParse(contactIdInput);
  if (!contactId.success) return { ok: false, error: "Invalid contact." };

  const { supabase } = await getCurrentMember();
  const { error } = await supabase.rpc("delete_contact", { p_contact_id: contactId.data });
  if (error) {
    console.error("deleteContact failed", error);
    return { ok: false, error: rpcError(error, "Couldn't delete that contact.") };
  }

  revalidateContactViews(contactId.data);
  return { ok: true, contactId: contactId.data };
}

/** Out of the bin, unchanged, with its task pills still attached. */
export async function restoreContact(contactIdInput: string): Promise<ActionResult> {
  const contactId = contactIdSchema.safeParse(contactIdInput);
  if (!contactId.success) return { ok: false, error: "Invalid contact." };

  const { supabase } = await getCurrentMember();
  const { error } = await supabase.rpc("restore_contact", { p_contact_id: contactId.data });
  if (error) {
    console.error("restoreContact failed", error);
    return { ok: false, error: rpcError(error, "Couldn't put that contact back.") };
  }

  revalidateContactViews(contactId.data);
  return { ok: true, contactId: contactId.data };
}

/**
 * Step two, and the only irreversible thing in the book.
 *
 * Returns what it destroyed so the toast can name it — and note there is no
 * Undo offered anywhere afterwards, because there is nothing left to bring
 * back and the button would be a lie.
 */
export interface PurgedContact {
  name: string;
  phones: number;
  emails: number;
  addresses: number;
  tasks: number;
}

export async function purgeContact(
  contactIdInput: string
): Promise<ActionResult<{ contactId: string; erased: PurgedContact | null }>> {
  const contactId = contactIdSchema.safeParse(contactIdInput);
  if (!contactId.success) return { ok: false, error: "Invalid contact." };

  const { supabase } = await getCurrentMember();
  const { data, error } = await supabase.rpc("purge_contact", { p_contact_id: contactId.data });
  if (error) {
    console.error("purgeContact failed", error);
    return { ok: false, error: rpcError(error, "Couldn't erase that contact.") };
  }

  revalidateContactViews(contactId.data);
  return { ok: true, contactId: contactId.data, erased: (data as PurgedContact) ?? null };
}
