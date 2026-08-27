import clsx, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * clsx alone only concatenates — when a caller passes a conflicting
 * override (e.g. `className="w-14"` against a component's own `w-full`),
 * which one wins depends on Tailwind's internal stylesheet order, not on
 * where the class appears in the string. twMerge resolves same-property
 * conflicts by keeping the last one, matching what callers actually intend.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/**
 * All formatters below that take a `timeZone` accept an optional IANA zone.
 * When omitted, `Intl.DateTimeFormat` falls back to the browser's local
 * zone, so existing callers that don't care about the timezone selector
 * keep working as-is.
 */
function dateFormatter(timeZone?: string) {
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", timeZone });
}
function dateTimeFormatter(timeZone?: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

/** e.g. "CST" / "CDT" for the given zone at the given instant. */
export function getZoneAbbreviation(timeZone: string, date: Date = new Date()): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? "";
}

/** "27 Aug", converting the instant `iso` into the given zone. */
export function formatDateGroup(iso: string, timeZone?: string): string {
  return dateFormatter(timeZone).format(new Date(iso));
}

export function formatTimestamp(iso: string, timeZone?: string): string {
  return dateTimeFormatter(timeZone).format(new Date(iso));
}

/**
 * "27 Aug" for a plain SQL `date` value ("2026-08-27") with no time-of-day
 * or timezone of its own. Parsed and formatted both in the browser's local
 * zone (no explicit `timeZone`) so the calendar day never shifts depending
 * on the viewer's location — a due date is the same day everywhere.
 */
export function formatCalendarDate(dateStr: string): string {
  return dateFormatter().format(new Date(`${dateStr}T00:00:00`));
}
