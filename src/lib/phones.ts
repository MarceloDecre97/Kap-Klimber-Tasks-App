/**
 * Phone numbers, written one way.
 *
 * The book had numbers as "9055550110", "(905) 555-0110" and "+41 79 357 3300"
 * side by side, which reads as three different kinds of thing. Everything now
 * goes through here on the way in, so the book looks like one book.
 *
 * The rule is deliberately narrow: format what is unambiguous, and leave
 * everything else exactly as typed. A number this cannot parse is somebody's
 * real number written in a way we did not anticipate — mangling it would be
 * worse than the inconsistency it was trying to fix.
 */

/** Just the digits. What the duplicate check and `tel:` links care about. */
export function phoneDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/*
  ITU country calling codes, longest match first.

  Only consulted when somebody typed a "+". Without one there is no way to tell
  a country code from an area code — "1234567890" could be either — so we do
  not guess. An unrecognised code means the number is returned untouched rather
  than split in the wrong place.
*/
const CALLING_CODES = [
  "1", "7", "20", "27", "30", "31", "32", "33", "34", "36", "39", "40", "41",
  "43", "44", "45", "46", "47", "48", "49", "51", "52", "53", "54", "55", "56",
  "57", "58", "60", "61", "62", "63", "64", "65", "66", "81", "82", "84", "86",
  "90", "91", "92", "93", "94", "95", "98",
  "211", "212", "213", "216", "218", "220", "221", "222", "223", "224", "225",
  "226", "227", "228", "229", "230", "231", "232", "233", "234", "235", "236",
  "237", "238", "239", "240", "241", "242", "243", "244", "245", "246", "248",
  "249", "250", "251", "252", "253", "254", "255", "256", "257", "258", "260",
  "261", "262", "263", "264", "265", "266", "267", "268", "269", "290", "291",
  "297", "298", "299", "350", "351", "352", "353", "354", "355", "356", "357",
  "358", "359", "370", "371", "372", "373", "374", "375", "376", "377", "378",
  "380", "381", "382", "383", "385", "386", "387", "389", "420", "421", "423",
  "500", "501", "502", "503", "504", "505", "506", "507", "508", "509", "590",
  "591", "592", "593", "595", "597", "598", "599", "670", "673", "674", "675",
  "676", "677", "678", "679", "680", "681", "682", "683", "685", "686", "687",
  "688", "689", "690", "691", "692", "850", "852", "853", "855", "856", "880",
  "886", "960", "961", "962", "963", "964", "965", "966", "967", "968", "970",
  "972", "973", "974", "975", "976", "977", "992", "993", "994", "995", "996",
  "998",
].sort((a, b) => b.length - a.length);

/**
 * "(123)-456-7890", or "456-7890" for a bare local seven.
 *
 * The seven-digit form is only offered when `allowLocal` is set, which means
 * no country code was given. After a "+" a seven-digit remainder is not a
 * local number — it is a foreign number missing its last digits, and dressing
 * "+41 79 357 33" up as "+41 793-5733" would be inventing a shape it does not
 * have. Returns null for anything else, which means "leave it alone".
 */
function groupNational(digits: string, allowLocal: boolean): string | null {
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)})-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (allowLocal && digits.length === 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return null;
}

/**
 * A number as the book writes it.
 *
 *   1234567890        →  (123)-456-7890
 *   +52 1234567890    →  +52 (123)-456-7890
 *   15175550123       →  +1 (517)-555-0123
 *   4567890           →  456-7890
 *   anything else     →  unchanged
 *
 * The last line is the important one. An extension, a nine-digit Swiss mobile,
 * a number with a note beside it — all come back exactly as they went in.
 */
export function formatPhone(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";

  const digits = phoneDigits(raw);
  if (!digits) return raw;

  // A country code is only ever taken from an explicit "+".
  if (raw.startsWith("+")) {
    for (const code of CALLING_CODES) {
      if (!digits.startsWith(code)) continue;
      const national = groupNational(digits.slice(code.length), false);
      if (national) return `+${code} ${national}`;
      // The code matched but the rest is not a shape we know. Longer codes
      // were tried first, so there is nothing better coming — leave it.
      break;
    }
    return raw;
  }

  // Eleven digits starting with 1 and no plus: almost always a US number
  // typed with its country code, so it is treated as one.
  if (digits.length === 11 && digits.startsWith("1")) {
    const national = groupNational(digits.slice(1), false);
    if (national) return `+1 ${national}`;
  }

  return groupNational(digits, true) ?? raw;
}

/* -------------------------------------------------------------------------
   How short is too short

   Three different answers, because the fields are three different things. A
   mobile is a full number or it is not a mobile. An office line and a company
   switchboard are routinely written as the local seven.
   ------------------------------------------------------------------------- */

export const PHONE_MINIMUMS = {
  mobile: 10,
  office: 7,
  companyLine: 7,
} as const;

export type PhoneKind = keyof typeof PHONE_MINIMUMS;

/** True when there are not enough digits for this kind of number. */
export function phoneTooShort(value: string | null | undefined, kind: PhoneKind): boolean {
  const digits = phoneDigits(value);
  if (!digits) return false;
  return digits.length < PHONE_MINIMUMS[kind];
}

/** What to tell somebody whose number is too short. */
export function phoneTooShortMessage(kind: PhoneKind): string {
  const n = PHONE_MINIMUMS[kind];
  return kind === "mobile"
    ? `A mobile needs all ${n} digits.`
    : `That needs at least ${n} digits.`;
}
