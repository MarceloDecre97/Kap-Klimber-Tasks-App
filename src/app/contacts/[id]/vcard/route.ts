import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/get-current-member";
import { getContact } from "@/lib/data/contacts";
import { buildVCard, vcardFilename } from "@/lib/export/vcard";

/**
 * One contact as a .vcf, which a phone offers to add to its address book.
 *
 * The point of the whole feature on a phone: after this, the number is where
 * somebody already looks for numbers, and they never need to open this app
 * to make the call.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await getCurrentMember();

  const contact = await getContact(supabase, id);
  // RLS hands back nothing for a row this member cannot see, which arrives
  // here as the same "no such contact" — the honest answer either way.
  if (!contact) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(buildVCard(contact), {
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": `attachment; filename="${vcardFilename(contact)}"`,
      "Cache-Control": "no-store, private",
    },
  });
}
