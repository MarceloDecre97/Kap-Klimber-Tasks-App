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
  className,
  children,
}: {
  panelRef: RefObject<HTMLDivElement | null>;
  style: { top: number; left: number } | null;
  width: number;
  className?: string;
  children: ReactNode;
}) {
  if (!style || typeof document === "undefined") return null;

  const margin = 16;
  const left = Math.max(margin, Math.min(style.left, window.innerWidth - width - margin));

  return createPortal(
    <div
      ref={panelRef}
      role="listbox"
      style={{ position: "fixed", top: style.top, left, width }}
      className={className}
    >
      {children}
    </div>,
    document.body
  );
}
