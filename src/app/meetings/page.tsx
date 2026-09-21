import { getCurrentMember } from "@/lib/get-current-member";
import { listNotifications } from "@/lib/data/notifications";
import { listMeetings } from "@/lib/data/meetings";
import { listContacts } from "@/lib/data/contacts";
import { listCompanies } from "@/lib/data/companies";
import { listRoster } from "@/lib/data/tasks";
import { MeetingsApp } from "@/components/meetings/meetings-app";

export const dynamic = "force-dynamic";

/**
 * The minutes.
 *
 * The contacts and companies come along because the details panel needs
 * something to search when you add who was in the room, and a round trip per
 * keystroke for that would be worse than carrying the book. The bodies do
 * not come along: listMeetings cuts each one to a snippet on the server, so
 * a phone gets a few kilobytes rather than a few megabytes.
 */
export default async function MeetingsPage() {
  const { supabase, member } = await getCurrentMember();

  const [meetings, contacts, companies, roster, notifications] = await Promise.all([
    listMeetings(supabase, member.id),
    listContacts(supabase),
    listCompanies(supabase),
    listRoster(supabase),
    listNotifications(supabase),
  ]);

  return (
    <MeetingsApp
      meetings={meetings}
      contacts={contacts}
      companies={companies}
      roster={roster}
      notifications={notifications}
      meId={member.id}
    />
  );
}
