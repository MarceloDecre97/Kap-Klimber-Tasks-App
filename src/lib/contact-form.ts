import { contactInputSchema } from "@/lib/validation";

/**
 * What the contact form knows about being wrong.
 *
 * Pure, and separate from the component, because "which field is bad and
 * what does it say" is the part worth testing — and because the form now
 * has to answer it in three places at once: the summary at the top, the
 * outline on the field, and the line beside the Save button.
 */

/** Every field the form can complain about. Keyed to the draft. */
export type ContactField =
  | "firstName" | "lastName" | "jobTitle" | "company"
  | "mobile" | "officePhone" | "email" | "email2" | "website"
  | "street" | "suite" | "city" | "state" | "postalCode" | "country"
  | "source" | "notes";

export type ContactErrors = Partial<Record<ContactField, string>>;

/** The label shown in the summary, so it names what you can see. */
export const FIELD_LABELS: Record<ContactField, string> = {
  firstName: "First name", lastName: "Last name", jobTitle: "Job title", company: "Company",
  mobile: "Mobile", officePhone: "Office phone", email: "Email", email2: "Second email",
  website: "Website", street: "Street", suite: "Suite / unit", city: "City", state: "State",
  postalCode: "ZIP", country: "Country", source: "Where they came from", notes: "Notes",
};

/**
 * The whole draft, checked at once.
 *
 * Runs the same Zod schema the server does rather than a second set of
 * rules, so the form can never accept something the action rejects. Zod
 * reports the reachability rule against `mobile`, which is where somebody
 * filling this in is most likely to be looking.
 */
export function validateContact(draft: Record<string, unknown>): ContactErrors {
  const result = contactInputSchema.safeParse(draft);
  if (result.success) return {};

  const errors: ContactErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in errors)) {
      errors[key as ContactField] = issue.message;
    }
  }
  return errors;
}

/* -------------------------------------------------------------------------
   Live checks

   Shown while typing rather than on save, and deliberately narrow: these
   catch a shape that is definitely wrong, never one that is merely unusual.
   ------------------------------------------------------------------------- */

/** something@something.tld — the shape, not a guarantee it exists. */
export function emailLooksWrong(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed);
}

/**
 * A phone that is too short to be one.
 *
 * Seven digits, not ten. A ten-digit rule is a US rule, and this book
 * already holds +41 79 357 3300 and +52 818 080 6605 — eleven and twelve
 * digits — while a US number written +1 312 555 0143 is also eleven.
 * Marking real numbers red teaches people to ignore the colour.
 */
const MIN_PHONE_DIGITS = 7;

export function phoneLooksWrong(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return trimmed.replace(/\D/g, "").length < MIN_PHONE_DIGITS;
}

/** "2 things need fixing" — the count, worded. */
export function errorSummary(errors: ContactErrors): string | null {
  const n = Object.keys(errors).length;
  if (n === 0) return null;
  return n === 1 ? "One thing needs fixing" : `${n} things need fixing`;
}
