"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { saveMeeting } from "@/app/meetings/actions";
import type { DetailValues } from "@/components/meetings/meeting-details";

/**
 * Saving a meeting, Marcelo's way.
 *
 * The first version autosaved the paper every 1.2 seconds and gave the
 * details panel its own Save button. He set a title, a company and an
 * attendee, left the page and came back to none of it — one half of the
 * screen had been saving itself and the other had been waiting for a button
 * he had no reason to expect. So:
 *
 * - **One button for the whole meeting.** Details and paper save together.
 * - **The button IS the indicator.** Enabled means there is something
 *   unsaved; disabled means there is not. No separate status line to read,
 *   and nothing to interpret: if it is pressable, press it.
 * - **A minute of quiet saves it anyway**, and so does clicking out of what
 *   you were typing in. The button is the fast path, not the only path —
 *   walk away mid-sentence and it lands by itself.
 *
 * What is kept from the first version is the part that actually stops work
 * being lost: a copy in this browser on every keystroke, offered back if a
 * save never landed, and the stale check that stops a phone flattening a
 * laptop. Sixty seconds is a long time to trust a network with; it is no time
 * at all to trust localStorage with.
 */

/** Quiet for this long and it saves itself. Marcelo's number. */
const AUTOSAVE_AFTER_MS = 60_000;

export type SaveState = "clean" | "dirty" | "saving" | "error" | "stale";

export interface MeetingDraft {
  details: DetailValues;
  body: string;
}

function draftKey(meetingId: string): string {
  return `kk.meeting.draft.${meetingId}`;
}

/*
  localStorage has no change event for the tab that wrote it, so the draft is
  a store this file keeps: written here, and everything reading it is told.

  This is not housekeeping. Without it `useStoredDraft` handed back whatever
  it read when the pane mounted, for ever — so clearing the draft after a
  successful save changed nothing on screen, and the "this device kept a newer
  copy" panel appeared straight after every save Marcelo made. The message was
  right about the data it had and wrong about the world.
*/
const listeners = new Set<() => void>();
let revision = 0;

function announce(): void {
  revision += 1;
  for (const listener of listeners) listener();
}

/** Every localStorage touch is wrapped: private windows and blocked data throw. */
function readDraft(meetingId: string): MeetingDraft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(meetingId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MeetingDraft>;
    if (typeof parsed.body !== "string" || !parsed.details) return null;
    return { body: parsed.body, details: parsed.details as DetailValues };
  } catch {
    return null;
  }
}

function writeDraft(meetingId: string, draft: MeetingDraft): void {
  try {
    window.localStorage.setItem(draftKey(meetingId), JSON.stringify(draft));
  } catch {
    /* Out of quota or blocked. The server save is still the real one. */
  }
  announce();
}

export function clearDraft(meetingId: string): void {
  try {
    window.localStorage.removeItem(draftKey(meetingId));
  } catch {
    /* Nothing to do, and nothing worth telling anybody about. */
  }
  announce();
}

/**
 * The draft this device is holding.
 *
 * `useSyncExternalStore` rather than an effect: localStorage does not exist
 * while this renders on the server, and an effect that calls setState to
 * correct that is a cascading render. The snapshot is cached against the
 * revision above, because getSnapshot must return a stable reference or React
 * re-renders for ever — and must return a FRESH one when the draft has
 * actually changed, or a cleared draft stays on screen.
 */
export function useStoredDraft(meetingId: string): MeetingDraft | null {
  const cache = useRef<{ key: string; at: number; value: MeetingDraft | null } | null>(null);
  const subscribe = useCallback((notify: () => void) => {
    listeners.add(notify);
    return () => {
      listeners.delete(notify);
    };
  }, []);
  const getSnapshot = useCallback(() => {
    if (cache.current?.key !== meetingId || cache.current.at !== revision) {
      cache.current = { key: meetingId, at: revision, value: readDraft(meetingId) };
    }
    return cache.current.value;
  }, [meetingId]);
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

export function useMeetingSave({
  meetingId,
  initialStamp,
  canEdit,
  onSaved,
}: {
  meetingId: string;
  initialStamp: string;
  canEdit: boolean;
  onSaved?: () => void;
}) {
  const [state, setState] = useState<SaveState>("clean");
  const [message, setMessage] = useState<string | null>(null);

  const stamp = useRef(initialStamp);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** What would be sent if a save ran now. A ref so the timer reads it live. */
  const pending = useRef<MeetingDraft | null>(null);
  const inFlight = useRef(false);

  /*
    Nothing here resets when the meeting changes, and nothing needs to: the
    pane that calls this is mounted with `key={meeting.id}`, so a different
    meeting is a different component and all of this starts over. That key is
    what lets the state below live in refs without ever being read during a
    render — which is exactly what React's rules ask for, and what an
    in-place reset could not have given.
  */

  const save = useCallback(async () => {
    const draft = pending.current;
    if (!draft || inFlight.current || !canEdit) return;
    if (timer.current) clearTimeout(timer.current);
    inFlight.current = true;
    setState("saving");

    try {
      const result = await saveMeeting(meetingId, draft.details, draft.body, stamp.current);
      if (!result.ok) {
        setState(result.stale ? "stale" : "error");
        setMessage(result.error);
        return;
      }
      stamp.current = result.savedAt;
      /*
        Only clear what was actually sent. Anything typed while the save was
        in the air is still unsaved, and throwing the draft away for it would
        be the one bug this whole file exists to prevent.
      */
      if (pending.current === draft) {
        pending.current = null;
        clearDraft(meetingId);
        setState("clean");
      } else {
        setState("dirty");
      }
      setMessage(null);
      onSaved?.();
    } finally {
      inFlight.current = false;
    }
  }, [canEdit, meetingId, onSaved]);

  /** Called on every keystroke and every field change. */
  const touch = useCallback(
    (draft: MeetingDraft) => {
      if (!canEdit) return;
      pending.current = draft;
      writeDraft(meetingId, draft);
      setState((was) => (was === "saving" ? was : "dirty"));
      setMessage(null);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void save(), AUTOSAVE_AFTER_MS);
    },
    [canEdit, meetingId, save]
  );

  /*
    Leaving, or putting the phone down mid-sentence.

    `visibilitychange` is the one that matters on Android — a phone locking or
    the app being swapped away fires it, where `beforeunload` frequently never
    runs. Both are best-effort; the local copy is what actually guarantees the
    text survives, and that is already written.
  */
  useEffect(() => {
    function onHide() {
      if (document.visibilityState === "hidden" && pending.current) void save();
    }
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [save]);

  return { state, message, save, touch, dirty: state === "dirty" };
}
