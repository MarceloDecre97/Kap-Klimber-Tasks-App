import { contactInputSchema } from "@/lib/validation";
import { phoneTooShort, phoneTooShortMessage } from "@/lib/phones";

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
export function validateContact(draft: unknown): ContactErrors {
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

/**
 * What is wrong with an email, in the words of the thing that is wrong.
 *
 * One message used to cover every failure, so "marcelo.dg97gmail.com" — no @
 * at all — was reported as "missing something after the dot". Being told to
 * fix the wrong end of an address is worse than being told nothing.
 *
 * Returns null when the shape is fine, or when the box is still empty.
 */
export function emailProblem(value: string): string | null {
  const v = value.trim();
  if (!v) return null;

  if (/\s/.test(v)) return "An email address can't have a space in it.";

  const at = v.split("@");
  if (at.length === 1) return "That email is missing its @.";
  if (at.length > 2) return "That email has more than one @.";

  const [local, domain] = at as [string, string];
  if (!local) return "That email is missing the part before the @.";
  if (!domain) return "That email is missing the part after the @.";
  if (!domain.includes(".")) return "That email is missing the dot — .com, .org, and so on.";
  if (!/\.[^.]{2,}$/.test(domain)) return "That email is missing something after the dot.";
  return null;
}

/** Kept as the yes/no form of the above, for callers that only need that. */
export function emailLooksWrong(value: string): boolean {
  return emailProblem(value) !== null;
}

/**
 * A phone that is too short for the field it is in.
 *
 * Three answers rather than one: a mobile is a full number or it is not a
 * mobile, while an office line is routinely the local seven. The rule itself
 * lives in phones.ts — this only decides which of the three applies here.
 */
export function phoneProblem(field: ContactField, value: string): string | null {
  const kind = field === "mobile" ? "mobile" : "office";
  return phoneTooShort(value, kind) ? phoneTooShortMessage(kind) : null;
}

/** "2 things need fixing" — the count, worded. */
export function errorSummary(errors: ContactErrors): string | null {
  const n = Object.keys(errors).length;
  if (n === 0) return null;
  return n === 1 ? "One thing needs fixing" : `${n} things need fixing`;
}
