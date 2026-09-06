import { getCurrentMember } from "@/lib/get-current-member";
import { listNotifications } from "@/lib/data/notifications";
import { listContactCategories, listContacts, listDeletedContacts } from "@/lib/data/contacts";
import { listCompanies, listCompanyTypes } from "@/lib/data/companies";
import { ContactsApp, type Book } from "@/components/contacts/contacts-app";
import { DELETED_CONTACTS_VISIBLE_DAYS } from "@/lib/contacts-view";

export const dynamic = "force-dynamic";

/**
 * People and companies are one screen with a switch, not two pages. `?book=`
 * says which half is open — read here rather than in the browser so a
 * refresh, or a link somebody sends, comes back to the right one.
 */
export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ book?: string }>;
}) {
  const { book } = await searchParams;
  const { supabase } = await getCurrentMember();

  const [contacts, deleted, categories, companies, companyTypes, notifications] = await Promise.all([
    listContacts(supabase),
    listDeletedContacts(supabase, DELETED_CONTACTS_VISIBLE_DAYS),
    listContactCategories(supabase),
    listCompanies(supabase),
    listCompanyTypes(supabase),
    listNotifications(supabase),
  ]);

  const initialBook: Book = book === "companies" ? "companies" : "contacts";

  return (
    <ContactsApp
      contacts={contacts}
      deletedContacts={deleted}
      categories={categories}
      companies={companies}
      companyTypes={companyTypes}
      notifications={notifications}
      initialBook={initialBook}
    />
  );
}
