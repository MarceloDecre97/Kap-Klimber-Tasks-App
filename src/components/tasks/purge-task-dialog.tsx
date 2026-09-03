"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { purgeTask } from "@/app/tasks/actions";
import { describePurgeDamage, listNames } from "@/lib/tasks-view";
import type { TaskWithRelations } from "@/lib/data/tasks";

/**
 * The one confirmation in this app that is telling the truth about damage.
 *
 * Everywhere else "delete" means "moves to your Recently deleted list" — that
 * warning can afford to be gentle, because the action can be taken back. This
 * one cannot. Five tables cascade off a task, so erasing it takes other
 * people's notes and the whole record of who changed what with it.
 *
 * Which is why the copy counts them. "This cannot be undone" is wallpaper;
 * everybody has clicked past it. "This also erases 4 notes from Keith and
 * Dee" is a sentence you actually read, and that is the difference between a
 * warning and a formality.
 */
export function PurgeTaskDialog({
  task,
  meId,
  onClose,
  onPurged,
  onError,
}: {
  task: TaskWithRelations | null;
  /** The signed-in member, so the warning does not name them to themselves. */
  meId: string;
  onClose: () => void;
  onPurged: (task: TaskWithRelations) => void;
  onError: (message: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const damage = task ? describePurgeDamage(task, meId) : null;

  function submit() {
    if (!task) return;
    const target = task;

    startTransition(async () => {
      const result = await purgeTask(target.id);
      if (!result.ok) {
        onError(result.error);
        return;
      }
      onPurged(target);
    });
  }

  return (
    <Dialog open={!!task} onClose={onClose}>
      {task && damage && (
        <>
          {/* Same clamp as the delete dialog, and for the same reason: the
              buttons must stay reachable however long the title is. */}
          <div className="text-section-heading text-pretty wrap-anywhere line-clamp-3">
            Erase “{task.title}” for good?
          </div>

          <p className="text-[18px] leading-7 text-sub text-pretty">
            {damage.noteCount > 0 && (
              <>
                This also erases {damage.noteCount}{" "}
                {damage.noteCount === 1 ? "note" : "notes"}
                {damage.authors.length > 0 && <> from {listNames(damage.authors)}</>}, and{" "}
              </>
            )}
            {damage.noteCount === 0 && <>This also erases </>}
            everything the task recorded about who changed what. It leaves your Recently deleted
            list, and there is no way to bring it back.
          </p>

          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Keep it in the bin
          </Button>
          <Button variant="destructive" onClick={submit} disabled={isPending}>
            {isPending ? "Erasing…" : "Erase for good"}
          </Button>
        </>
      )}
    </Dialog>
  );
}
