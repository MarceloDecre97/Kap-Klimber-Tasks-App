import { getCurrentMember } from "@/lib/get-current-member";
import { listCategories, listRoster } from "@/lib/data/tasks";
import { TaskForm } from "@/components/tasks/task-form";

export const dynamic = "force-dynamic";

export default async function NewTaskPage() {
  const { supabase } = await getCurrentMember();
  const [roster, categories] = await Promise.all([listRoster(supabase), listCategories(supabase)]);

  return <TaskForm mode="create" roster={roster} categories={categories} />;
}
