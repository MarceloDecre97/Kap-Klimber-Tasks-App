/**
 * Companies, as people read and type them.
 *
 * Pure, and in its own module for the same reason contacts-view.ts is:
 * data/companies.ts is `server-only`, and the contact form — a client
 * component — needs every one of these.
 */

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
