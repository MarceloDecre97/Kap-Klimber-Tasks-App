"use client";

import { useEffect, useState } from "react";
import {
  APP_TIMEZONE_LABEL,
  clockParts,
  cn,
  formatClockTime,
  formatLongDate,
  getGmtOffsetLabel,
} from "@/lib/utils";

/**
 * Non-interactive readout of the app's fixed working timezone. Not a button
 * and not a picker — the zone is fixed in code, so there is nothing here to
 * press.
 *
 * Rendered client-only: a live clock cannot be server-rendered, because the
 * server's clock and the viewer's would disagree and React would flag a
 * hydration mismatch. The panel reserves its width up front so nothing in
 * the header shifts when the time appears.
 *
 * Below `lg` it is the time and nothing else.
 *
 * It used to carry the zone on a phone too, and shared row two with the view
 * switcher. A third nav segment made the switcher too wide for that, and the
 * clock wrapped onto a third row — turning a 137px header into 193px on the
 * smallest screen in the team. So on a phone it shrinks to a time chip that
 * fits beside the bell on row one, and the city and date stay on desktop
 * where there has always been room for them.
 *
 * A fourth nav segment then pushed the SETTINGS gear onto a third row, and
 * the phone chip is where the width had to come from: stacked, 24-hour, two
 * characters wide instead of "11:40 AM" on one line. Marcelo's shape. It
 * costs a glance to read a stacked time and buys the gear its place on row
 * one, which is the better trade on the screen where rows are expensive.
 *
 * On a phone it is now 44px square — exactly the bell and the gear beside
 * it. Marcelo's call, and the digits gave up the 2px it needed: three
 * unequal boxes in a row of three read as three things, and three equal ones
 * read as a set. 13px is still above the size at which two tabular digits
 * stop being legible at arm's length, which is what this has to be.
 */
export function AppClock({ className }: { className?: string }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // Tick on the next whole second, then every second, so the displayed
    // minute never lags behind the real one.
    const start = setTimeout(() => setNow(new Date()), 0);
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearTimeout(start);
      clearInterval(interval);
    };
  }, []);

  const zoneLine = `${APP_TIMEZONE_LABEL}${now ? ` (${getGmtOffsetLabel(now)})` : ""}`;
  const stacked = now ? clockParts(now) : null;

  return (
    <div
      className={cn(
        "flex shrink-0 flex-col justify-center whitespace-nowrap border-[1.5px] border-border bg-muted",
        "size-11 items-center rounded-xl px-1",
        "lg:h-14 lg:min-w-[214px] lg:items-stretch lg:gap-0.5 lg:rounded-2xl lg:px-4",
        className
      )}
    >
      <span className="hidden text-[13px] leading-4 font-bold text-fg tabular-nums lg:block">
        {now ? formatLongDate(now) : " "}
      </span>
      <span className="flex flex-col lg:flex-row lg:items-baseline lg:gap-1.5">
        <span className="hidden text-[10px] leading-[13px] italic text-sub lg:block lg:text-[13px] lg:leading-4">
          {zoneLine}
        </span>
        {/* The zone still reaches a screen reader on a phone, where the
            sighted label is only the time. */}
        <span className="sr-only lg:hidden">{zoneLine}</span>
        {/*
          Two lines on a phone, one on desktop. The full "1:19 PM" is what a
          desktop shows and what a screen reader is given in both, so the
          stacking is a visual compression rather than a loss.
        */}
        <span className="sr-only">{now ? formatClockTime(now) : ""}</span>
        <span aria-hidden className="flex flex-col items-center leading-none lg:hidden">
          <span className="text-[13px] font-bold text-fg tabular-nums">{stacked?.hour ?? ""}</span>
          <span className="my-[2px] h-[1.5px] w-4 bg-line" />
          <span className="text-[13px] font-bold text-fg tabular-nums">{stacked?.minute ?? ""}</span>
        </span>
        <span
          aria-hidden
          className="hidden text-[14px] leading-[18px] font-bold text-fg tabular-nums lg:block lg:text-[13px] lg:leading-4"
        >
          {now ? formatClockTime(now) : ""}
        </span>
      </span>
    </div>
  );
}
