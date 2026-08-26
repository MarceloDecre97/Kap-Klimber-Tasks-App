"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  icon?: React.ReactNode;
  showCheckWhenSelected?: boolean;
}

export const Chip = forwardRef<HTMLButtonElement, ChipProps>(
  ({ className, selected, icon, showCheckWhenSelected = true, children, type = "button", ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        aria-pressed={selected}
        className={cn(
          "inline-flex items-center gap-2 h-14 px-4 rounded-full text-chip whitespace-nowrap",
          "border-[1.5px] transition-[transform,background-color] duration-150 ease-out active:scale-[0.97]",
          selected
            ? "bg-prim text-on-prim border-prim"
            : "bg-card text-fg border-border hover:bg-muted",
          className
        )}
        {...props}
      >
        {icon}
        {children}
        {selected && showCheckWhenSelected && <Check aria-hidden className="size-4" strokeWidth={3} />}
      </button>
    );
  }
);
Chip.displayName = "Chip";
