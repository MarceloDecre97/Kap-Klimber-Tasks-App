import { getCurrentMember } from "@/lib/get-current-member";
import { listNotifications } from "@/lib/data/notifications";
import {
  listContactRelationships,
  listContacts,
  listDeletedContacts,
  listOutreach,
  withOutreach,
} from "@/lib/data/contacts";
import { listRoster } from "@/lib/data/tasks";
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
  const { supabase, member } = await getCurrentMember();

  const [contacts, deleted, relationships, companies, companyTypes, notifications, rawOutreach, roster] =
    await Promise.all([
      listContacts(supabase),
      listDeletedContacts(supabase, DELETED_CONTACTS_VISIBLE_DAYS),
      listContactRelationships(supabase),
      listCompanies(supabase),
      listCompanyTypes(supabase),
      listNotifications(supabase),
      listOutreach(supabase, member.id),
      listRoster(supabase),
    ]);

  /* The tasks half and the assertion half, stitched into one answer. */
  const outreach = withOutreach(contacts, rawOutreach, roster);

  const initialBook: Book = book === "companies" ? "companies" : "contacts";

  return (
    <ContactsApp
      contacts={contacts}
      outreach={outreach}
      deletedContacts={deleted}
      relationships={relationships}
      companies={companies}
      companyTypes={companyTypes}
      notifications={notifications}
      initialBook={initialBook}
    />
  );
}
