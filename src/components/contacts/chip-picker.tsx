"use client";

import { useState } from "react";
import { Plus, type LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Picking several of something, and inventing one when the list falls short.
 *
 * One component for both vocabularies — what a company is, and what a person
 * is to us — because they are the same gesture and learning it twice is a
 * waste of the person using it.
 *
 * Several rather than one, because reality is: Royal Truck & Utility Trailer
 * is a trailer dealer and a parts dealer and an upfitter, and a single choice
 * made the book lie about companies like it.
 */
export function ChipPicker<T extends { id: string; label: string; icon: string }>({
  label,
  options,
  icons,
  fallbackIcon,
  selected,
  onChange,
  newLabel,
  onNewLabel,
  newPlaceholder,
  newButtonLabel = "New type",
}: {
  label: string;
  options: T[];
  icons: Record<string, LucideIcon>;
  fallbackIcon: LucideIcon;
  selected: string[];
  onChange: (next: string[]) => void;
  /** Set when the "new one" box is open and a name is being typed. */
  newLabel: string;
  onNewLabel: (next: string) => void;
  newPlaceholder: string;
  newButtonLabel?: string;
}) {
  const [otherOpen, setOtherOpen] = useState(false);

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-field-label text-fg">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const Icon = icons[option.icon] ?? fallbackIcon;
          const on = selected.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={on}
              // Pressing a chosen one again clears it. None is a real answer:
              // most people are simply somebody at a company.
              onClick={() => toggle(option.id)}
              className={cn(
                "inline-flex h-14 cursor-pointer items-center gap-2 rounded-full border-[1.5px] px-4",
                "text-chip transition-transform duration-150 active:scale-[0.97]",
                on ? "border-btn bg-btn text-on-btn" : "border-border bg-card text-fg hover:bg-muted"
              )}
            >
              <Icon aria-hidden className="size-5 shrink-0" strokeWidth={1.75} />
              {option.label}
            </button>
          );
        })}

        {/* Type one nobody has needed yet and it becomes one everybody can pick. */}
        <button
          type="button"
          aria-pressed={otherOpen}
          onClick={() => {
            if (otherOpen) onNewLabel("");
            setOtherOpen(!otherOpen);
          }}
          className={cn(
            "inline-flex h-14 cursor-pointer items-center gap-2 rounded-full border-[1.5px] px-4",
            "text-chip transition-transform duration-150 active:scale-[0.97]",
            otherOpen ? "border-btn bg-btn text-on-btn" : "border-border bg-card text-fg hover:bg-muted"
          )}
        >
          <Plus aria-hidden className="size-5 shrink-0" strokeWidth={2.5} />
          {newButtonLabel}
        </button>
      </div>

      {otherOpen && (
        <Input
          value={newLabel}
          onChange={(e) => onNewLabel(e.target.value)}
          placeholder={newPlaceholder}
          aria-label={newButtonLabel}
          maxLength={60}
          autoComplete="off"
        />
      )}
    </div>
  );
}

/**
 * The chips as a row shows them: a couple, and the rest counted.
 *
 * Three on a 390px row is confetti — the count says the same thing and keeps
 * the row readable. The full set lives on the page and in the panel.
 */
export function ChipRow<T extends { id: string; label: string; icon: string }>({
  items,
  icons,
  fallbackIcon,
  max = 2,
}: {
  items: T[];
  icons: Record<string, LucideIcon>;
  fallbackIcon: LucideIcon;
  max?: number;
}) {
  if (items.length === 0) return null;
  const shown = items.slice(0, max);
  const more = items.length - shown.length;

  return (
    <>
      {shown.map((item) => {
        const Icon = icons[item.icon] ?? fallbackIcon;
        return (
          <span
            key={item.id}
            /*
              Brand red on white, amber on the dark ground. They were the
              same grey as everything else on the row, so the "+1" beside
              them read as part of the sentence rather than as a count.
            */
            className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-tag px-2.5 py-1 text-timestamp font-bold text-tag"
          >
            <Icon aria-hidden className="size-[18px] shrink-0" strokeWidth={1.75} />
            {item.label}
          </span>
        );
      })}
      {more > 0 && (
        <span className="text-timestamp font-bold text-tag tabular-nums">+{more}</span>
      )}
    </>
  );
}
