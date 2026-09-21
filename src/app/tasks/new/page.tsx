import { getCurrentMember } from "@/lib/get-current-member";
import { listCategories, listRoster } from "@/lib/data/tasks";
import { listContacts } from "@/lib/data/contacts";
import { getMeeting } from "@/lib/data/meetings";
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
  searchParams: Promise<{ contacts?: string; outreach?: string; meeting?: string }>;
}) {
  const { contacts: contactParam, outreach, meeting } = await searchParams;
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

  /*
    A task started from a meeting. Checked the same way as everything else
    from the URL: the id is shape-checked and then looked up, so a stale or
    invented one is dropped rather than written onto the task. It is also
    read here rather than trusted from the form, because 0047 pins the column
    after insert and a wrong value would be permanent.
  */
  const meetingId = meeting && UUID.test(meeting.trim()) ? meeting.trim() : null;
  const fromMeeting = meetingId ? await getMeeting(supabase, member.id, meetingId) : null;

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
      : fromMeeting
        ? {
            /*
              The people who were in the room come with it, capped the same
              way. An action item out of a call with Eric and Sheena is about
              Eric and Sheena, and re-picking them from a book of hundreds is
              the kind of small friction that stops things being written down.
            */
            contactIds: fromMeeting.attendees
              .filter((a) => a.kind === "contact")
              .map((a) => a.id)
              .slice(0, MAX_CONTACTS),
            assigneeIds: [member.id],
            categoryId: null,
            isOutreach: false,
            meetingId: fromMeeting.id,
            meetingTitle: fromMeeting.title,
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
