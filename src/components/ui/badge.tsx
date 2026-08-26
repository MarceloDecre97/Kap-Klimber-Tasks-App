import type { BadgeSpec } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function Badge({ spec, className }: { spec: BadgeSpec; className?: string }) {
  const Icon = spec.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full text-[15px] leading-5 font-bold border-[1.5px] whitespace-nowrap",
        className
      )}
      style={{ background: spec.bg, color: spec.fg, borderColor: spec.border }}
    >
      <Icon aria-hidden className="size-3.5 shrink-0" strokeWidth={2.5} />
      {spec.label}
    </span>
  );
}
