import { notFound } from "next/navigation";
import { getCurrentMember } from "@/lib/get-current-member";
import { getContact, listContactRelationships, listTradeShows } from "@/lib/data/contacts";
import { listCompanies, listCompanyTypes } from "@/lib/data/companies";
import { ContactForm } from "@/components/contacts/contact-form";

export const dynamic = "force-dynamic";

export default async function EditContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await getCurrentMember();

  const [contact, relationships, companies, companyTypes, tradeShows] = await Promise.all([
    getContact(supabase, id),
    listContactRelationships(supabase),
    listCompanies(supabase),
    listCompanyTypes(supabase),
    listTradeShows(supabase),
  ]);
  if (!contact) notFound();

  return (
    <ContactForm
      contact={contact}
      relationships={relationships}
      companies={companies}
      companyTypes={companyTypes}
      tradeShows={tradeShows}
    />
  );
}
