"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useHasMounted } from "@/lib/use-has-mounted";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useHasMounted();

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label="Switch colour mode"
      className={cn(
        "inline-flex items-center gap-2 h-14 px-4 rounded-full text-chip cursor-pointer",
        "bg-muted border-[1.5px] border-border text-fg transition-transform duration-150 active:scale-[0.97]",
        className
      )}
    >
      {mounted && (isDark ? <Sun aria-hidden className="size-4" /> : <Moon aria-hidden className="size-4" />)}
      {mounted ? (isDark ? "Light" : "Dark") : "Theme"}
    </button>
  );
}
