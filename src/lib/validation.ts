import { z } from "zod";
import { visibleLength } from "@/lib/mentions";
import { formatPhone, phoneTooShort, phoneTooShortMessage, type PhoneKind } from "@/lib/phones";

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.");

export const otpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Enter the 6-digit code.");

export const passwordSchema = z.string().min(1, "Enter your password.").max(200);

export const priorityEnum = z.enum(["asap", "high", "medium", "low", "someday"]);
export const statusEnum = z.enum(["not_started", "in_progress", "for_review", "waiting", "complete"]);

/**
 * A label somebody may or may not have typed into a "new one" box.
 *
 * `.optional()` on its own is not enough, and this is the trap it hides. An
 * untouched box sends "" — which is a string, not undefined — so it sails
 * past `.optional()`, reaches `.min(1)`, and fails. The form is then refused
 * in Zod's own words ("Too small: expected string to have >=1 characters")
 * with every visible field correctly filled in, which is about as unhelpful
 * as a validation message can be.
 *
 * Empty in, absent out. Written once so no future field can repeat it: the
 * pattern had already been copied into three schemas before it was noticed.
 */
const optionalLabel = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined));

/**
 * A named link on a task.
 *
 * The scheme is checked here and again as a check constraint in
 * 0032_task_links.sql. That is not belt-and-braces for its own sake: this
 * value ends up as an anchor's href, and `javascript:...` behind a name that
 * reads "JV Exec Summary" is a script a teammate runs by tapping what looks
 * like a document. Escaping does not help — the browser follows the scheme
 * rather than reading the text — so it must never be stored.
 *
 * `new URL()` rather than a regular expression, because the parser is what
 * the browser itself will use, and it agrees with nothing else. A bare
 * "drive.google.com/x" is rejected: it has no scheme, and quietly prefixing
 * https:// would be guessing at where somebody meant to go.
 */
const LINK_LABEL_MAX = 40;
const LINK_URL_MAX = 2048;

const linkUrl = z
  .string()
  .trim()
  .min(1, "Paste the link.")
  .max(LINK_URL_MAX, "That link is too long to store.")
  .refine(
    (value) => {
      try {
        const parsed = new URL(value);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "A link has to start with http:// or https://" }
  );

export const taskLinkSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, "Give the link a name.")
    .max(LINK_LABEL_MAX, `Keep the name under ${LINK_LABEL_MAX} characters so it fits on one line.`),
  url: linkUrl,
});

export type TaskLinkInput = z.infer<typeof taskLinkSchema>;

/**
 * A reminder set for a named person.
 *
 * `memberId` is explicit rather than implied by the caller, because setting
 * one for somebody else is the point of the feature. Who is *allowed* to is
 * decided by set_task_reminder in 0034 — this only checks the shape.
 */
export const reminderInputSchema = z.object({
  taskId: z.string().uuid(),
  memberId: z.string().uuid(),
  remindAt: z.string().datetime({ offset: true }),
});

export type ReminderInput = z.infer<typeof reminderInputSchema>;

export const taskInputSchema = z.object({
  title: z.string().trim().min(1, "Give the task a title so people know what it is.").max(200),
  description: z.string().trim().max(4000).optional().or(z.literal("")),
  categoryId: z.string().uuid().nullable().optional(),
  newCategoryLabel: optionalLabel(60),
  priority: priorityEnum,
  status: statusEnum,
  assigneeIds: z.array(z.string().uuid()).min(1, "Pick at least one person."),
  /*
    Optional, and capped at two — the same cap the database enforces with a
    trigger. This copy exists so the form can say so in words rather than
    letting somebody pick a third and meet a raise() on save.
  */
  contactIds: z
    .array(z.string().uuid())
    .max(2, "Two contacts at most. Take one off to swap it.")
    .optional(),
  /*
    Three at most, the same cap the database enforces with a trigger. This
    copy exists so the form can say so in words rather than letting somebody
    add a fourth and meet a raise() on save.
  */
  links: z.array(taskLinkSchema).max(3, "Three links at most.").optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid due date.")
    .nullable()
    .optional(),
  /*
    reminderAt is gone from here as of 0034. A reminder belongs to a person,
    so it is set through set_task_reminder with the person named — see
    reminderInputSchema above — and never as a property of the task.
  */
});

