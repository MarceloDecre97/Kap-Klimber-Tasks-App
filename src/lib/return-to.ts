/**
 * Where a full-screen page should send you back to.
 *
 * The task form and the settings screen both used to end at /tasks, whoever
 * opened them. Edit a task from the Dashboard and saving dropped you in the
 * Tasklist; change your theme from the address book and Back did the same.
 *
 * The origin travels in the URL rather than through history. `router.back()`
 * is wrong here often enough to matter: it lands somewhere unrelated when the
 * page was reached by a typed address, a notification, or a redirect, and it
 * cannot survive a reload.
 */

/** Everywhere a page is allowed to send somebody. */
const ALLOWED = ["/tasks", "/dashboard", "/contacts", "/companies", "/settings"];

/**
 * A safe internal destination, or the Tasklist.
 *
 * Only paths this app actually has, matched against a list rather than a
 * shape. A value arriving as "//evil.example" or "https://evil.example" is a
 * link somebody could put in front of a teammate, and both would pass a naive
 * "starts with a slash" check — the first because browsers read a
 * protocol-relative URL as another host, the second for the obvious reason.
 */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value) return "/tasks";
  const [path] = value.split(/[?#]/);
  return ALLOWED.includes(path) ? value : "/tasks";
}

/**
 * The query string that carries an origin, and optionally the task to
 * re-open when you get there.
 */
export function returnToQuery(from: string, taskId?: string): string {
  const params = new URLSearchParams({ from });
  if (taskId) params.set("task", taskId);
  return `?${params.toString()}`;
}
