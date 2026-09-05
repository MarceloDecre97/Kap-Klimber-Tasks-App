"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { DuplicateDialog } from "@/components/contacts/duplicate-dialog";
import {
  createContact,
  findDuplicates,
  updateContact,
  type DuplicateMatch,
} from "@/app/contacts/actions";
import { CATEGORY_ICONS, DEFAULT_CATEGORY_ICON } from "@/lib/contacts-view";
import { cn } from "@/lib/utils";
import type { ContactCategory, ContactSummary } from "@/lib/data/contacts";

/** The shape the form holds: every field a string, because inputs are. */
type Draft = {
  firstName: string; lastName: string; jobTitle: string; company: string;
  mobile: string; officePhone: string; email: string; email2: string; website: string;
  street: string; city: string; state: string; postalCode: string;
  categoryId: string | null; source: string; notes: string;
};

function draftFrom(contact: ContactSummary | null): Draft {
  return {
    firstName: contact?.first_name ?? "",
    lastName: contact?.last_name ?? "",
    jobTitle: contact?.job_title ?? "",
    company: contact?.company ?? "",
    mobile: contact?.mobile ?? "",
    officePhone: contact?.office_phone ?? "",
    email: contact?.email ?? "",
    email2: contact?.email2 ?? "",
    website: contact?.website ?? "",
    street: contact?.street ?? "",
    city: contact?.city ?? "",
    state: contact?.state ?? "",
    postalCode: contact?.postal_code ?? "",
    categoryId: contact?.category?.id ?? null,
    source: contact?.source ?? "",
    notes: contact?.notes ?? "",
  };
}

/**
 * Adding and editing, one component.
 *
 * The two differ in their title, their button and where they go afterwards —
 * everything else is identical, and keeping them apart would mean every
 * future field being added twice and diverging the first time somebody
 * forgets.
 *
 * Saving is two steps whenever the details clash with somebody already in
 * the book: check, warn, then save on a second press. It is never a block.
 */
