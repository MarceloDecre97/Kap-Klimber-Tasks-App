"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconButton } from "./icon-button";

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
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
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-[rgba(2,6,23,0.55)] animate-[fade-in_150ms_ease-out]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative flex flex-col bg-card rounded-t-2xl border-t-[1.5px] border-border",
          "max-h-[85dvh] mx-auto w-full max-w-[520px] shadow-[0_-4px_24px_rgba(2,6,23,0.16)]",
          "animate-[slide-up_200ms_ease-out]"
        )}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b-[1.5px] border-border shrink-0">
          <h2 className="text-section-heading">{title}</h2>
          <IconButton aria-label="Close" onClick={onClose}>
            <X aria-hidden className="size-5" />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-6">{children}</div>
        {footer && <div className="flex gap-3 px-5 py-3 border-t-[1.5px] border-border shrink-0 safe-bottom">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
