import { getCurrentMember } from "@/lib/get-current-member";
import { listNotifications } from "@/lib/data/notifications";
import { listCategories, listRoster, listTasks } from "@/lib/data/tasks";
import { TasksApp } from "@/components/tasks/tasks-app";

export const dynamic = "force-dynamic";

/**
 * `searchParams` is a promise in this version of Next — see
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md.
 */
export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ task?: string | string[] }>;
}) {
  const { supabase, member } = await getCurrentMember();

  const [{ task }, tasks, roster, categories, notifications] = await Promise.all([
    searchParams,
    listTasks(supabase),
    listRoster(supabase),
    listCategories(supabase),
    listNotifications(supabase),
  ]);

  /*
    Where a notification lands. It arrives as "Keith commented on X", so it
    has to open X — dropping someone on an unfiltered task list and letting
    them hunt is how a notification stops being worth tapping.

    Validated against the tasks actually loaded rather than trusted: the value
    comes from a URL, so it is arbitrary text until it matches a real row.
  */
  const raw = Array.isArray(task) ? task[0] : task;
  const focusTaskId = tasks.some((t) => t.id === raw) ? (raw ?? null) : null;

  return (
    <TasksApp
      initialTasks={tasks}
      roster={roster}
      categories={categories}
      me={member}
      notifications={notifications}
      focusTaskId={focusTaskId}
    />
  );
}
