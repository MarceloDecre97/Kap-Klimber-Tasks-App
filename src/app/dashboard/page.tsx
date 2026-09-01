import { getCurrentMember } from "@/lib/get-current-member";
import { listNotifications } from "@/lib/data/notifications";
import { listRoster, listTasks } from "@/lib/data/tasks";
import { DashboardApp } from "@/components/dashboard/dashboard-app";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { supabase, member } = await getCurrentMember();

  const [tasks, roster, notifications] = await Promise.all([
    listTasks(supabase),
    listRoster(supabase),
    listNotifications(supabase),
  ]);

  return (
    <DashboardApp initialTasks={tasks} roster={roster} me={member} notifications={notifications} />
  );
}
