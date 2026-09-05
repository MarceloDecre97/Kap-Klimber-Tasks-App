import {
  Briefcase,
  Building2,
  ClipboardList,
  Compass,
  HardHat,
  Handshake,
  Landmark,
  Package,
  Target,
  TrendingUp,
  Truck,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { ContactSummary } from "@/lib/data/contacts";

/**
 * Turning the address book into something readable.
 *
 * Pure, and deliberately in its own module rather than beside the queries:
 * data/contacts.ts is `server-only`, and every one of these is needed by a
 * client component. A client importing from there fails at bundle time,
 * which typecheck does not catch.
 */

/* -------------------------------------------------------------------------
   Category icons

   Categories live in a table so the team can add one without a migration,
   which means the icon has to travel as a name. This is the whitelist that
   turns that name back into a component — anything unrecognised falls back
   rather than breaking the row, so a category added from the SQL editor with
   a typo still renders.
   ------------------------------------------------------------------------- */
export const DEFAULT_CATEGORY_ICON: LucideIcon = User;

/*
  Exported as a map and indexed at the call site rather than wrapped in a
  `categoryIcon()` helper. A function returning a component, assigned to a
  capitalised const and rendered, is indistinguishable from defining a
  component mid-render — React's lint rule says so, and it is right to. A
  property lookup is what the existing badge does, and it reads the same.
*/
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  target: Target,
  truck: Truck,
  handshake: Handshake,
  package: Package,
  landmark: Landmark,
  "trending-up": TrendingUp,
  user: User,
  users: Users,
  briefcase: Briefcase,
  building: Building2,
  compass: Compass,
  "hard-hat": HardHat,
  clipboard: ClipboardList,
};

/* -------------------------------------------------------------------------
   Names
   ------------------------------------------------------------------------- */

export function fullName(c: { first_name: string; last_name: string }): string {
  return `${c.first_name} ${c.last_name}`.trim();
}

/**
 * Two letters, first and last. Falls back to the first name's first two
 * rather than rendering a single lonely letter — every contact has both
 * names, but a one-character surname would otherwise give "M" beside a
 * roster of two-letter members.
 */
export function initialsOf(c: { first_name: string; last_name: string }): string {
  const a = c.first_name.trim()[0] ?? "";
  const b = c.last_name.trim()[0] ?? "";
  const pair = `${a}${b}`.toUpperCase();
  return pair.length >= 2 ? pair : c.first_name.trim().slice(0, 2).toUpperCase() || "?";
}

/**
 * The avatar colour, derived from the name rather than stored.
 *
 * Deterministic, so a contact keeps the same colour on every device and in
 * every session without a column to hold it or a picker to set it. The
 * palette is fixed and hand-picked to stay legible under white text in both
 * themes, which is why it is a list rather than a hue computed from the hash.
 */
const AVATAR_COLORS = [
  "#87252b", "#1d4ed8", "#047857", "#7c3aed", "#b45309",
  "#0e7490", "#9d174d", "#3f6212", "#4338ca", "#a16207",
];

export function avatarColor(c: { first_name: string; last_name: string }): string {
  const seed = `${c.first_name}|${c.last_name}`.toLowerCase();
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    // Same shape as the classic string hash: shift, add, keep it 32-bit.
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]!;
}

/* -------------------------------------------------------------------------
   Searching and filtering
   ------------------------------------------------------------------------- */

export interface ContactFilters {
  query: string;
  company: string | null;
  categoryId: string | null;
}

export const EMPTY_CONTACT_FILTERS: ContactFilters = { query: "", company: null, categoryId: null };

export function countActiveContactFilters(f: ContactFilters): number {
  return (f.company ? 1 : 0) + (f.categoryId ? 1 : 0);
}

/**
 * Search across everything somebody might half-remember.
 *
 * Phone numbers are matched on digits as well as on the text, so searching
 * "5550164" finds a contact stored as "(847) 555 0164". That is how anybody
 * reading a number off a screen would type it.
 */
