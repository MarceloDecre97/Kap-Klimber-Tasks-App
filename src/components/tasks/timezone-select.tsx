"use client";

import { useEffect, useState } from "react";
import { Check, Clock } from "lucide-react";
import { cn, getZoneAbbreviation } from "@/lib/utils";
import { useFloatingPanel, FloatingPanel } from "@/components/tasks/floating-panel";

export interface TimezoneOption {
  value: string;
  city: string;
}

export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  { value: "America/Monterrey", city: "Monterrey, Mexico" },
  { value: "America/Chicago", city: "Chicago" },
];

export const DEFAULT_TIMEZONE = TIMEZONE_OPTIONS[0]!.value;

const PANEL_WIDTH = 260;

export function TimezoneSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { open, setOpen, triggerRef, panelRef, style } = useFloatingPanel<HTMLButtonElement>();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const update = () => setNow(new Date());
    const immediate = setTimeout(update, 0);
    const interval = setInterval(update, 30_000);
    return () => {
      clearTimeout(immediate);
      clearInterval(interval);
    };
  }, []);

  const current = TIMEZONE_OPTIONS.find((o) => o.value === value) ?? TIMEZONE_OPTIONS[0]!;
  const currentAbbrev = now ? getZoneAbbreviation(current.value, now) : "";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Choose timezone"
        className="inline-flex items-center gap-2 h-14 px-4 rounded-full text-chip cursor-pointer bg-muted border-[1.5px] border-border text-fg transition-transform duration-150 active:scale-[0.97]"
      >
        <Clock aria-hidden className="size-4" />
        {currentAbbrev || " "}
      </button>
      {open && (
        <FloatingPanel
          panelRef={panelRef}
          style={style}
          width={PANEL_WIDTH}
          className="z-50 flex flex-col gap-1 rounded-2xl border-[1.5px] border-border bg-card p-2 shadow-[0_4px_16px_rgba(2,6,23,0.16)]"
        >
          {TIMEZONE_OPTIONS.map((option) => {
            const isSelected = option.value === value;
            const time = now ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: option.value }).format(now) : "";
            const abbrev = now ? getZoneAbbreviation(option.value, now) : "";
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left cursor-pointer",
                  isSelected ? "text-fg" : "text-sub hover:bg-muted"
                )}
              >
                <span className="flex flex-col gap-0.5">
                  <span className="text-[17px] leading-6 font-bold">{option.city}</span>
                  <span className="text-[15px] leading-5 tabular-nums opacity-80">
                    {time} {abbrev}
                  </span>
                </span>
                {isSelected && <Check aria-hidden className="size-4 shrink-0" />}
              </button>
            );
          })}
        </FloatingPanel>
      )}
    </>
  );
}
