"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentMember } from "@/lib/get-current-member";
import {
  deletionReasonSchema,
  noteEditSchema,
  noteInputSchema,
  statusEnum,
  reminderInputSchema,
  taskInputSchema,
  taskLinkSchema,
  type TaskLinkInput,
} from "@/lib/validation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type ActionResult<T = { taskId: string }> = { ok: true } & T | { ok: false; error: string };

const taskIdSchema = z.string().uuid();

/**
 * Both top-level views render the same task data, so any mutation has to
 * invalidate both — otherwise acting from one leaves the other stale.
 */
function revalidateTaskViews() {
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}

async function resolveCategoryId(
  supabase: SupabaseClient<Database>,
  memberId: string,
  categoryId: string | null | undefined,
  newLabel: string | undefined
): Promise<string | null> {
  const trimmedLabel = newLabel?.trim();
  if (trimmedLabel) {
    const { data: existing } = await supabase
      .from("categories")
      .select("id")
      .ilike("label", trimmedLabel)
      .maybeSingle();
    if (existing) return existing.id;

    const { data: created, error } = await supabase
      .from("categories")
      .insert({ label: trimmedLabel, created_by: memberId })
      .select("id")
      .single();
    if (error) throw error;
    return created.id;
  }
  return categoryId ?? null;
}

/**
 * Bring a task's attached contacts in line with what was submitted.
 *
 * Diffed rather than cleared and rewritten: `attached_at` and `attached_by`
 * are a record of when somebody put a contact on a task, and deleting every
 * row on each save would reset that history every time a title was fixed.
 *
 * The two-at-most rule is not checked here. The database enforces it with a
 * trigger, and a second copy of a rule is one copy that will eventually be
 * wrong — this only has to send the right set.
 */
async function syncTaskContacts(
  supabase: SupabaseClient<Database>,
  taskId: string,
  memberId: string,
  contactIds: string[] | undefined
): Promise<void> {
  if (contactIds === undefined) return;

  const { data: current, error: readError } = await supabase
    .from("task_contacts")
    .select("contact_id")
    .eq("task_id", taskId);
  if (readError) throw readError;

  const have = new Set((current ?? []).map((row) => row.contact_id));
  const want = new Set(contactIds);

  const toAdd = [...want].filter((id) => !have.has(id));
  const toRemove = [...have].filter((id) => !want.has(id));

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("task_contacts")
      .delete()
      .eq("task_id", taskId)
      .in("contact_id", toRemove);
    if (error) throw error;
  }
  if (toAdd.length > 0) {
    const { error } = await supabase
      .from("task_contacts")
      .insert(toAdd.map((contactId) => ({ task_id: taskId, contact_id: contactId, attached_by: memberId })));
    if (error) throw error;
  }
}

/**
 * Bring a task's links in line with what was submitted.
 *
 * Diffed on (label, url) rather than wiped and re-inserted, for the same
 * reason the assignee list is: saving an unrelated edit should not rewrite
 * rows that did not change. Here it costs less — nothing notifies off a link
 * — but it keeps `created_by` pointing at whoever actually pasted the
 * document instead of whoever last touched the title.
 *
 * Deletes run before inserts, so swapping all three links in one save never
 * meets the three-link trigger on the way through.
 */
async function syncTaskLinks(
  supabase: SupabaseClient<Database>,
  taskId: string,
  memberId: string,
  links: TaskLinkInput[] | undefined
): Promise<void> {
  if (links === undefined) return;

  const { data: current, error: readError } = await supabase
    .from("task_links")
    .select("id, label, url, position")
    .eq("task_id", taskId);
  if (readError) throw readError;

  const key = (link: { label: string; url: string }) => `${link.label}\u0000${link.url}`;
  const have = new Map((current ?? []).map((row) => [key(row), row]));
  const want = new Map(links.map((link, index) => [key(link), { ...link, position: index }]));

  const toRemove = (current ?? []).filter((row) => !want.has(key(row)));
  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("task_links")
      .delete()
      .in("id", toRemove.map((row) => row.id));
    if (error) throw error;
  }

  const toAdd = [...want.values()].filter((link) => !have.has(key(link)));
  if (toAdd.length > 0) {
    const { error } = await supabase.from("task_links").insert(
      toAdd.map((link) => ({
        task_id: taskId,
        label: link.label,
        url: link.url,
        position: link.position,
        created_by: memberId,
      }))
    );
    if (error) throw error;
  }

  /*
    A link that survived can still have moved, because removing the first of
    three shifts the two below it. Without this the order would be whatever
    the positions used to be.
  */
  for (const link of want.values()) {
    const existing = have.get(key(link));
    if (existing && existing.position !== link.position) {
      const { error } = await supabase
        .from("task_links")
        .update({ position: link.position })
        .eq("id", existing.id);
      if (error) throw error;
    }
  }
}

