"use client";

import { useMemo, useState } from "react";
import { Building2, Check, Pencil, TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/contacts/form-field";
import { CompanyFields, type CompanyDetails } from "@/components/companies/company-fields";
import { formatAddress } from "@/lib/contacts-view";
import {
  exactCompanyMatch,
  nearCompanyMatches,
  suggestCompanies,
  type CompanySummary,
  type CompanyType,
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
  companyTypeId: string | null;
  newCompanyTypeLabel: string;
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
  companyTypeId: null as string | null,
  newCompanyTypeLabel: "",
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
    companyTypeId: c.type?.id ?? null,
    newCompanyTypeLabel: "",
  };
}

/*
  The draft carries the company's fields under `company*` names so it can be
  one flat object the server action reads directly. The shared editor speaks
  the plain names. These two turn one into the other, in one place, rather
  than at every field.
*/
function toDetails(d: CompanyDraft): CompanyDetails {
  return {
    about: d.companyAbout,
    website: d.companyWebsite,
    companyNumber: d.companyNumber,
    street: d.companyStreet,
    suite: d.companySuite,
    city: d.companyCity,
    state: d.companyState,
    postalCode: d.companyPostalCode,
    country: d.companyCountry,
    typeId: d.companyTypeId,
    newTypeLabel: d.newCompanyTypeLabel,
  };
}

function fromDetails(patch: Partial<CompanyDetails>): Partial<CompanyDraft> {
  const out: Partial<CompanyDraft> = {};
  if ("about" in patch) out.companyAbout = patch.about;
  if ("website" in patch) out.companyWebsite = patch.website;
  if ("companyNumber" in patch) out.companyNumber = patch.companyNumber;
  if ("street" in patch) out.companyStreet = patch.street;
  if ("suite" in patch) out.companySuite = patch.suite;
  if ("city" in patch) out.companyCity = patch.city;
  if ("state" in patch) out.companyState = patch.state;
  if ("postalCode" in patch) out.companyPostalCode = patch.postalCode;
  if ("country" in patch) out.companyCountry = patch.country;
  if ("typeId" in patch) out.companyTypeId = patch.typeId ?? null;
  if ("newTypeLabel" in patch) out.newCompanyTypeLabel = patch.newTypeLabel;
  return out;
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
  types,
  draft,
  onChange,
}: {
  companies: CompanySummary[];
  types: CompanyType[];
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
    <CompanyFields
      types={types}
      value={toDetails(draft)}
      onChange={(patch) => onChange(fromDetails(patch))}
    />
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
