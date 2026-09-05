import { getCurrentMember } from "@/lib/get-current-member";
import { listNotifications } from "@/lib/data/notifications";
import { listContactCategories, listContacts, listDeletedContacts } from "@/lib/data/contacts";
import { ContactsApp } from "@/components/contacts/contacts-app";
import { DELETED_CONTACTS_VISIBLE_DAYS } from "@/lib/contacts-view";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const { supabase } = await getCurrentMember();

  const [contacts, deleted, categories, notifications] = await Promise.all([
    listContacts(supabase),
    listDeletedContacts(supabase, DELETED_CONTACTS_VISIBLE_DAYS),
    listContactCategories(supabase),
    listNotifications(supabase),
  ]);

  return (
    <ContactsApp
      contacts={contacts}
      deletedContacts={deleted}
      categories={categories}
      notifications={notifications}
    />
  );
}
