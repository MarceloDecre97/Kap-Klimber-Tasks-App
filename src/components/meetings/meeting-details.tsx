"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, X } from "lucide-react";
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
 * Folded away by default once the meeting exists. During the meeting the only
 * thing that matters is the paper; the title and the date were settled before
 * it started, and a row of form fields above the typing area is a row of
 * things to scroll past forty times.
 *
 * `disabled` here means *somebody else's meeting*. Only its author may change
 * any of this — the database has said so since 0046 — and the panel now looks
 * it: no inputs, no remove buttons, just what was decided. A greyed-out form
 * is still a form, and Fred pressing an X that silently does nothing is worse
 * than Fred not seeing an X.
 */

export interface DetailValues {
  title: string;
  description: string;
  metOn: string;
  metAt: string;
  companyId: string | null;
  contactIds: string[];
  memberIds: string[];
}

export function detailsFrom(meeting: MeetingSummary): DetailValues {
  return {
    title: meeting.title,
    description: meeting.description ?? "",
    metOn: meeting.met_on,
    metAt: toTimeInput(meeting.met_at),
    /* What was typed, not what was inferred — see MeetingSummary. */
    companyId: meeting.explicit_company_id,
    contactIds: meeting.attendees.filter((a) => a.kind === "contact").map((a) => a.id),
    memberIds: meeting.attendees.filter((a) => a.kind === "member").map((a) => a.id),
  };
}