export function ContactForm({
  contact,
  categories,
}: {
  /** Null when adding. */
  contact: ContactSummary | null;
  categories: ContactCategory[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(contact));
  const [error, setError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[] | null>(null);
  const [isPending, startTransition] = useTransition();

  const editing = contact !== null;

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setError(null);
  }

  function save(skipDuplicateCheck: boolean) {
    startTransition(async () => {
      setError(null);

      if (!skipDuplicateCheck) {
        const check = await findDuplicates(draft, contact?.id ?? null);
        // A failed check must not block a save. It is a courtesy, and the
        // real work is still ahead — so the error is reported and the save
        // goes on rather than the person being stuck behind a warning that
        // could not be produced.
        if (check.ok && check.matches.length > 0) {
          setDuplicates(check.matches);
          return;
        }
        if (!check.ok) console.error("duplicate check failed", check.error);
      }

      const result = editing ? await updateContact(contact.id, draft) : await createContact(draft);
      if (!result.ok) {
        setDuplicates(null);
        setError(result.error);
        return;
      }
      setDuplicates(null);
      router.replace(`/contacts/${result.contactId}`);
      router.refresh();
    });
  }

  return (
    <div className="flex h-full flex-col bg-bg">
      <header className="flex shrink-0 items-center gap-2 border-b-[1.5px] border-border bg-card px-3 pt-[calc(env(safe-area-inset-top)+8px)] pb-3">
        <Link
          href={editing ? `/contacts/${contact.id}` : "/contacts"}
          className="flex h-14 items-center gap-2 rounded-xl px-3 text-[18px] leading-7 font-bold text-brand"
        >
          <ChevronLeft aria-hidden className="size-5" />
          Back
        </Link>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-6">
        <div className="mx-auto flex w-full max-w-[640px] flex-col gap-6">
          <h1 className="text-screen-title text-fg">{editing ? "Edit contact" : "New contact"}</h1>

          {error && (
            <p className="rounded-2xl border-[1.5px] border-danger bg-danger-hover-bg px-4 py-3 text-[17px] leading-6 text-danger text-pretty">
              {error}
            </p>
          )}

          <Group heading="Who they are">
            <Field label="First name" required>
              <Input value={draft.firstName} onChange={(e) => set("firstName", e.target.value)} autoComplete="off" />
            </Field>
            <Field label="Last name" required hint="The book is sorted by it.">
              <Input value={draft.lastName} onChange={(e) => set("lastName", e.target.value)} autoComplete="off" />
            </Field>
            <Field label="Job title">
              <Input value={draft.jobTitle} onChange={(e) => set("jobTitle", e.target.value)} autoComplete="off" />
            </Field>
            <Field label="Company">
              <Input value={draft.company} onChange={(e) => set("company", e.target.value)} autoComplete="off" />
            </Field>
          </Group>

          <Group heading="How to reach them" hint="A phone or an email — one of the two is enough.">
            <Field label="Mobile">
              <Input value={draft.mobile} onChange={(e) => set("mobile", e.target.value)} inputMode="tel" autoComplete="off" />
            </Field>
            <Field label="Office phone">
              <Input value={draft.officePhone} onChange={(e) => set("officePhone", e.target.value)} inputMode="tel" autoComplete="off" />
            </Field>
            <Field label="Email">
              <Input value={draft.email} onChange={(e) => set("email", e.target.value)} inputMode="email" autoComplete="off" />
            </Field>
            <Field label="Second email">
              <Input value={draft.email2} onChange={(e) => set("email2", e.target.value)} inputMode="email" autoComplete="off" />
            </Field>
            <Field label="Website">
              <Input value={draft.website} onChange={(e) => set("website", e.target.value)} inputMode="url" autoComplete="off" placeholder="kapklimber.com" />
            </Field>
          </Group>

          <Group heading="Where they are">
            <Field label="Street">
              <Input value={draft.street} onChange={(e) => set("street", e.target.value)} autoComplete="off" />
            </Field>
            <Field label="City">
              <Input value={draft.city} onChange={(e) => set("city", e.target.value)} autoComplete="off" />
            </Field>
            <div className="flex gap-3">
              <Field label="State" className="flex-1">
                <Input value={draft.state} onChange={(e) => set("state", e.target.value)} autoComplete="off" />
              </Field>
              <Field label="ZIP" className="flex-1">
                <Input value={draft.postalCode} onChange={(e) => set("postalCode", e.target.value)} inputMode="numeric" autoComplete="off" />
              </Field>
            </div>
          </Group>

          <Group heading="Details">
            <div className="flex flex-col gap-2">
              <span className="text-field-label text-fg">Category</span>
              <div className="flex flex-wrap gap-2">
                {categories.map((cat) => {
                  const Icon = CATEGORY_ICONS[cat.icon] ?? DEFAULT_CATEGORY_ICON;
                  const on = draft.categoryId === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      aria-pressed={on}
                      // Pressing the chosen one again clears it: a category
                      // is optional, and without this there is no way back
                      // to none once anything has been picked.
                      onClick={() => set("categoryId", on ? null : cat.id)}
                      className={cn(
                        "inline-flex h-14 cursor-pointer items-center gap-2 rounded-full border-[1.5px] px-4",
                        "text-chip transition-transform duration-150 active:scale-[0.97]",
                        on ? "border-btn bg-btn text-on-btn" : "border-border bg-card text-fg hover:bg-muted"
                      )}
                    >
                      <Icon aria-hidden className="size-5 shrink-0" strokeWidth={1.75} />
                      {cat.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <Field label="Where they came from" hint="Website form, a trade show, a referral.">
              <Input value={draft.source} onChange={(e) => set("source", e.target.value)} autoComplete="off" />
            </Field>
            <Field label="Notes">
              <Textarea
                value={draft.notes}
                onChange={(e) => set("notes", e.target.value)}
                rows={4}
                className="min-h-[104px] resize-y"
              />
            </Field>
          </Group>

          <div className="flex flex-col gap-3 pb-4">
            <Button variant="primary" onClick={() => save(false)} disabled={isPending}>
              {isPending ? "Saving…" : editing ? "Save changes" : "Save contact"}
            </Button>
            <Button variant="secondary" onClick={() => router.back()} disabled={isPending}>
              Cancel
            </Button>
          </div>
        </div>
      </div>

      <DuplicateDialog
        matches={duplicates}
        saving={isPending}
        onClose={() => setDuplicates(null)}
        onSaveAnyway={() => save(true)}
      />
    </div>
  );
}

function Group({
  heading,
  hint,
  children,
}: {
  heading: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-section-heading text-fg">{heading}</h2>
        {hint && <p className="text-[16px] leading-6 text-sub text-pretty">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("flex flex-col gap-2", className)}>
      <span className="text-field-label text-fg">
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      {children}
      {hint && <span className="text-timestamp text-sub text-pretty">{hint}</span>}
    </label>
  );
}
