"use client";

import { cn } from "@/lib/utils";

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-1 p-1 bg-muted rounded-full", className)} role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "flex-1 h-14 rounded-full font-bold text-[18px] leading-7 cursor-pointer transition-colors duration-150",
            value === option.value ? "bg-prim text-on-prim" : "bg-transparent text-muted-fg hover:text-fg"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
