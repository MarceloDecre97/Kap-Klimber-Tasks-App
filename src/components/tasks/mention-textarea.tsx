"use client";

import { useEffect, useRef, useState, type TextareaHTMLAttributes } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/input";
import { FloatingPanel, useFloatingPanel } from "@/components/tasks/floating-panel";
import { activeMentionQuery, insertMention, matchRoster } from "@/lib/mentions";
import { cn } from "@/lib/utils";
import type { MemberSummary } from "@/lib/data/tasks";

const PANEL_WIDTH = 300;

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & {
  value: string;
  onValueChange: (next: string) => void;
  roster: MemberSummary[];
  /** ⌘/Ctrl+Enter, for anyone typing at a keyboard. */
  onSubmit?: () => void;
};

/**
 * The note box, with a roster picker on `@`.
 *
 * The picker opens above the field rather than below whenever the space
 * below is tight, which on a phone means "always, once the keyboard is up".
 * That is the failure this component was most likely to ship with: a list
 * that renders correctly and is entirely hidden behind the keyboard.
 *
 * Selecting never lets focus leave the textarea — `preventDefault` on
 * pointerdown — because losing focus on a phone closes the keyboard, and
 * having to tap back into the box after every name would make mentioning
 * two people worse than typing them out.
 */
export function MentionTextarea({ value, onValueChange, roster, onSubmit, ...rest }: Props) {
  const { open, setOpen, triggerRef, panelRef, style } = useFloatingPanel<HTMLTextAreaElement>();
  const [query, setQuery] = useState<{ start: number; query: string } | null>(null);
  const [highlight, setHighlight] = useState(0);
  /** Set when an insert moves the caret; applied once React has re-rendered. */
  const pendingCaret = useRef<number | null>(null);
  /**
   * The `@` position the user dismissed with Escape. Without it, the very
   * next keystroke re-syncs and the list they just dismissed springs back.
   */
  const dismissed = useRef<number | null>(null);

  const matches = query ? matchRoster(roster, query.query).slice(0, 6) : [];
  const showing = open && query !== null && matches.length > 0;

  useEffect(() => {
    const caret = pendingCaret.current;
    if (caret === null) return;
    pendingCaret.current = null;
    const el = triggerRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(caret, caret);
  }, [value, triggerRef]);

  /** Re-reads the caret after anything that could have moved it. */
  function sync(el: HTMLTextAreaElement) {
    const next = activeMentionQuery(el.value, el.selectionStart ?? el.value.length);
    setQuery(next);
    setHighlight(0);
    if (next === null) dismissed.current = null;
    // Left open across keystrokes so the list narrows as you type; only a
    // query that has stopped being one, or one already dismissed, closes it.
    setOpen(next !== null && dismissed.current !== next.start);
  }

  function choose(member: MemberSummary) {
    const el = triggerRef.current;
    if (!el || !query) return;
    const result = insertMention(value, query.start, el.selectionStart ?? value.length, member);
    pendingCaret.current = result.caret;
    dismissed.current = null;
    onValueChange(result.body);
    setQuery(null);
    setOpen(false);
  }

  return (
    <>
      <Textarea
        {...rest}
        ref={triggerRef}
        value={value}
        onChange={(event) => {
          onValueChange(event.target.value);
          sync(event.target);
        }}
        onSelect={(event) => sync(event.currentTarget)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (showing) {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setHighlight((i) => (i + 1) % matches.length);
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setHighlight((i) => (i - 1 + matches.length) % matches.length);
              return;
            }
            // Enter picks a name while the list is up. Without this it would
            // insert a newline and leave the half-typed "@ke" behind.
            if (event.key === "Enter" || event.key === "Tab") {
              event.preventDefault();
              choose(matches[highlight] ?? matches[0]!);
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              dismissed.current = query?.start ?? null;
              setOpen(false);
              return;
            }
          }
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            onSubmit?.();
          }
        }}
      />

      {showing && (
        <FloatingPanel
          panelRef={panelRef}
          style={style}
          width={PANEL_WIDTH}
          maxHeight={288}
          flip
          className="z-50 rounded-2xl border-[1.5px] border-border bg-card p-2 shadow-[0_4px_16px_rgba(2,6,23,0.16)]"
        >
          {matches.map((member, index) => (
            <button
              key={member.id}
              type="button"
              role="option"
              aria-selected={index === highlight}
              // Keeps the keyboard up and the caret where it was.
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => choose(member)}
              className={cn(
                "flex w-full min-h-12 items-center gap-3 rounded-xl px-3 py-2 text-left cursor-pointer",
                index === highlight ? "bg-muted text-fg" : "text-sub hover:bg-muted"
              )}
            >
              <Avatar initials={member.initials} color={member.color} size={32} />
              <span className="min-w-0 flex-1 truncate text-[17px] leading-6 font-bold">
                {member.display_name}
              </span>
            </button>
          ))}
        </FloatingPanel>
      )}
    </>
  );
}