/**
 * May the signed-in member change this task's content?
 *
 * The same rule as `can_edit_task` in 0033 — the creator, or anybody once
 * the creator has been deactivated. Asked here as well as enforced there
 * because the trigger *pins* rather than raises: without this check a
 * non-creator's save would report success and change nothing, which is a
 * worse answer than being told no.
 */
async function canEditTask(
  supabase: SupabaseClient<Database>,
  taskId: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc("can_edit_task", { p_task_id: taskId });
  if (error) throw error;
  return data === true;
}

export async function createTask(input: unknown): Promise<ActionResult> {
  const parsed = taskInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "That task isn't valid." };

  try {
    const { supabase, member } = await getCurrentMember();
    const data = parsed.data;
    const categoryId = await resolveCategoryId(supabase, member.id, data.categoryId, data.newCategoryLabel);

    const { data: task, error } = await supabase
      .from("tasks")
      .insert({
        title: data.title,
        description: data.description || null,
        category_id: categoryId,
        priority: data.priority,
        status: data.status,
        due_date: data.dueDate ?? null,
        created_by: member.id,
      })
      .select("id")
      .single();

    if (error) throw error;

    const { error: assigneeError } = await supabase
      .from("task_assignees")
      .insert(data.assigneeIds.map((memberId) => ({ task_id: task.id, member_id: memberId })));
    if (assigneeError) throw assigneeError;

    await syncTaskContacts(supabase, task.id, member.id, data.contactIds);
    await syncTaskLinks(supabase, task.id, member.id, data.links);

    revalidateTaskViews();
    return { ok: true, taskId: task.id };
  } catch (error) {
    console.error("createTask failed", error);
    return { ok: false, error: "Couldn't save that task. Try again." };
  }
}

export async function updateTask(taskIdInput: string, input: unknown): Promise<ActionResult> {
  const taskId = taskIdSchema.safeParse(taskIdInput);
  const parsed = taskInputSchema.safeParse(input);
  if (!taskId.success) return { ok: false, error: "Invalid task." };
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "That task isn't valid." };

  try {
    const { supabase, member } = await getCurrentMember();

    if (!(await canEditTask(supabase, taskId.data))) {
      return { ok: false, error: "Only the person who created this task can edit it." };
    }

    const data = parsed.data;
    const categoryId = await resolveCategoryId(supabase, member.id, data.categoryId, data.newCategoryLabel);

    const { error } = await supabase
      .from("tasks")
      .update({
        title: data.title,
        description: data.description || null,
        category_id: categoryId,
        priority: data.priority,
        status: data.status,
        due_date: data.dueDate ?? null,
        ...(data.status === "complete" ? { completed_at: new Date().toISOString(), completed_by: member.id } : { completed_at: null, completed_by: null }),
      })
      .eq("id", taskId.data);
    if (error) throw error;

    /*
      Diffed rather than wiped and rewritten. Deleting every assignee and
      re-inserting the same people made an edit to the title look, to anything
      watching the table, exactly like assigning four people from scratch: it
      reset every assigned_at, and now it would fire an "assigned you to this
      task" notification at everyone on every save. Only real additions and
      real removals touch the table.
    */
    const { data: currentRows, error: currentError } = await supabase
      .from("task_assignees")
      .select("member_id")
      .eq("task_id", taskId.data);
    if (currentError) throw currentError;

    const current = new Set((currentRows ?? []).map((row) => row.member_id));
    const wanted = new Set(data.assigneeIds);
    const removed = [...current].filter((id) => !wanted.has(id));
    const added = [...wanted].filter((id) => !current.has(id));

    if (removed.length > 0) {
      const { error: deleteError } = await supabase
        .from("task_assignees")
        .delete()
        .eq("task_id", taskId.data)
        .in("member_id", removed);
      if (deleteError) throw deleteError;
    }

    if (added.length > 0) {
      const { error: assigneeError } = await supabase
        .from("task_assignees")
        .insert(added.map((memberId) => ({ task_id: taskId.data, member_id: memberId })));
      if (assigneeError) throw assigneeError;
    }

    await syncTaskContacts(supabase, taskId.data, member.id, data.contactIds);
    await syncTaskLinks(supabase, taskId.data, member.id, data.links);

    revalidateTaskViews();
    return { ok: true, taskId: taskId.data };
  } catch (error) {
    console.error("updateTask failed", error);
    return { ok: false, error: "Couldn't save that task. Try again." };
  }
}

