"use client";

import { AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { DuplicateMatch } from "@/app/contacts/actions";

/**
 * A warning, never a block.
 *
 * Two people genuinely can share a number — a shared office line is the
 * obvious case — so this names who else has it and gets out of the way. What
 * it must not do is stay silent, because the same lead arriving twice in a
 * month is the normal failure of a book fed from an inbox.
 *
 * A match already in Recently deleted is called out separately: that is not
 * a duplicate so much as somebody about to undo a deletion they meant.
 */
export function DuplicateDialog({
  matches,
  saving,
  onClose,
  onSaveAnyway,
}: {
  matches: DuplicateMatch[] | null;
  saving: boolean;
  onClose: () => void;
  onSaveAnyway: () => void;
}) {
  const first = matches?.[0];

  return (
    <Dialog open={!!matches && matches.length > 0} onClose={onClose}>
      {first && (
        <>
          <div className="flex items-start gap-3">
            <AlertTriangle aria-hidden className="mt-1 size-8 shrink-0 text-accent" strokeWidth={1.75} />
            <div className="text-section-heading text-pretty">
              {matches!.length === 1
                ? `${capitalise(first.matched_on)} is already on ${first.first_name} ${first.last_name}.`
                : `${matches!.length} people already have these details.`}
            </div>
          </div>

          <p className="text-[18px] leading-7 text-sub text-pretty">
            Two people can share a number — a shared office line, for instance. Save it anyway if
            that is what this is.
          </p>

          <ul className="flex flex-col divide-y-[1.5px] divide-border rounded-2xl border-[1.5px] border-border bg-card">
            {matches!.map((match) => (
              <li key={`${match.id}-${match.matched_on}`} className="flex flex-col gap-0.5 px-4 py-3">
                <span className="text-[17px] leading-6 font-bold text-fg text-pretty">
                  {match.first_name} {match.last_name}
                </span>
                <span className="text-timestamp text-sub text-pretty">
                  {[match.job_title, match.company].filter(Boolean).join(" · ") || "No company"}
                  {" — has "}
                  {match.matched_on}
                </span>
                {match.in_bin && (
                  <span className="mt-1 inline-flex items-center gap-1.5 text-timestamp font-bold text-danger">
                    <Trash2 aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
                    In Recently deleted
                  </span>
                )}
              </li>
            ))}
          </ul>

          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Go back
          </Button>
          <Button variant="primary" onClick={onSaveAnyway} disabled={saving}>
            {saving ? "Saving…" : "Save anyway"}
          </Button>
        </>
      )}
    </Dialog>
  );
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
