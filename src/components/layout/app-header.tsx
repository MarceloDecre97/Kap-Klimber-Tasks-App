"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Settings } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { AppClock } from "@/components/layout/app-clock";
import { BrandLogo } from "@/components/layout/brand-logo";
import { NotificationBell } from "@/components/layout/notification-bell";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { ViewNav } from "@/components/layout/view-nav";
import type { NotificationFeed } from "@/lib/data/notifications";

/**
 * The one fixed chrome bar both top-level views share.
 *
 * From `lg` up it is a single row: brand left, view switcher centred,
 * clock and controls right. On a phone none of that fits on one line, and
 * letting it wrap freely produced three ragged rows, so it folds into a
 * deliberate two:
 *
 *     [ logo ................. bell  settings ]
 *     [ view switcher .............. clock    ]
 *
 * There is still only one DOM for both. The controls group is `display:
 * contents` below `lg`, which dissolves it so the clock, the bell and
 * settings become direct children of the wrapping row and can be
 * ordered independently; at `lg` it becomes a real flex box again and the
 * two `flex-1` end zones put the switcher on the true horizontal centre.
 *
 * That first row holds exactly three things on a phone and cannot hold four.
 * Measured with both a bell and a theme toggle: 390px survives with nothing
 * to spare, and at 360px settings is pushed onto the second row and the clock
 * onto a third — the 137px header becomes 193px, back to the ragged three
 * rows this layout exists to prevent. So the notification bell takes the
 * theme toggle's slot below `lg`, and the toggle shows from `lg` up where
 * there is room for both. Nothing is lost — the same
 * toggle already sits on the Settings screen, one tap away, and it is a
 * control you use once rather than one that has to be watchable.
 */
export function AppHeader({
  current,
  notifications,
  children,
}: {
  current: "/tasks" | "/dashboard";
  notifications: NotificationFeed;
  children?: ReactNode;
}) {
  return (
    <header className="flex shrink-0 flex-col gap-2.5 border-b-[1.5px] border-border bg-card px-5 pt-[calc(env(safe-area-inset-top)+10px)] pb-3.5 lg:gap-3">
      <div className="flex flex-wrap items-center gap-2 lg:gap-3">
        <div className="order-1 flex min-w-0 items-center lg:flex-1">
          <BrandLogo width={364} height={56} className="h-6 w-auto max-w-full min-[360px]:h-7 sm:h-10 lg:h-14" priority />
        </div>

        {/*
          `grow`, never `flex-1`: a zero flex-basis would make the switcher
          look like it always fits on the first line, so it would stay there
          and squash to nothing instead of wrapping. With the default `auto`
          basis its real width decides the wrap, and `grow` then lets it fill
          the rest of the second row beside the clock.
        */}
        <div className="order-4 grow lg:order-2 lg:grow-0">
          <ViewNav current={current} />
        </div>

        <div className="contents lg:order-3 lg:flex lg:flex-1 lg:items-center lg:justify-end lg:gap-2">
          <AppClock className="order-5 lg:order-1" />
          <NotificationBell feed={notifications} className="order-2 ml-auto lg:order-2 lg:ml-0" />
          <ThemeToggle className="hidden lg:order-3 lg:ml-0 lg:inline-flex" />
          <Link href="/settings" className="order-3 lg:order-4">
            <IconButton aria-label="Settings" className="size-12 lg:size-14">
              <Settings aria-hidden className="size-5" />
            </IconButton>
          </Link>
        </div>
      </div>

      {children}
    </header>
  );
}
