"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function Dialog({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-5">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-[rgba(2,6,23,0.55)] animate-[fade-in_150ms_ease-out]"
      />
      <div
        role="alertdialog"
        aria-modal="true"
        className="relative w-full max-w-[420px] bg-card border-[1.5px] border-border rounded-2xl p-6 flex flex-col gap-4 shadow-[0_1px_3px_rgba(2,6,23,0.08)] animate-[slide-up_200ms_ease-out]"
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
