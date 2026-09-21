"use client";

import type { ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFloatingPanel, FloatingPanel } from "@/components/tasks/floating-panel";

export interface FilterOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  /**
   * A line drawn above this row, naming the group it starts.
   *
   * The meetings filter needs it: "Internal" and a list of companies are one
   * question — whose meetings am I looking at — but they are not the same
   * KIND of answer, and a heading is how a menu says so without becoming two
   * menus. Optional, and no existing filter uses one.
   */
  heading?: string;
}

const PANEL_WIDTH = 256;

export function FilterDropdown<T extends string>({
  label,
  icon,
  options,
  selected,
  onChange,
  single = false,
  className,
}: {
  label: string;
  icon?: ReactNode;
  options: FilterOption<T>[];
  selected: T[];
  onChange: (next: T[]) => void;
  /** For a trigger that has to share a line — see the meetings list. */
  className?: string;
  /**
   * One choice at a time, so the count is dropped from the chip.
   *
   * "· 1" on a filter that can only ever be one is a number that never says
   * anything, and it costs about thirty pixels — which is the difference
   * between four of these fitting on one line in the address book's left
   * pane and the fourth one wrapping.
   */
  single?: boolean;
}) {
  const { open, setOpen, triggerRef, panelRef, style } = useFloatingPanel<HTMLButtonElement>();

  function toggle(value: T) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
    /* One choice means the question is answered; leaving it open is a menu
       covering the list it just filtered. */
    if (single) setOpen(false);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "flex h-12 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border-[1.5px] px-4 text-[16px] leading-[22px] font-bold cursor-pointer transition-transform duration-150 active:scale-[0.97]",
          selected.length > 0 ? "border-prim bg-prim text-on-prim" : "border-border bg-card text-fg",
          className
        )}
      >
        {icon}
        <span className="min-w-0 truncate">{label}</span>
        {!single && selected.length > 0 && (
          <span className="tabular-nums">· {selected.length}</span>
        )}
        <ChevronDown aria-hidden className={cn("size-4 transition-transform duration-150", open && "rotate-180")} />
      </button>
      {open && (
        <FloatingPanel
          panelRef={panelRef}
          style={style}
          width={PANEL_WIDTH}
          maxHeight={320}
          className="z-50 rounded-2xl border-[1.5px] border-border bg-card p-2 shadow-[0_4px_16px_rgba(2,6,23,0.16)]"
        >
          {options.map((option) => {
            const isSelected = selected.includes(option.value);
            return (
              <div key={option.value}>
                {option.heading && (
                  <p className="mt-1 border-t-[1.5px] border-border px-3 pb-1 pt-2 text-timestamp font-bold uppercase tracking-wider text-sub">
                    {option.heading}
                  </p>
                )}
              <button
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
              </div>
            );
          })}
          {options.length === 0 && <p className="px-3 py-2.5 text-[16px] text-sub">Nothing here yet.</p>}
        </FloatingPanel>
      )}
    </>
  );
}
