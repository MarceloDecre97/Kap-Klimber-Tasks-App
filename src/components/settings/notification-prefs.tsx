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
export function NotificationPrefsPanel({
  initial,
  deviceOn,
}: {
  initial: NotificationPrefs;
  /**
   * Whether the device being used right now can receive notifications at all.
   *
   * Only ever dims the Device column — it never changes what is stored. These
   * switches belong to the account, not to one phone, so writing them off
   * here would silence a different device that is working perfectly, and the
   * person would have no way to see why.
   */
  deviceOn: boolean;
}) {
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
      {/*
        A line per column, because each switch has a different reach and the
        difference is the thing people get wrong: email arrives regardless of
        any device, and the device column only touches machines that have been
        switched on in the section above.
      */}
      <div className="flex flex-col gap-1.5 text-[16px] leading-6 text-sub text-pretty">
        <p>
          <b className="text-fg">Email:</b> Goes to your inbox, whether or not any or
          some of your devices have notifications turned on.
        </p>
        <p>
          <b className="text-fg">Device:</b> Only reaches the devices where you turned
          notifications on in the section above.
        </p>
        <p>
          Everything is on until you turn it off. The bell inside the app always keeps
          a full record.
        </p>
      </div>

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

              {/*
                The two channels are one block with a gap of its own. As
                siblings of the label they inherited its spacing, which on a
                narrow row put "Phone" and "Email" close enough to read as
                one control.
              */}
              <div className="flex shrink-0 items-start gap-5">
              {!group.locked && (
                <div
                  className={cn(
                    "flex w-14 shrink-0 flex-col items-center gap-1.5",
                    // Dimmed, not disabled: the switch still works, because it
                    // governs the member's other devices too. What is being
                    // said here is "not this one", and saying it in colour is
                    // honest where switching it off would not be.
                    !deviceOn && "opacity-45"
                  )}
                >
                  {/*
                    "Device" rather than "Phone", and neither of them "Push".
                    It reaches laptops as well, so Phone was never the whole
                    truth — and Push is what the technology is called, not
                    what it does.
                  */}
                  <span className="text-[12px] leading-none font-bold tracking-wide text-sub uppercase">
                    Device
                  </span>
                  <Switch
                    checked={groupIsOn(group, prefs, "push")}
                    label={`Notifications on your devices for ${group.label}`}
                    size="sm"
                    onCheckedChange={(next) =>
                      commit({
                        ...prefs,
                        pushOff: toggleGroup(group, prefs.pushOff, next, "push"),
                      })
                    }
                  />
                </div>
              )}

              {/*
                Email is offered wherever the kind can carry it, locked groups
                included. Locked means the device channel cannot be silenced —
                it was never a reason to withhold the inbox, which is the one
                place a delete request reaches somebody who is away from the
                app.
              */}
              {group.email && (
                <div className="flex w-14 shrink-0 flex-col items-center gap-1.5">
                  <span className="text-[12px] leading-none font-bold tracking-wide text-sub uppercase">
                    Email
                  </span>
                  <Switch
                    checked={groupIsOn(group, prefs, "email")}
                    label={`Emails for ${group.label}`}
                    size="sm"
                    onCheckedChange={(next) =>
                      commit({
                        ...prefs,
                        emailOff: toggleGroup(group, prefs.emailOff, next, "email"),
                      })
                    }
                  />
                </div>
              )}
              </div>
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
              No buzzing overnight. Notifications still arrive within the App; emails
              wait until quiet hours end, and your phone stays quiet. (
              {APP_TIMEZONE_LABEL} Time Zone)
            </span>
          </div>
          <Switch
            checked={quietOn}
            label="Quiet hours"
            size="sm"
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
