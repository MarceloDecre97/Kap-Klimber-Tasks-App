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
 * All formatters below accept an optional IANA `timeZone`. When omitted,
 * `Intl.DateTimeFormat` falls back to the browser's local zone, so existing
 * callers that don't care about the timezone selector keep working as-is.
 */
function dateGroupKeyFormatter(timeZone?: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
}
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
function timeFormatter(timeZone?: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone });
}

/** Calendar-day key (e.g. "2026-08-27") for `date`, as seen in `timeZone`. */
export function zonedDateKey(date: Date, timeZone?: string): string {
  return dateGroupKeyFormatter(timeZone).format(date);
}

function isSameZonedDay(a: Date, b: Date, timeZone?: string) {
  return zonedDateKey(a, timeZone) === zonedDateKey(b, timeZone);
}

/** e.g. "CST" / "CDT" for the given zone at the given instant. */
export function getZoneAbbreviation(timeZone: string, date: Date = new Date()): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? "";
}

/** "Today, 4:00 PM" / "Tomorrow, 9:00 AM" / "27 Aug, 9:00 AM" */
export function formatReminder(iso: string, timeZone?: string): string {
  const date = new Date(iso);
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  if (isSameZonedDay(date, now, timeZone)) return `Today, ${timeFormatter(timeZone).format(date)}`;
  if (isSameZonedDay(date, tomorrow, timeZone)) return `Tomorrow, ${timeFormatter(timeZone).format(date)}`;
  return dateTimeFormatter(timeZone).format(date);
}

export function formatDateGroup(iso: string, timeZone?: string): string {
  return dateFormatter(timeZone).format(new Date(iso));
}

export function formatTimestamp(iso: string): string {
  return dateTimeFormatter().format(new Date(iso));
}

/** "4:00 PM" in the given zone. */
export function formatTimeOfDay(iso: string, timeZone?: string): string {
  return timeFormatter(timeZone).format(new Date(iso));
}
