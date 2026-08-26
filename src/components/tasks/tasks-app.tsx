"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Filter, Plus, Settings } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { IconButton } from "@/components/ui/icon-button";
import { useToast } from "@/components/ui/toast";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { EmptyState } from "@/components/tasks/empty-state";
import { FiltersPanel } from "@/components/tasks/filters-panel";
import { SortMenu } from "@/components/tasks/sort-menu";
import { TaskPill } from "@/components/tasks/task-pill";
import { setTaskStatus, softDeleteTask, restoreTask } from "@/app/tasks/actions";
import { EMPTY_FILTERS, countActiveFilters, groupTasks, matchesFilters, type SortMode, type TaskFilters } from "@/lib/tasks-view";
import type { MemberSummary, TaskWithRelations } from "@/lib/data/tasks";
import type { TaskStatus } from "@/lib/supabase/database.types";

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
  const [filtersOpen, setFiltersOpen] = useState(false);
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
      <header className="flex shrink-0 flex-col gap-4 border-b-[1.5px] border-border bg-card px-5 pt-[calc(env(safe-area-inset-top)+12px)] pb-4">
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
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            className="flex flex-1 h-14 items-center justify-center gap-2 rounded-full border-[1.5px] border-border bg-card text-chip text-fg cursor-pointer transition-transform duration-150 active:scale-[0.97]"
          >
            <Filter aria-hidden className="size-4" />
            Filters
            {activeCount > 0 && (
              <span className="inline-flex h-[26px] min-w-[26px] items-center justify-center rounded-full bg-brand px-1.5 text-[15px] font-bold text-white">
                {activeCount}
              </span>
            )}
            <ChevronDown aria-hidden className={`size-4 transition-transform duration-150 ${filtersOpen ? "rotate-180" : ""}`} />
          </button>
          <SortMenu value={sort} onChange={setSort} />
        </div>
        {activeCount > 0 && !filtersOpen && (
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

      {filtersOpen && (
        <FiltersPanel
          filters={filters}
          onChange={setFilters}
          roster={roster}
          categories={categories}
          resultCount={totalMatching}
          onClose={() => setFiltersOpen(false)}
        />
      )}

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
