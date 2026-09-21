"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AlertTriangle, Check, Loader2, RotateCcw } from "lucide-react";
import { saveMeetingBody } from "@/app/meetings/actions";
import { cn } from "@/lib/utils";

/**
 * The paper.
 *
 * Of everything in this feature, this is the part that decides whether it
 * gets used. Marcelo named "issues with saving, things get lost" as one of
 * the four things that would send him back to Word, and he types into this
 * while half-listening to a customer. So the rules here are not about
 * features, they are about never losing a sentence:
 *
 * 1. No Save button. A button you have to remember mid-call is a button you
 *    forget mid-call. It saves on a pause in typing, and says so.
 *
 * 2. A copy in the browser, written on every keystroke. The server save is
 *    debounced and can fail — a dead tunnel, a dropped signal in a yard, a
 *    closed laptop. The local copy has none of those failure modes, so what
 *    you typed survives even when the save did not, and is offered back on
 *    the way in.
 *
 * 3. The save state is on screen at all times, in words. "Saving…", "Saved",
 *    or an amber line if something went wrong. Silence is what makes people
 *    press Ctrl-S at a keyboard that has no Ctrl-S.
 *
 * 4. A second screen never flattens the first. He writes on a laptop and, when
 *    the laptop dies or the call is on speaker, on a phone — so the same
 *    minutes can genuinely be open twice. The save carries the timestamp it
 *    last saw and the database refuses when the row has moved on, and then
 *    this offers to reload rather than overwriting work it never had.
 */

/** Long enough that a fast typist isn't saving mid-word; short enough to feel safe. */
const SAVE_AFTER_MS = 1200;
/** A slow save says so rather than sitting silent. */
const SLOW_AFTER_MS = 4000;

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error" | "stale";

function draftKey(meetingId: string): string {
  return `kk.meeting.draft.${meetingId}`;
}

