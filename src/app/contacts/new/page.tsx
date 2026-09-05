import { getCurrentMember } from "@/lib/get-current-member";
import { listContactCategories } from "@/lib/data/contacts";
import { ContactForm } from "@/components/contacts/contact-form";

export const dynamic = "force-dynamic";

export default async function NewContactPage() {
  const { supabase } = await getCurrentMember();
  const categories = await listContactCategories(supabase);
  return <ContactForm contact={null} categories={categories} />;
}