/* -------------------------------------------------------------------------
   Links, from the banner

   Separate from updateTask because everyone assigned to a task may add a
   link, while only its creator may edit the task itself. Since 0033 an
   assignee cannot open the form at all, so without these two actions the
   permission to add a link would exist on paper and nowhere else.
   ------------------------------------------------------------------------- */

export async function addTaskLink(taskIdInput: string, input: unknown): Promise<ActionResult> {
  const taskId = taskIdSchema.safeParse(taskIdInput);
  const parsed = taskLinkSchema.safeParse(input);
  if (!taskId.success) return { ok: false, error: "Invalid task." };
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "That link isn't valid." };

  try {
    const { supabase, member } = await getCurrentMember();

    /*
      Appended after whatever is already there. Read first rather than
      counting on a default, so a link added from the banner lands below the
      ones added on the form instead of colliding with them at position 0.
    */
    const { data: existing, error: readError } = await supabase
      .from("task_links")
      .select("position")
      .eq("task_id", taskId.data);
    if (readError) throw readError;

    if ((existing ?? []).length >= 3) {
      return { ok: false, error: "A task can carry three links at most. Remove one to add another." };
    }

    const nextPosition = (existing ?? []).reduce((max, row) => Math.max(max, row.position), -1) + 1;

    const { error } = await supabase.from("task_links").insert({
      task_id: taskId.data,
      label: parsed.data.label,
      url: parsed.data.url,
      position: nextPosition,
      created_by: member.id,
    });
    if (error) throw error;

    revalidateTaskViews();
    return { ok: true, taskId: taskId.data };
  } catch (error) {
    console.error("addTaskLink failed", error);
    return { ok: false, error: "Couldn't add that link. Try again." };
  }
}

export async function removeTaskLink(taskIdInput: string, linkIdInput: string): Promise<ActionResult> {
  const taskId = taskIdSchema.safeParse(taskIdInput);
  const linkId = taskIdSchema.safeParse(linkIdInput);
  if (!taskId.success) return { ok: false, error: "Invalid task." };
  if (!linkId.success) return { ok: false, error: "Invalid link." };

  try {
    const { supabase } = await getCurrentMember();
    /*
      Scoped to the task as well as the id. The id alone would be enough —
      it is a primary key — but naming both means a mismatched pair removes
      nothing rather than removing somebody else's link.
    */
    const { error } = await supabase
      .from("task_links")
      .delete()
      .eq("id", linkId.data)
      .eq("task_id", taskId.data);
    if (error) throw error;

    revalidateTaskViews();
    return { ok: true, taskId: taskId.data };
  } catch (error) {
    console.error("removeTaskLink failed", error);
    return { ok: false, error: "Couldn't remove that link. Try again." };
  }
}