export function matchesContact(c: ContactSummary, filters: ContactFilters): boolean {
  if (filters.company && c.company !== filters.company) return false;
  if (filters.categoryId && c.category?.id !== filters.categoryId) return false;

  const q = filters.query.trim().toLowerCase();
  if (!q) return true;

  const digits = q.replace(/\D/g, "");
  const haystack = [
    c.first_name, c.last_name, c.job_title, c.company,
    c.email, c.email2, c.mobile, c.office_phone, c.category?.label,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (haystack.includes(q)) return true;
  if (digits.length >= 3) {
    const phoneDigits = `${c.mobile ?? ""}${c.office_phone ?? ""}`.replace(/\D/g, "");
    if (phoneDigits.includes(digits)) return true;
  }
  return false;
}

/** Every company in the book, for the filter, deduped and sorted. */
export function companiesIn(contacts: ContactSummary[]): string[] {
  const seen = new Set<string>();
  for (const c of contacts) {
    const name = c.company?.trim();
    if (name) seen.add(name);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

/* -------------------------------------------------------------------------
   A to Z
   ------------------------------------------------------------------------- */

export interface ContactGroup {
  letter: string;
  people: ContactSummary[];
}

/**
 * Grouped by the first letter of the surname, which is what the book sorts
 * by and what somebody scanning it is looking for. Anything not starting
 * with a letter — a surname in another script, a company standing in for a
 * person — collects under "#" at the end rather than inventing a letter.
 */
export function groupContacts(contacts: ContactSummary[]): ContactGroup[] {
  const sorted = contacts.slice().sort((a, b) => {
    const last = a.last_name.localeCompare(b.last_name, undefined, { sensitivity: "base" });
    return last !== 0 ? last : a.first_name.localeCompare(b.first_name, undefined, { sensitivity: "base" });
  });

  const groups: ContactGroup[] = [];
  for (const c of sorted) {
    /*
      Accents are stripped before the letter is chosen, so Álvarez files
      under A. Without this it landed in "#" with the numerals — which is
      where a surname goes to be un-findable, and exactly the kind of name
      a logistics book is full of.
    */
    const first = c.last_name.trim().normalize("NFD").replace(/\p{Diacritic}/gu, "")[0]?.toUpperCase() ?? "#";
    const letter = /[A-Z]/.test(first) ? first : "#";
    const last = groups[groups.length - 1];
    if (last && last.letter === letter) last.people.push(c);
    else groups.push({ letter, people: [c] });
  }

  // "#" sorts before "A" by character code, which is not where anybody looks
  // for it. Moved to the end, where "everything else" belongs.
  const other = groups.findIndex((g) => g.letter === "#");
  if (other >= 0) groups.push(...groups.splice(other, 1));
  return groups;
}

/* -------------------------------------------------------------------------
   Formatting
   ------------------------------------------------------------------------- */

/** "1440 N Milwaukee Ave · Chicago, IL 60622", skipping whatever is missing. */
export function formatAddress(c: {
  street: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
}): string | null {
  const cityLine = [c.city, [c.state, c.postal_code].filter(Boolean).join(" ")]
    .filter((part) => part && part.trim())
    .join(", ");
  const parts = [c.street?.trim(), cityLine].filter((part) => part && part.length > 0);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** "Project architect · Alvarez & Lin", or whichever half exists. */
export function roleLine(c: { job_title: string | null; company: string | null }): string | null {
  const parts = [c.job_title?.trim(), c.company?.trim()].filter((p) => p && p.length > 0);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * How long a deleted contact stays visible in Recently deleted.
 *
 * The same fortnight the Tasklist uses, and for the same reason — but note
 * what it does *not* do. Nothing is erased when this elapses. The row simply
 * stops being listed; erasing is always somebody pressing the button, or a
 * contact pill could vanish off a finished task weeks later with nobody
 * having asked for it.
 */
export const DELETED_CONTACTS_VISIBLE_DAYS = 15;
