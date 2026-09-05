"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Lock, Trash2, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { STATUSES } from "@/lib/constants";
import { fullName } from "@/lib/contacts-view";
import type { ContactSummary } from "@/lib/data/contacts";
import type { TaskStatus } from "@/lib/supabase/database.types";

export interface BlockingTaskInfo {
  task_id: string;
  title: string;
  status: string;
}

/**
 * The three ways deleting a contact can go.
 *
 * One component rather than three, because they are one decision seen from
 * different points on the same path, and splitting them is how the wording
 * of the middle one drifts away from the other two.
 *
 *   blocked — a task still needs this person, and says which
 *   confirm — nothing is in the way; into the bin, reversibly
 *   erase   — from the bin, the last step, and there is no way back
 */
export function DeleteContactDialog({
  contact,
  mode,
  blocking,
  onClose,
  onDeleted,
  onErased,
  onError,
}: {
  contact: ContactSummary | null;
  mode: "blocked" | "confirm" | "erase";
  blocking: BlockingTaskInfo[];
  onClose: () => void;
  onDeleted: (contact: ContactSummary) => void;
  onErased: (contact: ContactSummary) => void;
  onError: (message: string) => void;
}) {
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!contact) return;
    const target = contact;
    startTransition(async () => {
      const { deleteContact, purgeContact } = await import("@/app/contacts/actions");
      const result = mode === "erase" ? await purgeContact(target.id) : await deleteContact(target.id);
      if (!result.ok) {
        onError(result.error);
        return;
      }
      if (mode === "erase") onErased(target);
      else onDeleted(target);
    });
  }

  return (
    <Dialog open={!!contact} onClose={onClose}>
      {contact && (
        <>
          {mode === "blocked" && (
            <>
              <div className="flex items-start gap-3">
                <Lock aria-hidden className="mt-1 size-8 shrink-0 text-danger" strokeWidth={1.75} />
                <div className="text-section-heading text-pretty wrap-anywhere line-clamp-3">
                  {fullName(contact)} can&rsquo;t be deleted yet.
                </div>
              </div>
              <p className="text-[18px] leading-7 text-sub text-pretty">
                {blocking.length === 1 ? "A task that is still open needs them" : `${blocking.length} open tasks still need them`}
                . Finish the work first — this keeps the number on the job while the job is live.
              </p>

              <ul className="flex flex-col divide-y-[1.5px] divide-border rounded-2xl border-[1.5px] border-border bg-card">
                {blocking.map((task) => (
                  <li key={task.task_id} className="flex flex-col gap-2 px-4 py-3">
                    <Link
                      href={`/tasks?task=${task.task_id}`}
                      className="text-[17px] leading-6 font-bold text-brand underline underline-offset-4 text-pretty wrap-anywhere"
                    >
                      {task.title}
                    </Link>
                    <span>
                      <Badge spec={STATUSES[task.status as TaskStatus] ?? STATUSES.not_started} />
                    </span>
                  </li>
                ))}
              </ul>

              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
            </>
          )}

          {mode === "confirm" && (
            <>
              <div className="flex items-start gap-3">
                <Trash2 aria-hidden className="mt-1 size-8 shrink-0 text-sub" strokeWidth={1.75} />
                <div className="text-section-heading text-pretty wrap-anywhere line-clamp-3">
                  Delete {fullName(contact)}?
                </div>
              </div>
              <p className="text-[18px] leading-7 text-sub text-pretty">
                They go to Recently deleted, where anyone can put them back. Nothing is erased
                until somebody erases it.
              </p>

              <Button variant="secondary" onClick={onClose} disabled={isPending}>
                Keep them
              </Button>
              <Button variant="destructive" onClick={submit} disabled={isPending}>
                {isPending ? "Deleting…" : "Move to Recently deleted"}
              </Button>
            </>
          )}

          {mode === "erase" && (
            <>
              <div className="flex items-start gap-3">
                <TriangleAlert aria-hidden className="mt-1 size-8 shrink-0 text-danger" strokeWidth={1.75} />
                <div className="text-section-heading text-pretty wrap-anywhere line-clamp-3">
                  Erase {fullName(contact)} for good?
                </div>
              </div>
              {/*
                Names what disappears rather than saying "this cannot be
                undone", which everybody has clicked past. The task line is
                the one people do not expect: this is the step where the
                contact pill finally leaves a finished task.
              */}
              <p className="text-[18px] leading-7 text-sub text-pretty">
                This is the last step. Their numbers, emails, address, notes and the record of
                who added them all disappear, and nobody can put them back.
              </p>

              <Button variant="secondary" onClick={onClose} disabled={isPending}>
                Keep it in the bin
              </Button>
              <Button variant="destructive" onClick={submit} disabled={isPending}>
                {isPending ? "Erasing…" : "Erase for good"}
              </Button>
            </>
          )}
        </>
      )}
    </Dialog>
  );
}