export async function setTaskStatus(taskIdInput: string, statusInput: unknown): Promise<ActionResult> {
  const taskId = taskIdSchema.safeParse(taskIdInput);
  const status = statusEnum.safeParse(statusInput);
  if (!taskId.success || !status.success) return { ok: false, error: "That status isn't valid." };

  try {
    const { supabase, member } = await getCurrentMember();
    const isComplete = status.data === "complete";
    const { error } = await supabase
      .from("tasks")
      .update({
        status: status.data,
        completed_at: isComplete ? new Date().toISOString() : null,
        completed_by: isComplete ? member.id : null,
      })
      .eq("id", taskId.data);
    if (error) throw error;

    revalidateTaskViews();
    return { ok: true, taskId: taskId.data };
  } catch (error) {
    console.error("setTaskStatus failed", error);
    return { ok: false, error: "Couldn't update that task. Try again." };
  }
}

/**
 * Toggles whether a task's reminder has been dealt with.
 *
 * Deliberately shared rather than per-member: any member can set or edit a
 * task's reminder, so any member can dismiss it. Purely an attention
 * signal — never touches status, dates, or which dashboard bucket the task
 * sits in.
 *
 * The reminder itself is read back from the row rather than trusted from
 * the client, so a stale page can't dismiss a reminder that has since been
 * changed.
 */
/* -------------------------------------------------------------------------
   Reminders

   Every one of these is a call into a SECURITY DEFINER function, for the
   same reason deleting a task is: the rule — "yourself, or anyone assigned
   if you created the task" — is a sentence about three tables, and there is
   deliberately no insert, update or delete policy on task_reminders for a
   caller to route around it with.

   So these actions carry no permission logic of their own. They translate a
   raise() into a sentence a person can act on, and nothing else.
   ------------------------------------------------------------------------- */

/** Postgres raises with the message we wrote; show that rather than a generic. */
function reminderError(error: unknown, fallback: string): string {
  const message = (error as { message?: string })?.message;
  return typeof message === "string" && message.length > 0 && message.length < 200
    ? message
    : fallback;
}

export async function setTaskReminder(input: unknown): Promise<ActionResult> {
  const parsed = reminderInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That reminder isn't valid." };
  }

  try {
    const { supabase } = await getCurrentMember();
    const { error } = await supabase.rpc("set_task_reminder", {
      p_task_id: parsed.data.taskId,
      p_member_id: parsed.data.memberId,
      p_remind_at: parsed.data.remindAt,
    });
    if (error) throw error;

    revalidateTaskViews();
    return { ok: true, taskId: parsed.data.taskId };
  } catch (error) {
    console.error("setTaskReminder failed", error);
    return { ok: false, error: reminderError(error, "Couldn't set that reminder. Try again.") };
  }
}

/**
 * Handled, or back to waiting.
 *
 * A toggle, matching the chip that has always worked this way. The task id
 * comes along only so the right views are refreshed — the function decides
 * everything else from the reminder itself.
 */
export async function setReminderDismissed(
  taskIdInput: string,
  reminderIdInput: string,
  dismissed: boolean
): Promise<ActionResult> {
  const taskId = taskIdSchema.safeParse(taskIdInput);
  const reminderId = taskIdSchema.safeParse(reminderIdInput);
  if (!taskId.success || !reminderId.success) return { ok: false, error: "Invalid reminder." };

  try {
    const { supabase } = await getCurrentMember();
    const { error } = await supabase.rpc("set_reminder_dismissed", {
      p_reminder_id: reminderId.data,
      p_dismissed: dismissed,
    });
    if (error) throw error;

    revalidateTaskViews();
    return { ok: true, taskId: taskId.data };
  } catch (error) {
    console.error("setReminderDismissed failed", error);
    return { ok: false, error: reminderError(error, "Couldn't update that reminder. Try again.") };
  }
}

export async function clearTaskReminder(
  taskIdInput: string,
  reminderIdInput: string
): Promise<ActionResult> {
  const taskId = taskIdSchema.safeParse(taskIdInput);
  const reminderId = taskIdSchema.safeParse(reminderIdInput);
  if (!taskId.success || !reminderId.success) return { ok: false, error: "Invalid reminder." };

  try {
    const { supabase } = await getCurrentMember();
    const { error } = await supabase.rpc("clear_task_reminder", { p_reminder_id: reminderId.data });
    if (error) throw error;

    revalidateTaskViews();
    return { ok: true, taskId: taskId.data };
  } catch (error) {
    console.error("clearTaskReminder failed", error);
    return { ok: false, error: reminderError(error, "Couldn't remove that reminder. Try again.") };
  }
}

