"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Send, Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  removePushSubscription,
  savePushSubscription,
  sendTestPush,
} from "@/app/settings/push-actions";
import { cn } from "@/lib/utils";

/**
 * Every honest answer to "can this device receive notifications?".
 *
 * Most of these are not failures, and none of them should be reported as one.
 * A person on an iPhone who has not installed the app has done nothing wrong;
 * they need one specific instruction, and a flat "not supported" would send
 * them looking for a bug that does not exist.
 */
type PushState =
  | "checking"
  | "on"
  | "off"
  /** Safari only offers push to an app added to the Home Screen. */
  | "needs-install"
  /** No service worker or no push at all — an old browser, or a private window. */
  | "unsupported"
  /** The browser has been told no, and only its own settings can undo that. */
  | "denied"
  /** The keys have not been set up on the server yet. */
  | "unconfigured";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

/**
 * The subscribe call wants raw bytes, and a VAPID key travels as base64url —
 * which is base64 with two characters swapped and the padding dropped.
 */
function toApplicationServerKey(base64url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  // Backed by a plain ArrayBuffer rather than whatever the runtime picks:
  // subscribe() will not accept a view over a SharedArrayBuffer.
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

/** True once the app has been added to the Home Screen and opened from there. */
function isInstalled(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Notifications on this device — per device, not per person.
 *
 * Permission is only ever requested from a deliberate tap. A browser that is
 * asked unprompted blocks the site permanently, and a block cannot be undone
 * from inside the app: the person has to find it in their browser settings,
 * which most never will. So the switch exists, off, and asks nothing until
 * somebody presses it.
 */
export function PushSwitch({ onStateChange }: { onStateChange?: (on: boolean) => void }) {
  const [state, setState] = useState<PushState>("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Shown after a successful test, so the tap has a visible answer either way. */
  const [sent, setSent] = useState(false);

  /*
    Deliberately a resolver rather than a setter: it answers the question and
    hands the answer back, which keeps every state change in one place and
    keeps the effect below from setting state synchronously.

    It used to answer from the browser alone — if getSubscription() returned
    something, the switch said "on". That is only half the question, and the
    missing half is the half that matters: a browser can hold a perfectly
    valid subscription that the server has never been told about, and then
    the switch reads on, offers a Turn off button, and nothing can ever
    arrive. It happened: a subscription survived in Chrome from an earlier
    install while its row was gone from the database, so the page showed
    "on" and there was no button left to press that would have fixed it.

    So the browser's answer is now confirmed by re-registering it. The upsert
    is keyed on the endpoint and idempotent, which makes this both the check
    and the repair — the two states cannot drift apart for longer than one
    visit to this screen.
  */
  const resolve = useCallback(async (): Promise<{ state: PushState; error?: string }> => {
    if (!VAPID_PUBLIC_KEY) return { state: "unconfigured" };

    const supported = "serviceWorker" in navigator && "PushManager" in window;
    if (!supported) {
      // On iOS the two are missing precisely because the app is in a tab
      // rather than on the Home Screen, which is a different problem with a
      // different answer.
      return { state: isIos() && !isInstalled() ? "needs-install" : "unsupported" };
    }
    if (Notification.permission === "denied") return { state: "denied" };

    const registration = await navigator.serviceWorker.getRegistration();
    const existing = await registration?.pushManager.getSubscription();
    if (!existing) return { state: "off" };

    const json = existing.toJSON();
    const result = await savePushSubscription({
      endpoint: existing.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      userAgent: navigator.userAgent.slice(0, 400),
    });
    if (result.ok) return { state: "on" };

    /*
      The browser is subscribed and the server will not record it. "Off" is
      the honest word for that — nothing is going to reach this device — and
      saying so leaves a Turn on button, which is the one action that has any
      chance of helping.
    */
    return { state: "off", error: result.error };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = await resolve();
      if (cancelled) return;
      setState(next.state);
      if (next.error) setError(next.error);
    })();
    return () => {
      cancelled = true;
    };
  }, [resolve]);

  /*
    Told to the panel below rather than worked out there a second time. Two
    copies of "can this device receive anything?" is two answers waiting to
    disagree, and the one on the settings screen has to match the button
    beside it or the screen contradicts itself.
  */
  useEffect(() => {
    if (state !== "checking") onStateChange?.(state === "on");
  }, [state, onStateChange]);

  async function turnOn() {
    setBusy(true);
    setError(null);
    setSent(false);
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        // Required, and required to be true: a push that shows nothing is not
        // allowed, which is the rule that stops sites tracking people
        // silently in the background.
        userVisibleOnly: true,
        applicationServerKey: toApplicationServerKey(VAPID_PUBLIC_KEY),
      });

      const json = subscription.toJSON();
      const result = await savePushSubscription({
        endpoint: subscription.endpoint,
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
        userAgent: navigator.userAgent.slice(0, 400),
      });

      if (!result.ok) {
        // Do not leave a live subscription the server knows nothing about —
        // it would deliver nothing and look like a device that has been
        // switched on.
        await subscription.unsubscribe();
        setError(result.error);
        setState("off");
        return;
      }
      setState("on");
    } catch (err) {
      console.error("turnOn failed", err);
      setError("Couldn't turn notifications on for this device.");
      setState((await resolve()).state);
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setError(null);
    setSent(false);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await removePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setState("off");
    } catch (err) {
      console.error("turnOff failed", err);
      setError("Couldn't turn notifications off. Try again.");
      setState((await resolve()).state);
    } finally {
      setBusy(false);
    }
  }

  /*
    The whole point of this button is that it proves delivery rather than
    reporting it. So it deliberately does not say "sent" on its own — it says
    so only after the server confirms a push service accepted the message, and
    the real confirmation is the notification arriving a second later.
  */
  async function test() {
    setBusy(true);
    setError(null);
    setSent(false);
    try {
      const result = await sendTestPush();
      if (result.ok) setSent(true);
      else setError(result.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <span
          aria-hidden
          className={cn(
            "inline-flex size-12 shrink-0 items-center justify-center rounded-2xl border-[1.5px]",
            state === "on" ? "border-brand bg-brand/10 text-brand" : "border-border bg-muted text-sub"
          )}
        >
          {state === "on" ? <Bell className="size-5" /> : <BellOff className="size-5" />}
        </span>

        <div className="flex min-w-0 grow flex-col">
          <span className="text-[18px] leading-7 font-bold text-fg">
            Notifications on this device
          </span>
          <span className="text-[16px] leading-6 text-sub text-pretty">{describe(state)}</span>
          {/*
            The iPhone case is deliberately not mentioned here. Somebody on
            an iPhone without the app installed gets the Add to Home Screen
            panel below instead of a button, so the instruction already
            reaches exactly the people it applies to — putting it in this
            line would have everyone else read about a problem they do not
            have.
          */}
          <span className="mt-1 text-[16px] leading-6 text-sub text-pretty">
            Only for this phone or computer (Device). If you also use another one, you
            can turn it on there too.
          </span>
        </div>

        {(state === "on" || state === "off") && (
          <Button
            variant={state === "on" ? "secondary" : "primary"}
            size="md"
            className="w-auto shrink-0 px-4"
            disabled={busy}
            onClick={state === "on" ? turnOff : turnOn}
          >
            {state === "on" ? "Turn off" : "Turn on"}
          </Button>
        )}
      </div>

      {state === "on" && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            size="md"
            className="w-auto px-4"
            disabled={busy}
            onClick={test}
          >
            <Send aria-hidden className="size-4" />
            Send a test notification
          </Button>
          {sent && (
            <span className="text-[16px] leading-6 text-sub text-pretty">
              Sent. It should arrive in a second or two — if it doesn&rsquo;t, this
              device can&rsquo;t receive them.
            </span>
          )}
        </div>
      )}

      {state === "needs-install" && (
        <p className="flex items-start gap-2 rounded-2xl border-[1.5px] border-border bg-muted px-4 py-3 text-[16px] leading-6 text-sub text-pretty">
          <Share aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            In Safari, tap the share button, then <b className="text-fg">Add to Home Screen</b>.
            Open the app from there and this switch will work. Apple only allows notifications
            for an installed app — nothing we can change from here.
          </span>
        </p>
      )}

      {error && <p className="text-[16px] leading-6 text-danger text-pretty">{error}</p>}
    </div>
  );
}

function describe(state: PushState): string {
  switch (state) {
    case "checking":
      return "Checking…";
    case "on":
      return "This device gets a notification when something needs you.";
    case "off":
      return "Off. Turn it on and the bell also reaches you when the app is closed.";
    case "needs-install":
      return "Add the app to your Home Screen first.";
    case "denied":
      return "Blocked in this browser's settings. Allow notifications for this site there, then come back.";
    case "unsupported":
      return "This browser can't receive notifications. The bell inside the app still works.";
    case "unconfigured":
      return "Not set up on the server yet.";
  }
}
