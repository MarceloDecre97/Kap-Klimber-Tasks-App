import { notFound } from "next/navigation";
import { getCurrentMember } from "@/lib/get-current-member";
import { getContact, listContactEvents } from "@/lib/data/contacts";
import { ContactDetail } from "@/components/contacts/contact-detail";

export const dynamic = "force-dynamic";

/** Next 16 hands route params as a promise. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ContactPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  /*
    Validated rather than trusted. It arrives in the URL, so anyone can put
    anything there, and it is about to become an href — a shape check is
    what stops a crafted link turning the Back button into somewhere else.
  */
  const fromTaskId = from && UUID.test(from) ? from : null;
  const { supabase } = await getCurrentMember();

  const contact = await getContact(supabase, id);
  // RLS returns nothing for a row this member cannot see, which reaches here
  // as the same "no such contact" — which is the honest answer either way.
  if (!contact) notFound();

  const events = await listContactEvents(supabase, id);

  return <ContactDetail contact={contact} events={events} fromTaskId={fromTaskId} />;
}
