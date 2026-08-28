"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Bell, ChevronDown, MessageSquare } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { AppHeader } from "@/components/layout/app-header";
import { BigStat, Card, EmptyLine, LegendRow, MeterRow, StackedBar } from "@/components/dashboard/cards";
import { TaskPill } from "@/components/tasks/task-pill";
import { restoreTask, setTaskStatus, softDeleteTask } from "@/app/tasks/actions";
import {
  STALE_AFTER_DAYS,
  computeDashboardStats,
  type BucketSpec,
  type PersonalScope,
} from "@/lib/dashboard-stats";
import { cn } from "@/lib/utils";
import type { CountTone } from "@/lib/dashboard-stats";
import type { MemberSummary, TaskWithRelations } from "@/lib/data/tasks";
import type { TaskStatus } from "@/lib/supabase/database.types";

/**
 * Colour reads as severity: quiet = nothing here, filled = there is work,
 * amber = getting heavy, red = act now. The on-* label tokens flip with the
 * theme, since both the amber and red fills invert lightness in dark mode.
 */
const COUNT_TONE: Record<CountTone, string> = {
  quiet: "border-border bg-muted text-muted-fg",
  neutral: "border-prim bg-prim text-on-prim",
  amber: "border-accent bg-accent text-on-accent",
  danger: "border-danger bg-danger text-on-danger",
};

