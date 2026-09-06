import { getCurrentMember } from "@/lib/get-current-member";
import { listCompanies, listCompanyTypes } from "@/lib/data/companies";
import { CompanyForm } from "@/components/companies/company-form";

export const dynamic = "force-dynamic";

export default async function NewCompanyPage() {
  const { supabase } = await getCurrentMember();
  const [companies, types] = await Promise.all([
    listCompanies(supabase),
    listCompanyTypes(supabase),
  ]);
  return <CompanyForm companies={companies} types={types} />;
}
