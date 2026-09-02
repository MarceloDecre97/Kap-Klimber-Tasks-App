import "server-only";

import { getEmailConfig } from "@/lib/email/config";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type EmailResult =
  | { ok: true; id: string | null }
  /** The address is bad or blocked. Retrying will never help. */
  | { ok: false; permanent: true; reason: string }
  /** Rate limit, network, or Resend having a moment. */
  | { ok: false; permanent: false; reason: string };

/**
 * One email, through Resend's HTTP API.
 *
 * Called with fetch rather than through their SDK: this is a single POST with
 * a JSON body, and a dependency for that would be one more thing to keep
 * current in a project nobody is maintaining full time.
 */
export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const config = getEmailConfig();
  if (!config) return { ok: false, permanent: false, reason: "email is not configured" };

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        headers: {
          /*
            Tells Gmail and Outlook this is mail somebody signed up for, with
            a way out — which is a large part of why it lands in the inbox
            rather than Promotions. The link goes to Settings, where the
            switches will live once phase 6 ships.
          */
          ...(config.origin
            ? { "List-Unsubscribe": `<${config.origin}/settings>` }
            : {}),
        },
      }),
    });

    if (response.ok) {
      const body = (await response.json().catch(() => null)) as { id?: string } | null;
      return { ok: true, id: body?.id ?? null };
    }

    const detail = await response.text().catch(() => "");
    /*
      422 is Resend rejecting the address or the payload — a typo in an email,
      or a domain that is no longer verified. 4xx generally will not fix
      itself; 429 and 5xx will.
    */
    const permanent = response.status >= 400 && response.status < 500 && response.status !== 429;
    return { ok: false, permanent, reason: `${response.status}: ${detail.slice(0, 200)}` };
  } catch (error) {
    return {
      ok: false,
      permanent: false,
      reason: (error as Error)?.message ?? "network error",
    };
  }
}
