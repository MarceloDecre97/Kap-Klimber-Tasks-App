"use client";

import { useEffect, useState } from "react";
import { APP_TIMEZONE_LABEL, cn, formatClockTime, formatLongDate, getGmtOffsetLabel } from "@/lib/utils";

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

  return (
    <div
      className={cn(
        "flex shrink-0 flex-col justify-center whitespace-nowrap border-[1.5px] border-border bg-muted",
        "h-12 min-w-[74px] items-center rounded-xl px-2",
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
        <span className="text-[14px] leading-[18px] font-bold text-fg tabular-nums lg:text-[13px] lg:leading-4">
          {now ? formatClockTime(now) : ""}
        </span>
      </span>
    </div>
  );
}
