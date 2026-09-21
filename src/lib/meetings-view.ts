import type { MemberSummary } from "@/lib/data/tasks";

/**
 * Meetings, as the screen needs them.
 *
 * Everything here is pure, so it can be reasoned about and tested without a
 * database — the same split the contacts book uses.
 */

/** Somebody who was in the room: one of the team, or one of the book. */
export interface Attendee {
  id: string;
  name: string;
  initials: string;
  /** Team members carry their own colour; contacts get one from their name. */
  color: string | null;
  kind: "member" | "contact";
}

/** A meeting as the list shows it — everything but the body. */
export interface MeetingSummary {
  id: string;
  title: string;
  met_on: string;
  met_at: string | null;
  company_id: string | null;
  company_name: string | null;
  created_by: MemberSummary | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  attendees: Attendee[];
  /** The first line or two of the body, for the card. Never the whole thing. */
  snippet: string;
  /** Whether the viewer wrote it, so the editor knows before it asks. */
  mine: boolean;
}

/** A meeting with its paper, for the editor. */
export interface Meeting extends MeetingSummary {
  body: string;
}

/**
 * The opening of the minutes, for the card.
 *
 * Built from the body rather than stored, so it cannot go stale, and capped
 * at a length that fills two lines on a 360px card without the card having
 * to grow. Blank lines collapse: minutes are full of them and a snippet that
 * begins with three of them says nothing at all.
 */
export function snippetOf(body: string, max = 160): string {
  const flat = body.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  /* Cut at a word, not mid-syllable — a snippet ending "sampl" reads as a bug. */
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * How a meeting's date reads on a card.
 *
 * The time is shown only when there is one, because most meetings do not
 * need it and an invented "12:00 AM" is a lie the card would tell every row.
 */
export function meetingWhen(
  met_on: string,
  met_at: string | null,
  formatDate: (iso: string) => string
): string {
  const day = formatDate(met_on);
  if (!met_at) return day;
  return `${day} · ${formatClock(met_at)}`;
}

/**
 * The day a meeting happened, as a card shows it.
 *
 * The year appears only when it is not this one. "17 Sep" is what somebody
 * wants on a list of recent meetings; "12 Aug 2025" is what they want when
 * they have scrolled far enough back to need telling. Formatted in UTC
 * because a calendar day has no time zone — shifting `met_on` into the
 * browser's zone is how a meeting held on the 1st starts showing as the 31st.
 */
export function formatMeetingDay(dateStr: string, today: Date = new Date()): string {
  const day = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${dateStr}T00:00:00Z`));
  const year = dateStr.slice(0, 4);
  return year === String(today.getFullYear()) ? day : `${day} ${year}`;
}

/**
 * "14:30" or "14:30:00" as "2:30 PM".
 *
 * Postgres hands back a bare `time`, which no Date constructor will take
 * without a date bolted on — and bolting one on drags the browser's timezone
 * into a value that has none. So it is read as the two numbers it is.
 */
export function formatClock(time: string): string {
  const [hRaw, mRaw] = time.split(":");
  const h = Number(hRaw);
  const m = mRaw ?? "00";
  if (!Number.isFinite(h)) return time;
  const suffix = h < 12 ? "AM" : "PM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${m.padStart(2, "0")} ${suffix}`;
}

/** The `HH:MM` an `<input type="time">` wants, from what the database stores. */
export function toTimeInput(time: string | null): string {
  if (!time) return "";
  const [h, m] = time.split(":");
  return `${(h ?? "00").padStart(2, "0")}:${(m ?? "00").padStart(2, "0")}`;
}

/**
 * Who was there, in a sentence.
 *
 * Team first, then the book: on an internal meeting the members are the whole
 * story, and on an external one you already know your own colleagues were
 * there — it is the other side that tells you what the meeting was.
 */
export function attendeeLine(attendees: Attendee[]): string {
  if (attendees.length === 0) return "Nobody added yet";
  const names = attendees.map((a) => a.name.trim()).filter(Boolean);
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Whether a meeting has no external attendees — an Opus Kap meeting. */
export function isInternal(meeting: MeetingSummary): boolean {
  return !meeting.company_id && !meeting.attendees.some((a) => a.kind === "contact");
}

/**
 * The groups the list is broken into.
 *
 * Dates rather than pages: minutes are looked for by when they happened, and
 * "this week" is how somebody actually remembers a meeting they had on
 * Tuesday. Future-dated ones lead, because an agenda written for tomorrow is
 * the most likely thing you are reaching for.
 */
export type MeetingGroup = "Coming up" | "This week" | "Earlier this month" | "Older";

export function groupFor(met_on: string, today: Date = new Date()): MeetingGroup {
  /* Compared as calendar days in the viewer's own zone, never as instants. */
  const day = startOfDay(new Date(`${met_on}T12:00:00`));
  const now = startOfDay(today);
  const diff = Math.round((day.getTime() - now.getTime()) / 86_400_000);
  if (diff > 0) return "Coming up";
  if (diff > -7) return "This week";
  if (diff > -31) return "Earlier this month";
  return "Older";
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export const MEETING_GROUP_ORDER: MeetingGroup[] = [
  "Coming up",
  "This week",
  "Earlier this month",
  "Older",
];

/**
 * The list, grouped and in order.
 *
 * Newest first inside each group, which for "Coming up" means the soonest
 * meeting is at the bottom of its group — deliberately, so the boundary
 * between what is ahead and what is behind stays in one place.
 */
export function groupMeetings(
  meetings: MeetingSummary[],
  today: Date = new Date()
): { group: MeetingGroup; meetings: MeetingSummary[] }[] {
  const buckets = new Map<MeetingGroup, MeetingSummary[]>();
  for (const m of meetings) {
    const g = groupFor(m.met_on, today);
    const list = buckets.get(g) ?? [];
    list.push(m);
    buckets.set(g, list);
  }
  return MEETING_GROUP_ORDER.filter((g) => (buckets.get(g)?.length ?? 0) > 0).map((group) => ({
    group,
    meetings: (buckets.get(group) ?? []).sort(
      (a, b) =>
        b.met_on.localeCompare(a.met_on) ||
        (b.met_at ?? "").localeCompare(a.met_at ?? "") ||
        b.created_at.localeCompare(a.created_at)
    ),
  }));
}

/**
 * Rendering the body.
 *
 * Plain text, with one concession: a line beginning `- ` or `* ` is drawn as
 * a bullet. Marcelo's minutes are already written that way — the dashes are
 * in his own notes — so this is not a feature to learn, it is the app
 * agreeing to show what he already types. Everything else is left exactly as
 * written, because a note-taking box that reformats what you typed mid-call
 * is a box you stop trusting.
 */
export interface BodyLine {
  kind: "bullet" | "text" | "blank";
  text: string;
}

export function renderBody(body: string): BodyLine[] {
  return body.split("\n").map((raw) => {
    const line = raw.trimEnd();
    if (line.trim() === "") return { kind: "blank", text: "" };
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet) return { kind: "bullet", text: bullet[1] ?? "" };
    return { kind: "text", text: line };
  });
}

/**
 * What the search box matches.
 *
 * Kept here as well as in the database because the list already in hand can
 * be narrowed without a round trip, which is what makes typing feel instant;
 * the server query is what finds the ones not in hand. Both look at the same
 * fields, so they cannot disagree about what a word means.
 */
export function matchesMeeting(m: MeetingSummary, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    m.title,
    m.company_name ?? "",
    m.snippet,
    ...m.attendees.map((a) => a.name),
  ]
    .join(" ")
    .toLowerCase();
  return q.split(/\s+/).every((word) => haystack.includes(word));
}
