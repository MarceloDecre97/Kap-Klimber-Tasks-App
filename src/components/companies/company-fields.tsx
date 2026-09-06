"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Input, Textarea } from "@/components/ui/input";
import { CountryField } from "@/components/ui/country-field";
import { Field } from "@/components/contacts/form-field";
import {
  COMPANY_TYPE_ICONS,
  DEFAULT_COMPANY_TYPE_ICON,
  type CompanyType,
} from "@/lib/companies-view";
import { cn } from "@/lib/utils";

/** Everything about a company except its name, which its owner supplies. */
export interface CompanyDetails {
  about: string;
  website: string;
  companyNumber: string;
  street: string;
  suite: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  typeId: string | null;
  /** Set when "New type" is open and a name is being typed. */
  newTypeLabel: string;
}

export const EMPTY_COMPANY_DETAILS: CompanyDetails = {
  about: "", website: "", companyNumber: "",
  street: "", suite: "", city: "", state: "", postalCode: "", country: "",
  typeId: null, newTypeLabel: "",
};

/**
 * The company's own fields, in one place.
 *
 * Used by all three places a company can be written: the block underneath a
 * contact's company box, the Add company screen, and Edit company. They were
 * three copies for about an hour and had already started to differ — one
 * had the type picker and two did not.
 */
export function CompanyFields({
  value,
  onChange,
  types,
}: {
  value: CompanyDetails;
  onChange: (patch: Partial<CompanyDetails>) => void;
  types: CompanyType[];
}) {
  const [otherOpen, setOtherOpen] = useState(false);

  return (
    <>
      <div className="flex flex-col gap-2">
        <span className="text-field-label text-fg">Type</span>
        <div className="flex flex-wrap gap-2">
          {types.map((type) => {
            const Icon = COMPANY_TYPE_ICONS[type.icon] ?? DEFAULT_COMPANY_TYPE_ICON;
            const on = value.typeId === type.id && !value.newTypeLabel;
            return (
              <button
                key={type.id}
                type="button"
                aria-pressed={on}
                // Pressing the chosen one again clears it. A type is
                // optional, and without this there is no way back to none.
                onClick={() => {
                  setOtherOpen(false);
                  onChange({ newTypeLabel: "", typeId: on ? null : type.id });
                }}
                className={cn(
                  "inline-flex h-14 cursor-pointer items-center gap-2 rounded-full border-[1.5px] px-4",
                  "text-chip transition-transform duration-150 active:scale-[0.97]",
                  on ? "border-btn bg-btn text-on-btn" : "border-border bg-card text-fg hover:bg-muted"
                )}
              >
                <Icon aria-hidden className="size-5 shrink-0" strokeWidth={1.75} />
                {type.label}
              </button>
            );
          })}

          {/* Type a kind nobody has needed yet and it becomes one everybody
              can pick — the same as the contact categories. */}
          <button
            type="button"
            aria-pressed={otherOpen}
            onClick={() => {
              if (otherOpen) {
                setOtherOpen(false);
                onChange({ newTypeLabel: "" });
              } else {
                setOtherOpen(true);
                onChange({ typeId: null });
              }
            }}
            className={cn(
              "inline-flex h-14 cursor-pointer items-center gap-2 rounded-full border-[1.5px] px-4",
              "text-chip transition-transform duration-150 active:scale-[0.97]",
              otherOpen ? "border-btn bg-btn text-on-btn" : "border-border bg-card text-fg hover:bg-muted"
            )}
          >
            <Plus aria-hidden className="size-5 shrink-0" strokeWidth={2.5} />
            New type
          </button>
        </div>

        {otherOpen && (
          <Input
            value={value.newTypeLabel}
            onChange={(e) => onChange({ newTypeLabel: e.target.value })}
            placeholder="Dealer, Trailer rental, Testing…"
            aria-label="New company type"
            maxLength={60}
            autoComplete="off"
          />
        )}
      </div>

      <Field label="What they do" hint="A sentence. It shows on the company's page.">
        <Textarea
          value={value.about}
          onChange={(e) => onChange({ about: e.target.value })}
          rows={2}
          className="min-h-[72px] resize-y"
          maxLength={600}
        />
      </Field>
      <Field label="Website">
        <Input
          value={value.website}
          onChange={(e) => onChange({ website: e.target.value })}
          inputMode="url"
          autoComplete="off"
          placeholder="multimatic.com"
        />
      </Field>
      {/*
        The switchboard, not anybody's own line. A person's own numbers live
        on the person; this is the one you ring when you have lost them.
      */}
      <Field label="Company main line" hint="The switchboard, not anybody's own number.">
        <Input
          value={value.companyNumber}
          onChange={(e) => onChange({ companyNumber: e.target.value })}
          inputMode="tel"
          autoComplete="off"
        />
      </Field>
      <Field label="Street" hint="Including the number, however it is written there.">
        <Input value={value.street} onChange={(e) => onChange({ street: e.target.value })} autoComplete="off" />
      </Field>
      <Field label="Suite / unit / floor">
        <Input value={value.suite} onChange={(e) => onChange({ suite: e.target.value })} autoComplete="off" />
      </Field>
      <Field label="City">
        <Input value={value.city} onChange={(e) => onChange({ city: e.target.value })} autoComplete="off" />
      </Field>
      <div className="flex gap-3">
        <Field label="State / region" className="flex-1">
          <Input value={value.state} onChange={(e) => onChange({ state: e.target.value })} autoComplete="off" />
        </Field>
        <Field label="ZIP / postcode" className="flex-1">
          <Input value={value.postalCode} onChange={(e) => onChange({ postalCode: e.target.value })} autoComplete="off" />
        </Field>
      </div>
      {/*
        Picked, not typed free. The companies book is filtered by country,
        and "USA" beside "United States" is two filter rows for one place.
      */}
      <Field label="Country" hint="Type a few letters and pick it from the list.">
        <CountryField value={value.country} onChange={(next) => onChange({ country: next })} />
      </Field>
    </>
  );
}