/**
 * Chase somebody about a reminder that fired and was never dealt with.
 *
 * The creator's alone, at most once an hour, and refused outright on a
 * reminder that has not fired or has already been handled — all decided in
 * the database, which is why this reads as thin as it does.
 */
export async function nudgeTaskReminder(
  taskIdInput: string,
  reminderIdInput: string
): Promise<ActionResult> {
  const taskId = taskIdSchema.safeParse(taskIdInput);
  const reminderId = taskIdSchema.safeParse(reminderIdInput);
  if (!taskId.success || !reminderId.success) return { ok: false, error: "Invalid reminder." };

  try {
    const { supabase } = await getCurrentMember();
    const { error } = await supabase.rpc("nudge_task_reminder", { p_reminder_id: reminderId.data });
    if (error) throw error;

    revalidateTaskViews();
    return { ok: true, taskId: taskId.data };
  } catch (error) {
    console.error("nudgeTaskReminder failed", error);
    return { ok: false, error: reminderError(error, "Couldn't send that nudge. Try again.") };
  }
}

/*
  ---------------------------------------------------------------------------
  Deleting a task

  None of these write to the tasks table. Every rule about who may delete
  what lives in database functions (0014), and a plain UPDATE that tries to
  set deleted_at has it pinned straight back by a trigger — so the approval
  flow is not something a caller can route around, here or from the SQL
  editor.

  The messages those functions raise are written for people to read
  ("Only the person who created this task can delete it. Ask them instead."),
  so they are passed through rather than replaced with a generic apology. The
  fallback only covers the case where something failed for a reason nobody
  anticipated.
  ---------------------------------------------------------------------------
*/
function rpcError(error: unknown, fallback: string): string {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" && message.trim() ? message : fallback;
}

/** Delete a task you created. No approval — there is nobody to ask. */
export async function deleteOwnTask(taskIdInput: string): Promise<ActionResult> {
  const taskId = taskIdSchema.safeParse(taskIdInput);
  if (!taskId.success) return { ok: false, error: "Invalid task." };

  const { supabase } = await getCurrentMember();
  const { error } = await supabase.rpc("delete_own_task", { p_task_id: taskId.data });
  if (error) {
    console.error("deleteOwnTask failed", error);
    return { ok: false, error: rpcError(error, "Couldn't delete that task. Try again.") };
  }

  revalidateTaskViews();
  return { ok: true, taskId: taskId.data };
}

/**
 * Ask the creator to delete a task you did not create.
 *
 * The reason is required, and that is the point of it: "Keith wants to delete
 * this" is not something anyone can decide on from a phone, while "duplicate
 * of the Sep 4 one" is.
 */
export async function requestTaskDeletion(
  taskIdInput: string,
  reasonInput: unknown
): Promise<ActionResult> {
  const taskId = taskIdSchema.safeParse(taskIdInput);
  const reason = deletionReasonSchema.safeParse(reasonInput);
  if (!taskId.success) return { ok: false, error: "Invalid task." };
  if (!reason.success) {
    return { ok: false, error: reason.error.issues[0]?.message ?? "Say why it should go." };
  }

  const { supabase } = await getCurrentMember();
  const { error } = await supabase.rpc("request_task_deletion", {
    p_task_id: taskId.data,
    p_reason: reason.data,
  });
  if (error) {
    console.error("requestTaskDeletion failed", error);
    return { ok: false, error: rpcError(error, "Couldn't send that request. Try again.") };
  }

  revalidateTaskViews();
  return { ok: true, taskId: taskId.data };
}

