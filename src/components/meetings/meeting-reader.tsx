"use client";

import { renderBody } from "@/lib/meetings-view";

/**
 * Minutes, read rather than typed into.
 *
 * Bullets for lines that start "- " or "* ", because that is how these get
 * typed anyway; everything else exactly as written. No other formatting: a
 * record of what was said should look like what was written, not like a
 * document somebody designed.
 *
 * A rendered view rather than a greyed-out text area — a box you cannot use
 * still looks like one you should be able to, and this is the one place a
 * dash can become a bullet without the app reformatting what its author is
 * in the middle of typing.
 */
export function MeetingReader({ body }: { body: string }) {
  const lines = renderBody(body);

  if (body.trim() === "") {
    return (
      <p className="rounded-2xl border-[1.5px] border-border bg-card p-4 text-[17px] leading-6 text-sub">
        Nothing written here yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col rounded-2xl border-[1.5px] border-border bg-card p-4 text-[17px] leading-[26px] text-fg">
      {lines.map((line, i) => {
        if (line.kind === "blank") return <span key={i} className="h-[13px]" aria-hidden />;
        if (line.kind === "bullet") {
          return (
            <span key={i} className="flex gap-2 text-pretty">
              <span aria-hidden className="select-none text-sub">
                •
              </span>
              <span className="min-w-0 wrap-anywhere">{line.text}</span>
            </span>
          );
        }
        return (
          <span key={i} className="text-pretty wrap-anywhere">
            {line.text}
          </span>
        );
      })}
    </div>
  );
}
