"use client";

import { Sheet } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Asking before the file lands in Downloads.
 *
 * Export used to be one tap and a spreadsheet of the whole book — easy to
 * press by accident, and easy to press *meaning* "the four people I am
 * looking at" and not notice you got two hundred. The dialog exists to make
 * the difference visible at the moment it matters.
 *
 * So the two wordings are not decoration. Unfiltered, it says what you are
 * about to get and how to get less. Filtered, it counts what is on screen,
 * because that number is the whole reassurance.
 *
 * The download itself stays a plain link, not a fetch-and-blob: the browser
 * handles it, which is what makes it work in the installed app on Android as
 * well as in a tab.
 */
export function ExportDialog({
  open,
  onClose,
  href,
  noun,
  showing,
  total,
}: {
  open: boolean;
  onClose: () => void;
  href: string;
  /** "contact" or "company" — this dialog serves both books. */
  noun: string;
  showing: number;
  total: number;
}) {
  if (!open) return null;

  const filtered = showing !== total;
  const plural = showing === 1 ? noun : `${noun}s`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-dialog-title"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-[460px] flex-col gap-4 rounded-3xl border-[1.5px] border-border bg-card p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="export-dialog-title" className="text-section-heading text-fg text-pretty">
          {filtered
            ? `Export the ${showing} ${plural} you are looking at?`
            : `Export the whole address book?`}
        </h2>

        {!filtered && (
          <p className="text-[17px] leading-6 text-sub text-pretty">
            All {total} of them. If you only want some, use the search or filters first.
          </p>
        )}

        <div className="flex flex-col gap-3">
          <a
            href={href}
            onClick={onClose}
            className="inline-flex h-[60px] items-center justify-center gap-2.5 rounded-2xl bg-btn px-5 text-[20px] leading-7 font-bold text-on-btn transition-transform duration-150 active:scale-[0.97] hover:bg-btn-hover"
          >
            <Sheet aria-hidden className="size-5" strokeWidth={2} />
            Export .xlsx
          </a>
          <Button variant="secondary" onClick={onClose}>
            Go back
          </Button>
        </div>
      </div>
    </div>
  );
}
