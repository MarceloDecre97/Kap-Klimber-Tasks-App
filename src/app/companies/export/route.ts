import { NextResponse, type NextRequest } from "next/server";
import { getCurrentMember } from "@/lib/get-current-member";
import { listCompanies } from "@/lib/data/companies";
import { buildXlsx } from "@/lib/export/xlsx";
import { EMPTY_COMPANY_FILTERS, matchesCompany } from "@/lib/companies-view";
import { formatAddress } from "@/lib/contacts-view";

/**
 * The companies book as a spreadsheet — whatever the screen is showing.
 *
 * The twin of the contacts export, filters and all: the same three values
 * ride along in the query string and are re-applied here through the same
 * matchesCompany the list uses, so what you see is what you get and the two
 * cannot disagree about what "filtered" means.
 */
export async function GET(request: NextRequest) {
  const { supabase } = await getCurrentMember();
  const companies = await listCompanies(supabase);

  const params = request.nextUrl.searchParams;
  const filters = {
    ...EMPTY_COMPANY_FILTERS,
    query: params.get("q") ?? "",
    country: params.get("country"),
    typeId: params.get("type"),
  };
  const rows = companies.filter((company) => matchesCompany(company, filters));

  const headers = [
    "Company", "Type", "People", "What they do", "Main line", "Website",
    "Street", "Suite / unit", "City", "State", "ZIP", "Country", "Address",
    "In the book since",
  ];

  const body = rows.map((c) => [
    c.name,
    c.type?.label ?? "",
    // Text, like every other cell here — the writer stores everything as
    // inline strings so phone numbers and ZIPs survive, and one numeric
    // column would be the exception nobody remembers.
    String(c.contact_count ?? 0),
    c.about ?? "",
    c.company_number ?? "",
    c.website ?? "",
    c.street ?? "",
    c.suite ?? "",
    c.city ?? "",
    c.state ?? "",
    c.postal_code ?? "",
    c.country ?? "",
    // The pieces and the assembled line: one for sorting and mail merge,
    // the other for pasting into an email.
    formatAddress(c) ?? "",
    c.created_at.slice(0, 10),
  ]);

  const file = buildXlsx("Companies", headers, body);
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Kap-Klimber-companies-${stamp}.xlsx"`,
      "Cache-Control": "no-store, private",
    },
  });
}
