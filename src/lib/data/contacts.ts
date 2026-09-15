import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MemberSummary } from "@/lib/data/tasks";
import type { CompanySummary, CompanyType, ContactRelationship } from "@/lib/companies-view";
import type {
  ContactEventKind,
  Database,
  TaskEventKind,
  TaskStatus,
} from "@/lib/supabase/database.types";
import {
  NO_OUTREACH,
  outreachStateOf,
  type Outreach,
  type OutreachOutcome,
  type OutreachTask,
} from "@/lib/outreach";

/**
 * The address book, read.
 *
 * RLS already limits every one of these to the team, so there is no member
 * filter anywhere here — there is no way to ask for another team's rows.
 * What the queries do decide is the bin: the book excludes it, and one
 * query exists to show it.
 */

/** Everything a row in the book needs, and everything the detail needs too. */
export interface ContactSummary {
  id: string;
  first_name: string;
  last_name: string;
  job_title: string | null;
  /**
   * The company's name, kept in step with the linked company by trigger.
   * Still read directly by the list, the search, the vCard and the export;
   * see 0024_companies.sql for why it survives alongside the link.
   */
  company: string | null;
  company_id: string | null;
  /** The linked company in full — its address stands in for the person's. */
  company_record: CompanySummary | null;
  mobile: string | null;
  office_phone: string | null;
  /**
   * The extension on the office line. Its own column rather than part of the
   * number, so the tel: link can dial it. See 0040_office_extension.sql.
   */
  office_phone_ext: string | null;
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
  /**
   * How the outreach ended: 'in_touch', 'no_reply', or null while it runs.
   * Written only through set_contact_outcome — see 0044.
   */
  outcome: OutreachOutcome | null;
  outcome_at: string | null;
  outcome_by: string | null;
  /**
   * The filterable half of where they came from. Free text stays free — this
   * is the part the book is filtered by, so it is split from the year and
   * spelled the same way every time. See 0039_trade_show.sql.
   */
  trade_show: string | null;
  trade_show_year: number | null;
  notes: string | null;
  /**
   * What this person is to Opus Kap. Several, because somebody really can be
   * a consultant and an investor — and none, because most people are simply
   * somebody at a company. See 0029_chips.sql.
   */
  relationships: ContactRelationship[];
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
  id, first_name, last_name, job_title, company, company_id,
  mobile, office_phone, office_phone_ext, email, email2, website,
  outcome, outcome_at, outcome_by,
  street, suite, city, state, postal_code, country, source, notes,
  trade_show, trade_show_year,
  created_at, deleted_at,
  relationship_links:contact_relationship_links(
    relationship:contact_relationships(id, label, icon)
  ),
  company_record:companies(
    id, name, about, website, company_number,
    street, suite, city, state, postal_code, country, created_at,
    type_links:company_type_links(type:company_types(id, label, icon))
  ),
  created_by:members!contacts_created_by_fkey(id, display_name, initials, color),
  deleted_by:members!contacts_deleted_by_fkey(id, display_name, initials, color)
`;

/*
  PostgREST returns an embedded one-to-one as an object, but its generated
  types describe it as an array often enough that the two disagree. Rather
  than fight that at every call site, the rows come back through this shape
  and are mapped once.
*/
type RawCompany = Omit<CompanySummary, "types"> & {
  type_links: { type: CompanyType | null }[] | null;
};

type RawContact = Omit<
  ContactSummary,
  "relationships" | "created_by" | "deleted_by" | "company_record"
> & {
  relationship_links: { relationship: ContactRelationship | null }[] | null;
  created_by: MemberSummary | null;
  deleted_by: MemberSummary | null;
  company_record: RawCompany | null;
};

/**
 * A join table comes back as rows wrapping the thing you wanted.
 *
 * Unwrapped once, here, rather than at every call site — and sorted by label,
 * so a company that is both an Upfitter and a Trailer Dealer always reads the
 * same way round rather than shuffling between page loads.
 */
function linked<T extends { label: string }>(
  rows: { [key: string]: T | null }[] | null,
  key: string
): T[] {
  return (rows ?? [])
    .map((row) => row[key])
    .filter((item): item is T => Boolean(item))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function toCompany(row: RawCompany | null): CompanySummary | null {
  if (!row) return null;
  const { type_links, ...company } = row;
  return { ...company, types: linked<CompanyType>(type_links, "type") };
}

function toContact(row: RawContact): ContactSummary {
  const { relationship_links, ...rest } = row;
  return {
    ...rest,
    relationships: linked<ContactRelationship>(relationship_links, "relationship"),
    created_by: row.created_by ?? null,
    deleted_by: row.deleted_by ?? null,
    company_record: toCompany(row.company_record),
  };
}

/**
 * The book itself — everything except the bin.
 *
 * Ordered by first name in SQL as well as grouped by it in the view, so the
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
    .order("first_name", { ascending: true })
    .order("last_name", { ascending: true });

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
 * Everybody at one company, in the book's own order.
 *
 * The bin is excluded: a company page is a list of people you can call, and
 * somebody who was deleted last week is not one of them.
 */
export async function listContactsAtCompany(
  supabase: SupabaseClient<Database>,
  companyId: string
): Promise<ContactSummary[]> {
  const { data, error } = await supabase
    .from("contacts")
    .select(CONTACT_SELECT)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("first_name", { ascending: true })
    .order("last_name", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as unknown as RawContact[]).map(toContact);
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

/**
 * Who has been reached out to, worked out from the tasks.
 *
 * One query for the whole book rather than one per contact: this is a
 * four-person company's address list, and the outreach tasks on it will be
 * counted in dozens. The same reasoning the export route gives for filtering
 * in memory — code that is demonstrably the same for every caller beats a
 * faster one that might not be.
 *
 * Only tasks the Contact button made, and only ones still in the book. A
 * binned task has been retracted; counting it would have the contact claiming
 * an email that somebody decided never happened.
 */
export async function listOutreach(
  supabase: SupabaseClient<Database>,
  meId: string
): Promise<Record<string, Outreach>> {
  const { data, error } = await supabase
    .from("task_contacts")
    .select(
      `contact_id,
       contact:contacts(id, first_name, last_name),
       task:tasks!inner(
         id, title, status, created_at, completed_at, is_outreach, deleted_at,
         created_by:members!tasks_created_by_fkey(id, display_name, initials, color),
         completed_by:members!tasks_completed_by_fkey(id, display_name, initials, color),
         assignees:task_assignees(member_id),
         rounds:task_events(kind, created_at)
       )`
    )
    .eq("task.is_outreach", true)
    .is("task.deleted_at", null);

  if (error) throw error;

  type Row = {
    contact_id: string;
    contact: { id: string; first_name: string; last_name: string } | null;
    task: {
      id: string;
      title: string;
      status: TaskStatus;
      created_at: string;
      completed_at: string | null;
      created_by: MemberSummary | null;
      completed_by: MemberSummary | null;
      assignees: { member_id: string }[] | null;
      rounds: { kind: TaskEventKind; created_at: string }[] | null;
    } | null;
  };

  const rows = (data ?? []) as unknown as Row[];

  /*
    Who each task went to, before anything else is worked out. A contact's
    record of an outreach has to name the other recipients, and the only
    place that is known is across the rows rather than within one.
  */
  const peopleByTask: Record<string, { id: string; first_name: string; last_name: string }[]> = {};
  for (const row of rows) {
    if (!row.task || !row.contact) continue;
    (peopleByTask[row.task.id] ??= []).push(row.contact);
  }
  for (const people of Object.values(peopleByTask)) {
    people.sort((a, b) => a.first_name.localeCompare(b.first_name));
  }

  const byContact: Record<string, OutreachTask[]> = {};
  for (const row of rows) {
    const t = row.task;
    if (!t) continue;
    /*
      "Mine" is the same rule can_set_contact_outcome enforces: the person who
      made the task, or anyone put on it. Worked out here as well as there so
      the button can be hidden rather than shown and then refused.
    */
    const mine =
      t.created_by?.id === meId || (t.assignees ?? []).some((a) => a.member_id === meId);
    /*
      Every event on the task comes back, so the rounds are filtered here
      rather than in the query: PostgREST cannot filter an embedded table
      without also making it an inner join, which would drop every outreach
      task that has no extra rounds yet — that is, almost all of them.
    */
    const sentAgainAt = (t.rounds ?? [])
      .filter((e) => e.kind === "outreach_sent")
      .map((e) => e.created_at)
      .sort();
    (byContact[row.contact_id] ??= []).push({
      task_id: t.id,
      title: t.title,
      status: t.status,
      created_at: t.created_at,
      created_by: t.created_by,
      completed_at: t.completed_at,
      completed_by: t.completed_by,
      mine,
      people: peopleByTask[t.id] ?? [],
      sentAgainAt,
    });
  }

  const out: Record<string, Outreach> = {};
  for (const [contactId, tasks] of Object.entries(byContact)) {
    tasks.sort((a, b) => b.created_at.localeCompare(a.created_at));
    const done = tasks.filter((t) => t.status === "complete");
    const open = tasks.filter((t) => t.status !== "complete");

    /*
      Every round that went out, as a flat list of dates.

      A completed task is round one and each "Sent another" on it is the next,
      so the count is the completions plus the events — not the number of
      tasks. That is the whole point of 0044: chasing somebody four times
      should read ×4 whether it took four task cards or one.
    */
    const rounds = done
      .flatMap((t) => [t.completed_at, ...t.sentAgainAt])
      .filter((d): d is string => Boolean(d))
      .sort();

    const shape = {
      contactedCount: rounds.length,
      openCount: open.length,
      latestCompleted: done[0] ?? null,
      latestOpen: open[0] ?? null,
      tasks,
      firstContactedAt: rounds[0] ?? null,
      lastContactedAt: rounds[rounds.length - 1] ?? null,
      outcome: null,
      outcomeAt: null,
      outcomeBy: null,
      /* An outcome can only be recorded off the back of a finished round. */
      canConfirm: done.some((t) => t.mine),
    };
    out[contactId] = { ...shape, state: outreachStateOf(shape) };
  }
  return out;
}

/**
 * The contacts and their outreach, stitched.
 *
 * The assertion lives on the contact and the rest is derived from tasks, so
 * neither half knows the whole answer on its own.
 */
export function withOutreach(
  contacts: ContactSummary[],
  outreach: Record<string, Outreach>,
  roster: MemberSummary[]
): Record<string, Outreach> {
  const byId = new Map(roster.map((m) => [m.id, m]));
  const out: Record<string, Outreach> = {};
  for (const c of contacts) {
    const base = outreach[c.id] ?? NO_OUTREACH;
    const shape = {
      ...base,
      outcome: c.outcome,
      outcomeAt: c.outcome_at,
      outcomeBy: c.outcome_by ? byId.get(c.outcome_by) ?? null : null,
    };
    out[c.id] = { ...shape, state: outreachStateOf(shape) };
  }
  return out;
}

/**
 * Every trade show already written down, for the form to suggest.
 *
 * Distinct names rather than a table of shows: the list is whatever the team
 * has actually been to, and a show nobody has typed yet has no business
 * existing. Deleted contacts are included on purpose — a name that was good
 * enough once should keep being offered rather than reappear as a second
 * spelling once its only contact is binned.
 */
export async function listTradeShows(supabase: SupabaseClient<Database>): Promise<string[]> {
  const { data, error } = await supabase
    .from("contacts")
    .select("trade_show")
    .not("trade_show", "is", null);

  if (error) throw error;

  const seen = new Set<string>();
  for (const row of data ?? []) {
    const name = row.trade_show?.trim();
    if (name) seen.add(name);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

/** The relationships, in the order the table says to show them. */
export async function listContactRelationships(
  supabase: SupabaseClient<Database>
): Promise<ContactRelationship[]> {
  const { data, error } = await supabase
    .from("contact_relationships")
    .select("id, label, icon")
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (error) throw error;
  return (data ?? []) as ContactRelationship[];
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
