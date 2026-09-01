"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ToastOptions {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

interface ToastState extends ToastOptions {
  id: number;
}

interface ToastContextValue {
  showToast: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** Long enough to read and reach the button; short enough to stop nagging. */
const ACTION_MS = 5000;
/** Nothing to decide — this only has to be read. */
const PLAIN_MS = 3500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idRef = useRef(0);

  /*
    Two lifetimes, because these are two different things.

    A message with a button is asking you to decide — long enough to read it
    and reach the button on a phone, and no longer, because it is sitting on
    top of the list you are trying to use. One without a button is only being
    read. Both used to be eight seconds, which was too long for either.

    The × matters more than the number. Most of the annoyance in a banner is
    not its duration, it is having no way to get rid of it.
  */
  const showToast = useCallback((options: ToastOptions) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const id = ++idRef.current;
    setToast({ ...options, id });
    timerRef.current = setTimeout(
      () => setToast((current) => (current?.id === id ? null : current)),
      options.durationMs ?? (options.actionLabel ? ACTION_MS : PLAIN_MS)
    );
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <div
          key={toast.id}
          role="status"
          aria-live="polite"
          className={cn(
            "fixed left-5 right-5 z-[60] mx-auto flex max-w-[520px] items-center justify-between gap-4",
            "rounded-2xl bg-prim px-5 py-4 text-on-prim shadow-[0_1px_3px_rgba(2,6,23,0.08)]",
            "animate-[toast-in_150ms_ease-out]"
          )}
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 88px)" }}
        >
          <span className="flex items-center gap-3 text-[18px] leading-7 font-bold">
            <CheckCircle2 aria-hidden className="size-5 shrink-0" />
            {toast.message}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {toast.actionLabel && (
              <button
                type="button"
                onClick={() => {
                  toast.onAction?.();
                  setToast(null);
                }}
                className="h-14 shrink-0 rounded-full border-[1.5px] border-on-prim px-5 text-chip cursor-pointer"
              >
                {toast.actionLabel}
              </button>
            )}
            {/*
              Deliberately separate from the action, and never merged into it:
              a dismiss that could undo a delete by accident is worse than no
              dismiss at all.
            */}
            <button
              type="button"
              onClick={() => setToast(null)}
              aria-label="Dismiss"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-on-prim cursor-pointer hover:bg-white/10"
            >
              <X aria-hidden className="size-5" />
            </button>
          </span>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
