"use client";

import { useMemo, useState } from "react";
import { Check, Globe, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { COUNTRIES, canonicalCountry, suggestCountries } from "@/lib/countries";
import { cn } from "@/lib/utils";

/**
 * A country, typed and then picked.
 *
 * Not a plain text box: the companies book is filtered by country, and free
 * text turns the United States into three separate filter entries nobody can
 * reconcile. Not a bare dropdown either — scrolling to Switzerland past two
 * hundred countries on a phone is worse than typing "swi".
 *
 * So: type to narrow, tap to choose. What is stored is always a name from
 * the list. Anything typed and left unmatched is dropped on save rather than
 * quietly becoming a fourth spelling of somewhere.
 */
export function CountryField({
  value,
  onChange,
  ariaLabel = "Country",
}: {
  /** The stored value: a canonical country name, or "". */
  value: string;
  onChange: (next: string) => void;
  ariaLabel?: string;
}) {
  /*
    What is in the box, which is only the same as `value` once something has
    been chosen. While somebody is typing "swi" the stored value is still
    whatever it was — a half-typed country is not a country.
  */
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const chosen = value.trim();
  const matches = useMemo(() => suggestCountries(query), [query]);

  function choose(name: string) {
    onChange(name);
    setQuery("");
    setOpen(false);
  }

  /*
    A stored value that is not on the list — a country typed before this
    field was a picker. It is shown rather than swallowed, and flagged,
    because saving canonicalises: an unmatched value is dropped on the way
    in, and somebody should find that out here rather than by noticing the
    country has gone.
  */
  const unknown = Boolean(chosen) && canonicalCountry(chosen) === null;

  if (chosen && !open) {
    return (
      <div className="flex flex-col gap-1.5">
      <div
        className={cn(
          "flex min-h-14 items-center gap-2 rounded-2xl border-[1.5px] bg-card px-4 py-2",
          unknown ? "border-danger" : "border-border"
        )}
      >
        <Globe aria-hidden className="size-5 shrink-0 text-sub" strokeWidth={1.75} />
        <span className="min-w-0 grow text-[18px] leading-7 text-fg wrap-anywhere">{chosen}</span>
        <button
          type="button"
          aria-label={`Change ${ariaLabel.toLowerCase()}`}
          onClick={() => {
            setOpen(true);
            setQuery("");
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
      {unknown && (
        <span className="text-[16px] leading-6 font-bold text-danger text-pretty">
          That is not on the list. Press Change and pick one, or it will be dropped when you save.
        </span>
      )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        aria-label={ariaLabel}
        autoComplete="off"
        placeholder="Start typing — United States, Canada…"
      />

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
                  onClick={() => choose(country.name)}
                  className={cn(
                    "flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left",
                    "text-[17px] leading-6 text-fg hover:bg-muted"
                  )}
                >
                  <Globe aria-hidden className="size-5 shrink-0 text-sub" strokeWidth={1.75} />
                  {country.name}
                  {canonicalCountry(query) === country.name && (
                    <Check aria-hidden className="ml-auto size-5 shrink-0 text-brand" strokeWidth={2.5} />
                  )}
                </button>
              </li>
            ))
          )}
          {query.trim() === "" && matches.length < COUNTRIES.length && (
            <li className="px-3 pt-1 pb-2 text-timestamp text-sub">
              Keep typing to reach the rest.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
