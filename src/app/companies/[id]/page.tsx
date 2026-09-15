import { notFound } from "next/navigation";
import { getCurrentMember } from "@/lib/get-current-member";
import {
  countBinnedAtCompany,
  getCompany,
  listCompanies,
  listCompanyLogos,
  listCompanyTypes,
} from "@/lib/data/companies";
import { listContactsAtCompany } from "@/lib/data/contacts";
import { CompanyDetail } from "@/components/companies/company-detail";

export const dynamic = "force-dynamic";

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await getCurrentMember();

  const [company, people, types, companies, binned, logos] = await Promise.all([
    getCompany(supabase, id),
    listContactsAtCompany(supabase, id),
    listCompanyTypes(supabase),
    listCompanies(supabase),
    countBinnedAtCompany(supabase, id),
    listCompanyLogos(supabase),
  ]);
  if (!company) notFound();

  return (
    <CompanyDetail
      company={company}
      logo={logos[company.id]}
      people={people}
      types={types}
      companies={companies}
      binnedPeople={binned}
    />
  );
}
