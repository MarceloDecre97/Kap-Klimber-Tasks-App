import { z } from "zod";
import { visibleLength } from "@/lib/mentions";

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.");

export const otpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Enter the 6-digit code.");

export const passwordSchema = z.string().min(1, "Enter your password.").max(200);

export const priorityEnum = z.enum(["asap", "high", "medium", "low", "someday"]);
export const statusEnum = z.enum(["not_started", "in_progress", "for_review", "waiting", "complete"]);

export const taskInputSchema = z.object({
  title: z.string().trim().min(1, "Give the task a title so people know what it is.").max(200),
  description: z.string().trim().max(4000).optional().or(z.literal("")),
  categoryId: z.string().uuid().nullable().optional(),
  newCategoryLabel: z.string().trim().min(1).max(60).optional(),
  priority: priorityEnum,
  status: statusEnum,
  assigneeIds: z.array(z.string().uuid()).min(1, "Pick at least one person."),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid due date.")
    .nullable()
    .optional(),
  reminderAt: z.string().datetime({ offset: true }).nullable().optional(),
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
    mobile: optionalText(40),
    officePhone: optionalText(40),
    email: optionalEmail,
    email2: optionalEmail,
    website: optionalText(300),
    street: optionalText(200),
    city: optionalText(100),
    state: optionalText(60),
    postalCode: optionalText(20),
    categoryId: z.string().uuid().nullable().optional(),
    source: optionalText(200),
    notes: optionalText(4000),
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
