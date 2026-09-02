"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CircleDot,
  MessageSquare,
  RotateCcw,
  Trash2,
  Undo2,
  UserPlus,
  X,
  type LucideIcon,
} from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { FloatingPanel, useFloatingPanel } from "@/components/tasks/floating-panel";
import { dismissNotification, markNotificationsRead } from "@/app/notifications/actions";
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
  delete_requested: Trash2,
  delete_denied: Undo2,
  deleted: Trash2,
  restored: RotateCcw,
  reminder_upcoming: Bell,
  reminder_due: Bell,
  due_soon: CalendarClock,
  overdue: AlertTriangle,
};

/** The kinds that mean "act now" get the danger colour; nothing else does. */
const URGENT_KINDS = new Set<NotificationKind>([
  "reminder_due",
  "overdue",
  // Somebody is waiting on you to decide, and the task sits in limbo until
  // you do.
  "delete_requested",
]);

/**
 * The app's one place where something finds you, rather than you finding it.
 *
 * It replaces the Dashboard's "N new notes since you last looked" banner,
 * which only counted notes, only appeared on one of the two views, and told
 * you a number without telling you what had happened. This says who did what
 * on which task, on both views, and is the same row that web push and email
 * will send later — so what arrives on your phone and what is waiting in the
 * app can never disagree.
 *
 * Opening the panel does not clear the count. It first did, on the reasoning
 * that having looked is having seen; in use that was wrong, because glancing
 * at the bell to decide whether anything mattered destroyed the record of
 * what had not been dealt with. The count now falls when you act: tapping a
 * row opens its task, and opening a task marks it read. "Mark all read" is
 * there for the rest, so a notification you have decided to ignore still
 * takes exactly one tap rather than staying up forever.
 */
export function NotificationBell({ feed, className }: { feed: NotificationFeed; className?: string }) {
  const { open, setOpen, triggerRef, panelRef, style } = useFloatingPanel<HTMLButtonElement>();
  const [cleared, setCleared] = useState(false);
  /*
    Rows removed here, before the server has answered. A dismiss that waits
    for a round trip reads as a dead button on a phone, and there is nothing
    to roll back to if it fails: the row is gone from the table either way on
    the next render.
  */
  const [dismissed, setDismissed] = useState<string[]>([]);

  /*
    Fired and forgotten. The badge and the row highlights have already gone
    locally, and the next page render reads the rows back as read; nothing on
    screen is waiting on this to come back.
  */
  function handleMarkAllRead() {
    setCleared(true);
    void markNotificationsRead();
  }

  function handleDismiss(item: NotificationItem) {
    setDismissed((ids) => [...ids, item.id]);
    void dismissNotification(item.id);
  }

  const items = feed.items.filter((item) => !dismissed.includes(item.id));
  const unread = cleared
    ? 0
    : items.filter((item) => item.read_at === null).length;

  return (
    <>
      <IconButton
        ref={triggerRef}
        onClick={() => setOpen((o) => !o)}
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
          <div className="flex items-center gap-3 px-3 pt-2 pb-3">
            {/*
              Just the word. A "· N new" suffix wrapped to two lines at 320px,
              and it was saying a third time what the badge on the bell and the
              outlined rows below already say.
            */}
            <p className="flex-1 truncate text-[15px] leading-5 font-bold text-sub">Notifications</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="shrink-0 text-[15px] leading-5 font-bold text-brand underline underline-offset-[3px] cursor-pointer"
              >
                Mark all read
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="px-3 pb-3 text-[16px] leading-6 text-sub text-pretty">
              Nothing yet. Comments, assignments and changes to your tasks land here.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {items.map((item) => (
                <li key={item.id} className="flex items-stretch gap-1">
                  <NotificationRow item={item} read={cleared} onNavigate={() => setOpen(false)} />
                  {/*
                    A sibling of the row rather than a child of it: the row is
                    a link, and a button inside a link is both invalid and
                    unpressable on some phones.
                  */}
                  <button
                    type="button"
                    onClick={() => handleDismiss(item)}
                    aria-label="Remove this notification"
                    className="flex w-9 shrink-0 items-center justify-center rounded-xl text-muted-fg hover:bg-muted hover:text-fg cursor-pointer"
                  >
                    <X aria-hidden className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </FloatingPanel>
      )}
    </>
  );
}

function NotificationRow({
  item,
  read,
  onNavigate,
}: {
  item: NotificationItem;
  /** Set once "Mark all read" has run, before the server round trip lands. */
  read: boolean;
  onNavigate: () => void;
}) {
  const { headline, detail } = describeNotification(item);
  const Icon = KIND_ICON[item.kind] ?? Bell;
  const unread = !read && item.read_at === null;

  const className = cn(
    "flex min-w-0 grow gap-3 rounded-xl border-[1.5px] px-3 py-2.5 text-left",
    // Same language as the unread marker on a note: a border, not a
    // badge, so it reads at a glance without adding another symbol.
    unread ? "border-brand bg-card" : "border-transparent bg-bg",
    !item.taskGone && "hover:bg-muted"
  );

  const inner = (
    <>
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
    </>
  );

  // Nothing to open: the task is gone, and for everyone but its creator it is
  // gone for good. A link here would be a dead end dressed as a way forward.
  if (item.taskGone) return <div className={className}>{inner}</div>;

  return (
    <Link
      href={`/tasks?task=${item.task.id}`}
      // The destination positions its own list on the task this is about.
      // Next's scroll-on-navigate would fight that, and it reaches for
      // scrollIntoView to do it — the one call that can move the app shell.
      scroll={false}
      onClick={onNavigate}
      className={className}
    >
      {inner}
    </Link>
  );
}
