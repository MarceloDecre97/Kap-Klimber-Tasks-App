import { notFound } from "next/navigation";
import { getCurrentMember } from "@/lib/get-current-member";
import { getTask, listCategories, listRoster } from "@/lib/data/tasks";
import { listContacts } from "@/lib/data/contacts";
import { TaskForm } from "@/components/tasks/task-form";

export const dynamic = "force-dynamic";

export default async function EditTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, member } = await getCurrentMember();
  const [task, roster, categories, contacts] = await Promise.all([
    getTask(supabase, id, member.id),
    listRoster(supabase),
    listCategories(supabase),
    listContacts(supabase),
  ]);

  if (!task) notFound();

  /*
    Since 0033 only the creator may edit a task — or anybody, once the
    creator has been deactivated. The banner already hides the button, but
    this page is reachable by typing its address, and a form that saves
    nothing is a worse answer than a page that is not there.

    notFound() rather than a message: the task is visible to the whole team
    anyway, so there is nothing to reveal, and this reads as "no such page"
    rather than as an accusation.
  */
  const { data: mayEdit, error: mayEditError } = await supabase.rpc("can_edit_task", {
    p_task_id: id,
  });
  if (mayEditError) throw mayEditError;
  if (mayEdit !== true) notFound();

  return <TaskForm mode="edit" task={task} roster={roster} categories={categories} contacts={contacts} />;
}
