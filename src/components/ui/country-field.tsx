"use client";

import { useMemo, useState } from "react";
import { Check, Globe, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { canonicalCountry, suggestCountries } from "@/lib/countries";
import { cn } from "@/lib/utils";

/**
 * A country, typed and then picked.
 *
 * Not a plain text box: both books are filtered by country, and free text
 * turns the United States into three separate filter entries nobody can
 * reconcile. Not a bare dropdown either — scrolling to Switzerland past two
 * hundred and fifty countries on a phone is worse than typing "swi".
 *
 * The field is controlled on the raw text, not on the chosen country. That
 * matters: an earlier version kept the typed text to itself, so somebody who
 * typed "Bangladesh", found no match and saved anyway had their old country
 * silently kept and their typing discarded. Now what is in the box is what is
 * in the draft, an unrecognised value shows in red, and the form refuses to
 * save until it is picked or cleared. Nothing is thrown away quietly.
 */
export function CountryField({
  value,
  onChange,
  ariaLabel = "Country",
}: {
  /** Whatever is in the box — a country name once one has been picked. */
  value: string;
  onChange: (next: string) => void;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);

  const typed = value.trim();
  const chosen = canonicalCountry(typed);
  /*
    Always what is typed, never a reset to the head of the list.

    This used to pass "" once the text resolved to a country, so typing
    "DRC" — which is an alias — replaced the suggestions with United States,
    Canada, Mexico. The alias matched perfectly and the list looked like it
    had ignored you. Reopening a chosen value clears it first, so the empty
    query still gets the default head where it is wanted.
  */
  const matches = useMemo(() => suggestCountries(typed), [typed]);

  if (chosen && !open) {
    return (
      <div className="flex min-h-14 items-center gap-2 rounded-2xl border-[1.5px] border-border bg-card px-4 py-2">
        <Globe aria-hidden className="size-5 shrink-0 text-sub" strokeWidth={1.75} />
        <span className="min-w-0 grow text-[18px] leading-7 text-fg wrap-anywhere">{chosen}</span>
        <button
          type="button"
          aria-label={`Change ${ariaLabel.toLowerCase()}`}
          onClick={() => {
            onChange("");
            setOpen(true);
          }}
          className="shrink-0 cursor-pointer rounded-xl px-3 py-2 text-[16px] leading-[22px] font-bold text-brand hover:bg-muted"
        >
          Change
        </button>
        <button
          type="button"
          aria-label={`Clear ${ariaLabel.toLowerCase()}`}
          onClick={() => onChange("")}
          className="inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-xl text-sub hover:bg-muted hover:text-fg"
        >
          <X aria-hidden className="size-5" />
        </button>
      </div>
    );
  }

  const unmatched = typed.length > 0 && !chosen;

  return (
    <div className="flex flex-col gap-2">
      <span className={cn("flex flex-col rounded-2xl", unmatched && "outline-2 outline-offset-2 outline-danger")}>
        <Input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          aria-label={ariaLabel}
          autoComplete="off"
          placeholder="Start typing — United States, Canada…"
        />
      </span>

      {unmatched && (
        <span className="text-[16px] leading-6 font-bold text-danger text-pretty">
          Pick a country from the list, or clear the box.
        </span>
      )}

      {open && (
        <ul className="flex flex-col gap-1.5 rounded-2xl border-[1.5px] border-border bg-card p-1.5">
          {matches.length === 0 ? (
            <li className="px-3 py-3 text-[16px] leading-6 text-sub text-pretty">
              No country matches that. Try the start of its name.
            </li>
          ) : (
            matches.map((country) => (
              <li key={country.name}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(country.name);
                    setOpen(false);
                  }}
                  className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left text-[17px] leading-6 text-fg hover:bg-muted"
                >
                  <Globe aria-hidden className="size-5 shrink-0 text-sub" strokeWidth={1.75} />
                  {country.name}
                  {chosen === country.name && (
                    <Check aria-hidden className="ml-auto size-5 shrink-0 text-brand" strokeWidth={2.5} />
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

/**
 * True when a country box holds text that is not a country.
 *
 * Exported so a form can refuse to save rather than let the server drop the
 * value on the floor — which is what used to happen.
 */
export function countryUnmatched(value: string): boolean {
  const typed = value.trim();
  return typed.length > 0 && canonicalCountry(typed) === null;
}
