import type { ContactSummary } from "@/lib/data/contacts";
import { fullName } from "@/lib/contacts-view";

/**
 * One contact, as a .vcf a phone will offer to save.
 *
 * vCard 3.0 rather than 4.0: 3.0 is what Android's contacts app, iOS and
 * Outlook all import without argument, and there is nothing here that needs
 * anything newer.
 *
 * The format is fussier than it looks. Commas and semicolons are structure,
 * not text, so a company called "Halberd Steel; Tube" splits a field in two
 * unless escaped — and the whole file is CRLF-delimited, which some parsers
 * enforce strictly.
 */
function esc(value: string | null): string {
  if (!value) return "";
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

export function buildVCard(contact: ContactSummary): string {
  const lines: string[] = ["BEGIN:VCARD", "VERSION:3.0"];

  // N is structured: surname;given;middle;prefix;suffix — and required.
  lines.push(`N:${esc(contact.last_name)};${esc(contact.first_name)};;;`);
  lines.push(`FN:${esc(fullName(contact))}`);

  if (contact.company) lines.push(`ORG:${esc(contact.company)}`);
  if (contact.job_title) lines.push(`TITLE:${esc(contact.job_title)}`);
  if (contact.mobile) lines.push(`TEL;TYPE=CELL,VOICE:${esc(contact.mobile)}`);
  if (contact.office_phone) lines.push(`TEL;TYPE=WORK,VOICE:${esc(contact.office_phone)}`);
  if (contact.email) lines.push(`EMAIL;TYPE=INTERNET,PREF:${esc(contact.email)}`);
  if (contact.email2) lines.push(`EMAIL;TYPE=INTERNET:${esc(contact.email2)}`);
  if (contact.website) lines.push(`URL:${esc(contact.website)}`);

  /*
    The address on the card is the person's own if they have one, and the
    company's otherwise.

    Most people do not have their own — they work at the company address,
    which is why it lives on the company. Without this fallback, saving such
    a contact to a phone would produce a card with no address at all, and
    the whole point of the company table would have made the vCard worse.
  */
  const hasOwn = Boolean(
    contact.street || contact.city || contact.state || contact.postal_code || contact.country
  );
  const place = hasOwn ? contact : contact.company_record;

  // ADR is seven parts: po;extended;street;locality;region;postcode;country.
  if (place && (place.street || place.city || place.state || place.postal_code || place.country)) {
    // The second slot is "extended address", which is exactly what a suite
    // or unit number is, and the last is the country.
    lines.push(
      `ADR;TYPE=WORK:;${esc(place.suite)};${esc(place.street)};${esc(place.city)};${esc(place.state)};${esc(place.postal_code)};${esc(place.country)}`
    );
  }

  /*
    Notes and where they came from travel together, because a number without
    "quotes fast, call to confirm the install week" is the half of the
    contact that does not help anybody at 7am.
  */
  const note = [contact.notes, contact.source ? `From: ${contact.source}` : null]
    .filter(Boolean)
    .join("\n");
  if (note) lines.push(`NOTE:${esc(note)}`);

  lines.push("END:VCARD");
  return `${lines.join("\r\n")}\r\n`;
}

/** A filename a phone and a laptop will both accept. */
export function vcardFilename(contact: ContactSummary): string {
  const base = fullName(contact).replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-") || "contact";
  return `${base}.vcf`;
}
