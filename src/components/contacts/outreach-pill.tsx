import { Check, CheckCheck, Clock } from "lucide-react";
import { hasOpenRound, outreachLabel, type Outreach } from "@/lib/outreach";
import { cn } from "@/lib/utils";

/**
 * Where a contact stands, in one pill.
 *
 * Four states and four colours, but the quiet one is the point: "Not
 * contacted" is true of nearly everybody in a book that has just been
 * imported, so it is drawn in the border grey rather than shouting. The
 * states that mean somebody did something are the ones that catch the eye.
 *
 * Ticks rather than words for the last two, borrowed from every messaging app
 * anybody here uses: one tick sent, two ticks came back.
 */
const STYLES: Record<Outreach["state"], string> = {
  none: "border-border text-sub",
  open: "border-accent text-accent",
  contacted: "border-ok text-ok",
  in_touch: "border-link text-link",
};

const ICONS = {
  none: null,
  open: Clock,
  contacted: Check,
  in_touch: CheckCheck,
} as const;

export function OutreachPill({ outreach, className }: { outreach: Outreach; className?: string }) {
  const Icon = ICONS[outreach.state];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border-[1.5px] px-2.5 py-1 text-timestamp font-bold",
        STYLES[outreach.state],
        className
      )}
    >
      {Icon && <Icon aria-hidden className="size-[18px] shrink-0" strokeWidth={1.75} />}
      {outreachLabel(outreach)}
      {/*
        A round running on top of a finished one. A clock rather than more
        words: the pill shares a 390px row with a relationship chip, and
        "Contacted ×2, one open" is a sentence. The sentence is in the pane.
      */}
      {hasOpenRound(outreach) && (
        <Clock aria-hidden className="size-[16px] shrink-0 opacity-70" strokeWidth={1.75} />
      )}
    </span>
  );
}
