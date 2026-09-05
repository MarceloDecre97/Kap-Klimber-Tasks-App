import { getCurrentMember } from "@/lib/get-current-member";
import { listContactCategories } from "@/lib/data/contacts";
import { listCompanies } from "@/lib/data/companies";
import { ContactForm } from "@/components/contacts/contact-form";

export const dynamic = "force-dynamic";

export default async function NewContactPage() {
  const { supabase } = await getCurrentMember();
  const [categories, companies] = await Promise.all([
    listContactCategories(supabase),
    listCompanies(supabase),
  ]);
  return <ContactForm contact={null} categories={categories} companies={companies} />;
}
