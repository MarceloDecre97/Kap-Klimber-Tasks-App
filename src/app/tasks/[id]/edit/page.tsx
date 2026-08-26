import { notFound } from "next/navigation";
import { getCurrentMember } from "@/lib/get-current-member";
import { getTask, listCategories, listRoster } from "@/lib/data/tasks";
import { TaskForm } from "@/components/tasks/task-form";

export const dynamic = "force-dynamic";

export default async function EditTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await getCurrentMember();
  const [task, roster, categories] = await Promise.all([getTask(supabase, id), listRoster(supabase), listCategories(supabase)]);

  if (!task) notFound();

  return <TaskForm mode="edit" task={task} roster={roster} categories={categories} />;
}
