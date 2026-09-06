"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ExternalLink, Globe, Pencil, Phone, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { Field, Group } from "@/components/contacts/form-field";
import { CompanyFields, type CompanyDetails as Details } from "@/components/companies/company-fields";
import { ContactRow } from "@/components/contacts/contact-row";
import { deleteCompany, updateCompany } from "@/app/companies/actions";
import {
  COMPANY_TYPE_ICONS,
  DEFAULT_COMPANY_TYPE_ICON,
  companyPeopleLine,
  type CompanySummary,
  type CompanyType,
} from "@/lib/companies-view";
import { formatAddress } from "@/lib/contacts-view";
import { cn, formatTimestampWithYear } from "@/lib/utils";
import type { ContactSummary } from "@/lib/data/contacts";

type Draft = Details & { name: string };

function draftFrom(c: CompanySummary): Draft {
  return {
    name: c.name,
    about: c.about ?? "",
    website: c.website ?? "",
    companyNumber: c.company_number ?? "",
    street: c.street ?? "",
    suite: c.suite ?? "",
    city: c.city ?? "",
    state: c.state ?? "",
    postalCode: c.postal_code ?? "",
    country: c.country ?? "",
    typeId: c.type?.id ?? null,
    newTypeLabel: "",
  };
}

/**
 * One company, and everybody at it.
 *
 * The mirror of ContactDetail, embedded flag and all: its own page when you
 * arrive by link, and the right-hand panel when the companies book is open
 * beside it. Reading by default, editing on a press — everything here is
 * shared, so a correction made once reaches every colleague, and a mistake
 * made once does too.
 */