/** The creator's answer. `approve` deletes it; anything else keeps it. */
export async function resolveTaskDeletion(
  taskIdInput: string,
  approve: boolean
): Promise<ActionResult> {
  const taskId = taskIdSchema.safeParse(taskIdInput);
  if (!taskId.success) return { ok: false, error: "Invalid task." };

  const { supabase } = await getCurrentMember();
  const { error } = await supabase.rpc("resolve_task_deletion", {
    p_task_id: taskId.data,
    p_approve: approve,
  });
  if (error) {
    console.error("resolveTaskDeletion failed", error);
    return { ok: false, error: rpcError(error, "Couldn't record that. Try again.") };
  }

  revalidateTaskViews();
  return { ok: true, taskId: taskId.data };
}

/** Withdrawing your own request. */
export async function cancelTaskDeletion(taskIdInput: string): Promise<ActionResult> {
  const taskId = taskIdSchema.safeParse(taskIdInput);
  if (!taskId.success) return { ok: false, error: "Invalid task." };

  const { supabase } = await getCurrentMember();
  const { error } = await supabase.rpc("cancel_task_deletion", { p_task_id: taskId.data });
  if (error) {
    console.error("cancelTaskDeletion failed", error);
    return { ok: false, error: rpcError(error, "Couldn't withdraw that. Try again.") };
  }

  revalidateTaskViews();
  return { ok: true, taskId: taskId.data };
}

/** Bringing back one of your own, from the undo banner or from the bin. */
export async function restoreTask(taskIdInput: string): Promise<ActionResult> {
  const taskId = taskIdSchema.safeParse(taskIdInput);
  if (!taskId.success) return { ok: false, error: "Invalid task." };

  const { supabase } = await getCurrentMember();
  const { error } = await supabase.rpc("restore_task", { p_task_id: taskId.data });
  if (error) {
    console.error("restoreTask failed", error);
    return { ok: false, error: rpcError(error, "Couldn't bring that back.") };
  }

  revalidateTaskViews();
  return { ok: true, taskId: taskId.data };
}

/**
 * Erasing one of your own for good, from the Recently deleted list.
 *
 * The only irreversible thing in this app. Every rule that makes it safe
 * lives in the database — creator only, and only on a task already deleted —
 * because this action is not the only way to reach the RPC and a check here
 * would be a check anyone bypassing the UI never runs. See 0021_purge_task.sql.
 */
export async function purgeTask(taskIdInput: string): Promise<ActionResult> {
  const taskId = taskIdSchema.safeParse(taskIdInput);
  if (!taskId.success) return { ok: false, error: "Invalid task." };

  const { supabase } = await getCurrentMember();
  const { error } = await supabase.rpc("purge_task", { p_task_id: taskId.data });
  if (error) {
    console.error("purgeTask failed", error);
    return { ok: false, error: rpcError(error, "Couldn't erase that.") };
  }

  revalidateTaskViews();
  return { ok: true, taskId: taskId.data };
}

