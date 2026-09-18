"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, CheckCheck, CircleSlash, RotateCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OutreachPill } from "@/components/contacts/outreach-pill";
import { useToast } from "@/components/ui/toast";
import { recordOutreachSent, setContactOutcome } from "@/app/contacts/actions";
import { Avatar } from "@/components/ui/avatar";
import { avatarColor, fullName, initialsOf } from "@/lib/contacts-view";
import { cn, formatTimestampWithYear } from "@/lib/utils";
import {
  OUTREACH_FOLLOW_UP_DAYS,
  canGiveUp,
  canSendAnother,
  type Outreach,
  type OutreachOutcome,
} from "@/lib/outreach";
import type { ContactSummary } from "@/lib/data/contacts";

/** A task can carry four people. See 0041 — one email to four is four records. */
const MAX_PER_TASK = 4;

/** What the two endings are called where somebody has to read them. */
const OUTCOME_WORDS: Record<OutreachOutcome, { verb: string; done: string; undo: string }> = {
  in_touch: { verb: "in touch", done: "Marked as in touch", undo: "In touch taken back" },
  no_reply: { verb: "no reply", done: "Marked as no reply", undo: "No reply taken back" },
};

/**
 * Outreach, on the person's own page.
 *
 * The section says a different thing depending on where they stand, and the
 * wording is chosen so that nobody has to read the pill and the sentence and
 * reconcile them. The pill is the headline; this is the detail.
 *
 * What is deliberately missing is a way to mark somebody contacted by hand.
 * Marcelo's rule, and the right one: if Fred rings someone from his truck he
 * makes the task and ticks it off, which takes half a minute and leaves
 * evidence. A button that set the flag on its own would make the book a
 * record of what people remembered to click.
 *
 * What is deliberately present, since 0044, is "Sent another" — because the
 * rule above was costing a whole task per email. A chase is now rounds on one
 * task rather than a task per round, which is the same evidence without the
 * task list turning into a list of near-identical cards.
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
  /*
    The ending being recorded and who it counts for. Null while nothing is
    being asked. One piece of state for both endings rather than two, because
    the question is identical — only the word changes.
  */
  const [deciding, setDeciding] = useState<{ outcome: OutreachOutcome; ids: string[] } | null>(
    null
  );
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

  function record(outcome: OutreachOutcome | null, ids: string[] = [contactId]) {
    startTransition(async () => {
      const failures: string[] = [];
      for (const id of ids) {
        const result = await setContactOutcome(id, outcome);
        if (!result.ok) failures.push(result.error);
      }
      setDeciding(null);
      if (failures.length > 0) {
        showToast({ message: failures[0]! });
        return;
      }
      onChanged();
      const was = outreach.outcome;
      showToast({
        message: outcome
          ? ids.length > 1
            ? `${ids.length} marked as ${OUTCOME_WORDS[outcome].verb}`
            : OUTCOME_WORDS[outcome].done
          : was
            ? OUTCOME_WORDS[was].undo
            : "Taken back",
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

    Giving up is asked the same way and for the same reason, read the other
    direction: if Sheena answered and Mike never did, parking Mike is right
    and parking Sheena would be throwing away a live thread.
  */
  function startDeciding(outcome: OutreachOutcome) {
    const others = outreach.latestCompleted?.people ?? [];
    if (others.length > 1) {
      setDeciding({ outcome, ids: others.map((p) => p.id) });
      return;
    }
    record(outcome);
  }

  /*
    Another round on the task that is already there, rather than a new one.
    The database moves the follow-up reminder on by a week as part of the same
    call, so this button is the entire gesture.
  */
  function sendAnother() {
    const taskId = outreach.latestCompleted?.task_id;
    if (!taskId) return;
    startTransition(async () => {
      const result = await recordOutreachSent(taskId);
      if (!result.ok) {
        showToast({ message: result.error });
        return;
      }
      onChanged();
      showToast({ message: `Round ${outreach.contactedCount + 1} recorded` });
    });
  }

  const {
    state,
    latestOpen,
    latestCompleted,
    outcome,
    outcomeAt,
    outcomeBy,
    canConfirm,
    contactedCount,
    firstContactedAt,
    lastContactedAt,
    tasks,
  } = outreach;

  /*
    Every round that ever went out, newest first, flattened across tasks.

    A task with three "Sent another" events on it is four lines here, not one,
    because four emails is what happened. The open tasks come in as
    themselves, since an intention has no send date to show.
  */
  const history = [
    ...tasks.flatMap((t) =>
      t.status === "complete"
        ? [
            {
              at: t.completed_at ?? t.created_at,
              who: t.completed_by?.display_name ?? "somebody",
              what: t.title,
              open: false,
            },
            ...t.sentAgainAt.map((at) => ({
              at,
              who: t.completed_by?.display_name ?? "somebody",
              what: "sent another",
              open: false,
            })),
          ]
        : [{ at: t.created_at, who: t.created_by?.display_name ?? "somebody", what: t.title, open: true }]
    ),
  ].sort((a, b) => b.at.localeCompare(a.at));

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

        {/*
          The shape of the chase, in one sentence: when it started, how many
          rounds it has taken, and when the last one went.

          Both ends are named because they answer different questions. "First
          reached out in March" is how long this has been going on; "last
          round three weeks ago" is whether it is your turn. A single date
          would leave you guessing which one you were reading — and the first
          date is the one Marcelo asked for by name when we designed "No
          reply", because it is what tells you whether a silence is a week old
          or a season old.
        */}
        {firstContactedAt && (
          <p className="text-[17px] leading-6 text-fg text-pretty">
            First reached out {formatTimestampWithYear(firstContactedAt)}.
            {contactedCount > 1 && (
              <>
                {" "}
                {contactedCount} rounds, the last{" "}
                {formatTimestampWithYear(lastContactedAt ?? firstContactedAt)}.
              </>
            )}
            {contactedCount === 1 && latestCompleted && (
              <> Sent by {latestCompleted.completed_by?.display_name ?? "somebody"}.</>
            )}
          </p>
        )}

        {outcome && outcomeAt && (
          <p className="text-[17px] leading-6 text-fg text-pretty">
            {outcome === "in_touch" ? "In touch" : "No reply"} — recorded by{" "}
            {outcomeBy?.display_name ?? "somebody"}, {formatTimestampWithYear(outcomeAt)}.
          </p>
        )}

        {/*
          The actions, with their icons, and the parking decision below them.

          Measured rather than eyeballed: at a 360px phone the row inside this
          card has 290px, and these three at `sm` with icons need 346px. So on
          a phone they take two lines and from about 430px up they take one.
          That is Marcelo's call, made after seeing both — the icons say what
          the button does at a glance, and a second line costs nothing but a
          second line.

          The earlier attempt to win a single line everywhere did it by taking
          the icons off, which bought 66px and spent something worth more.
          Recorded because the arithmetic was right and the trade was wrong:
          fitting is not the same as being better.

          Two containers rather than one wrapping row. The endings belong
          below the actions, and wrapping would only put them there by
          arithmetic — grow a label and a link climbs up while a button drops
          down. This states the arrangement outright.

          Every label and icon here is 15px and 16px, the same as the buttons.
          The `link` variant deliberately takes no size class, since a link in
          a paragraph should be the size of that paragraph — which meant these
          two inherited the card's body size and stood a good deal larger than
          the buttons they sit under. Said explicitly here instead.
        */}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={startOutreach} className="w-auto">
            <Send aria-hidden className="size-4" strokeWidth={1.75} />
            Contact
          </Button>

          {/*
            Another round. Listed before the two endings because on a live
            chase it is much the commonest thing to press: most weeks the
            answer to "has anything happened?" is no, and you send again.

            "Sent again" rather than "Try again", though it is a letter
            longer. Past tense is the whole meaning: pressing this sends
            nothing — you have already sent it, in your own mail client, and
            this is you telling the book so. On a card full of buttons that
            do things, "Try again" would read as "send it for me", which is
            the one thing it cannot do.
          */}
          {canSendAnother(outreach) && (
            <Button
              variant="secondary"
              size="sm"
              onClick={sendAnother}
              disabled={isPending}
              className="w-auto"
            >
              {/* A circular arrow, for "again" — the waiting is the reminder's
                  job and is already spelled out at the foot of this card. */}
              <RotateCw aria-hidden className="size-4" strokeWidth={1.75} />
              Sent again
            </Button>
          )}

          {/*
            Only for the people who did the outreach, and only once a round
            has finished. The database holds the same rules — these hide
            buttons that would otherwise be refused, rather than being the
            rules themselves.

            "Replied" rather than "They replied": you are on their page, so
            the subject was never in doubt, and the two words it saves are
            what let the row hold three buttons on a phone.
          */}
          {canConfirm && !outcome && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => startDeciding("in_touch")}
              disabled={isPending}
              className="w-auto"
            >
              {/* Two ticks, exactly the In touch pill's mark — one tick sent,
                  two ticks came back. The gesture and the state it produces
                  carry the same sign. */}
              <CheckCheck aria-hidden className="size-4" strokeWidth={1.75} />
              Replied
            </Button>
          )}
        </div>

        {/*
          Giving up, and taking an ending back — the two quiet ones, kept
          below the row and drawn as links rather than buttons. Giving up is a
          real decision and should be reachable in one tap, but it should
          never be what a thumb finds first on a chase that still has life
          in it.
        */}
        {(canGiveUp(outreach) || (canConfirm && outcome)) && (
          <div className="flex flex-wrap items-center gap-4">
            {canGiveUp(outreach) && (
              <Button
                variant="link"
                onClick={() => startDeciding("no_reply")}
                disabled={isPending}
                className="text-timestamp"
              >
                <CircleSlash aria-hidden className="size-4" strokeWidth={1.75} />
                No reply
              </Button>
            )}
            {canConfirm && outcome && (
              <Button
                variant="link"
                onClick={() => record(null)}
                disabled={isPending}
                className="text-timestamp"
              >
                {outcome === "in_touch" ? "Not in touch after all" : "Chase them again"}
              </Button>
            )}
          </div>
        )}

        {/* Who the ending counts for, when the email went to more than one. */}
        {deciding !== null && (
          <div className="flex flex-col gap-2 rounded-2xl border-[1.5px] border-border bg-bg p-3">
            <p className="text-[17px] leading-6 text-fg text-pretty">
              {deciding.outcome === "in_touch"
                ? "Who replied? One answer often speaks for everybody it was sent to."
                : "Who are you giving up on? Leave anyone still worth chasing unticked."}
            </p>
            <ul className="flex flex-col gap-1.5">
              {(latestCompleted?.people ?? []).map((person) => {
                const on = deciding.ids.includes(person.id);
                return (
                  <li key={person.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setDeciding((prev) =>
                          prev === null
                            ? prev
                            : {
                                ...prev,
                                ids: prev.ids.includes(person.id)
                                  ? prev.ids.filter((id) => id !== person.id)
                                  : [...prev.ids, person.id],
                              }
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
                disabled={isPending || deciding.ids.length === 0}
                onClick={() => record(deciding.outcome, deciding.ids)}
              >
                {deciding.ids.length > 1
                  ? `Mark ${deciding.ids.length} as ${OUTCOME_WORDS[deciding.outcome].verb}`
                  : `Mark as ${OUTCOME_WORDS[deciding.outcome].verb}`}
              </Button>
              <Button variant="ghost" size="md" className="w-auto" onClick={() => setDeciding(null)}>
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

        {/*
          Every round, once there has been more than one. A single line of
          history under a sentence that already says the same thing is
          repetition; four of them is the story.
        */}
        {history.length > 1 && (
          <ul className="flex flex-col gap-1 border-t-[1.5px] border-border pt-3">
            {history.map((h, i) => (
              <li key={`${h.at}-${i}`} className="text-timestamp text-sub text-pretty">
                {formatTimestampWithYear(h.at)} · {h.open ? `open, ${h.who}` : h.who} — {h.what}
              </li>
            ))}
          </ul>
        )}

        {/*
          Said once, at the bottom, and only while a chase is live: the
          reminder is the part of this you cannot see, and somebody who does
          not know it exists will set one by hand or chase by memory.
        */}
        {canSendAnother(outreach) && (
          <p className="text-timestamp text-sub text-pretty">
            Each round sets your reminder {OUTREACH_FOLLOW_UP_DAYS} days on. It stops when you
            record a reply or a no reply.
          </p>
        )}
      </div>
    </div>
  );
}
