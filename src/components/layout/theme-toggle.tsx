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
        "inline-flex shrink-0 items-center justify-center gap-2 text-chip cursor-pointer",
        "size-12 rounded-2xl lg:h-14 lg:w-auto lg:rounded-full lg:px-4",
        "bg-muted border-[1.5px] border-border text-fg transition-transform duration-150 active:scale-[0.97]",
        className
      )}
    >
      {mounted &&
        (isDark ? (
          <Sun aria-hidden className="size-5 lg:size-4" />
        ) : (
          <Moon aria-hidden className="size-5 lg:size-4" />
        ))}
      {/*
        The label only appears where there is room for it, and in a
        fixed-width box: "Light" and "Dark" are different widths, so an
        auto-width label moved the button — and, once the header wrapped,
        everything laid out after it — on every theme change.
      */}
      <span className="hidden w-11 text-left lg:inline-block">
        {mounted ? (isDark ? "Light" : "Dark") : "Theme"}
      </span>
    </button>
  );
}
