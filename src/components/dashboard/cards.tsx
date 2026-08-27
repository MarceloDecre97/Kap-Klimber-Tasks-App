import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { BarRow, SegmentDatum } from "@/lib/dashboard-stats";

/**
 * Every chart in here prints its numbers as text next to the bar. Colour and
 * length are the fast read; the printed count is the accessible one, so none
 * of these cards depend on hue alone to be understood.
 */

export function Card({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        "flex flex-col gap-4 rounded-2xl border-[1.5px] border-border bg-card p-5 shadow-[0_1px_3px_rgba(2,6,23,0.08)]",
        className
      )}
    >
      {title && <h3 className="text-field-label text-fg">{title}</h3>}
      {children}
    </section>
  );
}

/** A single big number paired with a sentence — the "one glance" cards. */
export function BigStat({
  value,
  caption,
  tone = "fg",
  icon,
}: {
  value: number | string;
  caption: ReactNode;
  tone?: "fg" | "brand" | "accent" | "danger";
  icon?: ReactNode;
}) {
  const toneClass = {
    fg: "text-fg",
    brand: "text-brand",
    accent: "text-accent",
    danger: "text-danger",
  }[tone];

  return (
    <div className="flex items-baseline gap-3.5">
      {icon && <span className={cn("self-center", toneClass)}>{icon}</span>}
      <span className={cn("font-display text-[52px] leading-[52px] font-bold tabular-nums", toneClass)}>{value}</span>
      <span className="flex-1 text-[18px] leading-7 text-pretty">{caption}</span>
    </div>
  );
}

/** Horizontal stacked bar — one segment per status, widths summing to 100%. */
export function StackedBar({ segments, ariaLabel }: { segments: SegmentDatum[]; ariaLabel: string }) {
  const hasAny = segments.some((s) => s.count > 0);

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className="flex h-10 overflow-hidden rounded-full border-[1.5px] border-border bg-muted"
    >
      {hasAny &&
        segments
          .filter((s) => s.count > 0)
          .map((segment) => (
            <span
              key={segment.key}
              style={{ width: segment.width, background: segment.fill, color: segment.fg }}
              className="flex items-center justify-center overflow-hidden text-[15px] leading-5 font-bold tabular-nums"
            >
              {/* Only wide-enough segments can hold their number without clipping. */}
              {segment.count >= 4 ? segment.count : ""}
            </span>
          ))}
    </div>
  );
}

export function LegendRow({ segment }: { segment: SegmentDatum }) {
  return (
    <div className="flex min-h-11 items-center gap-3 rounded-xl px-2 text-[17px] leading-6">
      <span aria-hidden style={{ background: segment.fill }} className="size-4 shrink-0 rounded-md" />
      <span className="flex-1 text-fg">{segment.label}</span>
      <span className="font-bold tabular-nums text-fg">{segment.count}</span>
    </div>
  );
}

/** Label · proportional bar · count. Used for age and category breakdowns. */
export function MeterRow({ row, labelWidth = "w-[92px]" }: { row: BarRow; labelWidth?: string }) {
  return (
    <div className="flex min-h-11 items-center gap-3 rounded-xl px-2">
      <span className={cn("shrink-0 truncate text-[15px] leading-5 font-bold text-fg tabular-nums", labelWidth)}>
        {row.label}
      </span>
      <span className="h-6 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
        <span style={{ width: row.width }} className="block h-6 rounded-full bg-prim" />
      </span>
      <span className="w-8 shrink-0 text-right text-[17px] leading-6 font-bold tabular-nums text-fg">{row.count}</span>
    </div>
  );
}

export function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="text-[17px] leading-6 text-sub text-pretty">{children}</p>;
}
