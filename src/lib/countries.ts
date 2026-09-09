/**
 * The countries a company or a contact can be in.
 *
 * A fixed list rather than a free-text box, because both books are filtered by
 * country — and free text turns one country into three. "USA", "United States"
 * and "US" are the same place, and once all three exist in the filter nobody
 * can see everybody in America at once.
 *
 * You still type: the field narrows this list as you type and you pick the
 * match. What gets stored is always a name from here.
 *
 * The list is the full ISO 3166-1 set, generated from Node's own CLDR data
 * rather than typed by hand — the hand-written starter list this replaced was
 * missing Bangladesh and DR Congo, which is exactly the failure a hand-written
 * list has. Names are the standard English ones, the same as Google and Apple
 * show, so "Congo - Kinshasa" and "Côte d\u2019Ivoire" appear as such.
 *
 * Aliases exist because nobody types "United States of America" and everybody
 * types "DRC". They are matched, never stored.
 */
export interface Country {
  name: string;
  /** What someone might type instead. Lower case, accents optional. */
  aliases?: string[];
}

/*
  The four the book actually holds are first, so an empty box offers them
  before two hundred others. Everything after them is alphabetical.
*/
export const COUNTRIES: Country[] = [
  { name: "United States", aliases: ["usa", "us", "u.s.", "u.s.a.", "america", "united states of america"] },
  { name: "Canada" },
  { name: "Mexico", aliases: ["mejico"] },
  { name: "Switzerland", aliases: ["suisse", "schweiz", "svizzera"] },
  { name: "Afghanistan" },
  { name: "Albania" },
  { name: "Algeria" },
  { name: "American Samoa" },
  { name: "Andorra" },
  { name: "Angola" },
  { name: "Anguilla" },
  { name: "Antarctica" },
  { name: "Antigua & Barbuda", aliases: ["antigua and barbuda", "antigua"] },
  { name: "Argentina" },
  { name: "Armenia" },
  { name: "Aruba" },
  { name: "Australia" },
  { name: "Austria" },
  { name: "Azerbaijan" },
  { name: "Bahamas" },
  { name: "Bahrain" },
  { name: "Bangladesh" },
  { name: "Barbados" },
  { name: "Belarus" },
  { name: "Belgium" },
  { name: "Belize" },
  { name: "Benin" },
  { name: "Bermuda" },
  { name: "Bhutan" },
  { name: "Bolivia", aliases: ["plurinational state of bolivia"] },
  { name: "Bosnia & Herzegovina", aliases: ["bosnia and herzegovina", "bosnia"] },
  { name: "Botswana" },
  { name: "Bouvet Island" },
  { name: "Brazil", aliases: ["brasil"] },
  { name: "British Indian Ocean Territory" },
  { name: "British Virgin Islands" },
  { name: "Brunei" },
  { name: "Bulgaria" },
  { name: "Burkina Faso" },
  { name: "Burundi" },
  { name: "Cambodia" },
  { name: "Cameroon" },
  { name: "Cape Verde", aliases: ["cabo verde"] },
  { name: "Caribbean Netherlands" },
  { name: "Cayman Islands" },
  { name: "Central African Republic" },
  { name: "Chad" },
  { name: "Chile" },
  { name: "China" },
  { name: "Christmas Island" },
  { name: "Cocos (Keeling) Islands" },
  { name: "Colombia" },
  { name: "Comoros" },
  { name: "Congo - Brazzaville", aliases: ["republic of congo", "congo republic"] },
  { name: "Congo - Kinshasa", aliases: ["drc", "dr congo", "democratic republic of congo", "democratic republic of the congo", "zaire"] },
  { name: "Cook Islands" },
  { name: "Costa Rica" },
  { name: "Croatia" },
  { name: "Cuba" },
  { name: "Cura\u00e7ao" },
  { name: "Cyprus" },
  { name: "Czechia", aliases: ["czech republic"] },
  { name: "C\u00f4te d\u2019Ivoire", aliases: ["ivory coast", "cote d'ivoire", "cote divoire"] },
  { name: "Denmark" },
  { name: "Djibouti" },
  { name: "Dominica" },
  { name: "Dominican Republic" },
  { name: "Ecuador" },
  { name: "Egypt" },
  { name: "El Salvador" },
  { name: "Equatorial Guinea" },
  { name: "Eritrea" },
  { name: "Estonia" },
  { name: "Eswatini", aliases: ["swaziland"] },
  { name: "Ethiopia" },
  { name: "Falkland Islands" },
  { name: "Faroe Islands" },
  { name: "Fiji" },
  { name: "Finland" },
  { name: "France" },
  { name: "French Guiana" },
  { name: "French Polynesia" },
  { name: "French Southern Territories" },
  { name: "Gabon" },
  { name: "Gambia" },
  { name: "Georgia" },
  { name: "Germany", aliases: ["deutschland"] },
  { name: "Ghana" },
  { name: "Gibraltar" },
  { name: "Greece" },
  { name: "Greenland" },
  { name: "Grenada" },
  { name: "Guadeloupe" },
  { name: "Guam" },
  { name: "Guatemala" },
  { name: "Guernsey" },
  { name: "Guinea" },
  { name: "Guinea-Bissau" },
  { name: "Guyana" },
  { name: "Haiti" },
  { name: "Heard & McDonald Islands" },
  { name: "Honduras" },
  { name: "Hong Kong SAR China", aliases: ["hong kong"] },
  { name: "Hungary" },
  { name: "Iceland" },
  { name: "India" },
  { name: "Indonesia" },
  { name: "Iran" },
  { name: "Iraq" },
  { name: "Ireland", aliases: ["eire", "republic of ireland"] },
  { name: "Isle of Man" },
  { name: "Israel" },
  { name: "Italy" },
  { name: "Jamaica" },
  { name: "Japan" },
  { name: "Jersey" },
  { name: "Jordan" },
  { name: "Kazakhstan" },
  { name: "Kenya" },
  { name: "Kiribati" },
  { name: "Kosovo" },
  { name: "Kuwait" },
  { name: "Kyrgyzstan" },
  { name: "Laos", aliases: ["lao", "lao pdr"] },
  { name: "Latvia" },
  { name: "Lebanon" },
  { name: "Lesotho" },
  { name: "Liberia" },
  { name: "Libya" },
  { name: "Liechtenstein" },
  { name: "Lithuania" },
  { name: "Luxembourg" },
  { name: "Macao SAR China", aliases: ["macao", "macau"] },
  { name: "Madagascar" },
  { name: "Malawi" },
  { name: "Malaysia" },
  { name: "Maldives" },
  { name: "Mali" },
  { name: "Malta" },
  { name: "Marshall Islands" },
  { name: "Martinique" },
  { name: "Mauritania" },
  { name: "Mauritius" },
  { name: "Mayotte" },
  { name: "Micronesia", aliases: ["federated states of micronesia"] },
  { name: "Moldova" },
  { name: "Monaco" },
  { name: "Mongolia" },
  { name: "Montenegro" },
  { name: "Montserrat" },
  { name: "Morocco" },
  { name: "Mozambique" },
  { name: "Myanmar (Burma)", aliases: ["burma"] },
  { name: "Namibia" },
  { name: "Nauru" },
  { name: "Nepal" },
  { name: "Netherlands", aliases: ["holland", "the netherlands"] },
  { name: "New Caledonia" },
  { name: "New Zealand" },
  { name: "Nicaragua" },
  { name: "Niger" },
  { name: "Nigeria" },
  { name: "Niue" },
  { name: "Norfolk Island" },
  { name: "North Korea", aliases: ["dprk"] },
  { name: "North Macedonia" },
  { name: "Northern Mariana Islands" },
  { name: "Norway" },
  { name: "Oman" },
  { name: "Pakistan" },
  { name: "Palau" },
  { name: "Palestinian Territories", aliases: ["palestine"] },
  { name: "Panama" },
  { name: "Papua New Guinea" },
  { name: "Paraguay" },
  { name: "Peru" },
  { name: "Philippines" },
  { name: "Pitcairn Islands" },
  { name: "Poland" },
  { name: "Portugal" },
  { name: "Puerto Rico" },
  { name: "Qatar" },
  { name: "Romania" },
  { name: "Russia", aliases: ["russian federation"] },
  { name: "Rwanda" },
  { name: "R\u00e9union" },
  { name: "Samoa" },
  { name: "San Marino" },
  { name: "Saudi Arabia" },
  { name: "Senegal" },
  { name: "Serbia" },
  { name: "Seychelles" },
  { name: "Sierra Leone" },
  { name: "Singapore" },
  { name: "Sint Maarten" },
  { name: "Slovakia" },
  { name: "Slovenia" },
  { name: "Solomon Islands" },
  { name: "Somalia" },
  { name: "South Africa" },
  { name: "South Georgia & South Sandwich Islands" },
  { name: "South Korea", aliases: ["korea", "republic of korea", "rok"] },
  { name: "South Sudan" },
  { name: "Spain", aliases: ["espana"] },
  { name: "Sri Lanka" },
  { name: "St. Barth\u00e9lemy" },
  { name: "St. Helena" },
  { name: "St. Kitts & Nevis", aliases: ["saint kitts and nevis", "st kitts"] },
  { name: "St. Lucia", aliases: ["saint lucia", "st lucia"] },
  { name: "St. Martin" },
  { name: "St. Pierre & Miquelon" },
  { name: "St. Vincent & Grenadines", aliases: ["saint vincent and the grenadines", "st vincent"] },
  { name: "Sudan" },
  { name: "Suriname" },
  { name: "Svalbard & Jan Mayen" },
  { name: "Sweden" },
  { name: "Syria", aliases: ["syrian arab republic"] },
  { name: "S\u00e3o Tom\u00e9 & Pr\u00edncipe", aliases: ["sao tome and principe", "sao tome"] },
  { name: "Taiwan" },
  { name: "Tajikistan" },
  { name: "Tanzania", aliases: ["united republic of tanzania"] },
  { name: "Thailand" },
  { name: "Timor-Leste", aliases: ["east timor"] },
  { name: "Togo" },
  { name: "Tokelau" },
  { name: "Tonga" },
  { name: "Trinidad & Tobago", aliases: ["trinidad and tobago", "trinidad"] },
  { name: "Tunisia" },
  { name: "Turkmenistan" },
  { name: "Turks & Caicos Islands" },
  { name: "Tuvalu" },
  { name: "T\u00fcrkiye", aliases: ["turkey"] },
  { name: "U.S. Outlying Islands" },
  { name: "U.S. Virgin Islands" },
  { name: "Uganda" },
  { name: "Ukraine" },
  { name: "United Arab Emirates", aliases: ["uae"] },
  { name: "United Kingdom", aliases: ["uk", "gb", "great britain", "britain", "england", "scotland", "wales", "northern ireland"] },
  { name: "Uruguay" },
  { name: "Uzbekistan" },
  { name: "Vanuatu" },
  { name: "Vatican City", aliases: ["holy see"] },
  { name: "Venezuela", aliases: ["bolivarian republic of venezuela"] },
  { name: "Vietnam", aliases: ["viet nam"] },
  { name: "Wallis & Futuna" },
  { name: "Western Sahara" },
  { name: "Yemen" },
  { name: "Zambia" },
  { name: "Zimbabwe" },
  { name: "\u00c5land Islands" },
]

