import { getCurrentMember } from "@/lib/get-current-member";
import { listCategories, listRoster } from "@/lib/data/tasks";
import { listContacts } from "@/lib/data/contacts";
import { TaskForm } from "@/components/tasks/task-form";

export const dynamic = "force-dynamic";

export default async function NewTaskPage() {
  const { supabase } = await getCurrentMember();
  const [roster, categories, contacts] = await Promise.all([
    listRoster(supabase),
    listCategories(supabase),
    listContacts(supabase),
  ]);

  return <TaskForm mode="create" roster={roster} categories={categories} contacts={contacts} />;
}
