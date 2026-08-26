"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";
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

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idRef = useRef(0);

  const showToast = useCallback((options: ToastOptions) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const id = ++idRef.current;
    setToast({ ...options, id });
    timerRef.current = setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
    }, options.durationMs ?? 8000);
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
