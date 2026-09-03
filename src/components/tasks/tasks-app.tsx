"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus, Search, Trash2, Users, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { AppHeader } from "@/components/layout/app-header";
import { EmptyState } from "@/components/tasks/empty-state";
import { FilterDropdown, type FilterOption } from "@/components/tasks/filter-dropdown";
import { FiltersPanel } from "@/components/tasks/filters-panel";
import { SortMenu } from "@/components/tasks/sort-menu";
import { DeleteTaskDialog } from "@/components/tasks/delete-task-dialog";
import { PurgeTaskDialog } from "@/components/tasks/purge-task-dialog";
import { TaskPill } from "@/components/tasks/task-pill";
import {
  cancelTaskDeletion,
  markTaskRead,
  resolveTaskDeletion,
  restoreTask,
  setTaskStatus,
  toggleReminderDismissal,
} from "@/app/tasks/actions";
import { PRIORITIES, PRIORITY_ORDER } from "@/lib/constants";
import {
  DELETED_VISIBLE_DAYS,
  EMPTY_FILTERS,
  countActiveFilters,
  getLastActivityAt,
  groupTasks,
  matchesFilters,
  type SortMode,
  type TaskFilters,
} from "@/lib/tasks-view";
import { unreadMentionTaskIds } from "@/lib/notifications-view";
import { cn, formatDateGroup } from "@/lib/utils";
import type { NotificationFeed } from "@/lib/data/notifications";
import type { MemberSummary, TaskWithRelations } from "@/lib/data/tasks";
import type { Priority, TaskStatus } from "@/lib/supabase/database.types";

