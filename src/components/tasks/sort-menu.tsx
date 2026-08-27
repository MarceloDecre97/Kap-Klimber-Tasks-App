"use client";

import { ArrowUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFloatingPanel, FloatingPanel } from "@/components/tasks/floating-panel";
import type { SortMode } from "@/lib/tasks-view";

const OPTIONS: { value: SortMode; label: string }[] = [
  { value: "priority", label: "Priority" },
  { value: "due", label: "Due date" },
  { value: "updated", label: "Recently updated" },
];

const PANEL_WIDTH = 240;

/**
 * `value` is null until the user picks a sort, which is what lets the button
 * read a plain "Sort" by default. The list's underlying order is unchanged —
 * the caller substitutes its own default when nothing is chosen.
 */
export function SortMenu({ value, onChange }: { value: SortMode | null; onChange: (value: SortMode) => void }) {
  const { open, setOpen, triggerRef, panelRef, style } = useFloatingPanel<HTMLButtonElement>();
  const current = value ? OPTIONS.find((o) => o.value === value) : undefined;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "flex h-12 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border-[1.5px] px-4",
          "text-[16px] leading-[22px] font-bold cursor-pointer transition-transform duration-150 active:scale-[0.97]",
          current ? "border-prim bg-prim text-on-prim" : "border-border bg-card text-fg"
        )}
      >
        <ArrowUpDown aria-hidden className="size-4" />
        {current?.label ?? "Sort"}
      </button>
      {open && (
        <FloatingPanel
          panelRef={panelRef}
          style={style}
          width={PANEL_WIDTH}
          className="z-50 rounded-2xl border-[1.5px] border-border bg-card p-2 shadow-[0_4px_16px_rgba(2,6,23,0.16)]"
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
        </FloatingPanel>
      )}
    </>
  );
}
