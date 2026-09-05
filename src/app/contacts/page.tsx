import { getCurrentMember } from "@/lib/get-current-member";
import { listNotifications } from "@/lib/data/notifications";
import { listContactCategories, listContacts } from "@/lib/data/contacts";
import { ContactsApp } from "@/components/contacts/contacts-app";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const { supabase } = await getCurrentMember();

  const [contacts, categories, notifications] = await Promise.all([
    listContacts(supabase),
    listContactCategories(supabase),
    listNotifications(supabase),
  ]);

  return (
    <ContactsApp contacts={contacts} categories={categories} notifications={notifications} />
  );
}
