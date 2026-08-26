"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SortMode } from "@/lib/tasks-view";

const OPTIONS: { value: SortMode; label: string }[] = [
  { value: "priority", label: "Priority" },
  { value: "reminder", label: "Reminder date" },
  { value: "updated", label: "Recently updated" },
];

export function SortMenu({ value, onChange }: { value: SortMode; onChange: (value: SortMode) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const current = OPTIONS.find((o) => o.value === value)!;

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex h-12 items-center gap-1.5 whitespace-nowrap rounded-full border-[1.5px] border-border bg-card px-4 text-[16px] leading-[22px] font-bold text-fg cursor-pointer transition-transform duration-150 active:scale-[0.97]"
      >
        <ArrowUpDown aria-hidden className="size-4" />
        {current.label}
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute right-0 z-20 mt-2 w-64 rounded-2xl border-[1.5px] border-border bg-card p-2 shadow-[0_1px_3px_rgba(2,6,23,0.08)]"
        >
          {OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-3 text-left text-[18px] leading-7 font-bold cursor-pointer",
                option.value === value ? "text-fg" : "text-sub hover:bg-muted"
              )}
            >
              {option.label}
              {option.value === value && <Check aria-hidden className="size-4" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
