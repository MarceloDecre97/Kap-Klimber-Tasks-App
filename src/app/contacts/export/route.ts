import { NextResponse, type NextRequest } from "next/server";
import { getCurrentMember } from "@/lib/get-current-member";
import { listContacts } from "@/lib/data/contacts";
import { buildXlsx } from "@/lib/export/xlsx";
import {
  EMPTY_CONTACT_FILTERS,
  formatAddress,
  matchesContact,
} from "@/lib/contacts-view";

/**
 * The book as a spreadsheet — whatever the screen is currently showing.
 *
 * Built on the server rather than in the browser, so the writer never
 * reaches a phone's bundle and the download is a plain link the browser
 * handles itself. The filters arrive as query parameters and are re-applied
 * here through the same matchesContact the list uses, so what you see is
 * what you get, and the two can never disagree about what "filtered" means.
 *
 * The whole book is read and filtered in memory rather than translated into
 * SQL. It is a four-person company's address list, and one query that is
 * demonstrably the same code as the screen is worth more than a faster one
 * that might not be.
 */
export async function GET(request: NextRequest) {
  const { supabase } = await getCurrentMember();
  const contacts = await listContacts(supabase);

  const params = request.nextUrl.searchParams;
  const filters = {
    ...EMPTY_CONTACT_FILTERS,
    query: params.get("q") ?? "",
    company: params.get("company"),
    categoryId: params.get("category"),
  };
  const rows = contacts.filter((contact) => matchesContact(contact, filters));

  const headers = [
    "First name", "Last name", "Job title", "Company", "Category",
    "Mobile", "Office phone", "Email", "Second email", "Website",
    "Street", "Suite / unit", "City", "State", "ZIP", "Country", "Address",
    "Where they came from", "Notes", "Added by", "Added on",
  ];

  const body = rows.map((c) => [
    c.first_name,
    c.last_name,
    c.job_title ?? "",
    c.company ?? "",
    c.category?.label ?? "",
    c.mobile ?? "",
    c.office_phone ?? "",
    c.email ?? "",
    c.email2 ?? "",
    c.website ?? "",
    c.street ?? "",
    c.suite ?? "",
    c.city ?? "",
    c.state ?? "",
    c.postal_code ?? "",
    c.country ?? "",
    // The pieces and the assembled line: one is for sorting and mail merge,
    // the other is for pasting into an email.
    formatAddress(c) ?? "",
    c.source ?? "",
    c.notes ?? "",
    c.created_by?.display_name ?? "",
    c.created_at.slice(0, 10),
  ]);

  const file = buildXlsx("Contacts", headers, body);
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Kap-Klimber-contacts-${stamp}.xlsx"`,
      // A book that changes hourly must not be served from a cache, and this
      // is somebody's contact data — it should not sit in a shared one.
      "Cache-Control": "no-store, private",
    },
  });
}
