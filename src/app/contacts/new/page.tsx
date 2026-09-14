import { getCurrentMember } from "@/lib/get-current-member";
import { listContactRelationships, listTradeShows } from "@/lib/data/contacts";
import { listCompanies, listCompanyTypes } from "@/lib/data/companies";
import { ContactForm } from "@/components/contacts/contact-form";

export const dynamic = "force-dynamic";

export default async function NewContactPage() {
  const { supabase } = await getCurrentMember();
  const [relationships, companies, companyTypes, tradeShows] = await Promise.all([
    listContactRelationships(supabase),
    listCompanies(supabase),
    listCompanyTypes(supabase),
    listTradeShows(supabase),
  ]);
  return (
    <ContactForm
      contact={null}
      relationships={relationships}
      companies={companies}
      companyTypes={companyTypes}
      tradeShows={tradeShows}
    />
  );
}
