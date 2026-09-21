"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Check,
  ListPlus,
  PenLine,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
  canEdit,
  isPending,
  onBin,
  onSaved,
}: {
  meeting: Meeting;
  contacts: ContactSummary[];
  companies: CompanySummary[];
  roster: MemberSummary[];
  tasks: MeetingTask[];
  canEdit: boolean;
  isPending: boolean;
  onBin: () => void;
  onSaved: () => void;
}) {
  const [details, setDetails] = useState<DetailValues>(() => detailsFrom(meeting));
  const [body, setBody] = useState(meeting.body);
  const [reading, setReading] = useState(false);
  const [draftDismissed, setDraftDismissed] = useState(false);

  const saver = useMeetingSave({
    meetingId: meeting.id,
    initialStamp: meeting.updated_at,
    canEdit,
    onSaved,
  });

  const storedDraft = useStoredDraft(meeting.id);
  const recovered =
    !draftDismissed && storedDraft && storedDraft.body !== meeting.body ? storedDraft : null;

  const edit = useCallback(
    (nextDetails: DetailValues, nextBody: string) => {
      setDetails(nextDetails);
      setBody(nextBody);
      saver.touch({ details: nextDetails, body: nextBody });
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
        {canEdit && (
          <Button variant="link" onClick={onBin} disabled={isPending} className="text-timestamp">
            <Trash2 aria-hidden className="size-4" strokeWidth={1.75} />
            Bin
          </Button>
        )}
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

      <MeetingDetails
        values={details}
        disabled={!canEdit || isPending}
        onChange={(next) => edit(next, body)}
        contacts={contacts}
        companies={companies}
        roster={roster}
      />

      {canEdit && body.trim() !== "" && (
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

      {canEdit && !reading ? (
        <MeetingEditor
          value={body}
          onChange={(next) => edit(details, next)}
          placeholder={"Write the minutes here.\n\nA line starting “- ” shows as a bullet when you press Read."}
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
        The save button, and the only place the app says anything about
        saving. Pressable means there is something unsaved; greyed means
        there is not. Nothing else to read and nothing to interpret.
      */}
      {canEdit && (
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
