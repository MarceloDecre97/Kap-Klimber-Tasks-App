"use client";

import { useEffect, useState } from "react";
import { APP_TIMEZONE_LABEL, formatClockTime, formatLongDate, getGmtOffsetLabel } from "@/lib/utils";

/**
 * Non-interactive readout of the app's fixed working timezone. Not a button
 * and not a picker — the zone is fixed in code, so there is nothing here to
 * press.
 *
 * Rendered client-only: a live clock cannot be server-rendered, because the
 * server's clock and the viewer's would disagree and React would flag a
 * hydration mismatch. The panel reserves its width up front so nothing in
 * the header shifts when the time appears.
 */
export function AppClock() {
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
    <div className="flex h-14 min-w-[214px] shrink-0 flex-col justify-center gap-0.5 rounded-2xl border-[1.5px] border-border bg-muted px-4 whitespace-nowrap">
      <span className="text-[13px] leading-4 font-bold text-fg tabular-nums">
        {now ? formatLongDate(now) : " "}
      </span>
      <span className="flex items-baseline gap-1.5 text-[13px] leading-4">
        <span className="italic text-sub">{zoneLine}</span>
        <span className="font-bold text-fg tabular-nums">{now ? formatClockTime(now) : ""}</span>
      </span>
    </div>
  );
}