export async function addNote(input: unknown): Promise<ActionResult<{ noteId: string }>> {
  const parsed = noteInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Say what happened." };

  try {
    const { supabase, member } = await getCurrentMember();
    const { data: note, error } = await supabase
      .from("task_notes")
      .insert({
        task_id: parsed.data.taskId,
        member_id: member.id,
        body: parsed.data.body,
        parent_note_id: parsed.data.parentNoteId ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;

    revalidateTaskViews();
    return { ok: true, noteId: note.id };
  } catch (error) {
    console.error("addNote failed", error);
    return { ok: false, error: "Couldn't add that note. Try again." };
  }
}

/**
 * Edits the body of a note you wrote.
 *
 * Authorship is enforced twice over, and neither check is here: the RLS
 * policy limits the update to rows whose member_id is the caller's, and a
 * trigger pins every column except the body so an edit cannot reassign a
 * note or move it to another task. This action only has to send the text —
 * which is why it does not read the row back first to compare.
 */
export async function editNote(input: unknown): Promise<ActionResult<{ noteId: string }>> {
  const parsed = noteEditSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "That note isn't valid." };

  try {
    const { supabase } = await getCurrentMember();
    const { data, error } = await supabase
      .from("task_notes")
      .update({ body: parsed.data.body })
      .eq("id", parsed.data.noteId)
      .select("id");
    if (error) throw error;
    // RLS returns zero rows rather than an error when the note is not yours.
    if (!data || data.length === 0) {
      return { ok: false, error: "You can only edit notes you wrote." };
    }

    revalidateTaskViews();
    return { ok: true, noteId: parsed.data.noteId };
  } catch (error) {
    console.error("editNote failed", error);
    return { ok: false, error: "Couldn't save that edit. Try again." };
  }
}

const noteIdSchema = z.string().uuid();

/**
 * Removes a note you wrote.
 *
 * Soft, because `parent_note_id` cascades: a hard delete of a note carrying
 * replies would take those replies with it, and they may be somebody else's.
 * The row stays, the app stops showing it, and where replies survive a marker
 * is left in its place.
 *
 * Authorship is enforced by the same RLS policy that governs editing — this
 * is an update like any other, so a note that is not yours matches no row.
 */
export async function deleteNote(noteIdInput: string): Promise<ActionResult<{ noteId: string }>> {
  const noteId = noteIdSchema.safeParse(noteIdInput);
  if (!noteId.success) return { ok: false, error: "Invalid note." };

  try {
    const { supabase } = await getCurrentMember();
    const { data, error } = await supabase
      .from("task_notes")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", noteId.data)
      .is("deleted_at", null)
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) {
      return { ok: false, error: "You can only delete notes you wrote." };
    }

    revalidateTaskViews();
    return { ok: true, noteId: noteId.data };
  } catch (error) {
    console.error("deleteNote failed", error);
    return { ok: false, error: "Couldn't delete that note. Try again." };
  }
}

/**
 * Toggles the current member's like on a note.
 *
 * A like is now only a reaction. What counts as *read* is tracked separately
 * and written automatically by `markTaskRead`, so nobody has to press
 * anything for the Dashboard's unread count to be right.
 */
export async function toggleNoteLike(noteIdInput: string): Promise<ActionResult<{ liked: boolean }>> {
  const noteId = noteIdSchema.safeParse(noteIdInput);
  if (!noteId.success) return { ok: false, error: "Invalid note." };

  try {
    const { supabase, member } = await getCurrentMember();

    const { data: existing, error: lookupError } = await supabase
      .from("task_note_likes")
      .select("note_id")
      .eq("note_id", noteId.data)
      .eq("member_id", member.id)
      .maybeSingle();
    if (lookupError) throw lookupError;

    if (existing) {
      const { error } = await supabase
        .from("task_note_likes")
        .delete()
        .eq("note_id", noteId.data)
        .eq("member_id", member.id);
      if (error) throw error;
      revalidateTaskViews();
      return { ok: true, liked: false };
    }

    const { error } = await supabase
      .from("task_note_likes")
      .insert({ note_id: noteId.data, member_id: member.id });
    if (error) throw error;

    revalidateTaskViews();
    return { ok: true, liked: true };
  } catch (error) {
    console.error("toggleNoteLike failed", error);
    return { ok: false, error: "Couldn't update that. Try again." };
  }
}

/**
 * Records that the current member has just looked at a task.
 *
 * Called when a task card is expanded. Deliberately silent: it returns
 * nothing the UI waits on and never surfaces an error, because failing to
 * record a read must not interrupt someone reading. The views are not
 * revalidated either — re-rendering the list the instant you open a card
 * would collapse the very thing you opened.
 *
 * It also clears the task's notifications. Opening a task is the strongest
 * possible evidence that you have seen what happened on it, and a bell still
 * counting a note you are looking at is how a notification badge becomes
 * something people learn to ignore.
 */
export async function markTaskRead(taskIdInput: string): Promise<void> {
  const taskId = taskIdSchema.safeParse(taskIdInput);
  if (!taskId.success) return;

  try {
    const { supabase, member } = await getCurrentMember();
    await Promise.all([
      supabase
        .from("task_reads")
        .upsert(
          { task_id: taskId.data, member_id: member.id, last_read_at: new Date().toISOString() },
          { onConflict: "task_id,member_id" }
        ),
      supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("task_id", taskId.data)
        .is("read_at", null),
    ]);
  } catch (error) {
    console.error("markTaskRead failed", error);
  }
}
