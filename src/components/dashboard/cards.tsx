import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { BarRow, FlowWeek, SegmentDatum } from "@/lib/dashboard-stats";

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

/**
 * Four weeks of work in against work out, as paired vertical bars.
 *
 * Both series share one scale, so the two bars in a week are directly
 * comparable — that comparison is the whole reason the chart exists. Reading
 * it is one question: is the right-hand bar keeping up with the left?
 *
 * A count sits above each bar and the weekly totals repeat underneath, so
 * the chart never depends on bar height or hue alone to be read.
 */
export function FlowChart({ weeks }: { weeks: FlowWeek[] }) {
  const net = weeks.reduce((n, w) => n + w.created - w.completed, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-2" role="img"
        aria-label={weeks
          .map((w) => `Week of ${w.label}: ${w.created} created, ${w.completed} completed`)
          .join(". ")}
      >
        {weeks.map((week) => (
          <div key={week.key} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <div className="flex h-24 w-full items-end justify-center gap-1">
              <span className="flex h-full flex-1 flex-col justify-end" title={`${week.created} created`}>
                <span className="text-center text-[13px] leading-4 font-bold tabular-nums text-sub">
                  {week.created}
                </span>
                <span
                  className="w-full rounded-t-[3px] bg-muted-fg"
                  style={{ height: week.createdHeight, minHeight: week.created > 0 ? "3px" : "0" }}
                />
              </span>
              <span className="flex h-full flex-1 flex-col justify-end" title={`${week.completed} completed`}>
                <span className="text-center text-[13px] leading-4 font-bold tabular-nums text-brand">
                  {week.completed}
                </span>
                <span
                  className="w-full rounded-t-[3px] bg-brand"
                  style={{ height: week.completedHeight, minHeight: week.completed > 0 ? "3px" : "0" }}
                />
              </span>
            </div>
            <span className="w-full truncate text-center text-[13px] leading-4 text-sub">{week.label}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px] leading-5">
        <span className="inline-flex items-center gap-1.5 text-sub">
          <span aria-hidden className="size-3 rounded-[3px] bg-muted-fg" />
          Created
        </span>
        <span className="inline-flex items-center gap-1.5 text-sub">
          <span aria-hidden className="size-3 rounded-[3px] bg-brand" />
          Completed
        </span>
      </div>

      {/*
        The number that actually answers "are we falling behind": everything
        that arrived over four weeks, minus everything that left. Positive
        means the backlog grew.
      */}
      <p className="text-[15px] leading-5 text-sub text-pretty">
        {net === 0
          ? "Over four weeks, exactly as much finished as arrived."
          : net > 0
            ? `Over four weeks the backlog grew by ${net} ${net === 1 ? "task" : "tasks"}.`
            : `Over four weeks the backlog shrank by ${Math.abs(net)} ${Math.abs(net) === 1 ? "task" : "tasks"}.`}
      </p>
    </div>
  );
}
