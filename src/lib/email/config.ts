import "server-only";

/**
 * Everything the emailer needs, and a clear answer when it is not set up.
 *
 * The app has to work perfectly well before anyone has configured Resend —
 * the bell and push are the channels that matter, and email is the quiet one
 * on top. So this returns null rather than throwing, and the caller says
 * "skipped" rather than 500.
 */
export interface EmailConfig {
  apiKey: string;
  /** The verified subdomain. Never the root: five live mailboxes sit there. */
  from: string;
  /** Where a link in the email points. */
  origin: string | null;
}

/**
 * `notify.opuskap.com` rather than `opuskap.com`, deliberately.
 *
 * A subdomain keeps the app's sending reputation separate from the team's
 * real mail. If this app ever sends something that gets marked as spam, it
 * damages notify.opuskap.com and leaves everybody's actual email alone.
 */
const FROM = "Kap Klimber Tasks <tasks@notify.opuskap.com>";

/**
 * The public address of the app, for links back into it.
 *
 * Vercel provides the production domain as a system variable, so nothing has
 * to be configured by hand — but APP_URL wins if it is set, which is what a
 * custom domain would need later.
 */
export function appOrigin(): string | null {
  const explicit = process.env.APP_URL;
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return vercel ? `https://${vercel}` : null;
}

export function getEmailConfig(): EmailConfig | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return { apiKey, from: FROM, origin: appOrigin() };
}
