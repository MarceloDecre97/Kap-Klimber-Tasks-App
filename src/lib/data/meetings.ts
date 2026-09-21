import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, MeetingEventKind } from "@/lib/supabase/database.types";
import type { MemberSummary } from "@/lib/data/tasks";
import { avatarColor, initialsOf, fullName } from "@/lib/contacts-view";
import { snippetOf, type Attendee, type Meeting, type MeetingSummary } from "@/lib/meetings-view";

/**
 * Meetings, read.
 *
 * RLS limits every query here to the team, so there is no member filter
 * anywhere — there is no way to ask for another team's minutes. What these
 * queries do decide is the bin, and how much of the body travels.
 *
 * That second one matters more than it looks. A body runs to 200k characters
 * and the list shows four dozen meetings; sending every body to a phone so
 * the card can print two lines of it would be the slowest screen in the app.
 * So the list asks for the body, cuts it to a snippet HERE on the server, and
 * ships only the snippet. The editor is the one query that carries the paper.
 */

/*
  Every embed names its foreign key. `meeting_members` reaches `members`
  through two of them — `member_id` for who was in the room and `added_by`
  for who put them there — so an unqualified `members(...)` is ambiguous and
  PostgREST refuses the whole query. The others are unambiguous today and are
  named anyway: a second foreign key added later should not silently break a
  query that has been working for a year.

  And, as in tasks.ts: this string is a column list posted to the API, not
  SQL. No comments inside the backticks.
*/
const ATTENDEE_SELECT = `
  contacts:meeting_contacts(
    contact:contacts!meeting_contacts_contact_id_fkey(id, first_name, last_name, deleted_at)
  ),
  members:meeting_members(
    member:members!meeting_members_member_id_fkey(id, display_name, initials, color)
  )
`;

const MEETING_SELECT = `
  id, title, met_on, met_at, company_id, body,
  created_at, updated_at, deleted_at,
  created_by:members!meetings_created_by_fkey(id, display_name, initials, color),
  company:companies!meetings_company_id_fkey(id, name),
  ${ATTENDEE_SELECT}
`;

type Row = {
  id: string;
  title: string;
  met_on: string;
  met_at: string | null;
  company_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  created_by: MemberSummary | null;
  company: { id: string; name: string } | null;
  contacts:
    | { contact: { id: string; first_name: string; last_name: string; deleted_at: string | null } | null }[]
    | null;
  members: { member: MemberSummary | null }[] | null;
};

/**
 * Who was in the room, as one list.
 *
 * Team first, then the book. On an internal meeting the members are the whole
 * story; on an external one you already know your own colleagues were there,
 * so the other side is what tells you what the meeting was.
 *
 * A binned contact still shows. They were in the room — deleting them from
 * the book later does not un-hold the meeting, and a row of faces with a gap
 * in it is a worse record than one naming somebody who has since left.
 */
function attendeesOf(row: Row): Attendee[] {
  const members: Attendee[] = (row.members ?? [])
    .map((m) => m.member)
    .filter((m): m is MemberSummary => Boolean(m))
    .map((m) => ({
      id: m.id,
      name: m.display_name,
      initials: m.initials,
      color: m.color,
      kind: "member" as const,
    }));

  const contacts: Attendee[] = (row.contacts ?? [])
    .map((c) => c.contact)
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .map((c) => ({
      id: c.id,
      name: fullName(c),
      initials: initialsOf(c),
      color: avatarColor(c),
      kind: "contact" as const,
    }));

  members.sort((a, b) => a.name.localeCompare(b.name));
  contacts.sort((a, b) => a.name.localeCompare(b.name));
  return [...members, ...contacts];
}

function toSummary(row: Row, meId: string): MeetingSummary {
  return {
    id: row.id,
    title: row.title,
    met_on: row.met_on,
    met_at: row.met_at,
    company_id: row.company?.id ?? row.company_id,
    company_name: row.company?.name ?? null,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
    attendees: attendeesOf(row),
    snippet: snippetOf(row.body),
    mine: row.created_by?.id === meId,
  };
}

/**
 * The book of minutes, newest meeting first.
 *
 * `limit` exists because this grows for ever and a phone should not be handed
 * four years of it to draw a screen. Older ones are reached through search,
 * which is the query that does not have a limit worth imposing.
 */