export function TasksApp({
  initialTasks,
  roster,
  categories,
  me,
  notifications,
  deletedTasks,
  focusTaskId,
}: {
  initialTasks: TaskWithRelations[];
  roster: MemberSummary[];
  categories: { id: string; label: string; is_default: boolean }[];
  me: { id: string; display_name: string; initials: string; color: string };
  notifications: NotificationFeed;
  /** This member's own deleted tasks, newest first. Nobody else's exist here. */
  deletedTasks: TaskWithRelations[];
  /** A task to open on arrival — set when a notification was tapped. */
  focusTaskId: string | null;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [filters, setFilters] = useState<TaskFilters>(EMPTY_FILTERS);
  // null until the user picks one, so the button can read a plain "Sort".
  const [sort, setSort] = useState<SortMode | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(focusTaskId);
  /*
    A completed task lives inside a collapsed section, so arriving from a
    notification about one would land on a list that visibly does not contain
    it. Opening the section is the difference between "here it is" and "it is
    gone".
  */
  const [showDeleted, setShowDeleted] = useState(false);
  const [showComplete, setShowComplete] = useState(
    () => initialTasks.find((task) => task.id === focusTaskId)?.status === "complete"
  );

  /*
    Which focused task the two above have already been set for.

    Both were initial values only, which was right exactly once. Tapping a
    second notification while the Tasklist is already open changes the URL
    without remounting this component, so the task scrolled into view stayed
    shut — the notification took you to a card you then had to tap yourself,
    which reads as the tap not having worked.

    Adjusted during render rather than in an effect: React re-renders with the
    new values before anything reaches the screen, so the card is never
    painted collapsed and then opened. An effect would do it a frame later,
    visibly, and would also trip the rule against setting state in effects.
  */
  const [focusApplied, setFocusApplied] = useState(focusTaskId);
  if (focusTaskId && focusTaskId !== focusApplied) {
    setFocusApplied(focusTaskId);
    setExpandedId(focusTaskId);
    if (initialTasks.find((task) => task.id === focusTaskId)?.status === "complete") {
      setShowComplete(true);
    }
  }
  const [deleteTarget, setDeleteTarget] = useState<TaskWithRelations | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<TaskWithRelations | null>(null);
  const [, startTransition] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);

  /*
    Arriving from a notification: bring the task into view and record that it
    has been read, which is also what clears the notification that sent you
    here. Runs once per focused id — re-scrolling on every render would fight
    anyone who scrolled away.

    Arriving this way once left the app with no header: no logo, no bell, no
    way back to the Dashboard, and no gesture that brought it back. The shell
    is not supposed to be able to scroll at all — body is `overflow: hidden`
    and the list is the only thing that moves — but `overflow: hidden` is
    still scrollable under program control, and scrollIntoView walks every
    scrollable ancestor it can find rather than just the one you meant.

    So this scrolls the list directly, and then pins everything above it. The
    pin is belt-and-braces: an isolated copy of this shell would not reproduce
    the fault, so rather than guess at which ancestor moved, nothing above the
    list is allowed to stay scrolled. The header is the only route back, and
    losing it is not a bug worth risking twice.
  */
  useEffect(() => {
    if (!focusTaskId) return;
    void markTaskRead(focusTaskId);

    const list = listRef.current;
    const card = document.getElementById(`task-${focusTaskId}`);
    if (!list || !card) return;

    const offset = card.getBoundingClientRect().top - list.getBoundingClientRect().top;
    // A little breathing room above the card, so it does not sit flush
    // against the top edge and read as cut off.
    list.scrollTop += offset - 12;

    for (let node = list.parentElement; node; node = node.parentElement) {
      node.scrollTop = 0;
      node.scrollLeft = 0;
    }
    window.scrollTo(0, 0);
  }, [focusTaskId]);

  const activeCount = countActiveFilters(filters);

  /*
    Tasks where somebody named you and you have not looked yet, marked on the
    card itself. Derived from the same feed the bell renders, so the two can
    never disagree about who has been mentioned.
  */
  const mentionedTaskIds = useMemo(() => unreadMentionTaskIds(notifications), [notifications]);

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

  /*
    Opening a task is what marks it read — nobody has to press anything, which
    is the only reason the Dashboard's unread count can be trusted. Fired and
    forgotten: it deliberately does not revalidate, because re-rendering the
    list the moment you open a card would collapse the card you just opened.
  */
  function handleToggleExpand(taskId: string) {
    const opening = expandedId !== taskId;
    setExpandedId(opening ? taskId : null);
    if (opening) void markTaskRead(taskId);
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

  function handleDeleted(task: TaskWithRelations) {
    setDeleteTarget(null);
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
  }

  function handleRequested(task: TaskWithRelations) {
    setDeleteTarget(null);
    router.refresh();
    const creator = roster.find((m) => m.id === task.created_by);
    showToast({
      message: `Delete requested — waiting on ${creator?.display_name ?? "the creator"}`,
      actionLabel: "Withdraw",
      onAction: () => handleCancelDeletion(task.id),
    });
  }

  /*
    Two paths behind one button, decided by who created the task. The creator
    deletes; everybody else asks, and the dialog collects the reason. Which of
    the two you get is worked out here rather than inside the dialog so the
    card's own label can say the same thing before you tap it.

    listRoster only returns active members, so a creator missing from it has
    been deactivated — and then anyone may decide, or a pending request would
    be stuck against that task forever.
  */
  function canDecide(task: TaskWithRelations) {
    return task.created_by === me.id || !roster.some((m) => m.id === task.created_by);
  }

  function handleRestore(taskId: string) {
    startTransition(async () => {
      const result = await restoreTask(taskId);
      if (!result.ok) {
        showToast({ message: result.error });
        return;
      }
      router.refresh();
      showToast({ message: "Task restored" });
    });
  }

  /*
    No Undo on this one, and that is the point. Every other toast in this app
    offers a way back; here there is nothing left to bring back, so offering
    the button would be a lie.
  */
  function handlePurged(task: TaskWithRelations) {
    setPurgeTarget(null);
    router.refresh();
    showToast({ message: `“${task.title}” erased` });
  }

  function handleResolveDeletion(taskId: string, approve: boolean) {
    startTransition(async () => {
      const result = await resolveTaskDeletion(taskId, approve);
      if (!result.ok) {
        showToast({ message: result.error });
        return;
      }
      router.refresh();
      if (!approve) {
        showToast({ message: "Request declined — task kept" });
        return;
      }
      /*
        The same Undo the creator gets when deleting their own task. Approving
        somebody else's request is if anything the easier one to get wrong —
        you are acting on a sentence they wrote, on a phone, often without the
        conversation behind it — so it must be as recoverable.

        The task is in Recently deleted for a fortnight regardless; this is
        the fast way back, not the only one.
      */
      showToast({
        message: "Request approved — task deleted",
        actionLabel: "Undo",
        onAction: () => {
          startTransition(async () => {
            await restoreTask(taskId);
            router.refresh();
          });
        },
      });
    });
  }

  function handleCancelDeletion(taskId: string) {
    startTransition(async () => {
      const result = await cancelTaskDeletion(taskId);
      if (!result.ok) {
        showToast({ message: result.error });
        return;
      }
      router.refresh();
      showToast({ message: "Request withdrawn" });
    });
  }

  return (
    <div className="flex h-full flex-col bg-bg">
      <AppHeader current="/tasks" notifications={notifications}>
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

      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+24px)]"
      >
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
                  <div
                    key={task.id}
                    id={`task-${task.id}`}
                    className="lg:grid lg:grid-cols-[92px_minmax(0,1fr)] lg:gap-3"
                  >
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
                        onToggleExpand={() => handleToggleExpand(task.id)}
                        onSetStatus={(status) => handleSetStatus(task.id, status)}
                        onRequestDelete={() => setDeleteTarget(task)}
                        onResolveDeletion={(approve) => handleResolveDeletion(task.id, approve)}
                        onCancelDeletion={() => handleCancelDeletion(task.id)}
                        onToggleReminder={() => handleToggleReminder(task.id)}
                        roster={roster}
                        mentionsYou={mentionedTaskIds.has(task.id)}
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
                      <div key={task.id} id={`task-${task.id}`} className="min-w-0">
                        <TaskPill
                          task={task}
                          meId={me.id}
                          expanded={expandedId === task.id}
                          onToggleExpand={() => handleToggleExpand(task.id)}
                          onSetStatus={(status) => handleSetStatus(task.id, status)}
                          onRequestDelete={() => setDeleteTarget(task)}
                        onResolveDeletion={(approve) => handleResolveDeletion(task.id, approve)}
                        onCancelDeletion={() => handleCancelDeletion(task.id)}
                          onToggleReminder={() => handleToggleReminder(task.id)}
                          roster={roster}
                          mentionsYou={mentionedTaskIds.has(task.id)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/*
              The bin, at the bottom, in the same collapsed shape as Complete.
              It only exists for the person who deleted these — a deleted task
              is invisible to everybody else, by policy rather than by filter —
              and it disappears entirely when there is nothing in it, so it
              never costs anything on a normal day.

              This is the safety net for the one unguarded path in the design:
              deleting a task you created needs no approval, because there is
              nobody to ask.
            */}
            {deletedTasks.length > 0 && (
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeleted((v) => !v)}
                  className="flex h-14 w-full items-center gap-3 rounded-2xl border-[1.5px] border-border bg-card px-4 text-[18px] leading-7 font-bold text-fg cursor-pointer"
                >
                  <ChevronDown
                    aria-hidden
                    className={`size-5 transition-transform duration-150 ${showDeleted ? "rotate-180" : "-rotate-90"}`}
                  />
                  Recently deleted ({deletedTasks.length})
                </button>
                {showDeleted && (
                  <div className="flex flex-col gap-2">
                    <p className="px-1 text-[16px] leading-6 text-sub text-pretty">
                      Tasks you deleted in the last {DELETED_VISIBLE_DAYS} days. Only you can see
                      these.
                    </p>
                    {deletedTasks.map((task) => (
                      <div
                        key={task.id}
                        className="flex min-h-14 items-center gap-3 rounded-2xl border-[1.5px] border-border bg-card px-4 py-3"
                      >
                        <span className="min-w-0 grow text-[17px] leading-6 text-fg text-pretty">
                          {task.title}
                          {task.deleted_at && (
                            <span className="text-timestamp">
                              {" "}
                              · deleted {formatDateGroup(task.deleted_at)}
                            </span>
                          )}
                        </span>
                        {/*
                          The two controls are one unit that never breaks
                          apart. Left to wrap on its own, the erase button
                          dropped to a second line on a phone and read as
                          belonging to the row below it — the last thing an
                          irreversible control should do. The title takes the
                          squeeze instead, wrapping onto two lines.
                        */}
                        <div className="flex shrink-0 items-center gap-2">
                          <Button
                            variant="secondary"
                            size="md"
                            className="w-auto shrink-0 px-4"
                            onClick={() => handleRestore(task.id)}
                          >
                            Restore
                          </Button>
                          {/*
                            Set apart from Restore by a divider, and left grey
                            rather than red. It is the irreversible control on
                            the row, so it should take a deliberate reach —
                            not sit flush against the safe one where a thumb
                            aiming for Restore can find it.
                          */}
                          <span aria-hidden className="h-8 w-px shrink-0 bg-line" />
                          <button
                            type="button"
                            aria-label={`Erase ${task.title} for good`}
                            title="Erase for good"
                            onClick={() => setPurgeTarget(task)}
                            className={cn(
                              "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                              "text-muted-fg cursor-pointer transition-colors duration-150",
                              "hover:bg-danger-hover-bg hover:text-danger",
                              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
                            )}
                          >
                            <Trash2 size={20} strokeWidth={1.75} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <DeleteTaskDialog
        task={deleteTarget}
        canDecide={deleteTarget ? canDecide(deleteTarget) : false}
        onClose={() => setDeleteTarget(null)}
        onDeleted={handleDeleted}
        onRequested={handleRequested}
        onError={(message) => showToast({ message })}
      />

      <PurgeTaskDialog
        task={purgeTarget}
        meId={me.id}
        onClose={() => setPurgeTarget(null)}
        onPurged={handlePurged}
        onError={(message) => showToast({ message })}
      />
    </div>
  );
}
