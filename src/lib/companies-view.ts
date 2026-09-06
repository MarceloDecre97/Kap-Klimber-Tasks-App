import {
  Building2,
  Factory,
  HardHat,
  Handshake,
  Landmark,
  LifeBuoy,
  Package,
  Truck,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/**
 * Companies, as people read and type them.
 *
 * Pure, and in its own module for the same reason contacts-view.ts is:
 * data/companies.ts is `server-only`, and the contact form — a client
 * component — needs every one of these.
 */

/** What kind of organisation. A row in company_types, not a fixed enum. */
export interface CompanyType {
  id: string;
  label: string;
  /** A name, not a component — see COMPANY_TYPE_ICONS below. */
  icon: string;
}

/** Everything the form and the company page need about one company. */
export interface CompanySummary {
  id: string;
  name: string;
  about: string | null;
  website: string | null;
  company_number: string | null;
  street: string | null;
  suite: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  type: CompanyType | null;
  created_at: string;
  /** Live contacts at this company. Absent where it was not asked for. */
  contact_count?: number;
}

/* -------------------------------------------------------------------------
   Matching a typed name against the ones already there
   ------------------------------------------------------------------------- */

/**
 * The words that say what kind of company it is rather than which one.
 *
 * "ADV Mobil" and "ADV Mobil LLC" are the same company written twice, and
 * the whole point of this table is that they end up as one row. Stripping
 * the suffix is what lets the form notice — it never merges anything on its
 * own, it only asks.
 */
const LEGAL_SUFFIXES = new Set([
  "llc", "l.l.c", "inc", "incorporated", "corp", "corporation", "co", "company",
  "ltd", "limited", "llp", "lp", "plc", "gmbh", "ag", "sa", "sas", "srl", "bv",
  "nv", "oy", "ab", "as", "pty", "kg", "kft", "spa", "sl",
]);

/**
 * A name reduced to what it actually identifies: lower case, no accents, no
 * punctuation, no legal suffix, single spaces.
 *
 * Two names with the same reduction are near-certainly one company. That is
 * a question for the person who typed it, never an answer this code acts on.
 */
export function normalizeCompanyName(name: string): string {
  const stripped = name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    /*
      Dots close up; everything else opens out.

      "L.L.C." has to survive as the single word "llc" or the suffix list
      below never sees it — turning every dot into a space leaves the
      letters "l l c", and "A.D.V. Mobil, L.L.C." stops matching "ADV Mobil
      LLC", which is precisely the pair this exists to catch.
    */
    .replace(/\./g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

  // Only trailing suffixes go. "Co-op Services" keeps its "co", because
  // dropping a word from the middle of a name changes which company it is.
  while (stripped.length > 1 && LEGAL_SUFFIXES.has(stripped[stripped.length - 1]!)) {
    stripped.pop();
  }
  return stripped.join(" ");
}

/** The company already in the book under exactly this name, ignoring case. */
export function exactCompanyMatch<T extends { name: string }>(
  name: string,
  companies: T[]
): T | null {
  const typed = name.trim().toLowerCase();
  if (!typed) return null;
  return companies.find((c) => c.name.trim().toLowerCase() === typed) ?? null;
}

/**
 * Companies that are probably the one being typed, but are not spelled the
 * same. Empty when there is an exact match — there is nothing to ask about
 * once the name is already right.
 */
export function nearCompanyMatches<T extends { name: string }>(
  name: string,
  companies: T[]
): T[] {
  const typed = name.trim();
  if (!typed) return [];
  if (exactCompanyMatch(typed, companies)) return [];

  const key = normalizeCompanyName(typed);
  if (!key) return [];
  return companies.filter((c) => normalizeCompanyName(c.name) === key);
}

/**
 * The suggestion list under the company box: anything containing what has
 * been typed so far, best-looking first — the ones that start with it, then
 * the rest.
 */
export function suggestCompanies<T extends { name: string }>(
  query: string,
  companies: T[],
  limit = 6
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits = companies.filter((c) => c.name.toLowerCase().includes(q));
  return hits
    .slice()
    .sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
      const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
      return aStarts !== bStarts ? aStarts - bStarts : a.name.localeCompare(b.name);
    })
    .slice(0, limit);
}

