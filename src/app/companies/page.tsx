import { getCurrentMember } from "@/lib/get-current-member";
import { listCompanies } from "@/lib/data/companies";
import { CompaniesList } from "@/components/companies/companies-list";

export const dynamic = "force-dynamic";

export default async function CompaniesPage() {
  const { supabase } = await getCurrentMember();
  const companies = await listCompanies(supabase);
  return <CompaniesList companies={companies} />;
}
