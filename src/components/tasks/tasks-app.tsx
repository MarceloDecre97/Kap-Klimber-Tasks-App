"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus, Search, Users, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { AppHeader } from "@/components/layout/app-header";
import { EmptyState } from "@/components/tasks/empty-state";
import { FilterDropdown, type FilterOption } from "@/components/tasks/filter-dropdown";
import { FiltersPanel } from "@/components/tasks/filters-panel";
import { SortMenu } from "@/components/tasks/sort-menu";
import { TaskPill } from "@/components/tasks/task-pill";
import { setTaskStatus, softDeleteTask, restoreTask, toggleReminderDismissal } from "@/app/tasks/actions";
import { PRIORITIES, PRIORITY_ORDER } from "@/lib/constants";
import {
  EMPTY_FILTERS,
  countActiveFilters,
  getLastActivityAt,
  groupTasks,
  matchesFilters,
  type SortMode,
  type TaskFilters,
} from "@/lib/tasks-view";
import { cn, formatDateGroup } from "@/lib/utils";
import type { MemberSummary, TaskWithRelations } from "@/lib/data/tasks";
import type { Priority, TaskStatus } from "@/lib/supabase/database.types";

export function TasksApp({
  initialTasks,
  roster,
  categories,
  me,
}: {
  initialTasks: TaskWithRelations[];
  roster: MemberSummary[];
  categories: { id: string; label: string; is_default: boolean }[];
  me: { id: string; display_name: string; initials: string; color: string };
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [filters, setFilters] = useState<TaskFilters>(EMPTY_FILTERS);
  // null until the user picks one, so the button can read a plain "Sort".
  const [sort, setSort] = useState<SortMode | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showComplete, setShowComplete] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TaskWithRelations | null>(null);
  const [, startTransition] = useTransition();

  const activeCount = countActiveFilters(filters);

  const { open, complete } = useMemo(() => {
    const matching = initialTasks.filter((task) => matchesFilters(task, filters, me.id));
    return {
      open: matching.filter((task) => task.status !== "complete"),
      complete: matching.filter((task) => task.status === "complete"),
    };
  }, [initialTasks, filters, me.id]);

  // No explicit sort still orders by priority — same list as before, the
  // button label is the only thing that changes.
  const groups = useMemo(() => groupTasks(open, sort ?? "priority"), [open, sort]);
  const totalMatching = open.length + complete.length;

  const priorityOptions: FilterOption<Priority>[] = useMemo(
    () =>
      PRIORITY_ORDER.map((value) => {
        const spec = PRIORITIES[value];
        const Icon = spec.icon;
        return { value, label: spec.label, icon: <Icon aria-hidden className="size-4" /> };
      }),
    []
  );

  const assigneeOptions: FilterOption<string>[] = useMemo(
    () =>
      roster.map((person) => ({
        value: person.id,
        label: person.display_name,
        icon: <Avatar initials={person.initials} color={person.color} size={22} />,
      })),
    [roster]
  );

  function handleSetStatus(taskId: string, status: TaskStatus) {
    startTransition(async () => {
      const result = await setTaskStatus(taskId, status);
      if (!result.ok) {
        showToast({ message: result.error });
        return;
      }
      router.refresh();
    });
  }

  function handleToggleReminder(taskId: string) {
    startTransition(async () => {
      const result = await toggleReminderDismissal(taskId);
      if (!result.ok) {
        showToast({ message: result.error });
        return;
      }
      router.refresh();
    });
  }

  function handleConfirmDelete() {
    const task = deleteTarget;
    if (!task) return;
    setDeleteTarget(null);
    startTransition(async () => {
      const result = await softDeleteTask(task.id);
      if (!result.ok) {
        showToast({ message: result.error });
        return;
      }
      router.refresh();
      showToast({
        message: "Task deleted",
        actionLabel: "Undo",
        onAction: () => {
          startTransition(async () => {
            await restoreTask(task.id);
            router.refresh();
          });
        },
      });
    });
  }

  return (
    <div className="flex h-full flex-col bg-bg">
      <AppHeader current="/tasks">
        {/*
          Six controls wrapped into four stacked rows on a phone, which ate
          most of the screen before a single task appeared. They are now two
          rows below `lg`: search plus New Task on top, where the thumb is,
          and the four filters on a row that scrolls sideways. The scroller
          is safe here because the dropdown panels render through a portal
          (see `floating-panel.tsx`) and so are not clipped by it. From `lg`
          up the two groups sit side by side and it reads as one row again.
        */}
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="order-2 -mx-5 -my-1 flex items-center gap-2 overflow-x-auto px-5 py-1 lg:order-1 lg:mx-0 lg:my-0 lg:overflow-x-visible lg:px-0 lg:py-0">
            <FilterDropdown label="Priority" options={priorityOptions} selected={filters.priority} onChange={(priority) => setFilters({ ...filters, priority })} />
            <FilterDropdown
              label="Assigned to"
              icon={<Users aria-hidden className="size-4" />}
              options={assigneeOptions}
              selected={filters.assigneeIds}
              onChange={(assigneeIds) => setFilters({ ...filters, assigneeIds })}
            />
            <FiltersPanel filters={filters} onChange={setFilters} categories={categories} />
            <SortMenu value={sort} onChange={setSort} />
          </div>

          <div className="order-1 flex min-w-0 items-center gap-2 lg:order-2 lg:flex-1">
            <div className="relative min-w-0 flex-1">
              <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-sub" />
              <input
                type="text"
                value={filters.query}
                onChange={(event) => setFilters({ ...filters, query: event.target.value })}
                placeholder="Search tasks, notes, people…"
                aria-label="Search tasks"
                className="h-12 w-full rounded-full border-[1.5px] border-border bg-card pl-10 pr-10 text-[16px] text-fg placeholder:text-sub focus-visible:border-prim focus-visible:outline-[3px] focus-visible:outline-offset-2"
              />
              {filters.query && (
                <button
                  type="button"
                  onClick={() => setFilters({ ...filters, query: "" })}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-sub cursor-pointer hover:bg-muted"
                >
                  <X aria-hidden className="size-4" />
                </button>
              )}
            </div>

            {/*
              Icon-only until `sm`, where the label costs more width than the
              search field can spare — and filled brand red there, not white.
              The white resting state was designed to turn red on hover, but a
              phone has no hover, so on touch the button would have been stuck
              in its quietest form forever. Red at rest is that same intent,
              delivered on the device that can't hover. `aria-label` carries
              the name at every size.
            */}
            <Link href="/tasks/new" className="shrink-0">
              <Button
                size="md"
                aria-label="New task"
                className={cn(
                  "size-12 justify-center rounded-full px-0 border-[1.5px]",
                  "bg-brand text-on-brand border-brand",
                  "sm:w-auto sm:rounded-xl sm:px-4 sm:bg-white sm:text-black sm:border-border",
                  "sm:hover:bg-brand sm:hover:text-on-brand sm:hover:border-brand",
                  "sm:active:bg-brand sm:active:text-on-brand sm:active:border-brand"
                )}
              >
                <Plus aria-hidden className="size-6 sm:size-4" strokeWidth={2.5} />
                <span className="hidden sm:inline">New Task</span>
              </Button>
            </Link>
          </div>
        </div>

        {(activeCount > 0 || filters.query || sort) && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-[16px] leading-[22px] tabular-nums text-sub">
              Showing {totalMatching} of {initialTasks.length} tasks
            </span>
            <button
              type="button"
              onClick={() => {
                setFilters(EMPTY_FILTERS);
                setSort(null);
              }}
              className="text-[16px] leading-[22px] font-bold text-brand underline underline-offset-[3px] cursor-pointer"
            >
              Clear all
            </button>
          </div>
        )}
      </AppHeader>

      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+24px)]">
        {groups.length === 0 && complete.length === 0 ? (
          <EmptyState hasFilters={activeCount > 0 || !!filters.query} onClearFilters={() => setFilters(EMPTY_FILTERS)} />
        ) : (
          <div className="flex flex-col gap-6">
            {groups.map((group) => (
              <div key={group.key} className="flex flex-col gap-3">
                {/*
                  The rail costs 104px of a 390px phone — 27% of the screen —
                  to show a heading and a date the card can carry itself. Below
                  `lg` the heading becomes a plain row above the list and the
                  date moves into the card; from `lg` up, where the width is
                  free, the rail comes back exactly as it was.
                */}
                <div className="text-[15px] leading-[20px] font-bold text-sub lg:hidden">{group.label}</div>
                {group.tasks.map((task, taskIndex) => (
                  <div key={task.id} className="lg:grid lg:grid-cols-[92px_minmax(0,1fr)] lg:gap-3">
                    <div className="hidden flex-col items-end gap-1 pt-0.5 lg:flex">
                      {taskIndex === 0 && (
                        <div className="sticky top-0 text-[15px] leading-[20px] font-bold text-sub text-right whitespace-nowrap">
                          {group.label}
                        </div>
                      )}
                      <div className="flex flex-col items-end text-[11px] leading-[13px] font-bold text-sub tabular-nums whitespace-nowrap opacity-70">
                        <span>Updated</span>
                        <span>{formatDateGroup(getLastActivityAt(task))}</span>
                      </div>
                      <div className="flex-1 w-[1.5px] bg-line" />
                    </div>
                    <div className="min-w-0">
                      <TaskPill
                        task={task}
                        meId={me.id}
                        expanded={expandedId === task.id}
                        onToggleExpand={() => setExpandedId((id) => (id === task.id ? null : task.id))}
                        onSetStatus={(status) => handleSetStatus(task.id, status)}
                        onRequestDelete={() => setDeleteTarget(task)}
                        onToggleReminder={() => handleToggleReminder(task.id)}
                        lastActivityAt={getLastActivityAt(task)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ))}

            {complete.length > 0 && (
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => setShowComplete((v) => !v)}
                  className="flex h-14 w-full items-center gap-3 rounded-2xl border-[1.5px] border-border bg-card px-4 text-[18px] leading-7 font-bold text-fg cursor-pointer"
                >
                  <ChevronDown aria-hidden className={`size-5 transition-transform duration-150 ${showComplete ? "rotate-180" : "-rotate-90"}`} />
                  Complete ({complete.length})
                </button>
                {showComplete && (
                  <div className="flex flex-col gap-3">
                    {complete.map((task) => (
                      <TaskPill
                        key={task.id}
                        task={task}
                        meId={me.id}
                        expanded={expandedId === task.id}
                        onToggleExpand={() => setExpandedId((id) => (id === task.id ? null : task.id))}
                        onSetStatus={(status) => handleSetStatus(task.id, status)}
                        onRequestDelete={() => setDeleteTarget(task)}
                        onToggleReminder={() => handleToggleReminder(task.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        {deleteTarget && (
          <>
            <div className="text-section-heading text-pretty">Delete &ldquo;{deleteTarget.title}&rdquo;?</div>
            <p className="text-[18px] leading-7 text-sub text-pretty">This can&apos;t be undone once the undo message goes away.</p>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Keep the task
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              Delete it
            </Button>
          </>
        )}
      </Dialog>
    </div>
  );
}
