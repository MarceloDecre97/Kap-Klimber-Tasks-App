"use server";

import { getCurrentMember } from "@/lib/get-current-member";

/**
 * Marks everything currently unread as read.
 *
 * Called when the inbox is opened, which is the only honest moment: the bell
 * exists to say "there is something you have not seen", and once you have
 * opened it that has stopped being true. Leaving the count up until each row
 * was clicked would make it a chore list rather than a signal, which is the
 * mistake the old "press Seen on every note" flow made.
 *
 * Nothing here names a member. RLS restricts the update to the caller's own
 * rows, and a trigger pins every column except read_at, so this cannot mark
 * anyone else's inbox read or quietly rewrite what it says.
 */
export async function markNotificationsRead(): Promise<void> {
  try {
    const { supabase } = await getCurrentMember();
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .is("read_at", null);
  } catch (error) {
    // Silent by design, like markTaskRead: failing to clear a badge must
    // never interrupt somebody reading their notifications.
    console.error("markNotificationsRead failed", error);
  }
}

/**
 * The same, for one task — used when a task is opened, so reading the thing
 * itself clears the notification about it. Without this the bell would keep
 * counting a note you have demonstrably just read.
 */
export async function markTaskNotificationsRead(taskId: string): Promise<void> {
  try {
    const { supabase } = await getCurrentMember();
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("task_id", taskId)
      .is("read_at", null);
  } catch (error) {
    console.error("markTaskNotificationsRead failed", error);
  }
}

/**
 * Removes one row from the inbox.
 *
 * "Mark all read" clears the count but leaves the list, and a list nobody can
 * prune stops being read at all. This is the tidy-up: own rows only, enforced
 * by the RLS delete policy added in 0016 rather than by this function.
 *
 * Deleted rather than hidden. The record that matters is the task's Activity
 * log, which is untouched by this; the notification is only ever the nudge.
 */
export async function dismissNotification(id: string): Promise<void> {
  try {
    const { supabase } = await getCurrentMember();
    await supabase.from("notifications").delete().eq("id", id);
  } catch (error) {
    console.error("dismissNotification failed", error);
  }
}
