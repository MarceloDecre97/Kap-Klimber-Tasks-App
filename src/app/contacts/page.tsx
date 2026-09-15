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
import { listCompanies, listCompanyLogos, listCompanyTypes } from "@/lib/data/companies";
import { ContactsApp, type Book } from "@/components/contacts/contacts-app";
import { DELETED_CONTACTS_VISIBLE_DAYS } from "@/lib/contacts-view";

export const dynamic = "force-dynamic";
/*
  The icon sweep runs as a server action from this page, and each company
  costs a fetch to somebody else's website. The default ten seconds is not
  enough for a slow one, and a function the host kills mid-fetch takes the
  whole sweep with it — see the try/catch in contacts-app.tsx for the other
  half of that lesson.
*/
export const maxDuration = 60;

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

  const [
    contacts,
    deleted,
    relationships,
    companies,
    companyTypes,
    notifications,
    rawOutreach,
    roster,
    logos,
  ] = await Promise.all([
    listContacts(supabase),
    listDeletedContacts(supabase, DELETED_CONTACTS_VISIBLE_DAYS),
    listContactRelationships(supabase),
    listCompanies(supabase),
    listCompanyTypes(supabase),
    listNotifications(supabase),
    listOutreach(supabase, member.id),
    listRoster(supabase),
    listCompanyLogos(supabase),
  ]);

  /* The tasks half and the assertion half, stitched into one answer. */
  const outreach = withOutreach(contacts, rawOutreach, roster);

  const initialBook: Book = book === "companies" ? "companies" : "contacts";

  return (
    <ContactsApp
      contacts={contacts}
      outreach={outreach}
      logos={logos}
      deletedContacts={deleted}
      relationships={relationships}
      companies={companies}
      companyTypes={companyTypes}
      notifications={notifications}
      initialBook={initialBook}
    />
  );
}
