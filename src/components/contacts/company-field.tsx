"use client";

import { useMemo, useState } from "react";
import { Building2, Check, Pencil, TriangleAlert } from "lucide-react";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/contacts/form-field";
import { formatAddress } from "@/lib/contacts-view";
import {
  exactCompanyMatch,
  nearCompanyMatches,
  suggestCompanies,
  type CompanySummary,
} from "@/lib/companies-view";
import { cn } from "@/lib/utils";

/** The company half of the contact draft. Every field a string, as inputs are. */
export interface CompanyDraft {
  company: string;
  /** Set only when what was typed matches a company already in the book. */
  companyId: string | null;
  companyAbout: string;
  companyWebsite: string;
  companyNumber: string;
  companyStreet: string;
  companySuite: string;
  companyCity: string;
  companyState: string;
  companyPostalCode: string;
  companyCountry: string;
  updateCompanyDetails: boolean;
}

const BLANK_DETAILS = {
  companyAbout: "",
  companyWebsite: "",
  companyNumber: "",
  companyStreet: "",
  companySuite: "",
  companyCity: "",
  companyState: "",
  companyPostalCode: "",
  companyCountry: "",
};

function detailsOf(c: CompanySummary | null) {
  if (!c) return BLANK_DETAILS;
  return {
    companyAbout: c.about ?? "",
    companyWebsite: c.website ?? "",
    companyNumber: c.company_number ?? "",
    companyStreet: c.street ?? "",
    companySuite: c.suite ?? "",
    companyCity: c.city ?? "",
    companyState: c.state ?? "",
    companyPostalCode: c.postal_code ?? "",
    companyCountry: c.country ?? "",
  };
}

/**
 * The company, typed rather than picked.
 *
 * There is no company step in front of this form and there never will be.
 * You type the name. If it is already in the book it links itself and its
 * details come with it, read-only, because they are everybody's now. If it
 * is not, the fields open underneath and saving the contact creates the
 * company too — one save, two rows, linked.
 *
 * The near-duplicate warning is the whole reason this is not a plain text
 * box. "ADV Mobil" and "ADV Mobil LLC" are one company typed twice, and
 * once both exist nobody ever notices. So it asks — and takes either answer,
 * because sometimes two companies really are named almost the same thing.
 */
