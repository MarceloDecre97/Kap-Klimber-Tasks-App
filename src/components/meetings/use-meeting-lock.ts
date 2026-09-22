"use client";

import { useCallback, useEffect, useState } from "react";
import { claimMeetingLock, releaseMeetingLock } from "@/app/meetings/actions";

/**
 * One device writes the minutes at a time.
 *
 * The stale check has always stopped a second screen flattening the first —
 * but only after a paragraph has been typed into it. Marcelo writes on a
 * laptop and, when it dies or the call is on speaker, on a phone, so the same
 * minutes are genuinely open twice on his own account. This stops the typing
 * rather than the saving: whoever opens the write box holds it, and the other
 * device gets the minutes to read and a line saying where they are being
 * written.
 *
 * A LEASE, not a lock. A phone that dies mid-meeting, a lid closed, a tab the
 * OS kills — none of those release anything, and a lock nobody can take back
 * would lock Marcelo out of his own minutes with no way in. So it is
 * refreshed while the box is open and expires sixty seconds after the
 * refreshes stop. This heartbeat is a third of that: two may be lost to a bad
 * tunnel before anybody else can take it.
 */

const HEARTBEAT_MS = 20_000;
const DEVICE_KEY = "kk.device";

/**
 * This browser, not this person.
 *
 * Read lazily and never during a render, so it costs nothing on the server,
 * where neither `localStorage` nor `crypto` exists. Every access is wrapped:
 * a private window or blocked site data throws rather than returning null,
 * and a device that cannot remember its own id simply gets a new one each
 * time — which still works, because an abandoned lease expires.
 */
let cachedDevice: string | null = null;

function deviceId(): string {
  if (cachedDevice) return cachedDevice;
  try {
    const stored = window.localStorage.getItem(DEVICE_KEY);
    if (stored && stored.length >= 8 && stored.length <= 64) {
      cachedDevice = stored;
      return stored;
    }
  } catch {
    /* Blocked storage. A fresh id below still works. */
  }
  const made = `d-${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`;
  try {
    window.localStorage.setItem(DEVICE_KEY, made);
  } catch {
    /* Nothing to do, and nothing worth telling anybody about. */
  }
  cachedDevice = made;
  return made;
}

export type MeetingLockState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "mine" }
  | { status: "theirs"; holder: string | null }
  | { status: "error"; message: string };

export function useMeetingLock({
  meetingId,
  active,
}: {
  meetingId: string;
  /** True while the write box is what the person is asking for. */
  active: boolean;
}): MeetingLockState {
  /*
    Only the answer is stored, and it is stamped with the question it answers.
    "Idle" and "checking" are then DERIVED, which keeps every setState here
    inside an async callback — a setState in the body of an effect is a
    cascading render, and React's lint says so. It also makes a stale answer
    harmless: switch meeting, and the old reply no longer matches the key.
  */
  const [answer, setAnswer] = useState<{ key: string; state: MeetingLockState } | null>(null);
  const key = `${meetingId}:${active}`;

  const release = useCallback((id: string) => {
    void releaseMeetingLock(meetingId, id);
  }, [meetingId]);

  useEffect(() => {
    if (!active) return;

    let live = true;
    const id = deviceId();

    async function beat() {
      const result = await claimMeetingLock(meetingId, id);
      if (!live) return;
      setAnswer({
        key: `${meetingId}:true`,
        state: !result.ok
          ? { status: "error", message: result.error }
          : result.lock.heldByMe
            ? { status: "mine" }
            : { status: "theirs", holder: result.lock.holder },
      });
    }

    void beat();
    const timer = setInterval(() => void beat(), HEARTBEAT_MS);

    /*
      Closing the tab or locking the phone. Best effort, and deliberately so:
      `pagehide` fires most of the time and a flat battery fires nothing,
      which is what the sixty-second expiry is for. This is the fast path that
      stops the OTHER device waiting a minute for no reason.
    */
    function letGo() {
      release(id);
    }
    window.addEventListener("pagehide", letGo);

    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener("pagehide", letGo);
      release(id);
    };
  }, [meetingId, active, release]);

  if (!active) return { status: "idle" };
  return answer?.key === key ? answer.state : { status: "checking" };
}
