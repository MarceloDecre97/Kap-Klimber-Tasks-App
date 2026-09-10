"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-fetch the page when somebody comes back to it.
 *
 * These screens are server-rendered and only ever refreshed by the person
 * looking at them: `router.refresh()` runs after *your* action, so a page
 * left open shows the moment it was rendered and nothing since. With four
 * people sharing one task list that is a real problem rather than a
 * theoretical one — the reminder Marcelo sets for himself is invisible to
 * Fred until Fred reloads, and worse, a reminder Marcelo has deleted keeps
 * showing on Fred's screen as though it were live.
 *
 * Refreshing when the tab becomes visible again fixes that class of
 * staleness for everything at once — reminders, notes, statuses, the lot —
 * and costs one request at the moment somebody actually looks. Polling on a
 * timer would cost a request a minute per open tab to answer a question
 * nobody was asking.
 *
 * Deliberately not a live subscription. This is four people and a phone in a
 * pocket; a websocket held open all day is a great deal of machinery for a
 * list that changes a few times an hour.
 */
export function useRefreshOnReturn(): void {
  const router = useRouter();

  useEffect(() => {
    /*
      visibilitychange covers switching tabs and, on a phone, coming back to
      the browser; focus covers moving between windows on the desktop, which
      does not always fire the first. Both are cheap and idempotent.
    */
    function onVisible() {
      if (document.visibilityState === "visible") router.refresh();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [router]);
}