export function CompanyField({
  companies,
  draft,
  onChange,
}: {
  companies: CompanySummary[];
  draft: CompanyDraft;
  onChange: (patch: Partial<CompanyDraft>) => void;
}) {
  const [focused, setFocused] = useState(false);
  /** The name whose warning has been answered with "Create it separately". */
  const [dismissed, setDismissed] = useState<string | null>(null);

  const linked = useMemo(
    () => (draft.companyId ? companies.find((c) => c.id === draft.companyId) ?? null : null),
    [companies, draft.companyId]
  );

  const near = useMemo(
    () => nearCompanyMatches(draft.company, companies),
    [companies, draft.company]
  );

  const suggestions = useMemo(
    () => suggestCompanies(draft.company, companies).filter((c) => c.id !== draft.companyId),
    [companies, draft.company, draft.companyId]
  );

  const typed = draft.company.trim();
  const showSuggestions = focused && !linked && suggestions.length > 0;
  const showNear = near.length > 0 && dismissed !== typed.toLowerCase();
  const isNew = typed.length > 0 && !linked;

  /**
   * Renaming resolves the link, and a *changed* link resets the details —
   * to the matched company's, or to blank. Without the reset, linking to ADV
   * Mobil and then retyping the name would carry ADV Mobil's address into a
   * brand-new company nobody meant to give an address to.
   */
  function setName(name: string) {
    const match = exactCompanyMatch(name, companies);
    const nextId = match?.id ?? null;
    if (nextId !== draft.companyId) {
      onChange({ company: name, companyId: nextId, ...detailsOf(match), updateCompanyDetails: false });
    } else {
      onChange({ company: name });
    }
    setDismissed(null);
  }

  const detailFields = (
    <>
      <Field label="What they do" hint="A sentence. It shows on the company's page.">
        <Textarea
          value={draft.companyAbout}
          onChange={(e) => onChange({ companyAbout: e.target.value })}
          rows={2}
          className="min-h-[72px] resize-y"
          maxLength={600}
        />
      </Field>
      <Field label="Company website">
        <Input
          value={draft.companyWebsite}
          onChange={(e) => onChange({ companyWebsite: e.target.value })}
          inputMode="url"
          autoComplete="off"
          placeholder="multimatic.com"
        />
      </Field>
      {/*
        The switchboard, not this person's line. Their own numbers are up in
        "How to reach them" — this is the one you ring when you have lost
        everybody's direct number.
      */}
      <Field label="Company main line" hint="The switchboard, not their own number.">
        <Input
          value={draft.companyNumber}
          onChange={(e) => onChange({ companyNumber: e.target.value })}
          inputMode="tel"
          autoComplete="off"
        />
      </Field>
      <Field label="Street" hint="Including the number, however it is written there.">
        <Input value={draft.companyStreet} onChange={(e) => onChange({ companyStreet: e.target.value })} autoComplete="off" />
      </Field>
      <Field label="Suite / unit / floor">
        <Input value={draft.companySuite} onChange={(e) => onChange({ companySuite: e.target.value })} autoComplete="off" />
      </Field>
      <Field label="City">
        <Input value={draft.companyCity} onChange={(e) => onChange({ companyCity: e.target.value })} autoComplete="off" />
      </Field>
      <div className="flex gap-3">
        <Field label="State / region" className="flex-1">
          <Input value={draft.companyState} onChange={(e) => onChange({ companyState: e.target.value })} autoComplete="off" />
        </Field>
        <Field label="ZIP / postcode" className="flex-1">
          <Input value={draft.companyPostalCode} onChange={(e) => onChange({ companyPostalCode: e.target.value })} autoComplete="off" />
        </Field>
      </div>
      <Field label="Country">
        <Input value={draft.companyCountry} onChange={(e) => onChange({ companyCountry: e.target.value })} autoComplete="off" />
      </Field>
    </>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="relative flex flex-col gap-2">
        <Field label="Company" hint="Type it. If it is already in the book it will link itself.">
          <Input
            value={draft.company}
            onChange={(e) => setName(e.target.value)}
            onFocus={() => setFocused(true)}
            // Delayed so a tap on a suggestion lands before the list closes.
            onBlur={() => window.setTimeout(() => setFocused(false), 150)}
            autoComplete="off"
            maxLength={120}
          />
        </Field>

        {showSuggestions && (
          <ul className="flex flex-col gap-1.5 rounded-2xl border-[1.5px] border-border bg-card p-1.5">
            {suggestions.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setName(c.name)}
                  className="flex w-full min-h-14 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-muted"
                >
                  <Building2 aria-hidden className="size-5 shrink-0 text-sub" strokeWidth={1.75} />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-[17px] leading-6 font-bold text-fg wrap-anywhere">{c.name}</span>
                    {(c.city || c.state) && (
                      <span className="text-timestamp text-sub">
                        {[c.city, c.state].filter(Boolean).join(", ")}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/*
        The question that stops the book fragmenting. It never merges on its
        own — two companies genuinely can be called almost the same thing,
        and the person typing is the only one who knows.
      */}
      {showNear && (
        <div className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-brand bg-card px-4 py-3">
          <span className="flex items-start gap-2 text-[17px] leading-6 text-fg text-pretty">
            <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-brand" strokeWidth={2} />
            <span>
              <span className="font-bold">{near[0]!.name}</span> is already in the book. Did you
              mean that one?
            </span>
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setName(near[0]!.name)}
              className="inline-flex h-14 cursor-pointer items-center gap-2 rounded-2xl bg-btn px-5 text-chip text-on-btn transition-transform duration-150 active:scale-[0.97] hover:bg-btn-hover"
            >
              <Check aria-hidden className="size-5" strokeWidth={2} />
              Use that one
            </button>
            <button
              type="button"
              onClick={() => setDismissed(typed.toLowerCase())}
              className="inline-flex h-14 cursor-pointer items-center rounded-2xl border-[1.5px] border-border bg-card px-4 text-chip text-fg hover:bg-muted"
            >
              Create it separately
            </button>
          </div>
        </div>
      )}

      {linked && (
        <div className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-border bg-muted px-4 py-3">
          <span className="flex items-center gap-2 text-[16px] leading-6 font-bold text-sub">
            <Check aria-hidden className="size-5 shrink-0 text-brand" strokeWidth={2.5} />
            Linked to {linked.name}
          </span>

          {draft.updateCompanyDetails ? (
            <>
              {/*
                Editing here changes the company for everybody at it, which
                is the point — and the reason it is behind a press rather
                than simply being editable.
              */}
              <p className="text-[16px] leading-6 text-sub text-pretty">
                These are shared. Changing them here changes them for everyone at {linked.name}.
              </p>
              {detailFields}
            </>
          ) : (
            <>
              <CompanyLine label="What they do" value={linked.about} />
              <CompanyLine label="Website" value={linked.website} />
              <CompanyLine label="Main line" value={linked.company_number} />
              <CompanyLine label="Address" value={formatAddress(linked)} />
              <button
                type="button"
                onClick={() => onChange({ updateCompanyDetails: true })}
                className="inline-flex h-14 w-fit cursor-pointer items-center gap-2 rounded-2xl border-[1.5px] border-border bg-card px-4 text-chip text-fg hover:bg-muted"
              >
                <Pencil aria-hidden className="size-5" strokeWidth={1.75} />
                Edit company details
              </button>
            </>
          )}
        </div>
      )}

      {isNew && !showNear && (
        <div className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-border bg-muted px-4 py-3">
          <span className="text-[16px] leading-6 text-sub text-pretty">
            <span className="font-bold text-fg">{typed}</span> is new. Fill in what you know —
            saving the contact adds the company to the book at the same time. All of it can wait.
          </span>
          {detailFields}
        </div>
      )}
    </div>
  );
}

/** One read-only line of a linked company. Renders nothing when empty. */
function CompanyLine({ label, value }: { label: string; value: string | null }) {
  if (!value || !value.trim()) return null;
  return (
    <div className={cn("flex flex-col gap-0.5")}>
      <span className="text-timestamp text-sub">{label}</span>
      <span className="text-[17px] leading-6 text-fg text-pretty wrap-anywhere">{value}</span>
    </div>
  );
}
