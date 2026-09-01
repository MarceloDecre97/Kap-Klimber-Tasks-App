import type { MemberSummary } from "@/lib/data/tasks";

/**
 * Naming someone in a note.
 *
 * A mention is stored as `@[Keith B](uuid)` rather than as the plain text
 * "@Keith". Two reasons, both of which only show up later:
 *
 *   - Two people can share a first name, and a plain "@Keith" leaves the
 *     database guessing which one to notify. The id never guesses.
 *   - Display names change. A stored name would leave every past mention
 *     pointing at a person who no longer goes by that.
 *
 * The token is never shown. The app renders it as a chip, and everywhere a
 * note is quoted flat — the inbox excerpt, and later a push body or an email
 * — `stripMentions` turns it back into "@Keith B".
 *
 * The same pattern is read by the database trigger that writes the
 * notification, so it has to stay in step with 0013_mentions.sql.
 */
const MENTION_SOURCE =
  "@\\[([^\\]\\n]{1,80})\\]\\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\\)";

/**
 * Built fresh each time rather than shared. A `g` regex carries `lastIndex`
 * between calls, and one stateful constant used by four functions is a bug
 * that only appears on the second note somebody writes.
 */
function mentionRegex(): RegExp {
  return new RegExp(MENTION_SOURCE, "gi");
}

export type BodySegment =
  | { kind: "text"; text: string }
  | { kind: "mention"; name: string; memberId: string };

/**
 * Splits a note body into plain runs and mentions, in order.
 *
 * `split` with two capture groups interleaves the parts, so the array runs
 * text, name, id, text, name, id — hence the stride of three.
 */
export function splitMentions(body: string): BodySegment[] {
  const parts = body.split(mentionRegex());
  const segments: BodySegment[] = [];

  for (let i = 0; i < parts.length; i += 3) {
    const text = parts[i];
    if (text) segments.push({ kind: "text", text });

    const name = parts[i + 1];
    const memberId = parts[i + 2];
    if (name !== undefined && memberId !== undefined) {
      segments.push({ kind: "mention", name, memberId });
    }
  }

  return segments;
}

/** The note as a person would read it aloud — for excerpts, pushes and email. */
export function stripMentions(body: string): string {
  return body.replace(mentionRegex(), "@$1");
}

/** Every member named in the body, de-duplicated, in the order they appear. */
export function mentionedMemberIds(body: string): string[] {
  const ids: string[] = [];
  for (const match of body.matchAll(mentionRegex())) {
    const id = match[2]!.toLowerCase();
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * What the user has typed after an `@`, if they are in the middle of writing
 * a mention right now.
 *
 * Deliberately strict about what counts. An `@` in the middle of a word is
 * almost always an email address, and one with a space after it is somebody
 * writing "@ 3pm" — neither should open a roster picker over the keyboard.
 */
export function activeMentionQuery(
  body: string,
  caret: number
): { start: number; query: string } | null {
  const upto = body.slice(0, Math.max(0, caret));
  const at = upto.lastIndexOf("@");
  if (at === -1) return null;

  const before = at === 0 ? "" : upto[at - 1]!;
  if (before && !/\s/.test(before)) return null;

  const query = upto.slice(at + 1);
  // A name is short. Past this the user has moved on and the `@` was
  // punctuation, not an address.
  if (query.length > 40) return null;
  // Whitespace ends the query; brackets mean the caret is inside a token
  // that has already been inserted.
  if (/[\s[\]()]/.test(query)) return null;

  return { start: at, query };
}

/** Roster entries worth offering for `query`, best match first. */
export function matchRoster(roster: MemberSummary[], query: string): MemberSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return roster;

  const scored = roster
    .map((member) => {
      const name = member.display_name.toLowerCase();
      const first = name.split(/\s+/)[0] ?? "";
      // A leading match is what someone typing a name means; a match in the
      // middle ("art" in "Bartolo") is a fallback, never the top suggestion.
      if (name.startsWith(q) || first.startsWith(q)) return { member, rank: 0 };
      if (member.initials.toLowerCase().startsWith(q)) return { member, rank: 1 };
      if (name.includes(q)) return { member, rank: 2 };
      return null;
    })
    .filter((entry): entry is { member: MemberSummary; rank: number } => entry !== null);

  return scored.sort((a, b) => a.rank - b.rank).map((entry) => entry.member);
}

/**
 * Replaces the half-typed `@que` at `start`..`caret` with a real mention.
 *
 * The name is sanitised on the way in. A display name containing `]` or a
 * newline would close the token early and leave the rest of it on screen as
 * literal text — no real name does that, and one that did should not be able
 * to break every note it appears in.
 */
export function insertMention(
  body: string,
  start: number,
  caret: number,
  member: MemberSummary
): { body: string; caret: number } {
  const safeName = member.display_name.replace(/[[\]\n]/g, "").trim() || "Someone";
  const token = `@[${safeName}](${member.id})`;
  const rest = body.slice(caret);
  /*
    A space after the token is what lets you carry on typing without the
    picker reopening on the name you just inserted — but only when there is
    not one there already. Mentioning someone mid-sentence would otherwise
    leave a double space behind every name.
  */
  const gap = /^\s/.test(rest) ? "" : " ";
  const next = `${body.slice(0, start)}${token}${gap}${rest}`;
  return { body: next, caret: start + token.length + gap.length };
}

/**
 * How long the note reads, not how long it is stored.
 *
 * The counter and the limit both use this. A mention costs about fifty
 * characters on disk and eight on screen, and charging someone fifty for
 * typing a teammate's name would be inexplicable from the outside.
 */
export function visibleLength(body: string): number {
  return stripMentions(body).length;
}
