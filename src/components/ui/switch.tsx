"use client";

import { cn } from "@/lib/utils";

/*
  Track and knob are one measurement, not two.

  They were separate: the base gave a 76×44 track with a 34px knob at
  left-[37px], and the Settings screen shrank the track to 56×32 through
  className while the knob kept its size and position — so the knob stuck out
  fifteen pixels past the end of its own track and collided with the switch
  beside it. Any override of the width was going to do that.

  So size is a prop with both halves computed together, and the class name no
  longer controls geometry. `on` is the track width minus the knob minus the
  same inset it sits at when off, which is what keeps it flush at both ends.
*/
const SIZES = {
  md: { track: "w-[76px] h-11", knob: "w-[34px] h-[34px]", off: "left-[5px]", on: "left-[37px]" },
  sm: { track: "w-[56px] h-8", knob: "w-6 h-6", off: "left-[4px]", on: "left-[28px]" },
} as const;

export function Switch({
  checked,
  onCheckedChange,
  label,
  size = "md",
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: string;
  /** "sm" for dense rows like Settings; "md" everywhere else. */
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const spec = SIZES[size];

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex items-center rounded-full shrink-0 transition-colors duration-150",
        spec.track,
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
          "absolute rounded-full shadow-sm transition-[left,background-color] duration-150 ease-out",
          spec.knob,
          checked ? `bg-switch-knob ${spec.on}` : `bg-card ${spec.off}`
        )}
      />
    </button>
  );
}
