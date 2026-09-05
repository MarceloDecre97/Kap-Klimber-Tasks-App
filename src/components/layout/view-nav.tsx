"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

const VIEWS = [
  { href: "/tasks", label: "Tasklist" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/contacts", label: "Contacts" },
] as const;

export type ViewHref = (typeof VIEWS)[number]["href"];

/**
 * Segmented switch between the top-level views. Rendered as real links
 * (not buttons) so the browser can prefetch, middle-click and back-button
 * them like any other navigation, while `aria-current` carries the selected
 * state for assistive tech — the filled pill alone is colour-only.
 */
export function ViewNav({ current, className }: { current: ViewHref; className?: string }) {
  return (
    <nav
      aria-label="Views"
      className={cn("flex gap-1 rounded-full bg-muted p-1", className)}
    >
      {VIEWS.map((view) => {
        const isCurrent = view.href === current;
        return (
          <Link
            key={view.href}
            href={view.href}
            aria-current={isCurrent ? "page" : undefined}
            className={cn(
              // px-2 below sm, because a third segment arrived: at 360px
              // "Dashboard" is the widest label and px-3 pushed the row over.
              "flex h-12 flex-1 items-center justify-center whitespace-nowrap rounded-full px-2 sm:px-3 lg:px-5",
              "text-[15px] leading-6 font-bold transition-colors duration-150 lg:text-[17px]",
              isCurrent ? "bg-prim text-on-prim" : "text-muted-fg hover:text-fg"
            )}
          >
            {view.label}
          </Link>
        );
      })}
    </nav>
  );
}
