"use client";

import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * The paper: one plain white box, and nothing else.
 *
 * It used to own its own saving, its own draft recovery and its own status
 * line, while the details panel beside it owned a separate Save button. That
 * split is what let Marcelo set a title, a company and an attendee, leave the
 * page and come back to none of it — one half of the screen saved itself and
 * the other quietly did not. Saving now belongs to the meeting as a whole, so
 * this is a controlled text box and nothing more.
 *
 * It also no longer takes part in any flex height arithmetic. Four nested
 * `flex-1` boxes inside a scrolling pane, with a `min-h` on the innermost,
 * is what made the comments section draw on top of this one: the textarea was
 * laid out at its flex-allotted height and then drawn at its minimum. A
 * scrolling column should stack its children and let them be as tall as they
 * are, which is what this now does — it grows to fit what is in it.
 */
export function MeetingEditor({
  value,
  onChange,
  readOnly,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  readOnly?: boolean;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  /*
    Grow to fit, rather than scroll inside itself.

    A box that scrolls internally inside a page that also scrolls is two
    scrollbars fighting over one gesture, and on a phone mid-meeting the one
    your thumb catches is a coin toss. Measured on every change because the
    only way to know the height of wrapped text is to let the browser lay it
    out: reset to `auto` so `scrollHeight` reports the content rather than the
    box, then take that.

    useLayoutEffect, not useEffect, so the height is set in the same frame the
    text changes and the box never visibly jumps.
  */
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 360)}px`;
  }, [value]);

  return (
    <>
      <label htmlFor="meeting-body" className="sr-only">
        Minutes
      </label>
      <textarea
        id="meeting-body"
        ref={ref}
        value={value}
        readOnly={readOnly}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        spellCheck
        className={cn(
          "w-full resize-none overflow-hidden rounded-2xl border-[1.5px] border-border bg-card p-4",
          /*
            17px, and never below 16: iOS zooms the page when a field under
            16px takes focus, which on a phone mid-meeting is a small disaster.
          */
          "text-[17px] leading-[26px] text-fg placeholder:text-sub",
          readOnly && "opacity-90"
        )}
      />
    </>
  );
}
