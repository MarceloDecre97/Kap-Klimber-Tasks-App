"use client";

import Image from "next/image";
import { useTheme } from "next-themes";
import { useHasMounted } from "@/lib/use-has-mounted";

/**
 * The wordmark uses a near-black fill that needs to flip light for dark
 * backgrounds, but the brand maroon icon accent must stay maroon in both
 * themes — a blanket CSS `invert` filter (the previous approach) inverted
 * both colours at once, turning the maroon icon cyan. Swapping to a
 * pre-built dark variant SVG (same paths, only the wordmark fill changed)
 * keeps the icon colour correct in both modes.
 */
export function BrandLogo({
  width,
  height,
  className,
  priority,
}: {
  width: number;
  height: number;
  className?: string;
  priority?: boolean;
}) {
  const { resolvedTheme } = useTheme();
  const mounted = useHasMounted();
  const isDark = mounted && resolvedTheme === "dark";

  return (
    <Image
      src={isDark ? "/kap-klimber-logo-dark.svg" : "/kap-klimber-logo.svg"}
      alt="Kap Klimber"
      width={width}
      height={height}
      className={className}
      priority={priority}
    />
  );
}
