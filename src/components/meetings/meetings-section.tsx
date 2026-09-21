"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { companyMeetings, contactMeetings } from "@/app/meetings/actions";
import { formatMeetingDay, isInternal, meetingWhen, type MeetingSummary } from "@/lib/meetings-view";
import { cn } from "@/lib/utils";

/**
 * The running record, on a company's page and on a person's.
 *
 * This is the Word-document-per-company Marcelo described, without being one:
 * every meeting with Brazos in one place, newest first, each with its date.
 * The difference is that each line is still its own record — a task can point
 * at one, search can return one, and none of them is a forty-page file
 * somebody has to scroll.
 *
 * Loaded when the pane opens rather than with the contacts book. The book is
 * already the heaviest page in the app, and most visits never open a pane at
 * all.
 */
export function MeetingsSection({
  companyId,
  contactId,
  title = "Meetings",
}: {
  companyId?: string;
  contactId?: string;
  title?: string;
}) {
  const [meetings, setMeetings] = useState<MeetingSummary[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    const load = companyId
      ? companyMeetings(companyId)
      : contactId
        ? contactMeetings(contactId)
        : null;
    if (!load) return;
    void load.then((result) => {
      if (!live) return;
      if (result.ok) setMeetings(result.meetings);
      else setFailed(true);
    });
    return () => {
      live = false;
    };
  }, [companyId, contactId]);

  /* Nothing at all until there is something to say — an empty section on
     every company is a section people learn to scroll past. */
  if (failed || meetings === null || meetings.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-field-label text-sub">{title}</h2>
      <ul className="flex flex-col gap-2">
        {meetings.map((meeting) => (
          <li key={meeting.id}>
            <Link
              href={`/meetings?open=${meeting.id}`}
              className={cn(
                "flex flex-col gap-1.5 rounded-2xl border-[1.5px] border-border bg-card p-3",
                "no-underline hover:bg-muted"
              )}
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-border px-2.5 py-1 text-timestamp font-bold tabular-nums text-sub">
                  {meetingWhen(meeting.met_on, meeting.met_at, formatMeetingDay)}
                </span>
                {isInternal(meeting) && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-accent px-2.5 py-1 text-timestamp font-bold text-accent">
                    <Users aria-hidden className="size-4" strokeWidth={1.75} />
                    Internal
                  </span>
                )}
              </span>
              <span className="text-[17px] leading-6 font-bold text-fg text-pretty wrap-anywhere">
                {meeting.title}
              </span>
              {meeting.snippet && (
                <span className="line-clamp-2 text-timestamp text-sub text-pretty">
                  {meeting.snippet}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
