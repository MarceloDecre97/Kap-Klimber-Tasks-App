import clsx, { type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

const dateFormatter = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short" });
const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});
const timeFormatter = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "Today, 4:00 PM" / "Tomorrow, 9:00 AM" / "27 Aug, 9:00 AM" */
export function formatReminder(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  if (isSameDay(date, now)) return `Today, ${timeFormatter.format(date)}`;
  if (isSameDay(date, tomorrow)) return `Tomorrow, ${timeFormatter.format(date)}`;
  return dateTimeFormatter.format(date);
}

export function formatDateGroup(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

export function formatTimestamp(iso: string): string {
  return dateTimeFormatter.format(new Date(iso));
}
