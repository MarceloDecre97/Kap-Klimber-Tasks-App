"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OutreachPill } from "@/components/contacts/outreach-pill";
import { useToast } from "@/components/ui/toast";
import { setInTouch } from "@/app/contacts/actions";
import { Avatar } from "@/components/ui/avatar";
import { avatarColor, fullName, initialsOf } from "@/lib/contacts-view";
import { cn, formatTimestampWithYear } from "@/lib/utils";
import type { Outreach } from "@/lib/outreach";
import type { ContactSummary } from "@/lib/data/contacts";

/** A task can carry four people. See 0041 — one email to four is four records. */
const MAX_PER_TASK = 4;

/**
 * Outreach, on the person's own page.
 *
 * The section says three different things depending on where they stand, and
 * the wording is chosen so that nobody has to read the pill and the sentence
 * and reconcile them. The pill is the headline; this is the detail.
 *
 * What is deliberately missing is a way to mark somebody contacted by hand.
 * Marcelo's rule, and the right one: if Fred rings someone from his truck he
 * makes the task and ticks it off, which takes half a minute and leaves
 * evidence. A button that set the flag on its own would make the book a
 * record of what people remembered to click.
 */
export function OutreachSection({
  contact,
  outreach,
  colleagues,
  onChanged,
}: {
  contact: ContactSummary;
  outreach: Outreach;
  /** Everyone else at the same company, for the "anyone else?" step. */
  colleagues: ContactSummary[];
  onChanged: () => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [picking, setPicking] = useState(false);
  const [also, setAlso] = useState<string[]>([]);
  /* Who the reply counts for. Null while the question is not being asked. */
  const [replyingFor, setReplyingFor] = useState<string[] | null>(null);
  const contactId = contact.id;

  /*
    Straight to the form when there is nobody to ask about. A dialog whose
    only content is a Continue button is a dialog that teaches people to
    dismiss dialogs without reading them.
  */
  function startOutreach() {
    if (colleagues.length === 0) {
      go([]);
      return;
    }
    setAlso([]);
    setPicking(true);
  }

  function go(extra: string[]) {
    const ids = [contactId, ...extra].slice(0, MAX_PER_TASK);
    setPicking(false);
    router.push(`/tasks/new?contacts=${ids.join(",")}&outreach=1`);
  }

  function confirm(on: boolean, ids: string[] = [contactId]) {
    startTransition(async () => {
      const failures: string[] = [];
      for (const id of ids) {
        const result = await setInTouch(id, on);
        if (!result.ok) failures.push(result.error);
      }
      setReplyingFor(null);
      if (failures.length > 0) {
        showToast({ message: failures[0]! });
        return;
      }
      onChanged();
      showToast({
        message: on
          ? ids.length > 1
            ? `${ids.length} marked as in touch`
            : "Marked as in touch"
          : "In touch taken back",
      });
    });
  }

  /*
    One email to three people gets one reply, and it usually speaks for all
    three — so the question is who it counts for, asked once, with everybody
    on that task ticked to begin with.
 
    Not assumed, though. If only Sheena ever came back, "In touch" on Mike is
    a claim nobody made, and in six months it is the kind of wrong that sends
    somebody into a conversation thinking they have a relationship they do
    not. Two taps for the common case, one untick for the honest one.
  */
  function startConfirm() {
    const others = outreach.latestCompleted?.people ?? [];
    if (others.length > 1) {
      setReplyingFor(others.map((p) => p.id));
      return;
    }
    confirm(true);
  }

  const { state, latestOpen, latestCompleted, inTouchAt, inTouchBy, canConfirm, tasks } = outreach;

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-field-label text-sub">Outreach</h2>
      <div className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-border bg-card p-3.5">
        <OutreachPill outreach={outreach} className="self-start" />

        {state === "none" && (
          <p className="text-[17px] leading-6 text-sub text-pretty">
            Nobody has reached out yet.
          </p>
        )}

        {/*
          The open round links to its task, because that is where the work is
          and you may well want to go and do it. A finished one does not: it
          is finished, the sentence already says who and when, and a link
          there is an invitation to go and look at nothing.
        */}
        {latestOpen && (
          <p className="text-[17px] leading-6 text-fg text-pretty">
            Outreach open — {latestOpen.created_by?.display_name ?? "somebody"}, started{" "}
            {formatTimestampWithYear(latestOpen.created_at)}.{" "}
            <Link
              href={`/tasks?task=${latestOpen.task_id}`}
              className="font-bold text-link underline underline-offset-2"
            >
              Open the task
            </Link>
          </p>
        )}

        {latestCompleted && (
          <p className="text-[17px] leading-6 text-fg text-pretty">
            Contacted by {latestCompleted.completed_by?.display_name ?? "somebody"},{" "}
            {formatTimestampWithYear(latestCompleted.completed_at ?? latestCompleted.created_at)}.
          </p>
        )}

        {inTouchAt && (
          <p className="text-[17px] leading-6 text-fg text-pretty">
            In touch — confirmed by {inTouchBy?.display_name ?? "somebody"},{" "}
            {formatTimestampWithYear(inTouchAt)}.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" size="md" onClick={startOutreach} className="w-auto">
            <Send aria-hidden className="size-5" strokeWidth={1.75} />
            Contact
          </Button>

          {/*
            Only for the people who did the outreach, and only once a round
            has finished. The database holds the same rule — this hides a
            button that would otherwise be refused, rather than being the
            rule itself.
          */}
          {canConfirm && !inTouchAt && (
            <Button variant="secondary" size="md" onClick={startConfirm} disabled={isPending} className="w-auto">
              They replied
            </Button>
          )}
          {canConfirm && inTouchAt && (
            <Button variant="link" onClick={() => confirm(false)} disabled={isPending}>
              Not in touch after all
            </Button>
          )}
        </div>

        {/*
          Every round, once there has been more than one. A single line of
          history under a sentence that already says the same thing is
          repetition; three of them is the story.
        */}
        {/* Who the reply counts for, when the email went to more than one. */}
        {replyingFor !== null && (
          <div className="flex flex-col gap-2 rounded-2xl border-[1.5px] border-border bg-bg p-3">
            <p className="text-[17px] leading-6 text-fg text-pretty">
              Who replied? One answer often speaks for everybody it was sent to.
            </p>
            <ul className="flex flex-col gap-1.5">
              {(outreach.latestCompleted?.people ?? []).map((person) => {
                const on = replyingFor.includes(person.id);
                return (
                  <li key={person.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setReplyingFor((prev) =>
                          (prev ?? []).includes(person.id)
                            ? (prev ?? []).filter((id) => id !== person.id)
                            : [...(prev ?? []), person.id]
                        )
                      }
                      className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-muted"
                    >
                      <Avatar
                        initials={initialsOf(person)}
                        color={avatarColor(person)}
                        size={32}
                      />
                      <span className="min-w-0 grow text-[17px] leading-6 text-fg wrap-anywhere">
                        {fullName(person)}
                      </span>
                      {on && <Check aria-hidden className="size-5 shrink-0 text-brand" strokeWidth={2.5} />}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap gap-3">
              <Button
                size="md"
                className="w-auto"
                disabled={isPending || replyingFor.length === 0}
                onClick={() => confirm(true, replyingFor)}
              >
                {replyingFor.length > 1 ? `Mark ${replyingFor.length} in touch` : "Mark in touch"}
              </Button>
              <Button variant="ghost" size="md" className="w-auto" onClick={() => setReplyingFor(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/*
          The "anyone else?" step. Inline rather than a modal: it is a short
          list of people you already know, and a sheet that darkens the page
          for three checkboxes is heavier than the decision.
        */}
        {picking && (
          <div className="flex flex-col gap-2 rounded-2xl border-[1.5px] border-border bg-bg p-3">
            <p className="text-[17px] leading-6 text-fg text-pretty">
              Anyone else at {contact.company}? One email to four people counts for all four.
            </p>
            <ul className="flex flex-col gap-1.5">
              {colleagues.map((other) => {
                const on = also.includes(other.id);
                /* One already taken by the person whose page this is. */
                const full = !on && also.length >= MAX_PER_TASK - 1;
                return (
                  <li key={other.id}>
                    <button
                      type="button"
                      disabled={full}
                      onClick={() =>
                        setAlso((prev) =>
                          prev.includes(other.id)
                            ? prev.filter((id) => id !== other.id)
                            : [...prev, other.id]
                        )
                      }
                      className={cn(
                        "flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left",
                        full ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-muted"
                      )}
                    >
                      <Avatar
                        initials={initialsOf(other)}
                        color={avatarColor(other)}
                        size={32}
                      />
                      <span className="min-w-0 grow text-[17px] leading-6 text-fg wrap-anywhere">
                        {fullName(other)}
                        {other.job_title && (
                          <span className="block text-timestamp text-sub">{other.job_title}</span>
                        )}
                      </span>
                      {on && <Check aria-hidden className="size-5 shrink-0 text-brand" strokeWidth={2.5} />}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap gap-3">
              <Button size="md" onClick={() => go(also)} className="w-auto">
                Create the task
              </Button>
              <Button variant="ghost" size="md" onClick={() => setPicking(false)} className="w-auto">
                Cancel
              </Button>
            </div>
          </div>
        )}

        {tasks.length > 1 && (
          <ul className="flex flex-col gap-1 border-t-[1.5px] border-border pt-3">
            {tasks.map((t) => (
              <li key={t.task_id} className="text-timestamp text-sub text-pretty">
                {t.status === "complete"
                  ? `${formatTimestampWithYear(t.completed_at ?? t.created_at)} · ${t.completed_by?.display_name ?? "somebody"}`
                  : `${formatTimestampWithYear(t.created_at)} · open, ${t.created_by?.display_name ?? "somebody"}`}
                {" — "}
                {t.title}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
