"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentMember } from "@/lib/get-current-member";
import { noteEditSchema, noteInputSchema, statusEnum, taskInputSchema } from "@/lib/validation";
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
        reminder_at: data.reminderAt ?? null,
        created_by: member.id,
      })
      .select("id")
      .single();

    if (error) throw error;

    const { error: assigneeError } = await supabase
      .from("task_assignees")
      .insert(data.assigneeIds.map((memberId) => ({ task_id: task.id, member_id: memberId })));
    if (assigneeError) throw assigneeError;

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
        reminder_at: data.reminderAt ?? null,
        ...(data.status === "complete" ? { completed_at: new Date().toISOString(), completed_by: member.id } : { completed_at: null, completed_by: null }),
      })
      .eq("id", taskId.data);
    if (error) throw error;

    const { error: deleteError } = await supabase.from("task_assignees").delete().eq("task_id", taskId.data);
    if (deleteError) throw deleteError;

    const { error: assigneeError } = await supabase
      .from("task_assignees")
      .insert(data.assigneeIds.map((memberId) => ({ task_id: taskId.data, member_id: memberId })));
    if (assigneeError) throw assigneeError;

    revalidateTaskViews();
    return { ok: true, taskId: taskId.data };
  } catch (error) {
    console.error("updateTask failed", error);
    return { ok: false, error: "Couldn't save that task. Try again." };
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
 * changed. Editing reminder_at clears the dismissal via a database trigger.
 */
export async function toggleReminderDismissal(
  taskIdInput: string
): Promise<ActionResult<{ taskId: string; dismissed: boolean }>> {
  const taskId = taskIdSchema.safeParse(taskIdInput);
  if (!taskId.success) return { ok: false, error: "Invalid task." };

  try {
    const { supabase, member } = await getCurrentMember();

    const { data: task, error: lookupError } = await supabase
      .from("tasks")
      .select("reminder_at, reminder_dismissed_at")
      .eq("id", taskId.data)
      .is("deleted_at", null)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!task) return { ok: false, error: "That task no longer exists." };
    if (!task.reminder_at) return { ok: false, error: "That task has no reminder." };

    const dismissing = !task.reminder_dismissed_at;
    const { error } = await supabase
      .from("tasks")
      .update({
        reminder_dismissed_at: dismissing ? new Date().toISOString() : null,
        reminder_dismissed_by: dismissing ? member.id : null,
      })
      .eq("id", taskId.data);
    if (error) throw error;

    revalidateTaskViews();
    return { ok: true, taskId: taskId.data, dismissed: dismissing };
  } catch (error) {
    console.error("toggleReminderDismissal failed", error);
    return { ok: false, error: "Couldn't update that reminder. Try again." };
  }
}

export async function softDeleteTask(taskIdInput: string): Promise<ActionResult> {
  const taskId = taskIdSchema.safeParse(taskIdInput);
  if (!taskId.success) return { ok: false, error: "Invalid task." };

  try {
    const { supabase } = await getCurrentMember();
    const { error } = await supabase
      .from("tasks")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", taskId.data);
    if (error) throw error;

    revalidateTaskViews();
    return { ok: true, taskId: taskId.data };
  } catch (error) {
    console.error("softDeleteTask failed", error);
    return { ok: false, error: "Couldn't delete that task. Try again." };
  }
}

export async function restoreTask(taskIdInput: string): Promise<ActionResult> {
  const taskId = taskIdSchema.safeParse(taskIdInput);
  if (!taskId.success) return { ok: false, error: "Invalid task." };

  try {
    const { supabase } = await getCurrentMember();
    const { error } = await supabase.from("tasks").update({ deleted_at: null }).eq("id", taskId.data);
    if (error) throw error;

    revalidateTaskViews();
    return { ok: true, taskId: taskId.data };
  } catch (error) {
    console.error("restoreTask failed", error);
    return { ok: false, error: "Couldn't undo that delete." };
  }
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
 */
export async function markTaskRead(taskIdInput: string): Promise<void> {
  const taskId = taskIdSchema.safeParse(taskIdInput);
  if (!taskId.success) return;

  try {
    const { supabase, member } = await getCurrentMember();
    await supabase
      .from("task_reads")
      .upsert(
        { task_id: taskId.data, member_id: member.id, last_read_at: new Date().toISOString() },
        { onConflict: "task_id,member_id" }
      );
  } catch (error) {
    console.error("markTaskRead failed", error);
  }
}
