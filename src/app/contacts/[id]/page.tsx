import { notFound } from "next/navigation";
import { getCurrentMember } from "@/lib/get-current-member";
import { getContact, listContactEvents } from "@/lib/data/contacts";
import { ContactDetail } from "@/components/contacts/contact-detail";

export const dynamic = "force-dynamic";

/** Next 16 hands route params as a promise. */
export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await getCurrentMember();

  const contact = await getContact(supabase, id);
  // RLS returns nothing for a row this member cannot see, which reaches here
  // as the same "no such contact" — which is the honest answer either way.
  if (!contact) notFound();

  const events = await listContactEvents(supabase, id);

  return <ContactDetail contact={contact} events={events} />;
}
