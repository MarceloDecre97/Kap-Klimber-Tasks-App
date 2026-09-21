"use client";

import { useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { attendeeLine, toTimeInput, type MeetingSummary } from "@/lib/meetings-view";
import type { ContactSummary } from "@/lib/data/contacts";
import type { CompanySummary } from "@/lib/companies-view";
import type { MemberSummary } from "@/lib/data/tasks";
import { avatarColor, fullName, initialsOf } from "@/lib/contacts-view";

/**
 * Everything about a meeting except the minutes themselves.
 *
 * Folded away by default once the meeting exists. During the meeting the
 * only thing that matters is the paper; the title and the date were settled
 * before it started and a row of form fields above the typing area is a row
 * of things to scroll past forty times.
 */

export interface DetailValues {
  title: string;
  metOn: string;
  metAt: string;
  companyId: string | null;
  contactIds: string[];
  memberIds: string[];
}

export function detailsFrom(meeting: MeetingSummary): DetailValues {
  return {
    title: meeting.title,
    metOn: meeting.met_on,
    metAt: toTimeInput(meeting.met_at),
    /* What was typed, not what was inferred — see MeetingSummary. */
    companyId: meeting.explicit_company_id,
    contactIds: meeting.attendees.filter((a) => a.kind === "contact").map((a) => a.id),
    memberIds: meeting.attendees.filter((a) => a.kind === "member").map((a) => a.id),
  };
}

export function MeetingDetails({
  values,
  onChange,
  contacts,
  companies,
  roster,
  disabled,
  startOpen = false,
  alwaysOpen = false,
}: {
  values: DetailValues;
  onChange: (next: DetailValues) => void;
  contacts: ContactSummary[];
  companies: CompanySummary[];
  roster: MemberSummary[];
  disabled?: boolean;
  startOpen?: boolean;
  /** The create form has nothing to fold away — the fields are the point. */
  alwaysOpen?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(!startOpen);
  const open = alwaysOpen || !collapsed;
  const [peopleQuery, setPeopleQuery] = useState("");

  const set = <K extends keyof DetailValues>(key: K, value: DetailValues[K]) =>
    onChange({ ...values, [key]: value });

  const pickedContacts = contacts.filter((c) => values.contactIds.includes(c.id));
  const pickedMembers = roster.filter((m) => values.memberIds.includes(m.id));

  /*
    Who the picker offers.

    With a company chosen, everybody who works there, listed without typing —
    that list is a handful of people and making somebody search a set of four
    is making them work for nothing. Without one, the book is hundreds deep,
    so it stays quiet until two letters narrow it.

    Either way, typing searches the whole book. Choosing a company is a
    shortcut to the people you probably want, not a fence around them: the
    supplier who brought somebody from another firm is exactly the meeting
    you would otherwise have to undo the company to record.
  */
  const q = peopleQuery.trim().toLowerCase();
  const atCompany = values.companyId
    ? contacts.filter((c) => c.company_id === values.companyId)
    : [];

  const pool = q.length > 0 ? contacts : atCompany;
  const contactMatches = pool
    .filter((c) => !values.contactIds.includes(c.id))
    .filter((c) => q.length === 0 || `${fullName(c)} ${c.company ?? ""}`.toLowerCase().includes(q))
    .slice(0, q.length > 0 ? 6 : 8);

  const memberMatches =
    q.length > 0
      ? roster
          .filter((m) => !values.memberIds.includes(m.id))
          .filter((m) => m.display_name.toLowerCase().includes(q))
          .slice(0, 4)
      : [];

  const summary = attendeeLine([
    ...pickedMembers.map((m) => ({
      id: m.id,
      name: m.display_name,
      initials: m.initials,
      color: m.color,
      kind: "member" as const,
    })),
    ...pickedContacts.map((c) => ({
      id: c.id,
      name: fullName(c),
      initials: initialsOf(c),
      color: avatarColor(c),
      kind: "contact" as const,
    })),
  ]);

  return (
    <div className="flex flex-col gap-2 rounded-2xl border-[1.5px] border-border bg-card p-3">
      {!alwaysOpen && (
      <button
        type="button"
        onClick={() => setCollapsed((wasCollapsed) => !wasCollapsed)}
        aria-expanded={open}
        className="flex min-h-11 cursor-pointer items-center justify-between gap-3 border-none bg-transparent p-0 text-left"
      >
        <span className="min-w-0 text-timestamp text-sub wrap-anywhere">{summary}</span>
        <span className="flex shrink-0 items-center gap-1 text-timestamp font-bold text-brand">
          {open ? "Hide details" : "Details"}
          <ChevronDown
            aria-hidden
            className={cn("size-4 transition-transform duration-150", open && "rotate-180")}
            strokeWidth={2}
          />
        </span>
      </button>
      )}

      {open && (
        <div className="flex flex-col gap-3 border-t-[1.5px] border-border pt-3">
          <Field label="Title" htmlFor="meeting-title">
            <input
              id="meeting-title"
              value={values.title}
              disabled={disabled}
              onChange={(event) => set("title", event.target.value)}
              placeholder="What was it about?"
              className="h-14 w-full rounded-2xl border-[1.5px] border-border bg-bg px-3.5 text-[17px] text-fg placeholder:text-sub"
            />
          </Field>

          <div className="flex flex-wrap gap-3">
            <Field label="Date" htmlFor="meeting-date" className="min-w-[160px] flex-1">
              <input
                id="meeting-date"
                type="date"
                value={values.metOn}
                disabled={disabled}
                onChange={(event) => set("metOn", event.target.value)}
                className="h-14 w-full rounded-2xl border-[1.5px] border-border bg-bg px-3.5 text-[17px] tabular-nums text-fg"
              />
            </Field>
            <Field label="Time" htmlFor="meeting-time" className="min-w-[140px] flex-1">
              <input
                id="meeting-time"
                type="time"
                value={values.metAt}
                disabled={disabled}
                onChange={(event) => set("metAt", event.target.value)}
                className="h-14 w-full rounded-2xl border-[1.5px] border-border bg-bg px-3.5 text-[17px] tabular-nums text-fg"
              />
            </Field>
          </div>

          <Field label="Company" htmlFor="meeting-company">
            <select
              id="meeting-company"
              value={values.companyId ?? ""}
              disabled={disabled}
              onChange={(event) => set("companyId", event.target.value || null)}
              className="h-14 w-full rounded-2xl border-[1.5px] border-border bg-bg px-3 text-[17px] text-fg"
            >
              <option value="">Worked out from who was there</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
            <p className="text-timestamp text-sub text-pretty">
              Leave this alone and the company follows the people you add. Set it when you met a
              company without naming anyone, or when two companies were in the room.
            </p>
          </Field>

          <Field label="Who was there" htmlFor="meeting-people">
            <div className="flex flex-wrap gap-2">
              {pickedMembers.map((m) => (
                <Picked
                  key={m.id}
                  label={m.display_name}
                  initials={m.initials}
                  color={m.color}
                  disabled={disabled}
                  onRemove={() =>
                    set(
                      "memberIds",
                      values.memberIds.filter((id) => id !== m.id)
                    )
                  }
                />
              ))}
              {pickedContacts.map((c) => (
                <Picked
                  key={c.id}
                  label={fullName(c)}
                  initials={initialsOf(c)}
                  color={avatarColor(c)}
                  disabled={disabled}
                  onRemove={() =>
                    set(
                      "contactIds",
                      values.contactIds.filter((id) => id !== c.id)
                    )
                  }
                />
              ))}
            </div>

            <input
              id="meeting-people"
              value={peopleQuery}
              disabled={disabled}
              onChange={(event) => setPeopleQuery(event.target.value)}
              placeholder="Type a name — yours, or anyone in the book"
              className="h-14 w-full rounded-2xl border-[1.5px] border-border bg-bg px-3.5 text-[17px] text-fg placeholder:text-sub"
            />

            {(q.length > 0 || contactMatches.length > 0) && (
              <ul className="flex flex-col gap-1 rounded-2xl border-[1.5px] border-border bg-bg p-1.5">
                {memberMatches.length === 0 && contactMatches.length === 0 && (
                  <li className="px-2 py-2 text-timestamp text-sub">Nobody by that name.</li>
                )}
                {q.length === 0 && contactMatches.length > 0 && (
                  <li className="px-2 pb-1 pt-1.5 text-timestamp text-sub">
                    At this company — or type any name
                  </li>
                )}
                {memberMatches.map((m) => (
                  <li key={m.id}>
                    <Suggestion
                      label={m.display_name}
                      hint="Opus Kap"
                      initials={m.initials}
                      color={m.color}
                      onPick={() => {
                        set("memberIds", [...values.memberIds, m.id]);
                        setPeopleQuery("");
                      }}
                    />
                  </li>
                ))}
                {contactMatches.map((c) => (
                  <li key={c.id}>
                    <Suggestion
                      label={fullName(c)}
                      hint={c.company ?? ""}
                      initials={initialsOf(c)}
                      color={avatarColor(c)}
                      onPick={() => {
                        set("contactIds", [...values.contactIds, c.id]);
                        setPeopleQuery("");
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Field>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-field-label text-fg">
        {label}
      </label>
      {children}
    </div>
  );
}

function Picked({
  label,
  initials,
  color,
  disabled,
  onRemove,
}: {
  label: string;
  initials: string;
  color: string;
  disabled?: boolean;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-border bg-bg py-1 pl-1 pr-1.5">
      <Avatar initials={initials} color={color} size={26} />
      <span className="text-timestamp font-bold text-fg">{label}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={onRemove}
        aria-label={`Take ${label} off this meeting`}
        className="inline-grid size-7 cursor-pointer place-items-center rounded-full border-none bg-transparent text-sub hover:bg-muted"
      >
        <X aria-hidden className="size-4" strokeWidth={2.2} />
      </button>
    </span>
  );
}

function Suggestion({
  label,
  hint,
  initials,
  color,
  onPick,
}: {
  label: string;
  hint: string;
  initials: string;
  color: string;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex min-h-12 w-full cursor-pointer items-center gap-2.5 rounded-xl border-none bg-transparent px-2 py-1.5 text-left hover:bg-muted"
    >
      <Avatar initials={initials} color={color} size={28} />
      <span className="min-w-0 grow text-[16px] leading-[22px] text-fg wrap-anywhere">
        {label}
        {hint && <span className="block text-timestamp text-sub">{hint}</span>}
      </span>
      <Check aria-hidden className="size-4 shrink-0 text-sub" strokeWidth={2} />
    </button>
  );
}
