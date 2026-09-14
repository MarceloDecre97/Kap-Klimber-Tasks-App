"use client";

import { useMemo, useState } from "react";
import { Ticket } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * The name of a trade show, typed and — if somebody has been there before —
 * offered.
 *
 * Deliberately not the country field. That one refuses anything off its
 * list, because there is a finite set of countries and a misspelt one is
 * simply wrong. There is no list of trade shows: the first person to go to a
 * new one has to be able to write it down. So this suggests and then gets
 * out of the way, and anything typed is kept.
 *
 * What it is really for is spelling. Four people fill this book in, and the
 * page is filtered by this column — left as a bare text box, a year of
 * "MATS", "Mats" and "MATS Louisville" turns one show into three filter
 * entries and each of them finds a third of the people. Offering what has
 * already been written down is most of the fix; the server snapping a typed
 * name onto an existing spelling is the rest.
 */
export function TradeShowField({
  value,
  onChange,
  shows,
  ariaLabel = "Trade show",
}: {
  value: string;
  onChange: (next: string) => void;
  /** Show names already written down, for the suggestions. */
  shows: string[];
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);

  const typed = value.trim().toLowerCase();

  const matches = useMemo(() => {
    const pool = shows.filter((s) => s.trim().length > 0);
    if (!typed) return pool.slice(0, 8);
    /*
      What the name starts with first, then anything containing it. Typing
      "mats" should put MATS at the top rather than below "Heavy Duty Aftermarket
      Week — MATS edition" on an alphabetical sort.
    */
    const starts = pool.filter((s) => s.toLowerCase().startsWith(typed));
    const rest = pool.filter(
      (s) => !s.toLowerCase().startsWith(typed) && s.toLowerCase().includes(typed)
    );
    return [...starts, ...rest].slice(0, 8);
  }, [shows, typed]);

  /*
    Nothing to offer once the box already holds exactly what is on the list —
    a dropdown whose only entry is what you have just typed is noise.
  */
  const exact = matches.length === 1 && matches[0]!.toLowerCase() === typed;
  const showList = open && matches.length > 0 && !exact;

  return (
    <div className="flex flex-col gap-2">
      <Input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        /*
          Safe because every suggestion cancels its own mousedown, so picking
          one never blurs the box first.
        */
        onBlur={() => setOpen(false)}
        aria-label={ariaLabel}
        autoComplete="off"
        placeholder="MATS, CONEXPO…"
      />

      {showList && (
        <ul className="flex flex-col gap-1.5 rounded-2xl border-[1.5px] border-border bg-card p-1.5">
          {matches.map((show) => (
            <li key={show}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(show);
                  setOpen(false);
                }}
                className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left text-[17px] leading-6 text-fg hover:bg-muted"
              >
                <Ticket aria-hidden className="size-5 shrink-0 text-sub" strokeWidth={1.75} />
                {show}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