export async function listMeetings(
  supabase: SupabaseClient<Database>,
  meId: string,
  options: { limit?: number; companyId?: string } = {}
): Promise<MeetingSummary[]> {
  const query = supabase
    .from("meetings")
    .select(MEETING_SELECT)
    .is("deleted_at", null)
    .order("met_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 200);

  /*
    Only the company set on the meeting is filtered here. The derived half —
    meetings whose attendees work there — needs a second query with a
    different shape, which is what listCompanyMeetings exists to do. Asking
    one builder to be both is what PostgREST's types quite rightly refuse.
  */
  const { data, error } = options.companyId
    ? await query.eq("company_id", options.companyId)
    : await query;

  if (error) throw error;
  return ((data ?? []) as unknown as Row[]).map((row) => toSummary(row, meId));
}

/**
 * Every meeting that belongs to a company, however it came to belong to it.
 *
 * Two queries rather than one: the meetings pointed at the company, and the
 * meetings whose attendees work there. A meeting with Eric from ADV Mobil
 * belongs on ADV Mobil's page whether or not anybody set the company field,
 * which is the whole point of deriving it.
 */
export async function listCompanyMeetings(
  supabase: SupabaseClient<Database>,
  meId: string,
  companyId: string,
  limit = 20
): Promise<MeetingSummary[]> {
  const [direct, viaContacts] = await Promise.all([
    supabase
      .from("meetings")
      .select(MEETING_SELECT)
      .is("deleted_at", null)
      .eq("company_id", companyId)
      .order("met_on", { ascending: false })
      .limit(limit),
    supabase
      .from("meetings")
      .select(`${MEETING_SELECT}, mc:meeting_contacts!inner(contact:contacts!inner(company_id))`)
      .is("deleted_at", null)
      .eq("mc.contact.company_id", companyId)
      .order("met_on", { ascending: false })
      .limit(limit),
  ]);

  if (direct.error) throw direct.error;
  if (viaContacts.error) throw viaContacts.error;

  const byId = new Map<string, MeetingSummary>();
  for (const row of [
    ...((direct.data ?? []) as unknown as Row[]),
    ...((viaContacts.data ?? []) as unknown as Row[]),
  ]) {
    if (!byId.has(row.id)) byId.set(row.id, toSummary(row, meId));
  }

  return [...byId.values()]
    .sort((a, b) => b.met_on.localeCompare(a.met_on) || b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
}

/** The meetings one person sat in. */
export async function listContactMeetings(
  supabase: SupabaseClient<Database>,
  meId: string,
  contactId: string,
  limit = 20
): Promise<MeetingSummary[]> {
  const { data, error } = await supabase
    .from("meetings")
    .select(`${MEETING_SELECT}, mc:meeting_contacts!inner(contact_id)`)
    .is("deleted_at", null)
    .eq("mc.contact_id", contactId)
    .order("met_on", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as unknown as Row[]).map((row) => toSummary(row, meId));
}

/**
 * One meeting, with its paper.
 *
 * The only query that carries a whole body, and the only one that should.
 */
export async function getMeeting(
  supabase: SupabaseClient<Database>,
  meId: string,
  meetingId: string
): Promise<Meeting | null> {
  const { data, error } = await supabase
    .from("meetings")
    .select(MEETING_SELECT)
    .eq("id", meetingId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as Row;
  return { ...toSummary(row, meId), body: row.body };
}

/**
 * Search, run by Postgres rather than by the phone.
 *
 * ILIKE over the trigram indexes 0046 builds. The list already in hand is
 * narrowed instantly in the browser; this is what finds the meeting from
 * March that the browser never loaded.
 *
 * The query is escaped before it reaches the pattern: a stray `%` would
 * otherwise turn "50%" into a wildcard and return everything, and PostgREST
 * treats a comma as a filter separator, so one in the search box would
 * corrupt the request rather than being looked for.
 */
export async function searchMeetings(
  supabase: SupabaseClient<Database>,
  meId: string,
  query: string,
  limit = 50
): Promise<MeetingSummary[]> {
  const term = query.trim();
  if (term.length < 2) return [];
  const safe = term.replace(/[%_\\]/g, (ch) => `\\${ch}`).replace(/[(),]/g, " ");

  const { data, error } = await supabase
    .from("meetings")
    .select(MEETING_SELECT)
    .is("deleted_at", null)
    .or(`title.ilike.%${safe}%,body.ilike.%${safe}%`)
    .order("met_on", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return ((data ?? []) as unknown as Row[]).map((row) => toSummary(row, meId));
}

export interface MeetingEvent {
  id: string;
  kind: MeetingEventKind;
  field: string | null;
  from_value: string | null;
  to_value: string | null;
  created_at: string;
  member: MemberSummary | null;
}

/** What changed, minus the typing. See 0046 for why the body is absent. */
export async function listMeetingEvents(
  supabase: SupabaseClient<Database>,
  meetingId: string
): Promise<MeetingEvent[]> {
  const { data, error } = await supabase
    .from("meeting_events")
    .select(
      `id, kind, field, from_value, to_value, created_at,
       member:members!meeting_events_member_id_fkey(id, display_name, initials, color)`
    )
    .eq("meeting_id", meetingId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as unknown as MeetingEvent[];
}

/**
 * What came out of a meeting.
 *
 * Live status rather than a count, because "two tasks" answers nothing you
 * would open a meeting to ask. The question is always whether the thing you
 * promised has been done.
 */
export interface MeetingTask {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  completed_at: string | null;
}

export async function listMeetingTasks(
  supabase: SupabaseClient<Database>,
  meetingId: string
): Promise<MeetingTask[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, status, due_date, completed_at, created_at")
    .eq("meeting_id", meetingId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as MeetingTask[];
}

/**
 * A margin note on somebody's minutes.
 *
 * Its own thing rather than a task note: this carries no replies, no likes
 * and no mentions, because a comment on minutes is not a conversation — it
 * is Dee remembering the bit about the second depot.
 */
export interface MeetingComment {
  id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  member: MemberSummary | null;
  /** Whether the viewer wrote it — only its author may change it. */
  mine: boolean;
}

export async function listMeetingComments(
  supabase: SupabaseClient<Database>,
  meId: string,
  meetingId: string
): Promise<MeetingComment[]> {
  const { data, error } = await supabase
    .from("meeting_comments")
    .select(
      `id, body, created_at, edited_at, member_id,
       member:members!meeting_comments_member_id_fkey(id, display_name, initials, color)`
    )
    .eq("meeting_id", meetingId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;

  type CommentRow = Omit<MeetingComment, "mine"> & { member_id: string };
  return ((data ?? []) as unknown as CommentRow[]).map((row) => ({
    id: row.id,
    body: row.body,
    created_at: row.created_at,
    edited_at: row.edited_at,
    member: row.member,
    mine: row.member_id === meId,
  }));
}