export function CompanyDetail({
  company,
  people,
  types,
  embedded = false,
  onGone,
  onOpenContact,
}: {
  company: CompanySummary;
  people: ContactSummary[];
  types: CompanyType[];
  /** True inside the desktop panel: no header, no going anywhere. */
  embedded?: boolean;
  /** Called instead of navigating when the company is removed. */
  onGone?: () => void;
  /** In the panel, opening a person switches books rather than navigating. */
  onOpenContact?: (contact: ContactSummary) => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(company));
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isPending, startTransition] = useTransition();

  const address = formatAddress(company);
  const website = externalHref(company.website);
  const Icon = COMPANY_TYPE_ICONS[company.type?.icon ?? ""] ?? DEFAULT_COMPANY_TYPE_ICON;

  function patch(next: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...next }));
    setError(null);
  }

  function save() {
    if (!draft.name.trim()) {
      setError("A company needs a name.");
      return;
    }
    startTransition(async () => {
      const result = await updateCompany(company.id, draft);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
      showToast({ message: "Company updated" });
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteCompany(company.id);
      if (!result.ok) {
        setConfirmingDelete(false);
        showToast({ message: result.error });
        return;
      }
      if (embedded) onGone?.();
      else router.replace("/contacts?book=companies");
      router.refresh();
      showToast({ message: `${company.name} removed` });
    });
  }

  return (
    <div className={cn("flex flex-col bg-bg", embedded ? "min-h-0 flex-1" : "h-full")}>
      {!embedded && (
        <header className="flex shrink-0 items-center gap-2 border-b-[1.5px] border-border bg-card px-3 pt-[calc(env(safe-area-inset-top)+8px)] pb-3">
          <Link
            href="/contacts?book=companies"
            className="flex h-14 items-center gap-2 rounded-xl px-3 text-[18px] leading-7 font-bold text-brand"
          >
            <ChevronLeft aria-hidden className="size-5" />
            Companies
          </Link>
        </header>
      )}

      <div className={cn("flex-1 overflow-y-auto px-5", embedded ? "py-5" : "py-6")}>
        <div className={cn("mx-auto flex w-full flex-col gap-6", embedded ? "max-w-none" : "max-w-[640px]")}>
          {embedded && (
            <Link
              href={`/companies/${company.id}`}
              className="inline-flex w-fit items-center gap-2 text-[17px] leading-6 font-bold text-brand"
            >
              <ExternalLink aria-hidden className="size-[18px]" strokeWidth={2} />
              Open full page
            </Link>
          )}

          {error && (
            <p className="rounded-2xl border-[1.5px] border-danger bg-danger-hover-bg px-4 py-3 text-[17px] leading-6 text-danger text-pretty">
              {error}
            </p>
          )}

          <div className="flex items-start gap-4">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl border-[1.5px] border-border bg-muted">
              <Icon aria-hidden className="size-7 text-sub" strokeWidth={1.75} />
            </span>
            <div className="flex min-w-0 grow flex-col gap-1">
              <h1 className="text-screen-title text-fg text-pretty wrap-anywhere">{company.name}</h1>
              <p className="text-[17px] leading-6 text-sub">
                {company.type ? `${company.type.label} · ` : ""}
                {companyPeopleLine(people.length)}
              </p>
            </div>
          </div>

          {editing ? (
            <>
              <Group
                heading="Company details"
                hint="Shared. Changing anything here changes it for everyone who works there."
              >
                <Field label="Name" required>
                  <Input value={draft.name} onChange={(e) => patch({ name: e.target.value })} maxLength={120} autoComplete="off" />
                </Field>
                <CompanyFields types={types} value={draft} onChange={patch} />
              </Group>

              <div className="flex flex-col gap-3">
                <Button variant="primary" onClick={save} disabled={isPending}>
                  {isPending ? "Saving…" : "Save company"}
                </Button>
                <Button
                  variant="secondary"
                  disabled={isPending}
                  onClick={() => {
                    setDraft(draftFrom(company));
                    setError(null);
                    setEditing(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <>
              {company.about && (
                <p className="text-[18px] leading-7 text-fg text-pretty">{company.about}</p>
              )}

              <div className="flex flex-wrap gap-3">
                {company.company_number && (
                  <a
                    href={`tel:${company.company_number.replace(/[^\d+]/g, "")}`}
                    className="inline-flex h-14 items-center gap-2 rounded-2xl border-[1.5px] border-border bg-card px-4 text-chip text-fg hover:bg-muted"
                  >
                    <Phone aria-hidden className="size-5" strokeWidth={1.75} />
                    Main line
                  </a>
                )}
                {website && (
                  <a
                    href={website}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex h-14 items-center gap-2 rounded-2xl border-[1.5px] border-border bg-card px-4 text-chip text-fg hover:bg-muted"
                  >
                    <Globe aria-hidden className="size-5" strokeWidth={1.75} />
                    Website
                  </a>
                )}
              </div>

              <Section heading="Details">
                <Row label="Type" value={company.type?.label ?? null} />
                <Row label="Main line" value={company.company_number} />
                <Row label="Website" value={company.website} />
                <Row label="Address" value={address} />
              </Section>
            </>
          )}

          <Section heading="Who works there">
            {people.length === 0 ? (
              <p className="text-[17px] leading-6 text-sub text-pretty">
                Nobody in the book works here yet. Add a contact and type this company on them.
              </p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {people.map((person) => (
                  <li key={person.id}>
                    {/*
                      In the panel, opening somebody flips back to the
                      contacts book rather than leaving the screen — the two
                      books are one place, and a person is one tap away.
                    */}
                    <ContactRow
                      contact={person}
                      onSelect={onOpenContact ? () => onOpenContact(person) : undefined}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <p className="text-timestamp text-sub">
            In the book since {formatTimestampWithYear(company.created_at)}
          </p>

          {!editing && (
            <div className="flex flex-wrap gap-3 pb-4">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex h-14 cursor-pointer items-center gap-2 rounded-2xl border-[1.5px] border-border bg-card px-4 text-chip text-fg hover:bg-muted"
              >
                <Pencil aria-hidden className="size-5" strokeWidth={1.75} />
                Edit company
              </button>
              {/*
                Only offered once the last person has gone. While anybody is
                still here the button would produce nothing but a refusal,
                and a button that always refuses is worse than no button.
              */}
              {people.length === 0 && (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  className="inline-flex h-14 cursor-pointer items-center gap-2 rounded-2xl border-[1.5px] border-danger bg-card px-4 text-chip text-danger hover:bg-danger-hover-bg"
                >
                  <Trash2 aria-hidden className="size-5" strokeWidth={1.75} />
                  Remove company
                </button>
              )}
            </div>
          )}

          {confirmingDelete && (
            <div className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-danger bg-card px-4 py-4">
              <p className="text-[17px] leading-6 text-fg text-pretty">
                Remove <span className="font-bold">{company.name}</span> from the book? Nobody
                works there, so nothing else changes. There is no undo for this one.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button variant="destructive" size="md" onClick={remove} disabled={isPending}>
                  {isPending ? "Removing…" : "Remove it"}
                </Button>
                <Button variant="secondary" size="md" onClick={() => setConfirmingDelete(false)} disabled={isPending}>
                  Keep it
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-section-heading text-fg">{heading}</h2>
      {children}
    </div>
  );
}

/** One read-only line. Renders nothing when there is nothing to say. */
function Row({ label, value }: { label: string; value: string | null }) {
  if (!value || !value.trim()) return null;
  return (
    <div className="flex flex-col gap-0.5 border-b-[1.5px] border-border pb-3 last:border-b-0 last:pb-0">
      <span className="text-timestamp text-sub">{label}</span>
      <span className="text-[18px] leading-7 text-fg text-pretty wrap-anywhere">{value}</span>
    </div>
  );
}

/**
 * A website typed without its scheme still has to be a link. Left alone if
 * it already carries one, and refused outright for anything that is not
 * http — a "javascript:" in this field would otherwise become a live thing.
 */
function externalHref(value: string | null): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return null;
  return `https://${raw}`;
}