export type TaskInput = z.infer<typeof taskInputSchema>;

/**
 * A note is limited by what it reads as, not by what it stores.
 *
 * A mention costs about fifty characters on disk and eight on screen, so
 * counting the stored form would charge someone fifty for typing a
 * teammate's name — a limit they could hit with a note that visibly has room
 * left. The raw cap above it is a bound on the column, not a rule anyone is
 * meant to meet: a note at the visible limit made entirely of mentions is
 * still well inside it.
 */
const NOTE_VISIBLE_MAX = 2000;
const NOTE_RAW_MAX = 12000;

const noteBody = z
  .string()
  .trim()
  .max(NOTE_RAW_MAX)
  .refine((body) => visibleLength(body) <= NOTE_VISIBLE_MAX, {
    message: `Keep a note under ${NOTE_VISIBLE_MAX} characters.`,
  });

export const noteInputSchema = z.object({
  taskId: z.string().uuid(),
  body: noteBody.refine((body) => body.length > 0, { message: "Say what happened." }),
  /** Present when this note is a reply to another. */
  parentNoteId: z.string().uuid().optional(),
});

export const noteEditSchema = z.object({
  noteId: z.string().uuid(),
  body: noteBody.refine((body) => body.length > 0, {
    message: "A note can't be emptied — say what happened.",
  }),
});

/**
 * Why a task should go. Required, because the creator has to be able to
 * decide from this line alone — checked here as well as in the database so
 * the message a person sees is written for people.
 */
export const deletionReasonSchema = z
  .string()
  .trim()
  .min(1, "Say why it should go — the creator decides from this alone.")
  .max(300, "Keep the reason under 300 characters.");

export const taskFiltersSchema = z.object({
  mine: z.boolean().default(false),
  status: z.array(statusEnum).default([]),
  priority: z.array(priorityEnum).default([]),
  categoryIds: z.array(z.string().uuid()).default([]),
  assigneeIds: z.array(z.string().uuid()).default([]),
});

/* -------------------------------------------------------------------------
   Contacts

   The two required rules mirror the check constraints in 0022_contacts.sql
   rather than replacing them. The database is what actually guarantees them;
   these exist so somebody filling in a form is told which field to fix
   instead of being handed a constraint violation.
   ------------------------------------------------------------------------- */

/** Empty string in, null out — a blank field is an absent value, not "". */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null))
    .nullable();

const optionalEmail = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((v) => (v && v.length > 0 ? v.toLowerCase() : null))
  .nullable()
  .refine((v) => v === null || z.string().email().safeParse(v).success, {
    message: "That email is missing something after the dot.",
  });

/**
 * A phone number: formatted on the way in, and long enough to be one.
 *
 * Formatting happens here rather than in the form, so every route to the
 * column — the contact form, the company form, the company block inside the
 * contact form — writes the same shape. The minimum differs by field: a
 * mobile is a full number or it is not a mobile, while an office line and a
 * switchboard are routinely written as the local seven.
 */
const phoneField = (kind: PhoneKind, max = 40) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .refine((v) => !phoneTooShort(v, kind), { message: phoneTooShortMessage(kind) })
    .transform((v) => (v && v.length > 0 ? formatPhone(v) : null))
    .nullable();

