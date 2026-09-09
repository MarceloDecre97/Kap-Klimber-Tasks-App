"use client";

import { Input, Textarea } from "@/components/ui/input";
import { ChipPicker } from "@/components/contacts/chip-picker";
import { CountryField } from "@/components/ui/country-field";
import { Field } from "@/components/contacts/form-field";
import {
  COMPANY_TYPE_ICONS,
  DEFAULT_COMPANY_TYPE_ICON,
  type CompanyType,
} from "@/lib/companies-view";
import { formatPhone } from "@/lib/phones";


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
  /** Several: a trailer dealer that also upfits is both. */
  typeIds: string[];
  /** Set when "New type" is open and a name is being typed. */
  newTypeLabel: string;
}

export const EMPTY_COMPANY_DETAILS: CompanyDetails = {
  about: "", website: "", companyNumber: "",
  street: "", suite: "", city: "", state: "", postalCode: "", country: "",
  typeIds: [], newTypeLabel: "",
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
  return (
    <>
      <ChipPicker
        label="Type"
        options={types}
        icons={COMPANY_TYPE_ICONS}
        fallbackIcon={DEFAULT_COMPANY_TYPE_ICON}
        selected={value.typeIds}
        onChange={(next) => onChange({ typeIds: next })}
        newLabel={value.newTypeLabel}
        onNewLabel={(next) => onChange({ newTypeLabel: next })}
        newPlaceholder="Trailer rental, Testing, Logistics…"
        newButtonLabel="New type"
      />

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
          // Formatted on leaving the box, never under a moving cursor.
          onBlur={() => onChange({ companyNumber: formatPhone(value.companyNumber) })}
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
