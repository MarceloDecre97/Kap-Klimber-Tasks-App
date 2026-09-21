"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { returnToQuery } from "@/lib/return-to";
import { Settings } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { AppClock } from "@/components/layout/app-clock";
import { BrandLogo } from "@/components/layout/brand-logo";
import { NotificationBell } from "@/components/layout/notification-bell";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { ViewNav, type ViewHref } from "@/components/layout/view-nav";
import type { NotificationFeed } from "@/lib/data/notifications";

/**
 * The one fixed chrome bar every top-level view shares.
 *
 * From `lg` up it is a single row: brand left, view switcher centred,
 * clock and controls right. On a phone none of that fits on one line, and
 * letting it wrap freely produced three ragged rows, so it folds into a
 * deliberate two:
 *
 *     [ logo ......... clock  bell  settings ]
 *     [ view switcher ....................... ]
 *
 * There is still only one DOM for both. The controls group is `display:
 * contents` below `lg`, which dissolves it so the clock, the bell and
 * settings become direct children of the wrapping row and can be
 * ordered independently; at `lg` it becomes a real flex box again and the
 * two `flex-1` end zones put the switcher on the true horizontal centre.
 *
 * Row one holds four things on a phone — logo, clock, bell, gear — and it
 * took three separate concessions to make them fit, each measured at 360px
 * where 320px of width is all there is:
 *
 *   - the clock stacked to two characters (44px, was 74) and went 24-hour,
 *     because "11:40 AM" on one line has no shorter form;
 *   - the bell and the gear dropped to 44px, still the floor for a thumb;
 *   - the logo stopped growing at 360px and stays at its smallest step.
 *
 * Together: 286px against 320px. Before them the total was exactly 320px,
 * which rounding pushed over, and the gear fell to a third row — a 183px
 * header where this layout exists to produce a 127px one. At 320px it is
 * three rows again, which is rare and is where it already was.
 *
 * The theme toggle stays off the phone entirely. Nothing is lost: the same
 * toggle sits on the Settings screen, one tap away, and it is a control you
 * use once rather than one that has to be watchable.
 */
export function AppHeader({
  current,
  notifications,
  children,
}: {
  current: ViewHref;
  notifications: NotificationFeed;
  children?: ReactNode;
}) {
  const pathname = usePathname();
  return (
    <header className="flex shrink-0 flex-col gap-2.5 border-b-[1.5px] border-border bg-card px-5 pt-[calc(env(safe-area-inset-top)+10px)] pb-3.5 lg:gap-3">
      <div className="flex flex-wrap items-center gap-2 lg:gap-3">
        <div className="order-1 flex min-w-0 items-center lg:flex-1">
          {/*
            A step smaller below `sm`, and it stays at that step now rather
            than growing at 360px: row one carries four things on a phone —
            logo, clock, bell, gear — and at 360px the old h-6 logo put the
            total at exactly the 320px available, which rounding then pushed
            over and the gear fell to a third row. The logo is still the only
            element here that can give up width without losing meaning.
          */}
          <BrandLogo width={364} height={56} className="h-5 w-auto max-w-full sm:h-10 lg:h-14" priority />
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
          {/*
            On a phone the clock sits on row one now. With three nav
            segments the switcher needs the whole of row two, and the clock
            wrapping to a third row cost 56px of a small screen.
          */}
          <AppClock className="order-2 ml-auto lg:order-1 lg:ml-0" />
          <NotificationBell feed={notifications} className="order-3 lg:order-2 lg:ml-0" />
          <ThemeToggle className="hidden lg:order-3 lg:ml-0 lg:inline-flex" />
          {/*
            The gear carries the screen it was pressed on, so Settings can
            send somebody back to it. Without this every route out of
            Settings ended at the Tasklist, whichever book you came from.
          */}
          <Link href={`/settings${returnToQuery(pathname)}`} className="order-4 lg:order-4">
            <IconButton aria-label="Settings" className="size-11 sm:size-12 lg:size-14">
              <Settings aria-hidden className="size-5" />
            </IconButton>
          </Link>
        </div>
      </div>

      {children}
    </header>
  );
}
