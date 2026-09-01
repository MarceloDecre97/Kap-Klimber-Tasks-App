"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

/**
 * Positions a popover panel relative to its trigger button, but renders it
 * via a portal into document.body instead of as an absolutely-positioned
 * descendant. Needed because these triggers live inside a horizontally
 * scrolling row (overflow-x: auto) — per the CSS spec, setting overflow on
 * one axis forces the other axis to clip too, so an absolutely-positioned
 * panel nested inside that row gets silently cut off. Escaping via a
 * portal + position:fixed sidesteps that entirely.
 */
export interface PanelAnchor {
  /** Where the panel goes when it opens downward. */
  top: number;
  left: number;
  /** The trigger's own top edge — what an upward panel is measured from. */
  triggerTop: number;
}

export function useFloatingPanel<T extends HTMLElement = HTMLButtonElement>() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<T>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<PanelAnchor | null>(null);

  useEffect(() => {
    if (!open) return;

    function place() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setStyle({ top: rect.bottom + 8, left: rect.left, triggerTop: rect.top });
    }
    place();

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", place);
    /*
      The on-screen keyboard does not fire `resize` on iOS — `innerHeight`
      stays exactly as it was while half the screen disappears. The visual
      viewport is the only thing that reports it, and a panel anchored to a
      text field has to know, or it opens underneath the keyboard.
    */
    const vv = window.visualViewport;
    vv?.addEventListener("resize", place);
    vv?.addEventListener("scroll", place);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", place);
      vv?.removeEventListener("resize", place);
      vv?.removeEventListener("scroll", place);
    };
  }, [open]);

  return { open, setOpen, triggerRef, panelRef, style };
}

/** Below this, a downward panel is not worth opening — flip it instead. */
const MIN_ROOM_BELOW = 200;

export function FloatingPanel({
  panelRef,
  style,
  width,
  maxHeight,
  flip = false,
  role = "listbox",
  className,
  children,
}: {
  panelRef: RefObject<HTMLDivElement | null>;
  style: PanelAnchor | null;
  /** Preferred width; narrowed to fit when the screen is smaller. */
  width: number;
  /** Optional cap on top of the viewport clamp, for short option lists. */
  maxHeight?: number;
  /** Allow opening upward when the space below is too tight — see below. */
  flip?: boolean;
  /** Panels that are not a list of options say what they actually are. */
  role?: string;
  className?: string;
  children: ReactNode;
}) {
  if (!style || typeof document === "undefined") return null;

  const margin = 16;
  // A panel wider than the phone it opens on cannot be clamped into view by
  // shifting it — there is nowhere to shift it to. Narrow it instead.
  const panelWidth = Math.min(width, window.innerWidth - margin * 2);
  const left = Math.max(margin, Math.min(style.left, window.innerWidth - panelWidth - margin));

  /*
    A fixed panel does not move when the page scrolls, so anything hanging
    past the bottom edge of the viewport is unreachable — there is no
    gesture that can bring it into view. Cap the panel to the room actually
    below its top edge and let it scroll inside itself instead. The floor
    keeps a panel opened near the bottom of the screen usable rather than
    collapsing it to nothing; `contain` stops that inner scroll from
    chaining out to the task list behind it once it hits an end.

    "Room" is measured against the *visual* viewport, not the layout one, so
    the space taken by an open keyboard counts as gone rather than as
    available. Placement still uses layout coordinates, which is what
    position:fixed resolves against.
  */
  const vv = window.visualViewport;
  const visibleBottom = (vv?.offsetTop ?? 0) + (vv?.height ?? window.innerHeight);
  const roomBelow = visibleBottom - style.top - margin;
  const roomAbove = style.triggerTop - (vv?.offsetTop ?? 0) - margin;

  const goUp = flip && roomBelow < MIN_ROOM_BELOW && roomAbove > roomBelow;
  const room = Math.max(160, goUp ? roomAbove : roomBelow);

  return createPortal(
    <div
      ref={panelRef}
      role={role}
      style={{
        position: "fixed",
        // Anchoring by `bottom` when flipped avoids having to know the
        // panel's height before it has rendered.
        ...(goUp
          ? { bottom: window.innerHeight - style.triggerTop + 8 }
          : { top: style.top }),
        left,
        width: panelWidth,
        maxHeight: Math.min(room, maxHeight ?? Infinity),
        overflowY: "auto",
        overscrollBehavior: "contain",
      }}
      className={className}
    >
      {children}
    </div>,
    document.body
  );
}
