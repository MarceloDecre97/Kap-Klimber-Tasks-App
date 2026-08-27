"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronDown, MessageSquare, Settings } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { IconButton } from "@/components/ui/icon-button";
import { useToast } from "@/components/ui/toast";
import { BrandLogo } from "@/components/layout/brand-logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { ViewNav } from "@/components/layout/view-nav";
import { BigStat, Card, EmptyLine, LegendRow, MeterRow, StackedBar } from "@/components/dashboard/cards";
import { TaskPill } from "@/components/tasks/task-pill";
import { DEFAULT_TIMEZONE, TimezoneSelect } from "@/components/tasks/timezone-select";
import { restoreTask, setTaskStatus, softDeleteTask } from "@/app/tasks/actions";
import {
  STALE_AFTER_DAYS,
  computeDashboardStats,
  formatDueLabel,
  isOverdue,
  type BucketSpec,
  type PersonalScope,
} from "@/lib/dashboard-stats";
import { cn, zonedDateKey } from "@/lib/utils";
import type { MemberSummary, TaskWithRelations } from "@/lib/data/tasks";
import type { TaskStatus } from "@/lib/supabase/database.types";

const TIMEZONE_STORAGE_KEY = "kap-klimber-timezone";

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
  const [timeZone, setTimeZone] = useState(DEFAULT_TIMEZONE);
  const [scope, setScope] = useState<PersonalScope>("assigned");
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TaskWithRelations | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const id = setTimeout(() => {
      const stored = window.localStorage.getItem(TIMEZONE_STORAGE_KEY);
      if (stored) setTimeZone(stored);
    }, 0);
    return () => clearTimeout(id);
  }, []);

  function handleTimeZoneChange(next: string) {
    setTimeZone(next);
    window.localStorage.setItem(TIMEZONE_STORAGE_KEY, next);
  }

  const stats = useMemo(
    () => computeDashboardStats({ tasks: initialTasks, roster, meId: me.id, scope, timeZone }),
    [initialTasks, roster, me.id, scope, timeZone]
  );
  const todayKey = useMemo(() => zonedDateKey(new Date(), timeZone), [timeZone]);

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
      <header className="flex shrink-0 flex-col gap-3 border-b-[1.5px] border-border bg-card px-5 pt-[calc(env(safe-area-inset-top)+10px)] pb-3.5 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
        <div className="flex items-center justify-between gap-4">
          <BrandLogo width={120} height={19} className="h-[19px] w-auto" />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <TimezoneSelect value={timeZone} onChange={handleTimeZoneChange} />
            <ThemeToggle />
            <Link href="/settings">
              <IconButton aria-label="Settings">
                <Settings aria-hidden className="size-5" />
              </IconButton>
            </Link>
          </div>
        </div>
        <ViewNav current="/dashboard" className="lg:flex-none" />
      </header>

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
              const has = bucket.tasks.length > 0;
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
                    <span className="text-field-label">{bucket.title}</span>
                    <span
                      className={cn(
                        "inline-flex h-8 min-w-8 items-center justify-center rounded-full border-[1.5px] px-2.5",
                        "text-[15px] leading-5 font-bold tabular-nums",
                        urgentAndFull
                          ? "border-danger bg-danger text-white"
                          : "border-border bg-muted text-muted-fg"
                      )}
                    >
                      {bucket.tasks.length}
                    </span>
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
                      {bucket.tasks.map((task) => (
                        <div key={task.id} className="flex flex-col gap-1.5">
                          <TaskPill
                            task={task}
                            meId={me.id}
                            timeZone={timeZone}
                            expanded={expandedId === task.id}
                            onToggleExpand={() => setExpandedId((id) => (id === task.id ? null : task.id))}
                            onSetStatus={(status) => handleSetStatus(task.id, status)}
                            onRequestDelete={() => setDeleteTarget(task)}
                          />
                          <span
                            className={cn(
                              "px-3 text-[15px] leading-5 font-bold tabular-nums",
                              isOverdue(task, todayKey) ? "text-danger" : "text-sub"
                            )}
                          >
                            {formatDueLabel(task, todayKey)}
                          </span>
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
