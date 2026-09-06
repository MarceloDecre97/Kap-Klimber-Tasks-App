/**
 * The countries a company can be in.
 *
 * A fixed list rather than a free-text box, because the companies book is
 * filtered by country — and free text turns one country into three. "USA",
 * "United States" and "US" are the same place, and once all three exist in
 * the filter nobody can see everybody in America at once.
 *
 * You still type: the field narrows this list as you type and you pick the
 * match. What gets stored is always a name from here, so the filter can only
 * ever offer real countries, spelled one way.
 *
 * Aliases exist because nobody types "United States of America". They are
 * matched, never stored.
 */
export interface Country {
  name: string;
  /** What someone might type instead. Lower case. */
  aliases?: string[];
}

export const COUNTRIES: Country[] = [
  // The four the book actually contains today, first — this is a North
  // American trailer business with a Swiss connection, not a gazetteer.
  { name: "United States", aliases: ["usa", "us", "u.s.", "u.s.a.", "america", "united states of america"] },
  { name: "Canada", aliases: ["ca"] },
  { name: "Mexico", aliases: ["mx", "méxico"] },
  { name: "Switzerland", aliases: ["ch", "suisse", "schweiz", "svizzera"] },

  { name: "Argentina" },
  { name: "Australia", aliases: ["au"] },
  { name: "Austria", aliases: ["at", "österreich"] },
  { name: "Belgium", aliases: ["be", "belgië", "belgique"] },
  { name: "Brazil", aliases: ["br", "brasil"] },
  { name: "Chile" },
  { name: "China", aliases: ["cn", "prc"] },
  { name: "Colombia" },
  { name: "Czechia", aliases: ["cz", "czech republic"] },
  { name: "Denmark", aliases: ["dk", "danmark"] },
  { name: "Finland", aliases: ["fi", "suomi"] },
  { name: "France", aliases: ["fr"] },
  { name: "Germany", aliases: ["de", "deutschland"] },
  { name: "India", aliases: ["in"] },
  { name: "Ireland", aliases: ["ie", "eire", "éire"] },
  { name: "Israel" },
  { name: "Italy", aliases: ["it", "italia"] },
  { name: "Japan", aliases: ["jp"] },
  { name: "Netherlands", aliases: ["nl", "holland", "the netherlands"] },
  { name: "New Zealand", aliases: ["nz"] },
  { name: "Norway", aliases: ["no", "norge"] },
  { name: "Poland", aliases: ["pl", "polska"] },
  { name: "Portugal", aliases: ["pt"] },
  { name: "South Africa", aliases: ["za"] },
  { name: "South Korea", aliases: ["kr", "korea", "republic of korea"] },
  { name: "Spain", aliases: ["es", "españa"] },
  { name: "Sweden", aliases: ["se", "sverige"] },
  { name: "Türkiye", aliases: ["tr", "turkey"] },
  { name: "United Arab Emirates", aliases: ["ae", "uae"] },
  { name: "United Kingdom", aliases: ["uk", "gb", "great britain", "britain", "england", "scotland", "wales"] },
  { name: "Uruguay" },
];

/** Accent- and case-insensitive, for both what is typed and what is matched. */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * The countries worth showing for what has been typed so far.
 *
 * Names that *start* with it come first — typing "un" should offer United
 * States before United Arab Emirates is reached alphabetically — then names
 * that merely contain it, then alias hits. An empty query offers the whole
 * list, which is what makes this a picker as well as a search.
 */
export function suggestCountries(query: string, limit = 8): Country[] {
  const q = fold(query);
  if (!q) return COUNTRIES.slice(0, limit);

  const scored: { country: Country; rank: number }[] = [];
  for (const country of COUNTRIES) {
    const name = fold(country.name);
    let rank = -1;
    if (name.startsWith(q)) rank = 0;
    else if (name.includes(q)) rank = 1;
    else if (country.aliases?.some((a) => fold(a).startsWith(q))) rank = 2;
    if (rank >= 0) scored.push({ country, rank });
  }
  return scored.sort((a, b) => a.rank - b.rank).slice(0, limit).map((s) => s.country);
}

/**
 * The canonical name for something typed, or null when it matches nothing.
 *
 * Used on save as a last line of defence: whatever route the value arrived
 * by, what lands in the column is a name from the list above or nothing at
 * all. An exact alias counts — somebody who types "USA" and presses save
 * without touching the list still gets "United States".
 */
export function canonicalCountry(value: string | null | undefined): string | null {
  const q = fold(value ?? "");
  if (!q) return null;
  const hit = COUNTRIES.find(
    (c) => fold(c.name) === q || c.aliases?.some((a) => fold(a) === q)
  );
  return hit?.name ?? null;
}
