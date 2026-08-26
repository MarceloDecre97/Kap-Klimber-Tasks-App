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
      style={{ width: size, height: size, background: color, fontSize: size <= 32 ? 15 : 16 }}
    >
      {initials}
    </span>
  );
}
