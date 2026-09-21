"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { formatClock, isInternal, type MeetingSummary } from "@/lib/meetings-view";

/**
 * The month, when no meeting is open.
 *
 * The right-hand side used to say "Pick a meeting, or start a new one",
 * which is a sentence telling you to do the thing you were already trying to
 * do. Marcelo asked for a calendar there instead, and it is the right answer:
 * the list on the left is ordered by recency, which is how you find the
 * meeting you had this morning, and a month is how you find the one you had
 * "sometime before the Louisville trip".
 *
 * Built from the meetings already on the page — no query, no second source of
 * truth about what happened when. Dates are compared as the plain `YYYY-MM-DD`
 * strings the database stores. A calendar day has no time zone, and turning
 * one into a `Date` is how a meeting held on the 1st starts showing on the
 * 31st for somebody in a different zone.
 */

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** `YYYY-MM-DD` for a local calendar day, without going through UTC. */
function dayKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthName(year: number, month: number): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(
    new Date(year, month, 1)
  );
}

/** Monday-first, because a working week is what these are filed against. */
function leadingBlanks(year: number, month: number): number {
  return (new Date(year, month, 1).getDay() + 6) % 7;
}

export function MeetingCalendar({
  meetings,
  onOpen,
  today = new Date(),
}: {
  meetings: MeetingSummary[];
  onOpen: (id: string) => void;
  today?: Date;
}) {
  const [cursor, setCursor] = useState(() => ({
    year: today.getFullYear(),
    month: today.getMonth(),
  }));
  const [picked, setPicked] = useState<string | null>(null);

  /* Every meeting of the month, by day, in the order the day ran. */
  const byDay = useMemo(() => {
    const map = new Map<string, MeetingSummary[]>();
    for (const meeting of meetings) {
      const list = map.get(meeting.met_on) ?? [];
      list.push(meeting);
      map.set(meeting.met_on, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.met_at ?? "").localeCompare(b.met_at ?? ""));
    }
    return map;
  }, [meetings]);

  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const blanks = leadingBlanks(cursor.year, cursor.month);
  const todayKey = dayKey(today.getFullYear(), today.getMonth(), today.getDate());

  function step(by: number) {
    setPicked(null);
    setCursor((was) => {
      const next = new Date(was.year, was.month + by, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  }

  const pickedMeetings = picked ? byDay.get(picked) ?? [] : [];
  const monthCount = useMemo(() => {
    const prefix = `${cursor.year}-${String(cursor.month + 1).padStart(2, "0")}`;
    return meetings.filter((m) => m.met_on.startsWith(prefix)).length;
  }, [meetings, cursor]);

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-section-heading text-fg">
          <CalendarDays aria-hidden className="size-6 shrink-0 text-sub" strokeWidth={1.75} />
          {monthName(cursor.year, cursor.month)}
        </h2>
        <div className="flex items-center gap-1">
          <NudgeButton label="Previous month" onClick={() => step(-1)}>
            <ChevronLeft aria-hidden className="size-5" strokeWidth={2.2} />
          </NudgeButton>
          <button
            type="button"
            onClick={() => {
              setPicked(null);
              setCursor({ year: today.getFullYear(), month: today.getMonth() });
            }}
            className="h-11 cursor-pointer rounded-full border-[1.5px] border-border bg-card px-3.5 text-timestamp font-bold text-fg hover:bg-muted"
          >
            Today
          </button>
          <NudgeButton label="Next month" onClick={() => step(1)}>
            <ChevronRight aria-hidden className="size-5" strokeWidth={2.2} />
          </NudgeButton>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((day) => (
          <span
            key={day}
            className="pb-1 text-center text-timestamp font-bold uppercase tracking-wider text-sub"
          >
            {/* One letter on a phone: seven three-letter labels do not fit 320px. */}
            <span className="sm:hidden">{day.slice(0, 1)}</span>
            <span className="hidden sm:inline">{day}</span>
          </span>
        ))}

        {Array.from({ length: blanks }, (_, i) => (
          <span key={`blank-${i}`} aria-hidden />
        ))}

        {Array.from({ length: daysInMonth }, (_, i) => {
          const key = dayKey(cursor.year, cursor.month, i + 1);
          const onThisDay = byDay.get(key) ?? [];
          const isToday = key === todayKey;
          const isPicked = key === picked;
          return (
            <button
              key={key}
              type="button"
              disabled={onThisDay.length === 0}
              onClick={() => setPicked(isPicked ? null : key)}
              aria-label={`${i + 1} — ${onThisDay.length === 0 ? "nothing" : `${onThisDay.length} meeting${onThisDay.length === 1 ? "" : "s"}`}`}
              className={cn(
                "flex aspect-square min-h-11 flex-col items-center justify-center gap-1 rounded-xl border-[1.5px] p-1",
                onThisDay.length > 0
                  ? "cursor-pointer border-border bg-card hover:bg-muted"
                  : "cursor-default border-transparent bg-transparent",
                isToday && "border-accent",
                isPicked && "border-fg bg-muted"
              )}
            >
              <span
                className={cn(
                  "text-[15px] leading-none tabular-nums",
                  onThisDay.length > 0 ? "font-bold text-fg" : "text-sub"
                )}
              >
                {i + 1}
              </span>
              {/*
                A dot per meeting, up to three. A count would need a number
                beside the date in a 44px box, and on a month with two
                meetings a day the dots say it faster than "2" does.
              */}
              {onThisDay.length > 0 && (
                <span className="flex items-center gap-[3px]">
                  {onThisDay.slice(0, 3).map((m) => (
                    <span
                      key={m.id}
                      aria-hidden
                      className={cn(
                        "size-[5px] rounded-full",
                        isInternal(m) ? "bg-accent" : "bg-brand"
                      )}
                    />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {picked ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-timestamp font-bold uppercase tracking-wider text-sub">
            {new Intl.DateTimeFormat("en-US", {
              weekday: "long",
              day: "numeric",
              month: "long",
              timeZone: "UTC",
            }).format(new Date(`${picked}T00:00:00Z`))}
          </h3>
          {pickedMeetings.map((meeting) => (
            <button
              key={meeting.id}
              type="button"
              onClick={() => onOpen(meeting.id)}
              className="flex w-full cursor-pointer flex-col gap-2 rounded-2xl border-[1.5px] border-border bg-card p-3.5 text-left hover:bg-muted"
            >
              <span className="flex flex-wrap items-center gap-2">
                {meeting.met_at && (
                  <span className="text-timestamp font-bold text-fg tabular-nums">
                    {formatClock(meeting.met_at)}
                  </span>
                )}
                {isInternal(meeting) ? (
                  <Chip className="border-accent text-accent">
                    <Users aria-hidden className="size-4" strokeWidth={1.75} />
                    Internal
                  </Chip>
                ) : (
                  meeting.companies.map((company) => (
                    <Chip key={company.id} className="border-tag text-tag">
                      {company.name}
                    </Chip>
                  ))
                )}
              </span>
              <span className="text-card-title-compact text-fg text-pretty wrap-anywhere">
                {meeting.title}
              </span>
              {meeting.description && (
                <span className="line-clamp-2 text-timestamp text-sub text-pretty">
                  {meeting.description}
                </span>
              )}
              {meeting.attendees.length > 0 && (
                <span className="flex items-center">
                  {meeting.attendees.slice(0, 6).map((a) => (
                    <span
                      key={`${a.kind}-${a.id}`}
                      className="-mr-2 inline-flex rounded-full ring-2 ring-card last:mr-0"
                    >
                      <Avatar initials={a.initials} color={a.color ?? "#87252b"} size={24} />
                    </span>
                  ))}
                </span>
              )}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-[16px] leading-6 text-sub text-pretty">
          {monthCount === 0
            ? "Nothing this month. The arrows move through the year, and the list on the left is always there."
            : `${monthCount} meeting${monthCount === 1 ? "" : "s"} this month. Press a day to see them.`}
        </p>
      )}
    </div>
  );
}

function NudgeButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="inline-grid size-11 cursor-pointer place-items-center rounded-full border-[1.5px] border-border bg-card text-fg hover:bg-muted"
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
