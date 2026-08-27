"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Bell, Calendar } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Dialog } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { PRIORITIES, PRIORITY_ORDER, STATUSES, STATUS_ORDER } from "@/lib/constants";
import { createTask, updateTask } from "@/app/tasks/actions";
import { cn, toZonedDateInput, toZonedTimeInput, zonedWallClockToIso } from "@/lib/utils";

/** Matches the cap enforced in validation and in the database. */
const TITLE_MAX = 200;
/** Past this, the title will start getting clamped in the list on a phone. */
const TITLE_LONG = 80;
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
  dueDate: string;
  reminderEnabled: boolean;
  reminderDate: string;
  reminderTime: string;
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
    dueDate: task?.due_date ?? "",
    reminderEnabled: !!task?.reminder_at,
    reminderDate: task?.reminder_at ? toZonedDateInput(task.reminder_at) : "",
    reminderTime: task?.reminder_at ? toZonedTimeInput(task.reminder_at) : "09:00",
  };
}

export function TaskForm({
  mode,
  task,
  roster,
  categories,
}: {
  mode: "create" | "edit";
  task?: TaskWithRelations;
  roster: MemberSummary[];
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

    // Interpreted as Chicago wall-clock time, never the browser's zone.
    const reminderAt =
      form.reminderEnabled && form.reminderDate
        ? zonedWallClockToIso(form.reminderDate, form.reminderTime || "09:00")
        : null;

    const input = {
      title: form.title,
      description: form.description,
      categoryId: form.useOtherCategory ? null : form.categoryId,
      newCategoryLabel: form.useOtherCategory ? form.newCategoryLabel : undefined,
      priority: form.priority,
      status: form.status,
      assigneeIds: form.assigneeIds,
      dueDate: form.dueDate || null,
      reminderAt,
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
    <div className="flex h-dvh flex-col bg-bg">
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

        <Field label="">
          <div className="flex items-center justify-between gap-4 rounded-2xl border-[1.5px] border-border bg-card p-4">
            <span className="text-field-label">Set a reminder</span>
            <Switch checked={form.reminderEnabled} onCheckedChange={(v) => update("reminderEnabled", v)} label="Set a reminder" />
          </div>
          {form.reminderEnabled && (
            <div className="flex gap-3">
              <div className="flex flex-1 flex-col gap-2">
                <label htmlFor="reminder-date" className="text-field-label">
                  Date
                </label>
                <div className="relative">
                  <Calendar aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-sub" />
                  <input
                    id="reminder-date"
                    type="date"
                    value={form.reminderDate}
                    onChange={(event) => update("reminderDate", event.target.value)}
                    className="h-[60px] w-full rounded-2xl border-[1.5px] border-border bg-card pl-11 pr-3 text-[18px] text-fg tabular-nums"
                  />
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <label htmlFor="reminder-time" className="text-field-label">
                  Time
                </label>
                <input
                  id="reminder-time"
                  type="time"
                  value={form.reminderTime}
                  onChange={(event) => update("reminderTime", event.target.value)}
                  className="h-[60px] w-full rounded-2xl border-[1.5px] border-border bg-card px-3 text-[18px] text-fg tabular-nums"
                />
              </div>
            </div>
          )}
          {form.reminderEnabled && (
            <div className="flex items-center gap-2 text-[16px] leading-[22px] text-sub">
              <Bell aria-hidden className="size-4" />A reminder will be saved on the task.
            </div>
          )}
        </Field>

        <Field label="Description">
          <Textarea
            rows={4}
            placeholder="Any extra context worth writing down?"
            value={form.description}
            onChange={(event) => update("description", event.target.value)}
          />
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
