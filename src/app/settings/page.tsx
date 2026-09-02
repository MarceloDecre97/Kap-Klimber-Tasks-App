import { getCurrentMember } from "@/lib/get-current-member";
import { SettingsView } from "@/components/settings/settings-view";
import { DEFAULT_PREFS, type NotificationPrefs } from "@/lib/notification-prefs";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { supabase, member } = await getCurrentMember();

  /*
    No row is not a missing row — it is the default, and the default is
    everything on. RLS limits this to the caller's own, so there is no member
    filter here because there is no way to ask for anybody else's.
  */
  const { data } = await supabase
    .from("notification_prefs")
    .select("push_off, email_off, quiet_from, quiet_to")
    .maybeSingle();

  const prefs: NotificationPrefs = data
    ? {
        pushOff: data.push_off ?? [],
        emailOff: data.email_off ?? [],
        // Postgres hands back HH:MM:SS; the time input wants HH:MM.
        quietFrom: data.quiet_from?.slice(0, 5) ?? null,
        quietTo: data.quiet_to?.slice(0, 5) ?? null,
      }
    : DEFAULT_PREFS;

  return <SettingsView member={member} prefs={prefs} />;
}
