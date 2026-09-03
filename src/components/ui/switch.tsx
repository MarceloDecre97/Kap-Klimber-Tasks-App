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
        /*
          The knob changes colour with the track, not just position. On a
          pale track a white knob is invisible, which is how the dark theme
          ended up with an "on" switch that looked identical to an "off" one.
        */
        checked ? "bg-switch-on" : "bg-muted",
        className
      )}
    >
      <span
        className={cn(
          "absolute w-[34px] h-[34px] rounded-full shadow-sm transition-[left,background-color] duration-150 ease-out",
          checked ? "bg-switch-knob left-[37px]" : "bg-card left-[5px]"
        )}
      />
    </button>
  );
}
