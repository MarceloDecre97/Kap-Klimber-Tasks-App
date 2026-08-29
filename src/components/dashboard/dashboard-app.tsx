"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, BellOff, ChevronDown, MessageSquare } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { AppHeader } from "@/components/layout/app-header";
import { BigStat, Card, EmptyLine, FlowChart, LegendRow, MeterRow, StackedBar } from "@/components/dashboard/cards";
import { TaskPill } from "@/components/tasks/task-pill";
import { restoreTask, setTaskStatus, softDeleteTask, toggleReminderDismissal } from "@/app/tasks/actions";
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

  const firstName = me.display_name.trim().split(/\s+/)[0] ?? me.display_name;
  const openTotal = stats.openTasks.length;

  return (
    <div className="flex h-full flex-col bg-bg">
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

              {/*
                A fired reminder does not move its task, so on its own it can
                sit unnoticed inside a collapsed section. This surfaces the
                count regardless of bucket, and opens every section holding
                one so they are never hunted for.
              */}
              {stats.remindersNeedingAttention > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setOpenSections((current) => {
                      const next = { ...current };
                      for (const b of stats.buckets) {
                        if (b.remindersNeedingAttention > 0) next[b.key] = true;
                      }
                      return next;
                    })
                  }
                  className="flex min-h-14 items-center gap-3 rounded-2xl border-[1.5px] border-danger bg-card px-4 py-3 text-left text-[17px] leading-6 text-fg cursor-pointer hover:bg-muted"
                >
                  <Bell aria-hidden className="size-5 shrink-0 text-danger" />
                  <span className="font-bold tabular-nums text-pretty">
                    {stats.remindersNeedingAttention}{" "}
                    {stats.remindersNeedingAttention === 1 ? "reminder needs" : "reminders need"} your attention
                  </span>
                </button>
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
              return (
                <div key={bucket.key} className="flex flex-col gap-3">
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
                    {/*
                      One bell per heading, showing the more urgent of the
                      two: red counts reminders that have fired and nobody
                      has handled, amber counts ones still ahead. Without
                      the amber case a section full of reminders due later
                      today looked identical to one with none, which is
                      most of what a reminder is for.
                    */}
                    {(bucket.remindersNeedingAttention > 0 || bucket.remindersUpcoming > 0) && (
                      <span
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1 text-[15px] leading-5 font-bold tabular-nums",
                          bucket.remindersNeedingAttention > 0 ? "text-danger" : "text-accent"
                        )}
                        title={
                          bucket.remindersNeedingAttention > 0
                            ? `${bucket.remindersNeedingAttention} missed reminder(s) in this section`
                            : `${bucket.remindersUpcoming} upcoming reminder(s) in this section`
                        }
                      >
                        <Bell aria-hidden className="size-4" />
                        {bucket.remindersNeedingAttention > 0
                          ? bucket.remindersNeedingAttention
                          : bucket.remindersUpcoming}
                      </span>
                    )}
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
                            onToggleReminder={() => handleToggleReminder(entry.task.id)}
                          />
                          {/*
                            Reminder only, and the whole line takes one
                            colour. The due date lives on the card, where it
                            now goes red on its own when it has passed — two
                            dates in two colours on one line meant neither
                            read as a signal.
                          */}
                          {entry.reminderLabel && (
                            <div
                              className={cn(
                                "flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3",
                                "text-[15px] leading-5 font-bold tabular-nums",
                                entry.reminderTone === "missed"
                                  ? "text-danger"
                                  : entry.reminderTone === "handled"
                                    ? "text-sub"
                                    : "text-accent"
                              )}
                            >
                              {entry.reminderTone === "handled" ? (
                                <BellOff aria-hidden className="size-3.5 shrink-0" />
                              ) : (
                                <Bell aria-hidden className="size-3.5 shrink-0" />
                              )}
                              <span className={cn(entry.reminderTone === "handled" && "line-through")}>
                                {entry.reminderLabel}
                              </span>
                            </div>
                          )}
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

            {/*
              Team-wide deadline pressure. The personal panel beside this one
              is filtered to one person, so until now nothing on the screen
              could answer "what does the team owe this week?" — the question
              a shared task list exists to answer.
            */}
            <Card title="Deadline pressure">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Overdue", value: stats.teamDeadlines.overdue.length, tone: "danger" as const },
                  { label: "Due today", value: stats.teamDeadlines.dueToday, tone: "accent" as const },
                  { label: "This week", value: stats.teamDeadlines.dueThisWeek, tone: "fg" as const },
                ].map((cell) => (
                  <div key={cell.label} className="flex min-w-0 flex-col gap-0.5">
                    <span
                      className={cn(
                        "font-display text-[34px] leading-[38px] font-bold tabular-nums",
                        cell.value === 0
                          ? "text-sub"
                          : cell.tone === "danger"
                            ? "text-danger"
                            : cell.tone === "accent"
                              ? "text-accent"
                              : "text-fg"
                      )}
                    >
                      {cell.value}
                    </span>
                    <span className="text-[15px] leading-5 text-sub">{cell.label}</span>
                  </div>
                ))}
              </div>

              {stats.teamDeadlines.overdue.length > 0 && (
                <div className="flex flex-col gap-1 border-t-[1.5px] border-border pt-3">
                  {stats.teamDeadlines.overdue.slice(0, 4).map((task) => (
                    <div
                      key={task.id}
                      className="flex min-h-11 items-center gap-3 rounded-xl px-1 text-[17px] leading-6"
                    >
                      <span className="min-w-0 flex-1 truncate text-fg">{task.title}</span>
                      <span className="flex shrink-0 items-center gap-1">
                        {task.assignees.slice(0, 3).map((person) => (
                          <Avatar key={person.id} initials={person.initials} color={person.color} size={24} />
                        ))}
                      </span>
                    </div>
                  ))}
                  {stats.teamDeadlines.overdue.length > 4 && (
                    <span className="px-1 text-[15px] leading-5 text-sub tabular-nums">
                      and {stats.teamDeadlines.overdue.length - 4} more
                    </span>
                  )}
                </div>
              )}

              {/*
                ASAP is a label somebody typed, not a commitment with a date,
                so it sits beside the dates rather than above them. Tasks with
                no due date at all can never appear as late — which is exactly
                why work goes quiet there.
              */}
              <div className="flex flex-col gap-1 text-[15px] leading-5 text-sub tabular-nums">
                <span>
                  {stats.teamDeadlines.asap} marked ASAP
                </span>
                <span>
                  {stats.teamDeadlines.noDueDate} open{" "}
                  {stats.teamDeadlines.noDueDate === 1 ? "task has" : "tasks have"} no due date
                </span>
              </div>
            </Card>

            <Card title="Created vs completed">
              <FlowChart weeks={stats.flowWeeks} />
            </Card>

            <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
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
                          <Avatar key={person.id} initials={person.initials} color={person.color} size={28} />
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
                    <div
                      key={row.task.id}
                      className="flex min-h-11 items-center gap-3 rounded-xl px-1 text-[17px] leading-6"
                    >
                      <span className="min-w-0 flex-1 truncate text-fg">{row.task.title}</span>
                      <span className="shrink-0 text-[15px] leading-5 font-bold tabular-nums text-sub">
                        {row.untouchedDays}d
                      </span>
                    </div>
                  ))}
                </div>
              </Card>

              {/*
                Waiting and unowned were two cards. They read as one thing to
                whoever is looking — this will not move unless somebody acts —
                and the action is the same for both: name a person.
              */}
              <Card title="Not moving">
                <BigStat
                  value={stats.notMoving.length}
                  tone="danger"
                  caption={
                    <>
                      open {stats.notMoving.length === 1 ? "task is" : "tasks are"} waiting on someone, or
                      on nobody.
                    </>
                  }
                />
                {stats.notMoving.length === 0 ? (
                  <EmptyLine>Everything open has an owner and is moving.</EmptyLine>
                ) : (
                  <div className="flex flex-col gap-1">
                    {stats.notMoving.slice(0, 4).map((row) => (
                      <div
                        key={row.task.id}
                        className="flex min-h-11 items-center gap-2 rounded-xl px-1 text-[17px] leading-6"
                      >
                        <span className="min-w-0 flex-1 truncate text-fg">{row.task.title}</span>
                        <span
                          className={cn(
                            "shrink-0 rounded-full border-[1.5px] px-2 py-0.5 text-[13px] leading-4 font-bold",
                            row.reason === "unowned"
                              ? "border-danger text-danger"
                              : "border-border text-sub"
                          )}
                        >
                          {row.reason === "unowned" ? "No owner" : "Waiting"}
                        </span>
                        <span className="shrink-0 text-[15px] leading-5 font-bold tabular-nums text-sub">
                          {row.untouchedDays}d
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/*
                The scorecard for the whole system, and the one number that
                tells a new teammate what "on time" means here without a
                meeting. The denominator is always shown: 3 of 4 is not 75%,
                it is a coin toss.
              */}
              <Card title="On-time rate">
                {stats.onTime.rate === null ? (
                  <>
                    <BigStat value="—" tone="fg" caption={<span className="text-sub">Nothing to measure yet.</span>} />
                    <EmptyLine>
                      No task carrying a due date has been completed in the last 30 days. This starts
                      reporting on its own once one is.
                    </EmptyLine>
                  </>
                ) : (
                  <>
                    <BigStat
                      value={`${stats.onTime.rate}%`}
                      tone={stats.onTime.rate >= 80 ? "fg" : stats.onTime.rate >= 50 ? "accent" : "danger"}
                      caption={
                        <span className="text-sub">
                          finished on or before their due date.
                        </span>
                      }
                    />
                    <p className="text-[15px] leading-5 text-sub tabular-nums">
                      {stats.onTime.onTime} of {stats.onTime.completed} completed with a due date, last 30
                      days.
                    </p>
                  </>
                )}
              </Card>

              <Card title="Load per person">
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
                          }, ${row.inProgress} in progress`}
                          className="flex h-6 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
                        >
                          {row.segments.map((segment) => (
                            <span key={segment.key} style={{ width: segment.width, background: segment.fill }} />
                          ))}
                        </span>
                        <span className="shrink-0 text-right text-[15px] leading-5 tabular-nums text-sub">
                          <span className="font-bold text-fg">{row.inProgress}</span>/{row.total}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[15px] leading-5 text-sub text-pretty">
                  In progress / total open. Two or three genuinely in progress per person is the usual
                  working limit — past that, everything slows down for everyone. Tasks with several
                  assignees count for each.
                </p>
              </Card>

              <Card title="Work in progress by status">
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
                  {stats.completeCount} complete {stats.completeCount === 1 ? "task is" : "tasks are"}{" "}
                  excluded from this bar.
                </p>
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
