import { getCurrentMember } from "@/lib/get-current-member";
import { listCategories, listRoster, listTasks } from "@/lib/data/tasks";
import { TasksApp } from "@/components/tasks/tasks-app";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const { supabase, member } = await getCurrentMember();

  const [tasks, roster, categories] = await Promise.all([
    listTasks(supabase),
    listRoster(supabase),
    listCategories(supabase),
  ]);

  return <TasksApp initialTasks={tasks} roster={roster} categories={categories} me={member} />;
}
