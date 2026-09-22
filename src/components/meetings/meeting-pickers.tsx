"use client";

import { useRef, type ReactNode } from "react";
import { Building2, ChevronDown, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { FloatingPanel, useFloatingPanel } from "@/components/tasks/floating-panel";
import { cn } from "@/lib/utils";

/**
 * The two controls the meeting details panel is built from.
 *
 * Both are the Tasklist's floating panel underneath — the same rounded card,
 * the same rows, the same shadow as the filter menus in the address book.
 * Marcelo put the two side by side and the meetings screen was using the
 * browser's own `<select>`, which on Windows is a grey rectangle in a
 * typeface the app does not otherwise use. One app, one dropdown.
 *
 * They are portalled into `document.body` rather than drawn inside the
 * panel, which matters here: the details panel sits inside a column with
 * `overflow-y: auto`, and per the CSS spec overflow on one axis clips the
 * other too — an absolutely-positioned menu inside it gets silently cut off.
 */

const PANEL_WIDTH = 320;

/**
 * One row of a menu, and one chip above it.
 *
 * `initials` and `color` are optional so the same control can pick companies,
 * which have a name and no face. A row without them draws a building instead,
 * which keeps the two menus the same shape without inventing initials for a
 * company — "ADV Mobil" as a red circle reading "AM" looks like a person.
 */
export interface PickOption {
  id: string;
  label: string;
  hint?: string;
  initials?: string;
  color?: string;
}

/**
 * Pick several of something: a box you type in, with a menu under it.
 *
 * Closed until you press it. The first version listed every option the
 * moment the panel opened, which for the team meant three names and a face
 * each taking up a third of the screen above the thing you were actually
 * trying to reach. A menu you open is a menu that is not in the way.
 *
 * The rows themselves come from the caller already narrowed. That is
 * deliberate: the rule for who to offer is different for the two uses of
 * this — the team is always all of us, the book follows the company — and a
 * component that tried to hold both rules would state neither clearly.
 */
export function PickCombo({
  id,
  placeholder,
  picked,
  options,
  query,
  onQuery,
  onPick,
  onRemove,
  heading,
  emptyText,
  canRemove,
  removeHint,
  disabled,
}: {
  id: string;
  placeholder: string;
  picked: PickOption[];
  options: PickOption[];
  query: string;
  onQuery: (next: string) => void;
  onPick: (id: string) => void;
  onRemove: (id: string) => void;
  /** A line above the rows saying what they are — "At ADV Mobil", say. */
  heading?: string;
  emptyText: string;
  /** False leaves a chip with no X: see the note in meeting-details. */
  canRemove?: (id: string) => boolean;
  removeHint?: string;
  disabled?: boolean;
}) {
  const { open, setOpen, triggerRef, panelRef, style } = useFloatingPanel<HTMLDivElement>();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      {picked.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {picked.map((person) => {
            const removable = canRemove ? canRemove(person.id) : true;
            return (
              <span
                key={person.id}
                className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-border bg-bg py-1 pl-1 pr-1.5"
              >
                <Face option={person} size={26} />
                <span className={cn("text-timestamp font-bold text-fg", !removable && "pr-1.5")}>
                  {person.label}
                </span>
                {removable && !disabled && (
                  <button
                    type="button"
                    onClick={() => onRemove(person.id)}
                    aria-label={`Take ${person.label} off this meeting`}
                    className="inline-grid size-7 cursor-pointer place-items-center rounded-full border-none bg-transparent text-sub hover:bg-muted"
                  >
                    <X aria-hidden className="size-4" strokeWidth={2.2} />
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}

      {removeHint && <p className="text-timestamp text-sub text-pretty">{removeHint}</p>}

      {!disabled && (
        /*
          `field-ring` is defined in globals.css, and has to be: it moves the
          focus ring from the `<input>` to this box, and the rule it has to
          beat is unlayered, which no Tailwind utility can do. See the note
          there. It is also what makes the ring brand red rather than ink.
        */
        <div
          ref={triggerRef}
          className={cn(
            "field-ring flex h-14 items-center rounded-2xl border-[1.5px] bg-bg pr-1",
            open ? "border-fg" : "border-border"
          )}
        >
          <input
            id={id}
            ref={inputRef}
            value={query}
            onChange={(event) => {
              onQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            autoComplete="off"
            className="h-full min-w-0 grow rounded-2xl border-none bg-transparent px-3.5 text-[17px] text-fg placeholder:text-sub"
          />
          <button
            type="button"
            aria-label={open ? "Hide the list" : "Show the list"}
            aria-expanded={open}
            onClick={() => {
              setOpen((wasOpen) => !wasOpen);
              inputRef.current?.focus();
            }}
            className="inline-grid size-11 shrink-0 cursor-pointer place-items-center rounded-xl border-none bg-transparent text-sub hover:bg-muted"
          >
            <ChevronDown
              aria-hidden
              className={cn("size-5 transition-transform duration-150", open && "rotate-180")}
              strokeWidth={2}
            />
          </button>
        </div>
      )}

      {open && !disabled && (
        <Menu panelRef={panelRef} style={style}>
          {heading && <MenuHeading>{heading}</MenuHeading>}
          {options.length === 0 && <MenuEmpty>{emptyText}</MenuEmpty>}
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => {
                onPick(option.id);
                onQuery("");
                inputRef.current?.focus();
              }}
              className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-muted"
            >
              <Face option={option} size={30} />
              <span className="flex min-w-0 grow flex-col">
                <span className="text-[17px] leading-6 font-bold text-fg wrap-anywhere">
                  {option.label}
                </span>
                {option.hint && <span className="text-timestamp text-sub">{option.hint}</span>}
              </span>
            </button>
          ))}
        </Menu>
      )}
    </>
  );
}

/** The card both menus are drawn on. One definition, so they cannot drift. */
function Menu({
  panelRef,
  style,
  children,
}: {
  panelRef: React.RefObject<HTMLDivElement | null>;
  style: React.ComponentProps<typeof FloatingPanel>["style"];
  children: ReactNode;
}) {
  return (
    <FloatingPanel
      panelRef={panelRef}
      style={style}
      width={PANEL_WIDTH}
      maxHeight={360}
      flip
      className="z-50 rounded-2xl border-[1.5px] border-border bg-card p-2 shadow-[0_4px_16px_rgba(2,6,23,0.16)]"
    >
      {children}
    </FloatingPanel>
  );
}

function MenuHeading({ children }: { children: ReactNode }) {
  return (
    <p className="px-3 pb-1 pt-1.5 text-timestamp font-bold uppercase tracking-wider text-sub">
      {children}
    </p>
  );
}

function MenuEmpty({ children }: { children: ReactNode }) {
  return <p className="px-3 py-2.5 text-[16px] leading-[22px] text-sub text-pretty">{children}</p>;
}

/** A face for a person, a building for a company. */
function Face({ option, size }: { option: PickOption; size: number }) {
  if (option.initials) {
    return <Avatar initials={option.initials} color={option.color ?? "#87252b"} size={size} />;
  }
  return (
    <span
      aria-hidden
      className="inline-grid shrink-0 place-items-center rounded-full border-[1.5px] border-border bg-muted text-sub"
      style={{ width: size, height: size }}
    >
      <Building2 className="size-[60%]" strokeWidth={1.75} />
    </span>
  );
}
