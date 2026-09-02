"use client";

import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { saveNotificationPrefs } from "@/app/settings/prefs-actions";
import {
  PREF_GROUPS,
  groupIsOn,
  toggleGroup,
  type NotificationPrefs,
} from "@/lib/notification-prefs";
import { APP_TIMEZONE_LABEL } from "@/lib/utils";
import { cn } from "@/lib/utils";

const QUIET_DEFAULT = { from: "22:00", to: "07:00" };

/**
 * What reaches you, and when.
 *
 * Saved on every change rather than behind a Save button. A settings screen
 * with an unpressed Save button is a screen people leave thinking they have
 * changed something, and this one has no destructive option — the worst case
 * of a mis-tap is one extra notification, which the switch beside it undoes.
 */
export function NotificationPrefsPanel({ initial }: { initial: NotificationPrefs }) {
  const [prefs, setPrefs] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function commit(next: NotificationPrefs) {
    // Optimistic, deliberately: a switch that waits for a round trip before
    // moving feels broken on a phone, and there is nothing here worth being
    // careful about losing.
    setPrefs(next);
    setError(null);
    startTransition(async () => {
      const result = await saveNotificationPrefs(next);
      if (!result.ok) {
        setError(result.error);
        setPrefs(prefs);
      }
    });
  }

  const quietOn = prefs.quietFrom !== null && prefs.quietTo !== null;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[16px] leading-6 text-sub text-pretty">
        Everything is on until you turn it off. The bell inside the app always keeps
        a full record — these only change what reaches your phone and your inbox.
      </p>

      <ul className="flex flex-col divide-y-[1.5px] divide-border rounded-2xl border-[1.5px] border-border bg-card">
        {PREF_GROUPS.map((group) => (
          <li key={group.id} className="flex flex-col gap-2 px-4 py-3.5">
            <div className="flex items-start gap-3">
              <div className="flex min-w-0 grow flex-col">
                <span className="text-[17px] leading-6 font-bold text-fg text-pretty">
                  {group.label}
                </span>
                <span className="text-[15px] leading-[21px] text-sub text-pretty">
                  {group.locked ?? group.detail}
                </span>
              </div>

              {!group.locked && (
                <div className="flex shrink-0 flex-col items-center gap-1">
                  <span className="text-[12px] leading-none font-bold tracking-wide text-sub uppercase">
                    Push
                  </span>
                  <Switch
                    checked={groupIsOn(group, prefs, "push")}
                    label={`Push notifications for ${group.label}`}
                    className="w-[56px] h-8"
                    onCheckedChange={(next) =>
                      commit({ ...prefs, pushOff: toggleGroup(group, prefs.pushOff, next) })
                    }
                  />
                </div>
              )}

              {/*
                Only where email actually carries this. Offering an email
                switch for comments would imply comments are emailed, and
                they are not — a control that does nothing is worse than no
                control, because it teaches people the screen lies.
              */}
              {!group.locked && group.email && (
                <div className="flex shrink-0 flex-col items-center gap-1">
                  <span className="text-[12px] leading-none font-bold tracking-wide text-sub uppercase">
                    Email
                  </span>
                  <Switch
                    checked={groupIsOn(group, prefs, "email")}
                    label={`Emails for ${group.label}`}
                    className="w-[56px] h-8"
                    onCheckedChange={(next) =>
                      commit({ ...prefs, emailOff: toggleGroup(group, prefs.emailOff, next) })
                    }
                  />
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* ---- quiet hours ---- */}
      <div className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-border bg-card px-4 py-3.5">
        <div className="flex items-start gap-3">
          <div className="flex min-w-0 grow flex-col">
            <span className="text-[17px] leading-6 font-bold text-fg">Quiet hours</span>
            <span className="text-[15px] leading-[21px] text-sub text-pretty">
              No buzzing overnight. Emails and the bell still arrive — it is the phone
              that stays quiet. {APP_TIMEZONE_LABEL} time, like the rest of the app.
            </span>
          </div>
          <Switch
            checked={quietOn}
            label="Quiet hours"
            className="w-[56px] h-8 shrink-0"
            onCheckedChange={(next) =>
              commit({
                ...prefs,
                quietFrom: next ? QUIET_DEFAULT.from : null,
                quietTo: next ? QUIET_DEFAULT.to : null,
              })
            }
          />
        </div>

        {quietOn && (
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-[16px] leading-6 text-sub">
              From
              <input
                type="time"
                value={prefs.quietFrom ?? QUIET_DEFAULT.from}
                onChange={(event) =>
                  commit({ ...prefs, quietFrom: event.target.value || QUIET_DEFAULT.from })
                }
                className={cn(
                  "h-11 rounded-xl border-[1.5px] border-border bg-bg px-3",
                  "text-[16px] leading-6 text-fg tabular-nums"
                )}
              />
            </label>
            <label className="flex items-center gap-2 text-[16px] leading-6 text-sub">
              to
              <input
                type="time"
                value={prefs.quietTo ?? QUIET_DEFAULT.to}
                onChange={(event) =>
                  commit({ ...prefs, quietTo: event.target.value || QUIET_DEFAULT.to })
                }
                className={cn(
                  "h-11 rounded-xl border-[1.5px] border-border bg-bg px-3",
                  "text-[16px] leading-6 text-fg tabular-nums"
                )}
              />
            </label>
          </div>
        )}

        {quietOn && prefs.quietFrom! > prefs.quietTo! && (
          <p className="text-[15px] leading-[21px] text-sub">
            Overnight — from {prefs.quietFrom} one day to {prefs.quietTo} the next.
          </p>
        )}
      </div>

      {error && <p className="text-[16px] leading-6 text-danger text-pretty">{error}</p>}
    </div>
  );
}
