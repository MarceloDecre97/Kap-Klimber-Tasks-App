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
export function useFloatingPanel<T extends HTMLElement = HTMLButtonElement>() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<T>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) return;

    function place() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setStyle({ top: rect.bottom + 8, left: rect.left });
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
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  return { open, setOpen, triggerRef, panelRef, style };
}

export function FloatingPanel({
  panelRef,
  style,
  width,
  maxHeight,
  role = "listbox",
  className,
  children,
}: {
  panelRef: RefObject<HTMLDivElement | null>;
  style: { top: number; left: number } | null;
  /** Preferred width; narrowed to fit when the screen is smaller. */
  width: number;
  /** Optional cap on top of the viewport clamp, for short option lists. */
  maxHeight?: number;
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
  */
  const room = Math.max(160, window.innerHeight - style.top - margin);

  return createPortal(
    <div
      ref={panelRef}
      role={role}
      style={{
        position: "fixed",
        top: style.top,
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
