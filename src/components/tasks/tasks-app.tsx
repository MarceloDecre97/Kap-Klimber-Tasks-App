"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus, Settings, Users } from "lucide-react";
import Image from "next/image";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { IconButton } from "@/components/ui/icon-button";
import { useToast } from "@/components/ui/toast";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { EmptyState } from "@/components/tasks/empty-state";
import { FilterDropdown, type FilterOption } from "@/components/tasks/filter-dropdown";
import { FiltersPanel } from "@/components/tasks/filters-panel";
import { SortMenu } from "@/components/tasks/sort-menu";
import { TaskPill } from "@/components/tasks/task-pill";
import { setTaskStatus, softDeleteTask, restoreTask } from "@/app/tasks/actions";
import { PRIORITIES, PRIORITY_ORDER } from "@/lib/constants";
import { EMPTY_FILTERS, countActiveFilters, groupTasks, matchesFilters, type SortMode, type TaskFilters } from "@/lib/tasks-view";
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
  const [sort, setSort] = useState<SortMode>("priority");
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

  const groups = useMemo(() => groupTasks(open, sort), [open, sort]);
  const totalMatching = open.length + complete.length;

  const overallDone = useMemo(() => initialTasks.filter((task) => task.status === "complete").length, [initialTasks]);
  const overallTotal = initialTasks.length;
  const overallPercent = overallTotal > 0 ? Math.round((overallDone / overallTotal) * 100) : 0;

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
    <div className="flex h-dvh flex-col bg-bg">
      <header className="flex shrink-0 flex-col gap-3 border-b-[1.5px] border-border bg-card px-5 pt-[calc(env(safe-area-inset-top)+10px)] pb-3.5">
        <div className="flex items-center justify-between gap-4">
          <Image src="/kap-klimber-logo.svg" alt="Kap Klimber" width={120} height={19} className="h-[19px] w-auto dark:invert" />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link href="/settings">
              <IconButton aria-label="Settings">
                <Settings aria-hidden className="size-5" />
              </IconButton>
            </Link>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-screen-title">Tasks</h1>
          <span className="text-[16px] leading-[22px] font-bold text-sub">{me.display_name}</span>
        </div>

        {overallTotal > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3 text-[15px] leading-5 font-bold text-sub tabular-nums">
              <span>
                {overallDone} of {overallTotal} done
              </span>
              <span>{overallPercent}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${overallPercent}%` }} />
            </div>
          </div>
        )}

        <div data-hscroll="true" className="flex gap-2 overflow-x-auto">
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

        {activeCount > 0 && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-[16px] leading-[22px] tabular-nums text-sub">
              Showing {totalMatching} of {initialTasks.length} tasks
            </span>
            <button
              type="button"
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="text-[16px] leading-[22px] font-bold text-brand underline underline-offset-[3px] cursor-pointer"
            >
              Clear filters
            </button>
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-5 pb-6 pt-4">
        {groups.length === 0 && complete.length === 0 ? (
          <EmptyState hasFilters={activeCount > 0} onClearFilters={() => setFilters(EMPTY_FILTERS)} />
        ) : (
          <div className="flex flex-col gap-6">
            {groups.map((group) => (
              <div key={group.key} className="grid grid-cols-[64px_1fr] gap-3">
                <div className="flex flex-col items-end gap-2 pt-0.5">
                  <div className="sticky top-0 flex items-center gap-2 text-[16px] leading-[22px] font-bold text-sub text-right">
                    {group.label}
                    <span className="size-[11px] shrink-0 rounded-full bg-brand" />
                  </div>
                  <div className="flex-1 w-[1.5px] bg-line" />
                </div>
                <div className="flex flex-col gap-3 min-w-0 pb-1">
                  {group.tasks.map((task) => (
                    <TaskPill
                      key={task.id}
                      task={task}
                      expanded={expandedId === task.id}
                      onToggleExpand={() => setExpandedId((id) => (id === task.id ? null : task.id))}
                      onSetStatus={(status) => handleSetStatus(task.id, status)}
                      onRequestDelete={() => setDeleteTarget(task)}
                    />
                  ))}
                </div>
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
                        expanded={expandedId === task.id}
                        onToggleExpand={() => setExpandedId((id) => (id === task.id ? null : task.id))}
                        onSetStatus={(status) => handleSetStatus(task.id, status)}
                        onRequestDelete={() => setDeleteTarget(task)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="shrink-0 border-t-[1.5px] border-border bg-card px-5 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3">
        <Link href="/tasks/new">
          <Button>
            <Plus aria-hidden className="size-5" />
            New task
          </Button>
        </Link>
      </footer>

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