export const contactInputSchema = z
  .object({
    /*
      The message is set on the type as well as on the length rule. Without
      it, a payload that omits the key entirely — which a server action can
      be handed, being a public endpoint — reports "expected string,
      received undefined" instead of the sentence a person can act on.
    */
    firstName: z
      .string({ error: "A first name, at least." })
      .trim()
      .min(1, "A first name, at least.")
      .max(80),
    lastName: z
      .string({ error: "Add a last name — the book is sorted by it." })
      .trim()
      .min(1, "Add a last name — the book is sorted by it.")
      .max(80),
    jobTitle: optionalText(120),
    company: optionalText(120),
    mobile: phoneField("mobile"),
    officePhone: phoneField("office"),
    email: optionalEmail,
    email2: optionalEmail,
    website: optionalText(300),
    street: optionalText(200),
    suite: optionalText(100),
    city: optionalText(100),
    state: optionalText(60),
    postalCode: optionalText(20),
    country: optionalText(80),
    /*
      What this person is to us. Several allowed: somebody really can be a
      consultant and an investor. See 0029_chips.sql for why this replaced a
      single category that described their company rather than them.
    */
    relationshipIds: z.array(z.string().uuid()).max(6).optional(),
    /** Set when "New relationship" was opened and a name typed. */
    newRelationshipLabel: optionalLabel(60),
    source: optionalText(200),
    notes: optionalText(4000),

    /*
      The company, as typed rather than as picked.

      There is no company step to pass through first. `company` is whatever
      was typed in the box; `companyId` is set only when that name matched
      one already in the book. When it did not, the fields below are what
      the person filled in underneath, and saving creates the company and
      links it in the same breath. See 0024_companies.sql.
    */
    companyId: z.string().uuid().nullable().optional(),
    companyAbout: optionalText(600),
    companyWebsite: optionalText(300),
    companyNumber: phoneField("companyLine"),
    companyEmail: optionalEmail,
    companyStreet: optionalText(200),
    companySuite: optionalText(100),
    companyCity: optionalText(100),
    companyState: optionalText(60),
    companyPostalCode: optionalText(20),
    companyCountry: optionalText(80),
    companyTypeIds: z.array(z.string().uuid()).max(8).optional(),
    newCompanyTypeLabel: optionalLabel(60),
    /*
      Only true when "Edit company details" was opened on a company that
      already exists. Without it, opening a contact and saving an unrelated
      change would quietly write that contact's stale copy of the company
      over everyone else's.
    */
    updateCompanyDetails: z.boolean().optional(),
  })
  .refine(
    (v) => Boolean(v.mobile || v.officePhone || v.email || v.email2),
    {
      message: "A phone or an email — one of the two is enough.",
      // Reported against the field somebody is most likely to fill first, so
      // the message lands where they are looking rather than at the top.
      path: ["mobile"],
    }
  );

export type ContactInput = z.input<typeof contactInputSchema>;
export type ContactValues = z.output<typeof contactInputSchema>;

/**
 * A company edited on its own page, where the name is the one thing that
 * cannot be blank — everything else is optional, because a company you have
 * only just heard of is still worth writing down.
 */
export const companyInputSchema = z.object({
  name: z
    .string({ error: "A company needs a name." })
    .trim()
    .min(1, "A company needs a name.")
    .max(120),
  about: optionalText(600),
  website: optionalText(300),
  companyNumber: phoneField("companyLine"),
  /* The company's own address, held to the same rule a person's is. */
  email: optionalEmail,
  street: optionalText(200),
  suite: optionalText(100),
  city: optionalText(100),
  state: optionalText(60),
  postalCode: optionalText(20),
  /*
    Checked against the country list on the way in as well as being picked
    from it in the form. A country that matches nothing there is dropped
    rather than stored: the companies book is filtered by this column, and
    one unmatched spelling is a filter entry nobody can reconcile.
  */
  country: optionalText(80),
  /* Several, because a trailer dealer that also upfits is both. */
  typeIds: z.array(z.string().uuid()).max(8).optional(),
  /** Set when "New type" was opened and a name typed. */
  newTypeLabel: optionalLabel(60),
});

export type CompanyInput = z.input<typeof companyInputSchema>;
