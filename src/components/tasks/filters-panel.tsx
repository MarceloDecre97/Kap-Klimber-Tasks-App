"use client";

import { Chip } from "@/components/ui/chip";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { PRIORITIES, PRIORITY_ORDER, STATUSES, STATUS_ORDER } from "@/lib/constants";
import type { MemberSummary } from "@/lib/data/tasks";
import type { TaskFilters } from "@/lib/tasks-view";
import type { Priority, TaskStatus } from "@/lib/supabase/database.types";

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function FiltersPanel({
  filters,
  onChange,
  roster,
  categories,
  resultCount,
  onClose,
}: {
  filters: TaskFilters;
  onChange: (next: TaskFilters) => void;
  roster: MemberSummary[];
  categories: { id: string; label: string }[];
  resultCount: number;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-5 border-b-[1.5px] border-border bg-card px-5 py-5">
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

      <FilterGroup label="Priority">
        {PRIORITY_ORDER.map((value) => {
          const spec = PRIORITIES[value];
          const Icon = spec.icon;
          return (
            <Chip
              key={value}
              selected={filters.priority.includes(value)}
              icon={<Icon aria-hidden className="size-4" />}
              onClick={() => onChange({ ...filters, priority: toggle<Priority>(filters.priority, value) })}
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
      </FilterGroup>

      <FilterGroup label="Assigned to">
        {roster.map((person) => (
          <Chip
            key={person.id}
            selected={filters.assigneeIds.includes(person.id)}
            icon={<Avatar initials={person.initials} color={person.color} size={28} />}
            onClick={() => onChange({ ...filters, assigneeIds: toggle(filters.assigneeIds, person.id) })}
          >
            {person.display_name}
          </Chip>
        ))}
      </FilterGroup>

      <div className="flex gap-3 pt-1">
        <Button
          variant="secondary"
          className="w-auto px-5"
          onClick={() =>
            onChange({ mine: filters.mine, status: [], priority: [], categoryIds: [], assigneeIds: [] })
          }
        >
          Clear all
        </Button>
        <Button onClick={onClose}>
          Show {resultCount} {resultCount === 1 ? "task" : "tasks"}
        </Button>
      </div>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="text-field-label">{label}</div>
      <div className="flex flex-wrap gap-3">{children}</div>
    </div>
  );
}
