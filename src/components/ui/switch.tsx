"use client";

import { cn } from "@/lib/utils";

export function Switch({
  checked,
  onCheckedChange,
  label,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex items-center w-[76px] h-11 rounded-full shrink-0 transition-colors duration-150",
        checked ? "bg-prim" : "bg-muted",
        className
      )}
    >
      <span
        className={cn(
          "absolute w-[34px] h-[34px] rounded-full bg-white shadow-sm transition-[left] duration-150 ease-out",
          checked ? "left-[37px]" : "left-[5px]"
        )}
      />
    </button>
  );
}
