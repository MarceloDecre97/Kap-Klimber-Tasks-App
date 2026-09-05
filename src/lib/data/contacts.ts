import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MemberSummary } from "@/lib/data/tasks";
import type { ContactEventKind, Database, TaskStatus } from "@/lib/supabase/database.types";

/**
 * The address book, read.
 *
 * RLS already limits every one of these to the team, so there is no member
 * filter anywhere here — there is no way to ask for another team's rows.
 * What the queries do decide is the bin: the book excludes it, and one
 * query exists to show it.
 */

export interface ContactCategory {
  id: string;
  label: string;
  /** A name, not a component. See categoryIcon in contacts-view.ts. */
  icon: string;
}

/** Everything a row in the book needs, and everything the detail needs too. */
export interface ContactSummary {
  id: string;
  first_name: string;
  last_name: string;
  job_title: string | null;
  company: string | null;
  mobile: string | null;
  office_phone: string | null;
  email: string | null;
  email2: string | null;
  website: string | null;
  street: string | null;
  suite: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  source: string | null;
  notes: string | null;
  category: ContactCategory | null;
  /** Who put it in the book. A shared book gets asked this constantly. */
  created_by: MemberSummary | null;
  created_at: string;
  /** Set only for rows in Recently deleted. */
  deleted_at: string | null;
  deleted_by: MemberSummary | null;
}

export interface ContactEvent {
  id: string;
  kind: ContactEventKind;
  field: string | null;
  from_value: string | null;
  to_value: string | null;
  created_at: string;
  member: MemberSummary | null;
}

const CONTACT_SELECT = `
  id, first_name, last_name, job_title, company,
  mobile, office_phone, email, email2, website,
  street, suite, city, state, postal_code, country, source, notes,
  created_at, deleted_at,
  category:contact_categories(id, label, icon),
  created_by:members!contacts_created_by_fkey(id, display_name, initials, color),
  deleted_by:members!contacts_deleted_by_fkey(id, display_name, initials, color)
`;

/*
  PostgREST returns an embedded one-to-one as an object, but its generated
  types describe it as an array often enough that the two disagree. Rather
  than fight that at every call site, the rows come back through this shape
  and are mapped once.
*/
type RawContact = Omit<ContactSummary, "category" | "created_by" | "deleted_by"> & {
  category: ContactCategory | null;
  created_by: MemberSummary | null;
  deleted_by: MemberSummary | null;
};

function toContact(row: RawContact): ContactSummary {
  return {
    ...row,
    category: row.category ?? null,
    created_by: row.created_by ?? null,
    deleted_by: row.deleted_by ?? null,
  };
}

/**
 * The book itself — everything except the bin.
 *
 * Ordered by surname in SQL as well as grouped by it in the view, so the
 * first paint is already right rather than reshuffling once the client
 * takes over.
 */
export async function listContacts(
  supabase: SupabaseClient<Database>
): Promise<ContactSummary[]> {
  const { data, error } = await supabase
    .from("contacts")
    .select(CONTACT_SELECT)
    .is("deleted_at", null)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as unknown as RawContact[]).map(toContact);
}

/**
 * Recently deleted, newest first.
 *
 * Bounded by age for display only. Nothing is erased when a row falls past
 * this window — it simply stops being listed, and erasing stays something
 * a person does deliberately. See DELETED_CONTACTS_VISIBLE_DAYS.
 */
export async function listDeletedContacts(
  supabase: SupabaseClient<Database>,
  visibleDays: number
): Promise<ContactSummary[]> {
  const since = new Date(Date.now() - visibleDays * 86_400_000).toISOString();

  const { data, error } = await supabase
    .from("contacts")
    .select(CONTACT_SELECT)
    .not("deleted_at", "is", null)
    .gte("deleted_at", since)
    .order("deleted_at", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as unknown as RawContact[]).map(toContact);
}

/** One contact, bin included — a deleted contact still has a page. */
export async function getContact(
  supabase: SupabaseClient<Database>,
  contactId: string
): Promise<ContactSummary | null> {
  const { data, error } = await supabase
    .from("contacts")
    .select(CONTACT_SELECT)
    .eq("id", contactId)
    .maybeSingle();

  if (error) throw error;
  return data ? toContact(data as unknown as RawContact) : null;
}

/**
 * What has been done to a contact, newest first.
 *
 * The price of letting anyone edit anyone's contact: the book can say who
 * changed the number. Capped, because this is a record to glance at rather
 * than an archive to scroll.
 */
const ACTIVITY_LIMIT = 50;

export async function listContactEvents(
  supabase: SupabaseClient<Database>,
  contactId: string
): Promise<ContactEvent[]> {
  const { data, error } = await supabase
    .from("contact_events")
    .select(
      `id, kind, field, from_value, to_value, created_at,
       member:members!contact_events_member_id_fkey(id, display_name, initials, color)`
    )
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(ACTIVITY_LIMIT);

  if (error) throw error;
  return (data ?? []) as unknown as ContactEvent[];
}

/** The categories, in the order the table says to show them. */
export async function listContactCategories(
  supabase: SupabaseClient<Database>
): Promise<ContactCategory[]> {
  const { data, error } = await supabase
    .from("contact_categories")
    .select("id, label, icon")
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (error) throw error;
  return (data ?? []) as ContactCategory[];
}

/**
 * The unfinished tasks keeping a contact in the book.
 *
 * Asked of the database rather than worked out here, because this is the
 * same rule delete_contact enforces — and a second implementation of it in
 * TypeScript is a second thing to get wrong. Empty means deletable.
 * See 0022_contacts.sql.
 */
export interface BlockingTask {
  task_id: string;
  title: string;
  status: TaskStatus;
}

export async function contactBlockingTasks(
  supabase: SupabaseClient<Database>,
  contactId: string
): Promise<BlockingTask[]> {
  const { data, error } = await supabase.rpc("contact_blocking_tasks", {
    p_contact_id: contactId,
  });
  if (error) throw error;
  return (data ?? []) as BlockingTask[];
}
