"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Calendar, Link as LinkIcon } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Dialog } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { PRIORITIES, PRIORITY_ORDER, STATUSES, STATUS_ORDER } from "@/lib/constants";
import { ContactPicker } from "@/components/contacts/contact-picker";
import { createTask, updateTask } from "@/app/tasks/actions";
import { cn } from "@/lib/utils";

/** Matches the cap enforced in validation and in the database. */
const TITLE_MAX = 200;
/** Past this, the title will start getting clamped in the list on a phone. */
const TITLE_LONG = 80;
/** Both match 0032_task_links.sql, which is what actually enforces them. */
const LINK_LABEL_MAX = 40;
const MAX_LINKS = 3;
import type { ContactSummary } from "@/lib/data/contacts";
import type { MemberSummary, TaskWithRelations } from "@/lib/data/tasks";
import type { Priority, TaskStatus } from "@/lib/supabase/database.types";

interface FormState {
  title: string;
  description: string;
  categoryId: string | null;
  useOtherCategory: boolean;
  newCategoryLabel: string;
  priority: Priority;
  status: TaskStatus;
  assigneeIds: string[];
  contactIds: string[];
  dueDate: string;
  links: { label: string; url: string }[];
}

function initialState(task?: TaskWithRelations): FormState {
  return {
    title: task?.title ?? "",
    description: task?.description ?? "",
    categoryId: task?.category?.id ?? null,
    useOtherCategory: false,
    newCategoryLabel: "",
    priority: task?.priority ?? "medium",
    status: task?.status ?? "not_started",
    assigneeIds: task?.assignees.map((a) => a.id) ?? [],
    contactIds: task?.contacts.map((c) => c.id) ?? [],
    dueDate: task?.due_date ?? "",
    links: task?.links.map((link) => ({ label: link.label, url: link.url })) ?? [],
  };
}

