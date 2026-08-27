import { getCurrentMember } from "@/lib/get-current-member";
import { listRoster, listTasks } from "@/lib/data/tasks";
import { DashboardApp } from "@/components/dashboard/dashboard-app";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { supabase, member } = await getCurrentMember();

  const [tasks, roster] = await Promise.all([listTasks(supabase), listRoster(supabase)]);

  return <DashboardApp initialTasks={tasks} roster={roster} me={member} />;
}
