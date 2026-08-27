"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Settings } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { AppClock } from "@/components/layout/app-clock";
import { BrandLogo } from "@/components/layout/brand-logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { ViewNav } from "@/components/layout/view-nav";

/**
 * The one fixed chrome bar both top-level views share: brand left, view
 * switcher centred, controls right.
 *
 * The three zones are laid out with flex `order` rather than separate
 * mobile/desktop markup, so there is a single DOM for both. From `lg` up the
 * logo and control zones each take `flex-1`, which pins the nav to the true
 * horizontal centre of the header no matter how much wider the controls are
 * than the logo. Below `lg` the nav drops to its own full-width row, because
 * the logo and controls already fill a phone-width line.
 */
export function AppHeader({ current, children }: { current: "/tasks" | "/dashboard"; children?: ReactNode }) {
  return (
    <header className="flex shrink-0 flex-col gap-3 border-b-[1.5px] border-border bg-card px-5 pt-[calc(env(safe-area-inset-top)+10px)] pb-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="order-1 flex min-w-0 items-center lg:flex-1">
          <BrandLogo width={364} height={56} className="h-8 w-auto max-w-full sm:h-10 lg:h-14" priority />
        </div>

        <div className="order-3 w-full lg:order-2 lg:w-auto">
          <ViewNav current={current} />
        </div>

        <div className="order-2 ml-auto flex flex-wrap items-center justify-end gap-2 lg:order-3 lg:ml-0 lg:flex-1">
          <AppClock />
          <ThemeToggle />
          <Link href="/settings">
            <IconButton aria-label="Settings">
              <Settings aria-hidden className="size-5" />
            </IconButton>
          </Link>
        </div>
      </div>

      {children}
    </header>
  );
}