/** 200 characters, matching the column. Two lines on a 360px card. */
const DESCRIPTION_LIMIT = 200;

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
  /** Somebody else's meeting: read it, change nothing. */
  disabled?: boolean;
  startOpen?: boolean;
  /** The create form has nothing to fold away — the fields are the point. */
  alwaysOpen?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(!startOpen);
  const open = alwaysOpen || !collapsed;
  const [teamQuery, setTeamQuery] = useState("");
  const [contactQuery, setContactQuery] = useState("");

  const set = <K extends keyof DetailValues>(key: K, value: DetailValues[K]) =>
    onChange({ ...values, [key]: value });

  const pickedContacts = contacts.filter((c) => values.contactIds.includes(c.id));
  const pickedMembers = roster.filter((m) => values.memberIds.includes(m.id));

  /*
    Two pickers, not one.

    They were one box searching both books, which meant typing "p" offered Dee
    Kapur beside three contacts from three different companies — a list with
    no shape. Our four people and several hundred contacts are different kinds
    of thing and deserve different rows.

    The contacts picker narrows to the chosen company and shows them without
    typing: that list is a handful of people, and making somebody search a set
    of four is making them work for nothing. Typing still reaches the whole
    book, because the supplier who brought somebody from another firm is
    exactly the meeting you would otherwise have to undo the company to record.
  */
  const teamQ = teamQuery.trim().toLowerCase();
  const teamMatches = roster
    .filter((m) => !values.memberIds.includes(m.id))
    .filter((m) => teamQ.length === 0 || m.display_name.toLowerCase().includes(teamQ));

  const contactQ = contactQuery.trim().toLowerCase();
  const atCompany = values.companyId
    ? contacts.filter((c) => c.company_id === values.companyId)
    : [];
  const contactPool = contactQ.length > 0 ? contacts : atCompany;
  const contactMatches = contactPool
    .filter((c) => !values.contactIds.includes(c.id))
    .filter(
      (c) =>
        contactQ.length === 0 ||
        `${fullName(c)} ${c.company ?? ""}`.toLowerCase().includes(contactQ)
    )
    .slice(0, 8);

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

  const companyName = companies.find((c) => c.id === values.companyId)?.name ?? null;

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

      {open && disabled && (
        /* Somebody else's meeting. What was decided, and no controls. */
        <dl className="flex flex-col gap-2 border-t-[1.5px] border-border pt-3">
          <ReadRow label="Title" value={values.title} />
          <ReadRow label="About" value={values.description} />
          <ReadRow
            label="When"
            value={values.metAt ? `${values.metOn} · ${values.metAt}` : values.metOn}
          />
          <ReadRow label="Company" value={companyName ?? "Worked out from who was there"} />
          <ReadRow label="Who was there" value={summary} />
        </dl>
      )}

      {open && !disabled && (
        <div className="flex flex-col gap-3 border-t-[1.5px] border-border pt-3">
          <Field label="Title" htmlFor="meeting-title">
            <input
              id="meeting-title"
              value={values.title}
              onChange={(event) => set("title", event.target.value)}
              placeholder="What was it about?"
              className="h-14 w-full rounded-2xl border-[1.5px] border-border bg-bg px-3.5 text-[17px] text-fg placeholder:text-sub"
            />
          </Field>

          {/*
            The line the card shows. Its own field rather than the first 160
            characters of the minutes, which is whatever you happened to type
            first — a fine opening line and a useless summary.
          */}
          <Field label="Description" htmlFor="meeting-description">
            <input
              id="meeting-description"
              value={values.description}
              maxLength={DESCRIPTION_LIMIT}
              onChange={(event) => set("description", event.target.value)}
              placeholder="One line — this is what shows on the card"
              className="h-14 w-full rounded-2xl border-[1.5px] border-border bg-bg px-3.5 text-[17px] text-fg placeholder:text-sub"
            />
            <p className="text-timestamp text-sub tabular-nums">
              {values.description.length} / {DESCRIPTION_LIMIT} · leave it empty and the card shows
              the title alone.
            </p>
          </Field>

          <div className="flex flex-wrap gap-3">
            <Field label="Date" htmlFor="meeting-date" className="min-w-[160px] flex-1">
              <input
                id="meeting-date"
                type="date"
                value={values.metOn}
                onChange={(event) => set("metOn", event.target.value)}
                className="h-14 w-full rounded-2xl border-[1.5px] border-border bg-bg px-3.5 text-[17px] tabular-nums text-fg"
              />
            </Field>
            <Field label="Time" htmlFor="meeting-time" className="min-w-[140px] flex-1">
              <input
                id="meeting-time"
                type="time"
                value={values.metAt}
                onChange={(event) => set("metAt", event.target.value)}
                className="h-14 w-full rounded-2xl border-[1.5px] border-border bg-bg px-3.5 text-[17px] tabular-nums text-fg"
              />
            </Field>
          </div>

          <Field label="Company" htmlFor="meeting-company">
            <select
              id="meeting-company"
              value={values.companyId ?? ""}
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

          <Field label="From Opus Kap" htmlFor="meeting-team">
            <Picked
              people={pickedMembers.map((m) => ({
                id: m.id,
                label: m.display_name,
                initials: m.initials,
                color: m.color,
              }))}
              onRemove={(id) =>
                set(
                  "memberIds",
                  values.memberIds.filter((x) => x !== id)
                )
              }
            />
            <input
              id="meeting-team"
              value={teamQuery}
              onChange={(event) => setTeamQuery(event.target.value)}
              placeholder="Add somebody from the team"
              className="h-14 w-full rounded-2xl border-[1.5px] border-border bg-bg px-3.5 text-[17px] text-fg placeholder:text-sub"
            />
            {teamMatches.length > 0 && (
              <Suggestions>
                {teamMatches.map((m) => (
                  <Suggestion
                    key={m.id}
                    label={m.display_name}
                    hint="Opus Kap"
                    initials={m.initials}
                    color={m.color}
                    onPick={() => {
                      set("memberIds", [...values.memberIds, m.id]);
                      setTeamQuery("");
                    }}
                  />
                ))}
              </Suggestions>
            )}
          </Field>

          <Field label="From the address book" htmlFor="meeting-contacts">
            <Picked
              people={pickedContacts.map((c) => ({
                id: c.id,
                label: fullName(c),
                initials: initialsOf(c),
                color: avatarColor(c),
              }))}
              onRemove={(id) =>
                set(
                  "contactIds",
                  values.contactIds.filter((x) => x !== id)
                )
              }
            />
            <input
              id="meeting-contacts"
              value={contactQuery}
              onChange={(event) => setContactQuery(event.target.value)}
              placeholder={
                companyName ? `Anyone else, or search the whole book` : "Type a name from the book"
              }
              className="h-14 w-full rounded-2xl border-[1.5px] border-border bg-bg px-3.5 text-[17px] text-fg placeholder:text-sub"
            />
            {(contactQ.length > 0 || contactMatches.length > 0) && (
              <Suggestions>
                {contactQ.length === 0 && companyName && (
                  <li className="px-2 pb-1 pt-1.5 text-timestamp text-sub">
                    At {companyName} — or type any name
                  </li>
                )}
                {contactMatches.length === 0 && (
                  <li className="px-2 py-2 text-timestamp text-sub">Nobody by that name.</li>
                )}
                {contactMatches.map((c) => (
                  <Suggestion
                    key={c.id}
                    label={fullName(c)}
                    hint={c.company ?? ""}
                    initials={initialsOf(c)}
                    color={avatarColor(c)}
                    onPick={() => {
                      set("contactIds", [...values.contactIds, c.id]);
                      setContactQuery("");
                    }}
                  />
                ))}
              </Suggestions>
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
  children: ReactNode;
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

function ReadRow({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-timestamp font-bold text-sub">{label}</dt>
      <dd className="m-0 text-[17px] leading-6 text-fg text-pretty wrap-anywhere">{value}</dd>
    </div>
  );
}

function Suggestions({ children }: { children: ReactNode }) {
  return (
    <ul className="flex flex-col gap-1 rounded-2xl border-[1.5px] border-border bg-bg p-1.5">
      {children}
    </ul>
  );
}

function Picked({
  people,
  onRemove,
}: {
  people: { id: string; label: string; initials: string; color: string }[];
  onRemove: (id: string) => void;
}) {
  if (people.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {people.map((person) => (
        <span
          key={person.id}
          className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-border bg-bg py-1 pl-1 pr-1.5"
        >
          <Avatar initials={person.initials} color={person.color} size={26} />
          <span className="text-timestamp font-bold text-fg">{person.label}</span>
          <button
            type="button"
            onClick={() => onRemove(person.id)}
            aria-label={`Take ${person.label} off this meeting`}
            className="inline-grid size-7 cursor-pointer place-items-center rounded-full border-none bg-transparent text-sub hover:bg-muted"
          >
            <X aria-hidden className="size-4" strokeWidth={2.2} />
          </button>
        </span>
      ))}
    </div>
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
    <li>
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
      </button>
    </li>
  );
}
