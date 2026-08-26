import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  CircleDot,
  Circle,
  Clock,
  Equal,
  Moon,
  Eye,
  type LucideIcon,
} from "lucide-react";
import type { Priority, TaskStatus } from "@/lib/supabase/database.types";

export interface BadgeTone {
  bg: string;
  fg: string;
  border: string;
}

export interface BadgeSpec extends BadgeTone {
  value: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Every priority/status value is carried by an icon + a word, never colour
 * alone — so these still read correctly in greyscale or for colour-blind
 * teammates. Light-mode tones; dark mode remixes the same hues via the
 * `.dark` class in a wrapper if that's ever needed, but the tones below
 * already have enough contrast to hold up on the dark card background too.
 */
export const PRIORITIES: Record<Priority, BadgeSpec> = {
  asap: { value: "asap", label: "ASAP", icon: AlertTriangle, bg: "#FEE2E2", fg: "#991B1B", border: "#FCA5A5" },
  high: { value: "high", label: "High", icon: ArrowUp, bg: "#FFEDD5", fg: "#9A3412", border: "#FDBA74" },
  medium: { value: "medium", label: "Medium", icon: Equal, bg: "#FEF3C7", fg: "#92400E", border: "#FCD34D" },
  low: { value: "low", label: "Low", icon: ArrowDown, bg: "#E0E7FF", fg: "#3730A3", border: "#A5B4FC" },
  someday: { value: "someday", label: "Someday", icon: Moon, bg: "#F1F5F9", fg: "#475569", border: "#CBD5E1" },
};

export const STATUSES: Record<TaskStatus, BadgeSpec> = {
  not_started: { value: "not_started", label: "Not started", icon: Circle, bg: "#F1F5F9", fg: "#334155", border: "#CBD5E1" },
  in_progress: { value: "in_progress", label: "In progress", icon: CircleDot, bg: "#DBEAFE", fg: "#1E3A8A", border: "#93C5FD" },
  for_review: { value: "for_review", label: "For review", icon: Eye, bg: "#EDE9FE", fg: "#5B21B6", border: "#C4B5FD" },
  waiting: { value: "waiting", label: "Waiting", icon: Clock, bg: "#CCFBF1", fg: "#115E59", border: "#5EEAD4" },
  complete: { value: "complete", label: "Complete", icon: CheckCircle2, bg: "#DCFCE7", fg: "#166534", border: "#86EFAC" },
};

export const PRIORITY_ORDER: Priority[] = ["asap", "high", "medium", "low", "someday"];
export const STATUS_ORDER: TaskStatus[] = ["not_started", "in_progress", "for_review", "waiting", "complete"];

export const PRIORITY_RANK: Record<Priority, number> = Object.fromEntries(
  PRIORITY_ORDER.map((p, i) => [p, i])
) as Record<Priority, number>;

export const AVATAR_COLOR_PALETTE = [
  "#87252B",
  "#0F172A",
  "#166534",
  "#1E3A8A",
  "#92400E",
  "#5B21B6",
  "#115E59",
];
