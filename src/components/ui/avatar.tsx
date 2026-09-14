import { cn } from "@/lib/utils";

export function Avatar({
  initials,
  color,
  size = 36,
  className,
}: {
  initials: string;
  color: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex items-center justify-center rounded-full font-bold text-white shrink-0", className)}
      /*
        The type scales with the circle rather than stepping between two
        fixed sizes. Two capitals at the old 15px measured 31px wide — half
        again as wide as a 20px avatar — so every small one on the card
        spilled its letters over the edge, and the 56px one on Settings was
        left looking under-filled at 16px.

        0.42 is the largest ratio that clears every size in use: measured
        against "WM", the widest realistic pair, it leaves 3px inside a 20px
        circle and 6px inside a 56px one. 0.45 leaves 1px at 20px, which one
        different font on one phone would eat.
      */
      style={{ width: size, height: size, background: color, fontSize: Math.round(size * 0.42) }}
    >
      {initials}
    </span>
  );
}