/* -------------------------------------------------------------------------
   Reading one out
   ------------------------------------------------------------------------- */

/** True when the company has nothing filled in beyond its name. */
export function companyIsBare(c: CompanySummary): boolean {
  return ![c.about, c.website, c.company_number, c.street, c.suite, c.city, c.state, c.postal_code, c.country]
    .some((v) => v && v.trim());
}

/** "3 people" / "1 person" / "Nobody yet". */
export function companyPeopleLine(count: number): string {
  if (count === 0) return "Nobody yet";
  return count === 1 ? "1 person" : `${count} people`;
}

/* -------------------------------------------------------------------------
   Type icons

   The same whitelist-by-name arrangement contact categories use, and for the
   same reason: a type added by somebody typing it travels as a string, and
   an unrecognised one has to render as something rather than break the row.
   ------------------------------------------------------------------------- */
export const DEFAULT_COMPANY_TYPE_ICON: LucideIcon = Building2;

export const COMPANY_TYPE_ICONS: Record<string, LucideIcon> = {
  truck: Truck,
  factory: Factory,
  wrench: Wrench,
  "hard-hat": HardHat,
  "life-buoy": LifeBuoy,
  landmark: Landmark,
  building: Building2,
  handshake: Handshake,
  package: Package,
  users: Users,
};

/* -------------------------------------------------------------------------
   Searching and filtering the companies book

   Deliberately the same shape as the contacts book: a query that looks
   everywhere, plus two narrowing filters. Somebody who has learned one book
   has learned both.
   ------------------------------------------------------------------------- */

export interface CompanyFilters {
  query: string;
  country: string | null;
  typeId: string | null;
}

export const EMPTY_COMPANY_FILTERS: CompanyFilters = { query: "", country: null, typeId: null };

export function countActiveCompanyFilters(f: CompanyFilters): number {
  return (f.country ? 1 : 0) + (f.typeId ? 1 : 0);
}

export function matchesCompany(c: CompanySummary, filters: CompanyFilters): boolean {
  if (filters.country && c.country !== filters.country) return false;
  if (filters.typeId && c.type?.id !== filters.typeId) return false;

  const q = filters.query.trim().toLowerCase();
  if (!q) return true;

  // The name, where it is, what it does, and its number — the four things
  // somebody has in mind when they come looking for a company.
  return [c.name, c.city, c.state, c.country, c.about, c.website, c.company_number, c.type?.label]
    .some((field) => field && field.toLowerCase().includes(q));
}

/** Every country actually in use, for the filter. Deduped and sorted. */
export function countriesIn(companies: CompanySummary[]): string[] {
  const seen = new Set<string>();
  for (const c of companies) {
    const name = c.country?.trim();
    if (name) seen.add(name);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

/* -------------------------------------------------------------------------
   A to Z
   ------------------------------------------------------------------------- */

export interface CompanyGroup {
  letter: string;
  companies: CompanySummary[];
}

/**
 * Grouped by the first letter of the name, exactly as the contacts book is
 * grouped by surname — accents folded, so Ålesund Trailers files under A and
 * not under "#", and anything that does not start with a letter collects at
 * the end rather than inventing one.
 */
export function groupCompanies(companies: CompanySummary[]): CompanyGroup[] {
  const sorted = companies
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  const groups: CompanyGroup[] = [];
  for (const company of sorted) {
    const first = company.name
      .trim()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .charAt(0)
      .toUpperCase();
    const letter = /[A-Z]/.test(first) ? first : "#";

    const last = groups[groups.length - 1];
    if (last && last.letter === letter) last.companies.push(company);
    else groups.push({ letter, companies: [company] });
  }

  // "#" belongs at the end, whatever order the names arrived in.
  return groups.sort((a, b) => {
    if (a.letter === "#") return 1;
    if (b.letter === "#") return -1;
    return a.letter.localeCompare(b.letter);
  });
}
