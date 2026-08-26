"use client";

import { useEffect, useRef, useState } from "react";
import { Filter } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { cn } from "@/lib/utils";
import { STATUSES, STATUS_ORDER } from "@/lib/constants";
import type { TaskFilters } from "@/lib/tasks-view";
import type { TaskStatus } from "@/lib/supabase/database.types";

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function FiltersPanel({
  filters,
  onChange,
  categories,
}: {
  filters: TaskFilters;
  onChange: (next: TaskFilters) => void;
  categories: { id: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const count = filters.status.length + filters.categoryIds.length;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          "flex h-12 items-center gap-1.5 whitespace-nowrap rounded-full border-[1.5px] px-4 text-[16px] leading-[22px] font-bold cursor-pointer transition-transform duration-150 active:scale-[0.97]",
          count > 0 ? "border-prim bg-prim text-on-prim" : "border-border bg-card text-fg"
        )}
      >
        <Filter aria-hidden className="size-4" />
        More filters
        {count > 0 && <span className="tabular-nums">· {count}</span>}
      </button>

      {open && (
        <div className="absolute left-0 z-20 mt-2 flex w-[min(90vw,380px)] flex-col gap-5 rounded-2xl border-[1.5px] border-border bg-card p-5 shadow-[0_1px_3px_rgba(2,6,23,0.08)]">
          <FilterGroup label="Status">
            {STATUS_ORDER.map((value) => {
              const spec = STATUSES[value];
              const Icon = spec.icon;
              return (
                <Chip
                  key={value}
                  selected={filters.status.includes(value)}
                  icon={<Icon aria-hidden className="size-4" />}
                  onClick={() => onChange({ ...filters, status: toggle<TaskStatus>(filters.status, value) })}
                >
                  {spec.label}
                </Chip>
              );
            })}
          </FilterGroup>

          <FilterGroup label="Category">
            {categories.map((category) => (
              <Chip
                key={category.id}
                selected={filters.categoryIds.includes(category.id)}
                onClick={() => onChange({ ...filters, categoryIds: toggle(filters.categoryIds, category.id) })}
              >
                {category.label}
              </Chip>
            ))}
            {categories.length === 0 && <p className="text-[16px] text-sub">No categories yet.</p>}
          </FilterGroup>

          {count > 0 && (
            <button
              type="button"
              onClick={() => onChange({ ...filters, status: [], categoryIds: [] })}
              className="self-start text-[16px] leading-[22px] font-bold text-brand underline underline-offset-[3px] cursor-pointer"
            >
              Clear these filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="text-field-label">{label}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
