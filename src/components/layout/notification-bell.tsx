"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CircleDot,
  MessageSquare,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { FloatingPanel, useFloatingPanel } from "@/components/tasks/floating-panel";
import { markNotificationsRead } from "@/app/notifications/actions";
import { describeNotification } from "@/lib/notifications-view";
import { cn, formatTimestamp } from "@/lib/utils";
import type { NotificationFeed, NotificationItem } from "@/lib/data/notifications";
import type { NotificationKind } from "@/lib/supabase/database.types";

const PANEL_WIDTH = 380;

/**
 * An icon per reason, because the panel is scanned rather than read: at a
 * glance you should be able to tell "three people commented" from "I have
 * been put on something new" without parsing three sentences.
 */
const KIND_ICON: Record<NotificationKind, LucideIcon> = {
  note: MessageSquare,
  reply: MessageSquare,
  mention: MessageSquare,
  assigned: UserPlus,
  status: CircleDot,
  due_date: CalendarClock,
  reminder_upcoming: Bell,
  reminder_due: Bell,
  due_soon: CalendarClock,
  overdue: AlertTriangle,
};

/** The kinds that mean "act now" get the danger colour; nothing else does. */
const URGENT_KINDS = new Set<NotificationKind>(["reminder_due", "overdue"]);

/**
 * The app's one place where something finds you, rather than you finding it.
 *
 * It replaces the Dashboard's "N new notes since you last looked" banner,
 * which only counted notes, only appeared on one of the two views, and told
 * you a number without telling you what had happened. This says who did what
 * on which task, on both views, and is the same row that web push and email
 * will send later — so what arrives on your phone and what is waiting in the
 * app can never disagree.
 */
export function NotificationBell({ feed, className }: { feed: NotificationFeed; className?: string }) {
  const { open, setOpen, triggerRef, panelRef, style } = useFloatingPanel<HTMLButtonElement>();
  const [cleared, setCleared] = useState(false);

  /*
    Opening the panel is what clears the count. The bell answers one question
    — "is there something you have not seen?" — and once you have opened it,
    the answer is no. Requiring a tap per row would turn it back into the
    chore the old "press Seen on every note" flow was.

    The rows keep their unread styling for this render, though: the count is
    a prompt, the highlight is the answer to "which ones", and wiping both in
    the same instant would leave you looking at a list with nothing marked.
  */
  function handleToggle() {
    const opening = !open;
    setOpen(opening);
    if (opening && feed.unread > 0 && !cleared) {
      setCleared(true);
      // Fired and forgotten. The badge has already gone to zero locally, and
      // the next page render reads the rows back as read; nothing on screen
      // is waiting on this to come back.
      void markNotificationsRead();
    }
  }

  const unread = cleared ? 0 : feed.unread;

  return (
    <>
      <IconButton
        ref={triggerRef}
        onClick={handleToggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        className={cn("relative size-12 lg:size-14", className)}
      >
        <Bell aria-hidden className="size-5" />
        {unread > 0 && (
          <span
            aria-hidden
            className={cn(
              "absolute -top-1 -right-1 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5",
              "border-[1.5px] border-card bg-brand text-[12px] leading-none font-bold tabular-nums text-on-brand"
            )}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </IconButton>

      {open && (
        <FloatingPanel
          panelRef={panelRef}
          style={style}
          width={PANEL_WIDTH}
          role="dialog"
          className="z-50 rounded-2xl border-[1.5px] border-border bg-card p-2 shadow-[0_4px_16px_rgba(2,6,23,0.16)]"
        >
          <p className="px-3 pt-2 pb-3 text-[15px] leading-5 font-bold text-sub">
            {feed.items.length === 0
              ? "Notifications"
              : `Notifications · ${feed.items.length}`}
          </p>

          {feed.items.length === 0 ? (
            <p className="px-3 pb-3 text-[16px] leading-6 text-sub text-pretty">
              Nothing yet. Comments, assignments and changes to your tasks land here.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {feed.items.map((item) => (
                <li key={item.id}>
                  <NotificationRow item={item} onNavigate={() => setOpen(false)} />
                </li>
              ))}
            </ul>
          )}
        </FloatingPanel>
      )}
    </>
  );
}

function NotificationRow({ item, onNavigate }: { item: NotificationItem; onNavigate: () => void }) {
  const { headline, detail } = describeNotification(item);
  const Icon = KIND_ICON[item.kind] ?? Bell;
  const unread = item.read_at === null;

  return (
    <Link
      href={`/tasks?task=${item.task.id}`}
      onClick={onNavigate}
      className={cn(
        "flex gap-3 rounded-xl border-[1.5px] px-3 py-2.5 text-left",
        // Same language as the unread marker on a note: a border, not a
        // badge, so it reads at a glance without adding another symbol.
        unread ? "border-brand bg-card" : "border-transparent bg-bg hover:bg-muted"
      )}
    >
      {/*
        One visual per row, not two. The actor's name is already the first
        word of the headline, so an avatar beside it would say the same thing
        twice; what the eye cannot get from the sentence is the *kind*, which
        is exactly what this carries.
      */}
      <span
        aria-hidden
        className={cn(
          "mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full border-[1.5px] border-border bg-muted",
          URGENT_KINDS.has(item.kind) ? "text-danger" : "text-sub"
        )}
      >
        <Icon className="size-4" />
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[16px] leading-[22px] font-bold text-fg text-pretty">{headline}</span>
        {detail && (
          <span className="line-clamp-2 text-[15px] leading-5 text-sub text-pretty">{detail}</span>
        )}
        <span className="text-[13px] leading-4 text-muted-fg tabular-nums">
          {formatTimestamp(item.created_at)}
        </span>
      </span>
    </Link>
  );
}
