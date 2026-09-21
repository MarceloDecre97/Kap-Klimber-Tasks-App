"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

/*
  Four segments since meetings arrived, and the labels shortened to pay for
  it. "Tasklist" and "Dashboard" were nine letters each against a row that
  had already dropped to px-2 to fit three; a fourth needed the words to give
  ground rather than the padding. Measured at 360px before it shipped.

  "Tasks" and "Board" say the same thing in half the width, and "Meetings"
  earns its place on the row rather than hiding behind Contacts: it is opened
  mid-call with a customer waiting, which is the one screen in this app where
  a second tap is a real cost.
*/
const VIEWS = [
  { href: "/tasks", label: "Tasks" },
  { href: "/dashboard", label: "Board" },
  { href: "/contacts", label: "Contacts" },
  { href: "/meetings", label: "Meetings" },
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
              // px-1.5 below sm, because a fourth segment arrived. The labels
              // shortened at the same time; between them the row fits 360px.
              "flex h-12 flex-1 items-center justify-center whitespace-nowrap rounded-full px-1.5 sm:px-3 lg:px-5",
              "text-[14px] leading-6 font-bold transition-colors duration-150 sm:text-[15px] lg:text-[17px]",
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