export function DashboardApp({
  initialTasks,
  roster,
  me,
}: {
  initialTasks: TaskWithRelations[];
  roster: MemberSummary[];
  me: { id: string; display_name: string; initials: string; color: string };
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [scope, setScope] = useState<PersonalScope>("assigned");
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TaskWithRelations | null>(null);
  const [, startTransition] = useTransition();


  const stats = useMemo(
    () => computeDashboardStats({ tasks: initialTasks, roster, meId: me.id, scope }),
    [initialTasks, roster, me.id, scope]
  );

  function isSectionOpen(bucket: BucketSpec) {
    return openSections[bucket.key] ?? bucket.defaultOpen;
  }

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

  const firstName = me.display_name.trim().split(/\s+/)[0] ?? me.display_name;
  const openTotal = stats.openTasks.length;

  return (
    <div className="flex h-dvh flex-col bg-bg">
      <AppHeader current="/dashboard" />

      <div className="flex-1 overflow-y-auto px-5 pt-5 pb-[calc(env(safe-area-inset-bottom)+32px)]">
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[400px_minmax(0,1fr)]">
          {/* ---- Personal panel ------------------------------------------ */}
          <div className="flex min-w-0 flex-col gap-5">
            <div className="flex flex-col gap-4">
              <h1 className="text-screen-title text-fg">Hello, {firstName}</h1>

              {stats.unseenNoteCount > 0 && (
                <Link
                  href="/tasks"
                  className="flex min-h-14 items-center gap-3 rounded-2xl border-[1.5px] border-border bg-card px-4 py-3 text-[17px] leading-6 text-fg hover:bg-muted"
                >
                  <MessageSquare aria-hidden className="size-5 shrink-0 text-brand" />
                  <span className="font-bold tabular-nums text-pretty">
                    {stats.unseenNoteCount} {stats.unseenNoteCount === 1 ? "note" : "notes"} you haven&apos;t marked
                    seen
                  </span>
                </Link>
              )}

              <div role="tablist" aria-label="Scope" className="flex gap-1 rounded-full bg-muted p-1">
                {(
                  [
                    { value: "assigned", label: "Assigned to me" },
                    { value: "created", label: "Created by me" },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="tab"
                    aria-selected={scope === option.value}
                    onClick={() => setScope(option.value)}
                    className={cn(
                      "h-12 flex-1 rounded-full text-[17px] leading-6 font-bold cursor-pointer transition-colors duration-150",
                      scope === option.value ? "bg-prim text-on-prim" : "text-muted-fg hover:text-fg"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {stats.buckets.map((bucket) => {
              const open = isSectionOpen(bucket);
              const has = bucket.entries.length > 0;
              const urgentAndFull = bucket.urgent && has;

              return (
                <div
                  key={bucket.key}
                  className={cn("flex flex-col gap-3", urgentAndFull && "border-l-[1.5px] border-danger pl-4")}
                >
                  <button
                    type="button"
                    onClick={() => setOpenSections((s) => ({ ...s, [bucket.key]: !open }))}
                    aria-expanded={open}
                    disabled={!has}
                    className="flex min-h-14 w-full items-center gap-3 text-left text-fg cursor-pointer disabled:cursor-default"
                  >
                    {/*
                      Count first, so every number lands in one vertical
                      column and the panel can be scanned down a single strip
                      rather than hunting past labels of differing lengths.
                      Tone is decided in dashboard-stats, where the meaning of
                      a bucket lives; this only maps tone to colour.
                    */}
                    <span
                      className={cn(
                        "inline-flex h-8 min-w-9 shrink-0 items-center justify-center rounded-full border-[1.5px] px-2",
                        "text-[15px] leading-5 font-bold tabular-nums",
                        COUNT_TONE[bucket.countTone]
                      )}
                    >
                      {bucket.entries.length}
                    </span>
                    <span className="text-field-label">{bucket.title}</span>
                    {bucket.prompt && has && (
                      <span className="truncate text-[15px] leading-5 text-sub">{bucket.prompt}</span>
                    )}
                    {has && (
                      <ChevronDown
                        aria-hidden
                        className={cn(
                          "ml-auto size-5 shrink-0 text-sub transition-transform duration-150",
                          open ? "rotate-180" : ""
                        )}
                      />
                    )}
                  </button>

                  {!has && <EmptyLine>{bucket.emptyCopy}</EmptyLine>}

                  {open && has && (
                    <div className="flex flex-col gap-3">
                      {bucket.entries.map((entry) => (
                        <div key={entry.task.id} className="flex flex-col gap-1.5">
                          <TaskPill
                            task={entry.task}
                            meId={me.id}
                            expanded={expandedId === entry.task.id}
                            onToggleExpand={() =>
                              setExpandedId((id) => (id === entry.task.id ? null : entry.task.id))
                            }
                            onSetStatus={(status) => handleSetStatus(entry.task.id, status)}
                            onRequestDelete={() => setDeleteTarget(entry.task)}
                          />
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3 text-[15px] leading-5 font-bold tabular-nums">
                            {entry.hasReminder && (
                              <Bell aria-hidden className="size-3.5 shrink-0 text-accent" />
                            )}
                            <span
                              className={cn(
                                entry.missedDeadline
                                  ? "text-danger"
                                  : entry.passedReminder
                                    ? "text-accent"
                                    : "text-sub"
                              )}
                            >
                              {entry.primaryLabel}
                            </span>
                            {entry.secondaryLabel && (
                              <span className="text-sub opacity-80">· {entry.secondaryLabel}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ---- Team overview ------------------------------------------- */}
          <div className="flex min-w-0 flex-col gap-5">
            <div className="flex flex-col gap-1">
              <h2 className="text-screen-title text-fg">Team overview</h2>
              <p className="text-[17px] leading-6 text-sub">All open tasks across the team.</p>
            </div>

            <Link
              href="/tasks"
              className="flex items-center gap-4 rounded-2xl border-[1.5px] border-border bg-card p-5 shadow-[0_1px_3px_rgba(2,6,23,0.08)] hover:bg-muted"
            >
              <BigStat
                value={stats.asapCount}
                tone="brand"
                icon={<AlertTriangle aria-hidden className="size-8" />}
                caption={
                  <span className="font-bold text-fg">
                    {stats.asapCount === 1 ? "task is" : "tasks are"} marked ASAP
                  </span>
                }
              />
            </Link>

            <Card title="Open tasks by status">
              {openTotal === 0 ? (
                <EmptyLine>No open tasks — the whole board is clear.</EmptyLine>
              ) : (
                <>
                  <StackedBar
                    segments={stats.statusSegments}
                    ariaLabel={`Open tasks by status: ${stats.statusSegments
                      .map((s) => `${s.label} ${s.count}`)
                      .join(", ")}`}
                  />
                  <div className="flex flex-col gap-1">
                    {stats.statusSegments.map((segment) => (
                      <LegendRow key={segment.key} segment={segment} />
                    ))}
                  </div>
                </>
              )}
              <p className="text-[15px] leading-5 text-sub tabular-nums">
                {stats.completeCount} complete {stats.completeCount === 1 ? "task is" : "tasks are"} excluded from this
                bar.
              </p>
            </Card>

            <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
              <Card title="Workload by person">
                {stats.workload.length === 0 ? (
                  <EmptyLine>Nobody on the roster yet.</EmptyLine>
                ) : (
                  <div className="flex flex-col gap-2">
                    {stats.workload.map((row) => (
                      <div key={row.member.id} className="flex min-h-11 items-center gap-3 rounded-xl px-1">
                        <Avatar initials={row.member.initials} color={row.member.color} size={32} />
                        <span className="w-[70px] shrink-0 truncate text-[15px] leading-5 font-bold text-fg">
                          {row.member.display_name.split(/\s+/)[0]}
                        </span>
                        <span
                          role="img"
                          aria-label={`${row.member.display_name}: ${row.total} open ${
                            row.total === 1 ? "task" : "tasks"
                          }`}
                          className="flex h-6 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
                        >
                          {row.segments.map((segment) => (
                            <span key={segment.key} style={{ width: segment.width, background: segment.fill }} />
                          ))}
                        </span>
                        <span className="w-8 shrink-0 text-right text-[17px] leading-6 font-bold tabular-nums text-fg">
                          {row.total}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[15px] leading-5 text-sub text-pretty">
                  Tasks with multiple assignees are counted for each person.
                </p>
              </Card>

              <Card title="Age of open tasks">
                <div className="flex flex-col gap-2">
                  {stats.ageRows.map((row) => (
                    <MeterRow key={row.key} row={row} />
                  ))}
                </div>
                {stats.oldest && (
                  <>
                    <div className="h-[1.5px] bg-border" />
                    <div className="flex flex-col gap-1.5 px-1">
                      <span className="text-[15px] leading-5 font-bold text-sub">Oldest open task</span>
                      <span className="text-card-title truncate text-fg">{stats.oldest.task.title}</span>
                      <span className="flex items-center gap-2.5 text-[15px] leading-5 text-sub tabular-nums">
                        {stats.oldest.ageDays} {stats.oldest.ageDays === 1 ? "day" : "days"} old
                        {stats.oldest.task.assignees.map((person) => (
                          <Avatar
                            key={person.id}
                            initials={person.initials}
                            color={person.color}
                            size={28}
                          />
                        ))}
                      </span>
                    </div>
                  </>
                )}
              </Card>

              <Card title="Stale tasks">
                <BigStat
                  value={stats.staleTasks.length}
                  tone="accent"
                  caption={
                    <>
                      {stats.staleTasks.length === 1 ? "task has" : "tasks have"} had no activity for{" "}
                      {STALE_AFTER_DAYS}+ days.
                    </>
                  }
                />
                <div className="flex flex-col gap-1">
                  {stats.staleTasks.slice(0, 3).map((row) => (
                    <div key={row.task.id} className="flex min-h-11 items-center gap-3 rounded-xl px-1 text-[17px] leading-6">
                      <span className="min-w-0 flex-1 truncate text-fg">{row.task.title}</span>
                      <span className="shrink-0 text-[15px] leading-5 font-bold tabular-nums text-sub">
                        {row.untouchedDays}d
                      </span>
                    </div>
                  ))}
                </div>
              </Card>

              <Card title="Work by category">
                {stats.categoryRows.length === 0 ? (
                  <EmptyLine>No open tasks to categorise.</EmptyLine>
                ) : (
                  <div className="flex flex-col gap-2">
                    {stats.categoryRows.map((row) => (
                      <MeterRow key={row.key} row={row} labelWidth="w-[104px]" />
                    ))}
                  </div>
                )}
              </Card>

              <Card title="Needs an owner">
                <BigStat
                  value={stats.ownerless.length}
                  tone="danger"
                  caption={
                    <>open {stats.ownerless.length === 1 ? "task has" : "tasks have"} no active assignee.</>
                  }
                />
                <div className="flex flex-col gap-1">
                  {stats.ownerless.slice(0, 4).map((task) => (
                    <div
                      key={task.id}
                      className="flex min-h-11 items-center rounded-xl px-1 text-[17px] leading-6 text-fg text-pretty"
                    >
                      {task.title}
                    </div>
                  ))}
                </div>
              </Card>

              <Card title="Completed this week">
                <BigStat
                  value={stats.doneThisWeek}
                  caption={
                    <span className="text-sub">
                      {stats.doneThisWeek === 1 ? "task" : "tasks"} completed since Monday.
                    </span>
                  }
                />
                <p className="text-[15px] leading-5 text-sub tabular-nums">{stats.doneLastWeek} last week.</p>
              </Card>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        {deleteTarget && (
          <>
            <div className="text-section-heading text-pretty">Delete &ldquo;{deleteTarget.title}&rdquo;?</div>
            <p className="text-[18px] leading-7 text-sub text-pretty">
              This can&apos;t be undone once the undo message goes away.
            </p>
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
