"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { deleteOwnTask, requestTaskDeletion } from "@/app/tasks/actions";
import { DELETED_VISIBLE_DAYS } from "@/lib/tasks-view";
import type { TaskWithRelations } from "@/lib/data/tasks";

const REASON_MAX = 300;

/**
 * Two different conversations behind one button.
 *
 * The creator is confirming something they are about to do, and the honest
 * warning is no longer "this can't be undone" — it goes to their own
 * Recently deleted list and stays there for a fortnight.
 *
 * Everyone else is writing to a person. The reason is required because the
 * creator has to decide from that line alone, usually on a phone, without the
 * conversation that produced it: "duplicate of the Sep 4 one" is a decision,
 * "Keith wants to delete this" is an errand.
 *
 * Shared by the Tasklist and the Dashboard, which both render task cards and
 * would otherwise each need their own copy of this.
 */
export function DeleteTaskDialog({
  task,
  canDecide,
  onClose,
  onDeleted,
  onRequested,
  onError,
}: {
  task: TaskWithRelations | null;
  /** True for the creator — and for anyone, if the creator is deactivated. */
  canDecide: boolean;
  onClose: () => void;
  onDeleted: (task: TaskWithRelations) => void;
  onRequested: (task: TaskWithRelations) => void;
  onError: (message: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();

  function close() {
    setReason("");
    onClose();
  }

  function submit() {
    if (!task) return;
    const target = task;

    startTransition(async () => {
      const result = canDecide
        ? await deleteOwnTask(target.id)
        : await requestTaskDeletion(target.id, reason);

      if (!result.ok) {
        onError(result.error);
        return;
      }
      setReason("");
      if (canDecide) onDeleted(target);
      else onRequested(target);
    });
  }

  return (
    <Dialog open={!!task} onClose={close}>
      {task && (
        <>
          <div className="text-section-heading text-pretty">
            {canDecide ? `Delete “${task.title}”?` : `Ask to delete “${task.title}”?`}
          </div>

          {canDecide ? (
            <p className="text-[18px] leading-7 text-sub text-pretty">
              It moves to your Recently deleted list, at the bottom of the Tasklist, where you
              can bring it back for the next {DELETED_VISIBLE_DAYS} days.
            </p>
          ) : (
            <>
              <p className="text-[18px] leading-7 text-sub text-pretty">
                Only the person who created a task can delete it. Say why, and they decide.
              </p>
              <Textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Why should it go? e.g. duplicate of the Sep 4 one"
                aria-label="Why this task should be deleted"
                rows={3}
                maxLength={REASON_MAX}
                className="min-h-[88px] resize-y"
              />
            </>
          )}

          <Button variant="secondary" onClick={close} disabled={isPending}>
            {canDecide ? "Keep the task" : "Never mind"}
          </Button>
          <Button
            variant="destructive"
            onClick={submit}
            disabled={isPending || (!canDecide && !reason.trim())}
          >
            {canDecide ? "Delete it" : "Send request"}
          </Button>
        </>
      )}
    </Dialog>
  );
}