export function TaskForm({
  mode,
  task,
  roster,
  categories,
  contacts,
}: {
  mode: "create" | "edit";
  task?: TaskWithRelations;
  roster: MemberSummary[];
  /** The whole book, for the picker to search. Never a fetch per keystroke. */
  contacts: ContactSummary[];
  categories: { id: string; label: string }[];
}) {
  const router = useRouter();
  const initial = useMemo(() => initialState(task), [task]);
  const [form, setForm] = useState<FormState>(initial);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initial);
  const canSave = form.title.trim().length > 0 && form.assigneeIds.length > 0;
  const titleLength = form.title.length;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleAssignee(id: string) {
    update("assigneeIds", form.assigneeIds.includes(id) ? form.assigneeIds.filter((a) => a !== id) : [...form.assigneeIds, id]);
  }

  function handleCancel() {
    if (isDirty) setConfirmDiscard(true);
    else router.push("/tasks");
  }

  function submit() {
    if (!canSave) return;
    setError(null);


    const input = {
      title: form.title,
      description: form.description,
      categoryId: form.useOtherCategory ? null : form.categoryId,
      newCategoryLabel: form.useOtherCategory ? form.newCategoryLabel : undefined,
      priority: form.priority,
      status: form.status,
      assigneeIds: form.assigneeIds,
      contactIds: form.contactIds,
      dueDate: form.dueDate || null,
      /*
        A half-filled row is dropped rather than refused. Somebody who taps
        "Add link" and then thinks better of it has an empty pair on screen,
        and refusing to save the task over it would be punishing them for
        changing their mind. A row with only one side filled is the same
        gesture left unfinished.
      */
      links: form.links
        .map((link) => ({ label: link.label.trim(), url: link.url.trim() }))
        .filter((link) => link.label.length > 0 && link.url.length > 0),
    };

    startTransition(async () => {
      const result = mode === "create" ? await createTask(input) : await updateTask(task!.id, input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/tasks");
      router.refresh();
    });
  }

  return (
    <div className="flex h-full flex-col bg-bg">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b-[1.5px] border-border bg-card px-5 pt-[calc(env(safe-area-inset-top)+8px)] pb-4">
        <button
          type="button"
          onClick={handleCancel}
          className="h-14 px-2 text-[18px] leading-7 font-bold text-brand cursor-pointer bg-transparent border-none"
        >
          Cancel
        </button>
        <span className="text-[20px] leading-7 font-bold text-fg">{mode === "create" ? "New task" : "Edit task"}</span>
        <Button
          variant="primary"
          size="md"
          className="w-auto px-5"
          disabled={!canSave || isPending}
          onClick={submit}
        >
          {isPending ? "Saving…" : "Save"}
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-6">
        <Field label="Title" htmlFor="task-title">
          <Input
            id="task-title"
            placeholder="What needs doing?"
            value={form.title}
            maxLength={TITLE_MAX}
            onChange={(event) => update("title", event.target.value)}
            aria-invalid={!!error && !form.title.trim()}
            aria-describedby="task-title-hint"
          />
          <div className="flex items-start justify-between gap-3">
            <p id="task-title-hint" className="text-[16px] leading-[22px] text-sub text-pretty">
              {!form.title.trim() && <>Save turns on once the task has a title. </>}
              Long titles are shortened in the list — put extra detail in the Description below, or add notes
              once the task is saved.
            </p>
            <span
              aria-live="polite"
              className={cn(
                "shrink-0 pt-0.5 text-[15px] leading-5 font-bold tabular-nums",
                titleLength >= TITLE_MAX
                  ? "text-danger"
                  : titleLength > TITLE_LONG
                    ? "text-accent"
                    : "text-sub"
              )}
            >
              {titleLength}/{TITLE_MAX}
            </span>
          </div>
        </Field>

        <Field label="Assigned to">
          <div className="flex flex-wrap gap-3">
            {roster.map((person) => (
              <Chip
                key={person.id}
                selected={form.assigneeIds.includes(person.id)}
                icon={<Avatar initials={person.initials} color={person.color} size={28} />}
                onClick={() => toggleAssignee(person.id)}
              >
                {person.display_name}
              </Chip>
            ))}
          </div>
          {form.assigneeIds.length === 0 && <p className="text-[16px] leading-[22px] text-sub">Pick at least one person.</p>}
        </Field>

        {/*
          Optional, and last of the "who" fields. Somebody outside the
          company that whoever picks this up will need to ring — the number
          travels with the task instead of living in one person's phone.
        */}
        <Field label="Contacts">
          <ContactPicker
            contacts={contacts}
            selectedIds={form.contactIds}
            onChange={(next) => update("contactIds", next)}
          />
        </Field>

        <Field label="Priority">
          <div className="flex flex-wrap gap-3">
            {PRIORITY_ORDER.map((value) => {
              const spec = PRIORITIES[value];
              const Icon = spec.icon;
              return (
                <Chip key={value} selected={form.priority === value} icon={<Icon aria-hidden className="size-4" />} onClick={() => update("priority", value)}>
                  {spec.label}
                </Chip>
              );
            })}
          </div>
        </Field>

        <Field label="Status">
          <div className="flex flex-wrap gap-3">
            {STATUS_ORDER.map((value) => {
              const spec = STATUSES[value];
              const Icon = spec.icon;
              return (
                <Chip key={value} selected={form.status === value} icon={<Icon aria-hidden className="size-4" />} onClick={() => update("status", value)}>
                  {spec.label}
                </Chip>
              );
            })}
          </div>
        </Field>

        <Field label="Category">
          <div className="flex flex-wrap gap-3">
            {categories.map((category) => (
              <Chip
                key={category.id}
                selected={!form.useOtherCategory && form.categoryId === category.id}
                onClick={() => setForm((f) => ({ ...f, useOtherCategory: false, categoryId: category.id }))}
              >
                {category.label}
              </Chip>
            ))}
            <Chip selected={form.useOtherCategory} onClick={() => setForm((f) => ({ ...f, useOtherCategory: true, categoryId: null }))}>
              Other
            </Chip>
          </div>
          {form.useOtherCategory && (
            <div className="flex flex-col gap-2 rounded-2xl border-[1.5px] border-border bg-card p-4">
              <label htmlFor="new-category" className="text-field-label">
                Name the new category
              </label>
              <Input id="new-category" value={form.newCategoryLabel} onChange={(event) => update("newCategoryLabel", event.target.value)} />
              <p className="text-[16px] leading-[22px] text-sub">Saving adds this to the list for everyone on the team.</p>
            </div>
          )}
        </Field>

        <Field label="Due date" htmlFor="task-due-date">
          <div className="relative">
            <Calendar aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-sub" />
            <input
              id="task-due-date"
              type="date"
              value={form.dueDate}
              onChange={(event) => update("dueDate", event.target.value)}
              className="h-[60px] w-full rounded-2xl border-[1.5px] border-border bg-card pl-11 pr-3 text-[18px] text-fg tabular-nums"
            />
          </div>
          <p className="text-[16px] leading-[22px] text-sub">Optional — leave blank if there&apos;s no deadline yet.</p>
        </Field>

        {/*
          The reminder field used to live here.

          Since 0034 a reminder belongs to a person rather than to the task,
          so a single switch on this form has no answer to "whose?". Setting
          one moved to the Reminders section on the expanded card, where the
          person is part of the gesture — and where an assignee can reach it,
          which since 0033 they cannot do here.
        */}

        <Field label="Description">
          <Textarea
            rows={4}
            placeholder="Any extra context worth writing down?"
            value={form.description}
            onChange={(event) => update("description", event.target.value)}
          />
        </Field>

        {/*
          Up to three. Named, because a Drive URL is eighty unbroken
          characters and pasting one into the description is what used to
          push it off the side of the card.
        */}
        <Field label="Links">
          <div className="flex flex-col gap-3">
            {form.links.map((link, index) => (
              <div key={index} className="flex flex-col gap-2 rounded-2xl border-[1.5px] border-border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-field-label">Link {index + 1}</span>
                  <button
                    type="button"
                    onClick={() => update("links", form.links.filter((_, i) => i !== index))}
                    className="h-9 px-2 text-[16px] leading-[22px] font-bold text-danger cursor-pointer bg-transparent border-none"
                  >
                    Remove
                  </button>
                </div>
                <Input
                  placeholder="Name — e.g. JV Exec Summary"
                  maxLength={LINK_LABEL_MAX}
                  value={link.label}
                  onChange={(event) =>
                    update(
                      "links",
                      form.links.map((l, i) => (i === index ? { ...l, label: event.target.value } : l))
                    )
                  }
                />
                <Input
                  placeholder="https://…"
                  inputMode="url"
                  maxLength={2048}
                  value={link.url}
                  onChange={(event) =>
                    update(
                      "links",
                      form.links.map((l, i) => (i === index ? { ...l, url: event.target.value } : l))
                    )
                  }
                />
              </div>
            ))}
            {form.links.length < MAX_LINKS ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => update("links", [...form.links, { label: "", url: "" }])}
              >
                <LinkIcon aria-hidden className="size-5" />
                Add link
              </Button>
            ) : (
              <p className="text-[16px] leading-[22px] text-sub">
                Three links is the most a task can carry. Remove one to add another.
              </p>
            )}
          </div>
          <p className="text-[16px] leading-[22px] text-sub">
            Only the name shows on the task — tapping it opens the link.
          </p>
        </Field>

        {error && (
          <div className="flex items-start gap-2 text-danger">
            <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0" />
            <p className="text-[18px] leading-7 font-bold text-pretty">{error}</p>
          </div>
        )}
      </div>

      <Dialog open={confirmDiscard} onClose={() => setConfirmDiscard(false)}>
        <div className="text-section-heading text-pretty">Discard this task?</div>
        <p className="text-[18px] leading-7 text-sub text-pretty">You have unsaved changes. Nothing is saved yet.</p>
        <Button variant="secondary" onClick={() => setConfirmDiscard(false)}>
          Keep editing
        </Button>
        <Button variant="destructive" onClick={() => router.push("/tasks")}>
          Discard it
        </Button>
      </Dialog>
    </div>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      {label && (
        <label htmlFor={htmlFor} className="text-field-label">
          {label}
        </label>
      )}
      {children}
    </div>
  );
}
