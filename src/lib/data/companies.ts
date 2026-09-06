import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompanySummary, CompanyType } from "@/lib/companies-view";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Companies, read.
 *
 * There is no bin here and no soft delete. A company with nobody at it is a
 * typo somebody is tidying up, not a record anyone will come looking for —
 * see delete_company in 0024_companies.sql.
 */

const COMPANY_SELECT = `
  id, name, about, website, company_number,
  street, suite, city, state, postal_code, country, created_at,
  type:company_types(id, label, icon)
`;

/**
 * Every company, with how many people are at each.
 *
 * The count is a second query and a tally here rather than an embedded
 * `contacts(count)` with a filter on the embedded rows. That form reads
 * better and would be one round trip, but whether such a filter applies
 * before or after the aggregate is a PostgREST detail — and getting it
 * wrong means every company quietly claims the wrong number of people,
 * which is the kind of wrong nobody notices. Two plain queries over a
 * four-person company's address book cost nothing and cannot be misread.
 */
export async function listCompanies(
  supabase: SupabaseClient<Database>
): Promise<CompanySummary[]> {
  const [companies, counts] = await Promise.all([
    supabase.from("companies").select(COMPANY_SELECT).order("name", { ascending: true }),
    // Live contacts only: somebody in Recently deleted must not keep a
    // company looking occupied, or it can never be tidied away.
    supabase.from("contacts").select("company_id").is("deleted_at", null),
  ]);

  if (companies.error) throw companies.error;
  if (counts.error) throw counts.error;

  const tally = new Map<string, number>();
  for (const row of counts.data ?? []) {
    if (row.company_id) tally.set(row.company_id, (tally.get(row.company_id) ?? 0) + 1);
  }

  return ((companies.data ?? []) as unknown as CompanySummary[]).map((company) => ({
    ...company,
    type: company.type ?? null,
    contact_count: tally.get(company.id) ?? 0,
  }));
}

/** One company, or null when the id is stale. */
export async function getCompany(
  supabase: SupabaseClient<Database>,
  companyId: string
): Promise<CompanySummary | null> {
  const { data, error } = await supabase
    .from("companies")
    .select(COMPANY_SELECT)
    .eq("id", companyId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  const company = data as unknown as CompanySummary;
  return { ...company, type: company.type ?? null };
}

/** The types, in the order the table says to show them. */
export async function listCompanyTypes(
  supabase: SupabaseClient<Database>
): Promise<CompanyType[]> {
  const { data, error } = await supabase
    .from("company_types")
    .select("id, label, icon")
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (error) throw error;
  return (data ?? []) as CompanyType[];
}