/** Accent- and case-insensitive, for both what is typed and what is matched. */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[\u2018\u2019]/g, "'")
    .toLowerCase()
    .trim();
}

/**
 * The countries worth showing for what has been typed so far.
 *
 * Names that *start* with it come first — typing "un" should offer United
 * States before United Arab Emirates is reached alphabetically — then names
 * that merely contain it, then alias hits. An empty query offers the head of
 * the list, which is what makes this a picker as well as a search.
 */
export function suggestCountries(query: string, limit = 8): Country[] {
  const q = fold(query);
  if (!q) return COUNTRIES.slice(0, limit);

  const scored: { country: Country; rank: number; at: number }[] = [];
  for (let i = 0; i < COUNTRIES.length; i += 1) {
    const country = COUNTRIES[i]!;
    const name = fold(country.name);
    let rank = -1;
    if (name.startsWith(q)) rank = 0;
    else if (country.aliases?.some((a) => fold(a).startsWith(q))) rank = 1;
    else if (name.includes(q)) rank = 2;
    else if (country.aliases?.some((a) => fold(a).includes(q))) rank = 3;
    if (rank >= 0) scored.push({ country, rank, at: i });
  }
  return scored
    .sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : a.at - b.at))
    .slice(0, limit)
    .map((s) => s.country);
}

/**
 * The canonical name for something typed, or null when it matches nothing.
 *
 * Used on save as the last line of defence: whatever route the value arrived
 * by, what lands in the column is a name from the list above or nothing at
 * all. An exact alias counts — somebody who types "USA" and saves without
 * touching the list still gets "United States".
 */
export function canonicalCountry(value: string | null | undefined): string | null {
  const q = fold(value ?? "");
  if (!q) return null;
  const hit = COUNTRIES.find(
    (c) => fold(c.name) === q || c.aliases?.some((a) => fold(a) === q)
  );
  return hit?.name ?? null;
}
