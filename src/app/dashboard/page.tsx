import { getCurrentMember } from "@/lib/get-current-member";
import { listNotifications } from "@/lib/data/notifications";
import { listRoster, listTasks } from "@/lib/data/tasks";
import { DashboardApp } from "@/components/dashboard/dashboard-app";

export const dynamic = "force-dynamic";

/**
 * `searchParams` is a promise in this version of Next — see
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ task?: string | string[] }>;
}) {
  const { supabase, member } = await getCurrentMember();

  const [{ task }, tasks, roster, notifications] = await Promise.all([
    searchParams,
    listTasks(supabase, member.id),
    listRoster(supabase),
    listNotifications(supabase),
  ]);

  /*
    Which card to reopen. Editing a task from here goes to a full screen and
    comes back; without this you would return to a panel scrolled to the top
    with the card you were working on closed.

    Validated against the tasks actually loaded rather than trusted: the value
    comes from a URL, so it is arbitrary text until it matches a real row.
  */
  const raw = Array.isArray(task) ? task[0] : task;
  const focusTaskId = tasks.some((t) => t.id === raw) ? (raw ?? null) : null;

  return (
    <DashboardApp
      initialTasks={tasks}
      roster={roster}
      me={member}
      notifications={notifications}
      focusTaskId={focusTaskId}
    />
  );
}
