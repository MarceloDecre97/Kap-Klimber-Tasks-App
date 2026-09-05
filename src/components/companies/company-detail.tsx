"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, ChevronLeft, Globe, Pencil, Phone, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { Field, Group } from "@/components/contacts/form-field";
import { ContactRow } from "@/components/contacts/contact-row";
import { deleteCompany, updateCompany } from "@/app/companies/actions";
import { companyPeopleLine, type CompanySummary } from "@/lib/companies-view";
import { formatAddress } from "@/lib/contacts-view";
import { formatTimestampWithYear } from "@/lib/utils";
import type { ContactSummary } from "@/lib/data/contacts";

type Draft = {
  name: string; about: string; website: string; companyNumber: string;
  street: string; suite: string; city: string; state: string; postalCode: string; country: string;
};

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
  };
}

/**
 * One company, and everybody at it.
 *
 * Reading by default, editing on a press — the same shape as the company
 * block inside the contact form, and for the same reason. Everything here is
 * shared: a correction made once reaches every colleague, and a mistake made
 * once does too.
 *
 * Renaming is allowed. The trigger in 0024_companies.sql carries the new
 * name out to every contact, so nothing is left saying the old one.
 */
export function CompanyDetail({
  company,
  people,
}: {
  company: CompanySummary;
  people: ContactSummary[];
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

  function set<K extends keyof Draft>(key: K, value: string) {
    setDraft((d) => ({ ...d, [key]: value }));
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
      router.replace("/companies");
      router.refresh();
      showToast({ message: `${company.name} removed` });
    });
  }

  return (
    <div className="flex h-full flex-col bg-bg">
      <header className="flex shrink-0 items-center gap-2 border-b-[1.5px] border-border bg-card px-3 pt-[calc(env(safe-area-inset-top)+8px)] pb-3">
        <Link
          href="/companies"
          className="flex h-14 items-center gap-2 rounded-xl px-3 text-[18px] leading-7 font-bold text-brand"
        >
          <ChevronLeft aria-hidden className="size-5" />
          Companies
        </Link>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-6">
        <div className="mx-auto flex w-full max-w-[640px] flex-col gap-6">
          {error && (
            <p className="rounded-2xl border-[1.5px] border-danger bg-danger-hover-bg px-4 py-3 text-[17px] leading-6 text-danger text-pretty">
              {error}
            </p>
          )}

          <div className="flex items-start gap-4">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl border-[1.5px] border-border bg-muted">
              <Building2 aria-hidden className="size-7 text-sub" strokeWidth={1.75} />
            </span>
            <div className="flex min-w-0 grow flex-col gap-1">
              <h1 className="text-screen-title text-fg text-pretty wrap-anywhere">{company.name}</h1>
              <p className="text-[17px] leading-6 text-sub">
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
                  <Input value={draft.name} onChange={(e) => set("name", e.target.value)} maxLength={120} autoComplete="off" />
                </Field>
                <Field label="What they do">
                  <Textarea
                    value={draft.about}
                    onChange={(e) => set("about", e.target.value)}
                    rows={3}
                    className="min-h-[88px] resize-y"
                    maxLength={600}
                  />
                </Field>
                <Field label="Website">
                  <Input value={draft.website} onChange={(e) => set("website", e.target.value)} inputMode="url" autoComplete="off" />
                </Field>
                <Field label="Main line" hint="The switchboard, not anybody's own number.">
                  <Input value={draft.companyNumber} onChange={(e) => set("companyNumber", e.target.value)} inputMode="tel" autoComplete="off" />
                </Field>
                <Field label="Street" hint="Including the number, however it is written there.">
                  <Input value={draft.street} onChange={(e) => set("street", e.target.value)} autoComplete="off" />
                </Field>
                <Field label="Suite / unit / floor">
                  <Input value={draft.suite} onChange={(e) => set("suite", e.target.value)} autoComplete="off" />
                </Field>
                <Field label="City">
                  <Input value={draft.city} onChange={(e) => set("city", e.target.value)} autoComplete="off" />
                </Field>
                <div className="flex gap-3">
                  <Field label="State / region" className="flex-1">
                    <Input value={draft.state} onChange={(e) => set("state", e.target.value)} autoComplete="off" />
                  </Field>
                  <Field label="ZIP / postcode" className="flex-1">
                    <Input value={draft.postalCode} onChange={(e) => set("postalCode", e.target.value)} autoComplete="off" />
                  </Field>
                </div>
                <Field label="Country">
                  <Input value={draft.country} onChange={(e) => set("country", e.target.value)} autoComplete="off" />
                </Field>
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
                <Row label="Main line" value={company.company_number} />
                <Row label="Website" value={company.website} />
                <Row label="Address" value={address} />
              </Section>
            </>
          )}

          <Section heading="Who works there">
            {people.length === 0 ? (
              <p className="text-[17px] leading-6 text-sub text-pretty">
                Nobody in the book works here any more.
              </p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {people.map((person) => (
                  <li key={person.id}>
                    <ContactRow contact={person} />
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
                still here the button would only ever produce a refusal, and
                a button that always refuses is worse than no button.
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
