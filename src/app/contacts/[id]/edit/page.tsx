import { notFound } from "next/navigation";
import { getCurrentMember } from "@/lib/get-current-member";
import { getContact, listContactCategories } from "@/lib/data/contacts";
import { ContactForm } from "@/components/contacts/contact-form";

export const dynamic = "force-dynamic";

export default async function EditContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await getCurrentMember();

  const [contact, categories] = await Promise.all([
    getContact(supabase, id),
    listContactCategories(supabase),
  ]);
  if (!contact) notFound();

  return <ContactForm contact={contact} categories={categories} />;
}
