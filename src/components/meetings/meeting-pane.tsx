"use client";

import { useCallback, useState, type FocusEvent } from "react";
import Link from "next/link";
import {
  BookOpen,
  Check,
  ListPlus,
  PenLine,
  RotateCcw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { MeetingComments } from "@/components/meetings/meeting-comments";
import { MeetingEditor } from "@/components/meetings/meeting-editor";
import { MeetingReader } from "@/components/meetings/meeting-reader";
import {
  MeetingDetails,
  detailsFrom,
  type DetailValues,
} from "@/components/meetings/meeting-details";
import {
  clearDraft,
  useMeetingSave,
  useStoredDraft,
} from "@/components/meetings/use-meeting-save";
import { formatMeetingDay, meetingWhen, type Meeting } from "@/lib/meetings-view";
import { cn } from "@/lib/utils";
import type { ContactSummary } from "@/lib/data/contacts";
import type { CompanySummary } from "@/lib/companies-view";
import type { MemberSummary } from "@/lib/data/tasks";
import type { MeetingTask } from "@/lib/data/meetings";

/** The status words, matching what the Tasklist calls them. */
const TASK_STATUS_WORDS: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  for_review: "For review",
  waiting: "Waiting",
  complete: "Done",
};

/**
 * One meeting, open.
 *
 * Its own component, and **mounted with `key={meeting.id}`** by the list
 * beside it. That key is load-bearing: everything here — the text on screen,
 * whether it is saved, the timestamp the stale check compares against — is
 * about one meeting, and switching meetings should start over rather than
 * reset field by field. React remounting the whole thing is both simpler and
 * safer than any amount of clearing, and it is what lets the save hook hold
 * its state in refs without ever reading one during a render.
 *
 * Laid out in plain document flow, with no `flex-1` anywhere. Four nested
 * flex-1 boxes inside a scrolling pane, with a min-height on the innermost,
 * is what made the comments draw on top of the paper.
 */
