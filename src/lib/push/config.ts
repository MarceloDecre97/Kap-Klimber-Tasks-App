import "server-only";

/**
 * The VAPID pair that identifies this app to the push services.
 *
 * The private half signs each request; the public half is what every browser
 * needs in order to check that signature, which is why it carries the
 * NEXT_PUBLIC_ prefix and is not a secret. Reading them here, rather than
 * inline where they are used, keeps the "is push even configured?" question
 * answerable in one place — the app has to work perfectly well before anyone
 * has set them.
 */
export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  /** A contact address the push services can reach. Never shown to anyone. */
  subject: string;
}

export function getVapidConfig(): VapidConfig | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

/**
 * The shared secret that proves a request to the dispatcher came from the
 * scheduled job rather than from the open internet.
 */
export function getCronSecret(): string | null {
  return process.env.CRON_SECRET || null;
}
