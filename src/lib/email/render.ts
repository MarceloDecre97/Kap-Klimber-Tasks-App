import { describeNotification } from "@/lib/notifications-view";
import type { NotificationItem } from "@/lib/data/notifications";
import type { NotificationKind } from "@/lib/supabase/database.types";

/**
 * Which notifications email can carry.
 *
 * Everything a person is able to switch. Marcelo's call, and the right one:
 * the app should not decide on somebody's behalf that a comment is not worth
 * an email — it should let them decide, and default to telling them.
 *
 * The three exceptions are the two locked groups: being @mentioned, and being
 * asked to approve or refused a deletion. Those are urgent and addressed to
 * one person, they cannot be switched off, and email is the slow channel —
 * so they stay on the bell and the phone where they are read in minutes
 * rather than hours.
 */
/*
  Only mentions. Delete requests used to be here too, on the reasoning that
  they were urgent enough for the bell and the phone — but that is backwards:
  a request sits waiting until the creator answers, and email is the one
  channel that reaches somebody who is not near the app. It is switchable
  like any other, and quiet hours hold it like any other.

  Mentions stay out. They are conversation, and a note naming you is already
  on the bell and the phone the moment it is written.
*/
const NEVER_EMAILED = new Set<NotificationKind>(["mention"]);

export function isEmailable(item: NotificationItem): boolean {
  return !NEVER_EMAILED.has(item.kind);
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Everything user-supplied goes through this before it reaches the HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/*
  Table-based, inline-styled, no external stylesheet and no web font.

  Every one of those is a concession to email clients rather than a taste:
  Outlook ignores most modern CSS, Gmail strips <style> blocks in some
  contexts, and a font that fails to load silently is worse than one that was
  never asked for. The colours are the app's own so the two read as one thing.
*/
const BRAND = "#87252b";
const FG = "#020617";
const SUB = "#475569";
const BORDER = "#e2e8f0";
const FONT = "Helvetica, Arial, sans-serif";

function row(item: NotificationItem, origin: string | null): string {
  const { headline, detail } = describeNotification(item);
  const href = origin && !item.taskGone ? `${origin}/tasks?task=${item.task.id}` : null;

  /*
    Underlined, deliberately.

    It was styled `text-decoration:none` to look tidy, and that made the one
    link that matters — the one that opens the actual task — read as a
    heading. Marcelo got a reminder, clicked the only thing in the message
    that looked clickable, and landed on the whole Tasklist wondering which
    card he had been sent to. A link that does not look like a link is not a
    link, and in an email there is no hover state to discover it with.
  */
  const title = href
    ? `<a href="${escapeHtml(href)}" style="color:${BRAND};text-decoration:underline;font-weight:bold">${escapeHtml(headline)}</a>`
    : `<span style="font-weight:bold">${escapeHtml(headline)}</span>`;

  // A second, unmissable way in. The headline is the natural thing to tap,
  // but "Open this task" says what will happen, which the headline never can.
  const open = href
    ? `<div style="margin-top:6px"><a href="${escapeHtml(href)}" style="color:${BRAND};font-size:14px;line-height:20px">Open this task &rarr;</a></div>`
    : "";

  return `
    <tr>
      <td style="padding:14px 0;border-bottom:1px solid ${BORDER};font-family:${FONT};font-size:16px;line-height:24px;color:${FG}">
        ${title}
        ${detail ? `<div style="margin-top:4px;font-size:15px;line-height:22px;color:${SUB}">${escapeHtml(detail)}</div>` : ""}
        ${open}
      </td>
    </tr>`;
}

/**
 * One email per person per run, not one per notification.
 *
 * Three things happening in the same minute is one email listing three lines.
 * Three separate emails about one afternoon is how a person decides the app
 * is not worth having in their inbox.
 */
export function renderDigest(
  name: string,
  items: NotificationItem[],
  origin: string | null
): RenderedEmail {
  const first = describeNotification(items[0]!);
  // The subject is the whole notification for anyone reading on a lock
  // screen, so a single item says exactly what happened rather than a count.
  const subject =
    items.length === 1 ? first.headline : `${items.length} updates on your tasks`;

  const rows = items.map((item) => row(item, origin)).join("");
  const openLink = origin
    ? `<p style="margin:28px 0 0;font-family:${FONT};font-size:15px;line-height:22px">
         <a href="${escapeHtml(origin)}/tasks" style="color:${BRAND}">See everything in Kap Klimber Tasks</a>
       </p>`
    : "";

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f8fafc">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc">
    <tr><td align="center" style="padding:24px 12px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:560px;background:#ffffff;border:1px solid ${BORDER};border-radius:12px;padding:24px">
        <tr><td style="font-family:${FONT};font-size:13px;letter-spacing:1px;text-transform:uppercase;color:${BRAND};font-weight:bold;padding-bottom:6px">
          Kap Klimber Tasks
        </td></tr>
        <tr><td style="font-family:${FONT};font-size:18px;line-height:26px;color:${FG};padding-bottom:8px">
          Hello ${escapeHtml(name)},
        </td></tr>
        <tr><td>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
          ${openLink}
        </td></tr>
        <tr><td style="padding-top:24px;font-family:${FONT};font-size:13px;line-height:20px;color:${SUB}">
          You get these because you created or were assigned to these tasks.
          ${origin ? `Change what reaches you in <a href="${escapeHtml(origin)}/settings" style="color:${SUB}">Settings</a>.` : ""}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  // Not a fallback nobody reads: a plain-text part is one of the things spam
  // filters look for, and some people genuinely read mail this way.
  const lines = items.map((item) => {
    const { headline, detail } = describeNotification(item);
    const link = origin && !item.taskGone ? `\n  ${origin}/tasks?task=${item.task.id}` : "";
    return `* ${headline}${detail ? `\n  ${detail}` : ""}${link}`;
  });

  const text = [
    `Hello ${name},`,
    "",
    ...lines,
    "",
    origin ? `See everything: ${origin}/tasks` : "",
    "",
    "You get these because you created or were assigned to these tasks.",
  ]
    .filter((line, i, all) => !(line === "" && all[i - 1] === ""))
    .join("\n");

  return { subject, html, text };
}
