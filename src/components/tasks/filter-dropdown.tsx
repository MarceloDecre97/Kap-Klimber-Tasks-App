"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FilterOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

export function FilterDropdown<T extends string>({
  label,
  icon,
  options,
  selected,
  onChange,
  align = "left",
}: {
  label: string;
  icon?: ReactNode;
  options: FilterOption<T>[];
  selected: T[];
  onChange: (next: T[]) => void;
  align?: "left" | "right";
}) {
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

  function toggle(value: T) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "flex h-12 items-center gap-1.5 whitespace-nowrap rounded-full border-[1.5px] px-4 text-[16px] leading-[22px] font-bold cursor-pointer transition-transform duration-150 active:scale-[0.97]",
          selected.length > 0 ? "border-prim bg-prim text-on-prim" : "border-border bg-card text-fg"
        )}
      >
        {icon}
        {label}
        {selected.length > 0 && <span className="tabular-nums">· {selected.length}</span>}
        <ChevronDown aria-hidden className={cn("size-4 transition-transform duration-150", open && "rotate-180")} />
      </button>
      {open && (
        <div
          role="listbox"
          className={cn(
            "absolute z-20 mt-2 max-h-80 w-64 overflow-y-auto rounded-2xl border-[1.5px] border-border bg-card p-2 shadow-[0_1px_3px_rgba(2,6,23,0.08)]",
            align === "right" ? "right-0" : "left-0"
          )}
        >
          {options.map((option) => {
            const isSelected = selected.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => toggle(option.value)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[17px] leading-6 font-bold cursor-pointer",
                  isSelected ? "text-fg" : "text-sub hover:bg-muted"
                )}
              >
                {option.icon}
                <span className="flex-1 truncate">{option.label}</span>
                {isSelected && <Check aria-hidden className="size-4 shrink-0" />}
              </button>
            );
          })}
          {options.length === 0 && <p className="px-3 py-2.5 text-[16px] text-sub">Nothing here yet.</p>}
        </div>
      )}
    </div>
  );
}
