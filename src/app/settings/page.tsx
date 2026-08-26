import { getCurrentMember } from "@/lib/get-current-member";
import { SettingsView } from "@/components/settings/settings-view";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { member } = await getCurrentMember();
  return <SettingsView member={member} />;
}