/** Every localStorage touch is wrapped: private windows and blocked site data throw. */
function readDraft(meetingId: string): { body: string; at: number } | null {
  try {
    const raw = window.localStorage.getItem(draftKey(meetingId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { body?: unknown; at?: unknown };
    if (typeof parsed.body !== "string" || typeof parsed.at !== "number") return null;
    return { body: parsed.body, at: parsed.at };
  } catch {
    return null;
  }
}

function writeDraft(meetingId: string, body: string): void {
  try {
    window.localStorage.setItem(draftKey(meetingId), JSON.stringify({ body, at: Date.now() }));
  } catch {
    /* Out of quota or blocked. The server save is still the real one. */
  }
}

function clearDraft(meetingId: string): void {
  try {
    window.localStorage.removeItem(draftKey(meetingId));
  } catch {
    /* Nothing to do, and nothing worth telling anybody about. */
  }
}

/**
 * The draft this device is holding, if any.
 *
 * `useSyncExternalStore` rather than reading it in an effect: localStorage
 * does not exist while this renders on the server, and an effect that calls
 * setState to correct that is both a cascading render and the thing the
 * lint rule exists to stop. This is the shape React provides for exactly
 * this — a value the server cannot see and the client can.
 *
 * The snapshot is cached because getSnapshot must return the same reference
 * every call or React re-renders for ever, and localStorage hands back a
 * fresh string each time.
 */
function useStoredDraft(meetingId: string): string | null {
  const cache = useRef<{ key: string; value: string | null } | null>(null);
  const subscribe = useCallback(() => () => {}, []);
  const getSnapshot = useCallback(() => {
    if (cache.current?.key !== meetingId) {
      cache.current = { key: meetingId, value: readDraft(meetingId)?.body ?? null };
    }
    return cache.current.value;
  }, [meetingId]);
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

export function MeetingEditor({
  meetingId,
  initialBody,
  initialStamp,
  canEdit,
  onSaved,
}: {
  meetingId: string;
  initialBody: string;
  /** The row's updated_at when it was read. The stale check compares to this. */
  initialStamp: string;
  canEdit: boolean;
  onSaved?: () => void;
}) {
  const [body, setBody] = useState(initialBody);
  const [state, setState] = useState<SaveState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  /*
    A local copy left by a save that never landed — offered, never applied.
    Derived rather than stored, so there is nothing to keep in step.
  */
  const storedDraft = useStoredDraft(meetingId);
  const [draftDismissed, setDraftDismissed] = useState(false);
  const recovered =
    !draftDismissed && storedDraft !== null && storedDraft !== initialBody ? storedDraft : null;

  const stamp = useRef(initialStamp);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);
  const inFlight = useRef(false);

  /*
    Written as a loop rather than as a function that calls itself again for
    whatever was typed while the last save was in the air. Same behaviour,
    and it keeps the callback from referencing its own identity — which is
    both a lint error and a real footgun, since the recursive call would be
    reaching for whichever version of itself the closure happened to catch.
  */
  const flush = useCallback(async () => {
    if (inFlight.current || pending.current === null) return;
    inFlight.current = true;
    slowTimer.current = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    setState("saving");

    try {
      while (pending.current !== null) {
        const next = pending.current;
        pending.current = null;

        const result = await saveMeetingBody(meetingId, next, stamp.current);

        if (!result.ok) {
          setState(result.stale ? "stale" : "error");
          setMessage(result.error);
          return;
        }

        stamp.current = result.savedAt;
        clearDraft(meetingId);
        setMessage(null);
      }
      setState("saved");
      onSaved?.();
    } finally {
      if (slowTimer.current) clearTimeout(slowTimer.current);
      setSlow(false);
      inFlight.current = false;
    }
  }, [meetingId, onSaved]);

  const change = useCallback(
    (next: string) => {
      setBody(next);
      setState("dirty");
      setMessage(null);
      writeDraft(meetingId, next);
      pending.current = next;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_AFTER_MS);
    },
    [flush, meetingId]
  );

  /*
    Leaving the page, or putting the phone down mid-sentence.

    `visibilitychange` is the one that matters on Android: a phone locking or
    the app being swapped away fires it, where `beforeunload` frequently
    never runs at all. Both are best-effort — the local copy is what actually
    guarantees the text survives.
  */
  useEffect(() => {
    function onHide() {
      if (document.visibilityState === "hidden" && pending.current !== null) void flush();
    }
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      if (timer.current) clearTimeout(timer.current);
      if (slowTimer.current) clearTimeout(slowTimer.current);
    };
  }, [flush]);

  const status = (() => {
    if (!canEdit) return { text: "Read only — written by somebody else", tone: "quiet" as const };
    if (state === "stale") return { text: "Changed somewhere else", tone: "warn" as const };
    if (state === "error") return { text: "Not saved yet", tone: "warn" as const };
    if (state === "saving") return { text: slow ? "Still saving…" : "Saving…", tone: "busy" as const };
    if (state === "dirty") return { text: "Unsaved changes", tone: "quiet" as const };
    if (state === "saved") return { text: "Saved", tone: "ok" as const };
    return { text: "Saved", tone: "quiet" as const };
  })();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {/*
        The recovered draft, before the paper rather than after it: it is
        about the words you are looking at, and a notice underneath them is a
        notice nobody reads.
      */}
      {recovered !== null && (
        <div className="flex flex-col gap-2 rounded-2xl border-[1.5px] border-accent bg-card p-3">
          <p className="text-[16px] leading-[22px] text-fg text-pretty">
            There&apos;s a newer copy of these minutes saved on this device — from a save that
            didn&apos;t reach the server. {recovered.length.toLocaleString()} characters against{" "}
            {body.length.toLocaleString()} here.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                change(recovered);
                setDraftDismissed(true);
              }}
              className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border-[1.5px] border-fg bg-card px-3 text-timestamp font-bold text-fg"
            >
              <RotateCcw aria-hidden className="size-4" strokeWidth={1.75} />
              Use the newer copy
            </button>
            <button
              type="button"
              onClick={() => {
                clearDraft(meetingId);
                setDraftDismissed(true);
              }}
              className="inline-flex h-11 cursor-pointer items-center rounded-xl border-none bg-transparent px-2 text-timestamp font-bold text-brand underline underline-offset-[3px]"
            >
              Keep what&apos;s here
            </button>
          </div>
        </div>
      )}

      {state === "stale" && (
        <div className="flex flex-col gap-2 rounded-2xl border-[1.5px] border-accent bg-card p-3">
          <p className="text-[16px] leading-[22px] text-fg text-pretty">
            {message ?? "These minutes changed somewhere else."} Your text is still here — copy
            anything you need before reloading.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex h-11 w-auto cursor-pointer items-center gap-2 self-start rounded-xl border-[1.5px] border-fg bg-card px-3 text-timestamp font-bold text-fg"
          >
            <RotateCcw aria-hidden className="size-4" strokeWidth={1.75} />
            Reload these minutes
          </button>
        </div>
      )}

      <label htmlFor="meeting-body" className="sr-only">
        Minutes
      </label>
      <textarea
        id="meeting-body"
        value={body}
        readOnly={!canEdit}
        onChange={(event) => change(event.target.value)}
        placeholder={
          canEdit
            ? "Start typing. It saves itself.\n\nA line starting with “- ” shows as a bullet."
            : ""
        }
        spellCheck
        className={cn(
          "min-h-[320px] w-full flex-1 resize-y rounded-2xl border-[1.5px] border-border bg-card p-4",
          "text-[17px] leading-[26px] text-fg placeholder:text-sub",
          /*
            16px is the floor on iOS: anything smaller and Safari zooms the
            page on focus, which on a phone mid-meeting is a small disaster.
          */
          "lg:text-[17px]",
          !canEdit && "opacity-90"
        )}
      />

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-timestamp font-bold",
            status.tone === "ok" && "text-ok",
            status.tone === "warn" && "text-accent",
            status.tone === "busy" && "text-sub",
            status.tone === "quiet" && "text-sub"
          )}
        >
          {status.tone === "ok" && <Check aria-hidden className="size-4" strokeWidth={2.5} />}
          {status.tone === "warn" && (
            <AlertTriangle aria-hidden className="size-4" strokeWidth={2} />
          )}
          {status.tone === "busy" && (
            <Loader2 aria-hidden className="size-4 animate-spin" strokeWidth={2} />
          )}
          {status.text}
        </span>
        <span className="text-timestamp tabular-nums text-sub">
          {body.length.toLocaleString()} characters
        </span>
      </div>

      {state === "error" && message && (
        <p className="text-timestamp text-accent text-pretty">{message}</p>
      )}
    </div>
  );
}