export function MeetingPane({
  meeting,
  contacts,
  companies,
  roster,
  tasks,
  canEditBody,
  canEditDetails,
  meId,
  isPending,
  onBin,
  onClose,
  onSaved,
}: {
  meeting: Meeting;
  contacts: ContactSummary[];
  companies: CompanySummary[];
  roster: MemberSummary[];
  tasks: MeetingTask[];
  /** The minutes are the author's. See 0051. */
  canEditBody: boolean;
  /** The details belong to everybody who was in the room. See 0051. */
  canEditDetails: boolean;
  meId: string;
  isPending: boolean;
  onBin: () => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [details, setDetails] = useState<DetailValues>(() => detailsFrom(meeting));
  const [body, setBody] = useState(meeting.body);
  const [reading, setReading] = useState(false);
  const [draftDismissed, setDraftDismissed] = useState(false);

  /*
    One save for the whole meeting, so the button is live for anybody who may
    change any part of it. What each person's save actually writes is the
    database's decision, not this screen's: `save_meeting` takes the details
    from anybody who was there and the body only from its author, and
    `guard_meeting_edit` pins the rest whatever the caller sends.
  */
  const saver = useMeetingSave({
    meetingId: meeting.id,
    initialStamp: meeting.updated_at,
    canEdit: canEditBody || canEditDetails,
    onSaved,
  });

  const storedDraft = useStoredDraft(meeting.id);
  /*
    Compared against what is ON SCREEN, not against what the server last sent.

    Against the server's copy it was true of every unsaved keystroke and of
    every saved one too, so Marcelo met "this device kept a newer copy" after
    ordinary typing and after ordinary saving — a warning that cried wolf
    until it meant nothing. Against the text in front of him it is true of
    exactly one thing: a draft this browser wrote that is not what he is
    looking at, which only happens when a save never landed. That is the case
    the panel was built for, and now the only one it appears for.
  */
  const recovered = !draftDismissed && storedDraft && storedDraft.body !== body ? storedDraft : null;

  const edit = useCallback(
    (nextDetails: DetailValues, nextBody: string) => {
      setDetails(nextDetails);
      setBody(nextBody);
      saver.touch({ details: nextDetails, body: nextBody });
    },
    [saver]
  );

  /*
    Clicking out of what you were typing in saves it.

    A minute of quiet already did, and a minute is a long time to be wrong
    about — the answer to "did that save?" should be "yes" by the time you
    have looked away. `relatedTarget` is where the focus went: moving from the
    title to the date is still editing, and saving between every field would
    be a write per keystroke-group and a revalidate of three routes with it.
    Leaving the group altogether is the moment that counts.

    `relatedTarget` is null when focus leaves for the browser chrome or
    nothing at all, which is exactly the walking-away case — so that saves too.
  */
  const saveOnLeaving = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
      const next = event.relatedTarget;
      if (next && event.currentTarget.contains(next)) return;
      /*
        The attendee and company menus are portalled into `document.body` so
        the scrolling column cannot clip them, which means picking a name
        moves focus OUT of this box by the DOM's reckoning. Without this,
        every name chosen from a list would post a save — three attendees,
        three round trips, none of them what "clicking out" meant.
      */
      if (next?.closest('[role="listbox"]')) return;
      if (saver.dirty) void saver.save();
    },
    [saver]
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-section-heading text-fg text-pretty wrap-anywhere">{meeting.title}</h1>
          <p className="text-timestamp text-sub">
            {meetingWhen(meeting.met_on, meeting.met_at, formatMeetingDay)}
            {meeting.company_name ? ` · ${meeting.company_name}` : ""}
            {meeting.created_by ? ` · ${meeting.created_by.display_name}` : ""}
          </p>
        </div>
        {/*
          Close, not bin. The top-right corner is where every window in the
          world puts "I'm done looking at this", and it had the one control
          here that destroys something. Binning is at the very bottom now,
          past everything you would have read first — Marcelo's arrangement,
          and the right way round.
        */}
        <IconButton
          aria-label="Close these minutes"
          onClick={onClose}
          className="size-11 shrink-0"
        >
          <X aria-hidden className="size-5" strokeWidth={2} />
        </IconButton>
      </div>

      {recovered && (
        <div className="flex flex-col gap-2 rounded-2xl border-[1.5px] border-accent bg-card p-3">
          <p className="text-[16px] leading-[22px] text-fg text-pretty">
            This device kept a newer copy of these minutes, from a save that never reached the
            server — {recovered.body.length.toLocaleString()} characters against{" "}
            {body.length.toLocaleString()} here.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="w-auto"
              onClick={() => {
                edit(recovered.details, recovered.body);
                setDraftDismissed(true);
              }}
            >
              <RotateCcw aria-hidden className="size-4" strokeWidth={1.75} />
              Use the newer copy
            </Button>
            <Button
              variant="link"
              className="text-timestamp"
              onClick={() => {
                clearDraft(meeting.id);
                setDraftDismissed(true);
              }}
            >
              Keep what&apos;s here
            </Button>
          </div>
        </div>
      )}

      {saver.state === "stale" && (
        <div className="flex flex-col gap-2 rounded-2xl border-[1.5px] border-accent bg-card p-3">
          <p className="text-[16px] leading-[22px] text-fg text-pretty">
            {saver.message} Your text is still on screen — copy anything you need first.
          </p>
          <Button
            size="sm"
            variant="secondary"
            className="w-auto self-start"
            onClick={() => window.location.reload()}
          >
            <RotateCcw aria-hidden className="size-4" strokeWidth={1.75} />
            Reload these minutes
          </Button>
        </div>
      )}

      {/*
        The details and the paper are one editing surface: they save together,
        so they lose focus together. See saveOnLeaving.
      */}
      <div className="flex flex-col gap-4" onBlur={saveOnLeaving}>
        <MeetingDetails
          values={details}
          /*
            Only "somebody else's meeting" makes this read-only — never a
            save in flight. `disabled` here swaps the whole panel for a
            read-only list, and doing that for a second while a transition
            settled would flash the form away under whoever was typing in it.
          */
          disabled={!canEditDetails}
          meId={meId}
          isAuthor={canEditBody}
          onChange={(next) => edit(next, body)}
          contacts={contacts}
          companies={companies}
          roster={roster}
        />

        {canEditBody && body.trim() !== "" && (
          <div className="flex gap-1 self-start rounded-full bg-muted p-1">
            <ModeTab on={!reading} onClick={() => setReading(false)}>
              <PenLine aria-hidden className="size-4" strokeWidth={1.75} />
              Write
            </ModeTab>
            <ModeTab on={reading} onClick={() => setReading(true)}>
              <BookOpen aria-hidden className="size-4" strokeWidth={1.75} />
              Read
            </ModeTab>
          </div>
        )}

        {canEditBody && !reading ? (
          <MeetingEditor
            value={body}
            onChange={(next) => edit(details, next)}
            placeholder={"Write the minutes here.\n\nStart a line with “- ” or “1. ” and Enter carries the list on."}
          />
        ) : (
          /*
            Somebody else's minutes, or your own read back. A rendered view
            rather than a greyed-out box — a text area you cannot use still
            looks like one you should be able to, and this is where a line
            starting "- " becomes an actual bullet without the app reformatting
            what its author is in the middle of typing.
          */
          <MeetingReader body={body} />
        )}

        {/*
          Said once, where the box is, rather than left to be discovered. The
          details above are editable for anybody who was in the room; this is
          not, and a text area you cannot type in owes you a reason.
        */}
        {!canEditBody && canEditDetails && (
          <p className="text-timestamp text-sub text-pretty">
            The minutes belong to{" "}
            {meeting.created_by?.display_name ?? "whoever wrote them"} — you can correct the
            details above and add a comment below.
          </p>
        )}
      </div>

      {/*
        The save button, and the only place the app says anything about
        saving. Pressable means there is something unsaved; greyed means
        there is not. Nothing else to read and nothing to interpret.
      */}
      {(canEditBody || canEditDetails) && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="md"
            onClick={() => void saver.save()}
            disabled={!saver.dirty || isPending}
            className="w-auto"
          >
            <Save aria-hidden className="size-5" strokeWidth={1.75} />
            {saver.state === "saving" ? "Saving…" : saver.dirty ? "Save" : "Saved"}
          </Button>
          <span className="text-timestamp text-sub text-pretty">
            {saver.state === "error"
              ? saver.message
              : saver.dirty
                ? "Or leave it a minute and it saves itself."
                : "Everything here is saved."}
          </span>
        </div>
      )}

      {/*
        What came out of it. Below the paper: during the meeting the paper is
        the only thing that matters, and the action items are what you reach
        for once the talking has stopped.
      */}
      <div className="flex flex-col gap-2 border-t-[1.5px] border-border pt-4">
        <Link
          href={`/tasks/new?meeting=${meeting.id}&from=/meetings`}
          className="inline-flex h-11 w-auto items-center gap-2 self-start rounded-xl border-[1.5px] border-fg bg-card px-3 text-timestamp font-bold text-fg no-underline hover:bg-muted"
        >
          <ListPlus aria-hidden className="size-4" strokeWidth={1.75} />
          Task from this meeting
        </Link>

        {tasks.length > 0 && (
          <ul className="flex flex-col gap-2">
            {tasks.map((task) => (
              <li key={task.id}>
                <Link
                  href={`/tasks?task=${task.id}`}
                  className="flex flex-col gap-1.5 rounded-2xl border-[1.5px] border-border bg-card p-3 no-underline hover:bg-muted"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    {task.status === "complete" ? (
                      <Chip className="border-ok text-ok">
                        <Check aria-hidden className="size-4" strokeWidth={2.5} />
                        Done
                      </Chip>
                    ) : (
                      <Chip className="border-accent text-accent">
                        {TASK_STATUS_WORDS[task.status] ?? "Open"}
                      </Chip>
                    )}
                    {task.due_date && (
                      <Chip className="border-border text-sub tabular-nums">
                        Due {formatMeetingDay(task.due_date)}
                      </Chip>
                    )}
                  </span>
                  <span className="text-[17px] leading-6 text-fg text-pretty wrap-anywhere">
                    {task.title}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <MeetingComments meetingId={meeting.id} />

      {/*
        The last thing on the page, and deliberately the last thing.

        It was in the top-right corner, a thumb's width from the close button
        on a phone. Nothing that takes a meeting away should sit where you
        reach without looking — so it is below the minutes, the action items
        and the comments, at the end of everything you would read before
        deciding you no longer need any of it.
      */}
      {canEditBody && (
        <div className="flex flex-col gap-1.5 border-t-[1.5px] border-border pt-4">
          <Button
            variant="secondary"
            size="md"
            onClick={onBin}
            disabled={isPending}
            className="w-auto self-start"
          >
            <Trash2 aria-hidden className="size-5" strokeWidth={1.75} />
            Move to the bin
          </Button>
          <p className="text-timestamp text-sub text-pretty">
            Nothing is erased. It goes to the bin at the bottom of the list, where anyone can put
            it back.
          </p>
        </div>
      )}
    </div>
  );
}

/** A tab in the Write/Read switch. */
function ModeTab({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-full border-none px-3.5 text-timestamp font-bold",
        on ? "bg-prim text-on-prim" : "bg-transparent text-muted-fg hover:text-fg"
      )}
    >
      {children}
    </button>
  );
}

function Chip({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border-[1.5px] px-2.5 py-1 text-timestamp font-bold",
        className
      )}
    >
      {children}
    </span>
  );
}
