import { z } from "zod";

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

export const noteInputSchema = z.object({
  taskId: z.string().uuid(),
  body: z.string().trim().min(1, "Say what happened.").max(2000),
  /** Present when this note is a reply to another. */
  parentNoteId: z.string().uuid().optional(),
});

export const noteEditSchema = z.object({
  noteId: z.string().uuid(),
  body: z.string().trim().min(1, "A note can't be emptied — say what happened.").max(2000),
});

export const taskFiltersSchema = z.object({
  mine: z.boolean().default(false),
  status: z.array(statusEnum).default([]),
  priority: z.array(priorityEnum).default([]),
  categoryIds: z.array(z.string().uuid()).default([]),
  assigneeIds: z.array(z.string().uuid()).default([]),
});
