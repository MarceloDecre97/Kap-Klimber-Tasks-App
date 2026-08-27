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
 * The whole app runs on one fixed timezone: the team shares a single
 * schedule, so a reminder set for 9:00 AM reads 9:00 AM to everyone
 * regardless of where they are sitting. Every formatter below defaults to
 * it — nothing renders in the viewer's local zone.
 */
export const APP_TIMEZONE = "America/Chicago";

/** How the fixed zone is named in the UI. */
export const APP_TIMEZONE_LABEL = "Chicago, IL";

function dateFormatter(timeZone: string = APP_TIMEZONE) {
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", timeZone });
}
function dateTimeFormatter(timeZone: string = APP_TIMEZONE) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

/**
 * Calendar-day key ("2026-08-27") for `date` as seen in `timeZone`. Sortable
 * and directly comparable against a SQL `date` column's string value.
 */
export function zonedDateKey(date: Date, timeZone: string = APP_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/**
 * Whole days between two "YYYY-MM-DD" keys (b - a). Both are parsed at UTC
 * midnight so the subtraction is exact integer days, never off-by-one from
 * a DST shift in the viewer's zone.
 */
export function daysBetweenKeys(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/**
 * "GMT-5" / "GMT-6" for the app's zone at a given instant — derived, never
 * hardcoded, so it follows Chicago across the daylight-saving switch instead
 * of silently going an hour wrong every November.
 */
export function getGmtOffsetLabel(date: Date = new Date(), timeZone: string = APP_TIMEZONE): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? "";
}

/** "Thursday, August 27, 2026" in the app's zone. */
export function formatLongDate(date: Date, timeZone: string = APP_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone,
  }).format(date);
}

/** "1:19 PM" in the app's zone. */
export function formatClockTime(date: Date, timeZone: string = APP_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  }).format(date);
}

/**
 * Wall-clock fields of `date` as they read in `timeZone`.
 */
function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);

  const map: Record<string, string> = {};
  for (const part of parts) map[part.type] = part.value;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    // Some engines render midnight as "24" under hour12:false.
    hour: Number(map.hour) % 24,
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

/** The zone's UTC offset, in ms, at the given instant. */
function zoneOffsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - date.getTime();
}

/** "YYYY-MM-DD" of `iso` as it reads in the app's zone — for a date input. */
export function toZonedDateInput(iso: string, timeZone: string = APP_TIMEZONE): string {
  return zonedDateKey(new Date(iso), timeZone);
}

/** "HH:mm" of `iso` as it reads in the app's zone — for a time input. */
export function toZonedTimeInput(iso: string, timeZone: string = APP_TIMEZONE): string {
  const p = zonedParts(new Date(iso), timeZone);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

/**
 * Turns a wall-clock date + time the user typed into the UTC instant it
 * refers to **in the app's zone**, not in whoever's browser typed it.
 *
 * Without this, someone entering "9:00 AM" from a different timezone would
 * store a different instant than a teammate in Chicago entering the same
 * thing, and it would read back at the wrong hour.
 *
 * Two passes: the first estimates the offset, the second re-checks it at the
 * estimated instant so a time that lands on a daylight-saving boundary still
 * resolves correctly.
 */
export function zonedWallClockToIso(
  dateStr: string,
  timeStr: string,
  timeZone: string = APP_TIMEZONE
): string {
  const naive = Date.parse(`${dateStr}T${timeStr}:00Z`);
  if (Number.isNaN(naive)) throw new Error(`Invalid date/time: ${dateStr} ${timeStr}`);

  let ts = naive - zoneOffsetMs(new Date(naive), timeZone);
  ts = naive - zoneOffsetMs(new Date(ts), timeZone);
  return new Date(ts).toISOString();
}

/** "27 Aug", converting the instant `iso` into the app's zone. */
export function formatDateGroup(iso: string, timeZone?: string): string {
  return dateFormatter(timeZone).format(new Date(iso));
}

export function formatTimestamp(iso: string, timeZone?: string): string {
  return dateTimeFormatter(timeZone).format(new Date(iso));
}

/**
 * "27 Aug" for a plain SQL `date` value ("2026-08-27"), which carries no
 * time-of-day and no zone of its own. Parsed AND formatted in UTC so the
 * calendar day is a fixed label that can never shift by a day — unlike a
 * timestamp, a due date means the same thing everywhere.
 */
export function formatCalendarDate(dateStr: string): string {
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${dateStr}T00:00:00Z`)
  );
}
