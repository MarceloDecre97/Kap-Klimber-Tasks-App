import { getCurrentMember } from "@/lib/get-current-member";
import { listCategories, listRoster } from "@/lib/data/tasks";
import { listContacts } from "@/lib/data/contacts";
import { TaskForm } from "@/components/tasks/task-form";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The cap, matching the trigger in 0041 and the picker. */
const MAX_CONTACTS = 4;

/** What the Contact button sets the category to. Seeded in 0001. */
const OUTREACH_CATEGORY = "client outreach";

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: Promise<{ contacts?: string; outreach?: string }>;
}) {
  const { contacts: contactParam, outreach } = await searchParams;
  const { supabase, member } = await getCurrentMember();
  const [roster, categories, contacts] = await Promise.all([
    listRoster(supabase),
    listCategories(supabase),
    listContacts(supabase),
  ]);

  /*
    Everything below is read from the URL, so everything below is checked.
    Ids are shape-checked and then matched against the book — an id for
    somebody who is not in it, or is in the bin, is dropped rather than
    attached, and the cap is applied here as well as in the database.
  */
  const isOutreach = outreach === "1";
  const wanted = (contactParam ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => UUID.test(id));
  const contactIds = wanted
    .filter((id) => contacts.some((c) => c.id === id))
    .slice(0, MAX_CONTACTS);

  const prefill =
    isOutreach && contactIds.length > 0
      ? {
          contactIds,
          /* Whoever pressed Contact is the one doing it, until they say otherwise. */
          assigneeIds: [member.id],
          categoryId:
            categories.find((c) => c.label.toLowerCase() === OUTREACH_CATEGORY)?.id ?? null,
          isOutreach: true,
        }
      : undefined;

  return (
    <TaskForm
      mode="create"
      roster={roster}
      categories={categories}
      contacts={contacts}
      prefill={prefill}
    />
  );
}
