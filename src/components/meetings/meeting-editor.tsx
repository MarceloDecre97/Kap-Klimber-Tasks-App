"use client";

import { useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

/**
 * The paper: one plain white box, and nothing else.
 *
 * It used to own its own saving, its own draft recovery and its own status
 * line, while the details panel beside it owned a separate Save button. That
 * split is what let Marcelo set a title, a company and an attendee, leave the
 * page and come back to none of it — one half of the screen saved itself and
 * the other quietly did not. Saving now belongs to the meeting as a whole, so
 * this is a controlled text box with two typing habits and nothing more.
 *
 * It also no longer takes part in any flex height arithmetic. Four nested
 * `flex-1` boxes inside a scrolling pane, with a `min-h` on the innermost,
 * is what made the comments section draw on top of this one: the textarea was
 * laid out at its flex-allotted height and then drawn at its minimum. A
 * scrolling column should stack its children and let them be as tall as they
 * are, which is what this now does — up to a point. See below.
 */

/** Matches `leading-[26px]` on the textarea. Change both or neither. */
const LINE_HEIGHT = 26;
/** Marcelo's number: the box is fifteen lines tall, then it scrolls. */
const MAX_LINES = 15;
/** `p-4` top and bottom, plus the 1.5px border twice. */
const CHROME = 32 + 3;
const MAX_HEIGHT = MAX_LINES * LINE_HEIGHT + CHROME;
/** Empty minutes still look like somewhere to write. Roughly thirteen lines. */
const MIN_HEIGHT = 360;

/**
 * Typing text into a field the way a person would.
 *
 * `execCommand` is deprecated and is still the only way to change a textarea
 * from code without throwing away the browser's undo stack — Ctrl+Z has to
 * take back an automatic bullet, or the automation is a trap. It also fires a
 * real input event, so React's onChange sees it like any keystroke. The
 * fallback writes the value directly and accepts the lost undo, which is
 * better than the feature not working at all.
 */
function typeInto(el: HTMLTextAreaElement, text: string, onChange: (next: string) => void): void {
  let inserted = false;
  try {
    /* `insertText` with an empty string is not reliably a deletion — Firefox
       treats it as nothing at all — so a deletion says so. */
    inserted =
      text === ""
        ? document.execCommand("delete")
        : document.execCommand("insertText", false, text);
  } catch {
    inserted = false;
  }
  if (inserted) return;

  const { selectionStart: start, selectionEnd: end, value } = el;
  const next = value.slice(0, start) + text + value.slice(end);
  el.value = next;
  const caret = start + text.length;
  el.setSelectionRange(caret, caret);
  onChange(next);
}

/** The marker a line is already carrying, and what the next one should be. */
function continuationFor(line: string): { prefix: string; markerLength: number } | null {
  const bullet = /^(\s*)([-*])\s+/.exec(line);
  if (bullet) {
    return { prefix: `${bullet[1]}${bullet[2]} `, markerLength: bullet[0].length };
  }
  const numbered = /^(\s*)(\d+)([.)])\s+/.exec(line);
  if (numbered) {
    const next = Number(numbered[2]) + 1;
    return { prefix: `${numbered[1]}${next}${numbered[3]} `, markerLength: numbered[0].length };
  }
  return null;
}

/**
 * The word that has just been finished, when it starts a sentence.
 *
 * A sentence starts at the top of a line, after a bullet or a number, or
 * after `.`, `?` or `!` and a space. Returns nothing otherwise, and nothing
 * for a word that already contains a capital anywhere in it — which is what
 * keeps "iPhone", "eLog" and "mySQL" as they were typed. Word would capitalise
 * those; we know more about what gets written here than Word does.
 */
function sentenceWordAt(before: string): { word: string; start: number } | null {
  const patterns = [
    /(?:^|\n)[ \t]*(?:[-*]|\d+[.)])[ \t]+([a-z][A-Za-z'’-]*)$/,
    /(?:^|\n)[ \t]*([a-z][A-Za-z'’-]*)$/,
    /[.!?]["'’)\]]?[ \t]+([a-z][A-Za-z'’-]*)$/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(before);
    const word = match?.[1];
    if (!word) continue;
    if (/[A-Z]/.test(word)) return null;
    return { word, start: before.length - word.length };
  }
  return null;
}

export function MeetingEditor({
  value,
  onChange,
  onBlur,
  readOnly,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  onBlur?: () => void;
  readOnly?: boolean;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  /*
    Grow to fit, up to fifteen lines, then scroll inside itself.

    It used to grow without limit. On a long set of minutes that put the save
    button, the action items and the comments a very long way down a page
    whose scrollbar was doing all the work — so the box now stops at the
    height Marcelo asked for and takes over its own scrolling. Two scrollbars
    is a real cost on a phone, which is why the box is fifteen lines and not
    five: you have to have written a screenful before the second one appears.

    Measured on every change because the only way to know the height of
    wrapped text is to let the browser lay it out: reset to `auto` so
    `scrollHeight` reports the content rather than the box, then take that.
    useLayoutEffect, not useEffect, so the height is set in the same frame the
    text changes and the box never visibly jumps.
  */
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const content = el.scrollHeight;
    el.style.height = `${Math.min(Math.max(content, MIN_HEIGHT), MAX_HEIGHT)}px`;
    el.style.overflowY = content > MAX_HEIGHT ? "auto" : "hidden";
  }, [value]);

  /*
    Two habits, both of them things a word processor does and neither of them
    a thing to learn.

    Enter on a list carries the list on: "- " becomes another "- ", "3. "
    becomes "4. ", and an empty one ends the list rather than laying down a
    marker for ever. Space or Enter after the first word of a sentence
    capitalises it.

    Both are written through `typeInto`, so one Ctrl+Z takes either back.
    Nothing here reformats text that is already on the page: these fire on the
    keystroke and only ever touch what was just typed, which is the line
    between a helpful editor and one that rewrites your minutes while you are
    reading them out.
  */
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const el = ref.current;
    if (!el || readOnly) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    if (el.selectionStart !== el.selectionEnd) return;

    /* The sentence capital first: it applies to both keys, and to the word
       that is about to be closed by either of them. */
    const before = el.value.slice(0, el.selectionStart);
    const sentenceWord = sentenceWordAt(before);
    if (sentenceWord) {
      el.setSelectionRange(sentenceWord.start, before.length);
      typeInto(
        el,
        sentenceWord.word.charAt(0).toUpperCase() + sentenceWord.word.slice(1),
        onChange
      );
    }

    if (event.key !== "Enter" || event.shiftKey) return;

    /* Re-read: the capital above may have just rewritten this line. */
    const caret = el.selectionStart;
    const lineStart = el.value.lastIndexOf("\n", caret - 1) + 1;
    const line = el.value.slice(lineStart, caret);
    const carry = continuationFor(line);
    if (!carry) return;

    event.preventDefault();
    if (line.length === carry.markerLength) {
      /* An empty bullet: the way you say you have finished the list. */
      el.setSelectionRange(lineStart, caret);
      typeInto(el, "", onChange);
      return;
    }
    typeInto(el, `\n${carry.prefix}`, onChange);
  }

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
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        placeholder={placeholder}
        spellCheck
        /* Android's own sentence capitals, which cost nothing and agree with
           the rule above — a word it has already capitalised is left alone. */
        autoCapitalize="sentences"
        className={cn(
          "w-full resize-none rounded-2xl border-[1.5px] border-border bg-card p-4",
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
