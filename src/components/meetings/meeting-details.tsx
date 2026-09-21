"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { attendeeLine, toTimeInput, type MeetingSummary } from "@/lib/meetings-view";
import { PickCombo, type PickOption } from "@/components/meetings/meeting-pickers";
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
 * `disabled` here means *not your meeting to correct*. Since 0051 that is a
 * narrower thing than it was: the details belong to everybody who was at the
 * meeting, not only to whoever typed the minutes. Dee remembering that Keith
 * was there too is a correction to the record of a meeting she sat in, not an
 * edit to Marcelo's paper. Somebody who was not there sees a read-only list —
 * no inputs, no remove buttons. A greyed-out form is still a form, and
 * pressing an X that silently does nothing is worse than not seeing an X.
 *
 * The company leads. Pick it and the address book below narrows to its
 * people, which is how this is actually used: you know who you met before you
 * know their name is spelled Housman.
 */

export interface DetailValues {
  title: string;
  description: string;
  metOn: string;
  metAt: string;
  /** Up to four. The address book below offers the people at any of them. */
  companyIds: string[];
  contactIds: string[];
  memberIds: string[];
}

export function detailsFrom(meeting: MeetingSummary): DetailValues {
  return {
    title: meeting.title,
    description: meeting.description ?? "",
    metOn: meeting.met_on,
    metAt: toTimeInput(meeting.met_at),
    /* What was chosen, not what was inferred — see MeetingSummary. */
    companyIds: meeting.explicit_company_ids,
    contactIds: meeting.attendees.filter((a) => a.kind === "contact").map((a) => a.id),
    memberIds: meeting.attendees.filter((a) => a.kind === "member").map((a) => a.id),
  };
}

/** 200 characters, matching the column. Two lines on a 360px card. */
const DESCRIPTION_LIMIT = 200;

/** Matching set_meeting_attendees. Five is a conference, not a meeting. */
const COMPANY_LIMIT = 4;

export function MeetingDetails({
  values,
  onChange,
  contacts,
  companies,
  roster,
  meId,
  isAuthor = true,
  memberAddedBy,
  disabled,
  startOpen = false,
  alwaysOpen = false,
}: {
  values: DetailValues;
  onChange: (next: DetailValues) => void;
  contacts: ContactSummary[];
  companies: CompanySummary[];
  roster: MemberSummary[];
  /** Who is looking, so they cannot accidentally sign themselves out. */
  meId?: string;
  /** Whether they wrote the minutes. The author may take anybody off. */
  isAuthor?: boolean;
  /**
   * Who put each member in the room, for the people already saved.
   *
   * A name missing from this map is one added in this session, which by
   * definition was added by whoever is looking. See the remove rule below.
   */
  memberAddedBy?: Record<string, string | null>;
  /** Somebody who was not at this meeting: read it, change nothing. */
  disabled?: boolean;
  startOpen?: boolean;
  /** The create form has nothing to fold away — the fields are the point. */
  alwaysOpen?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(!startOpen);
  const open = alwaysOpen || !collapsed;
  const [companyQuery, setCompanyQuery] = useState("");
  const [teamQuery, setTeamQuery] = useState("");
  const [contactQuery, setContactQuery] = useState("");

  const set = <K extends keyof DetailValues>(key: K, value: DetailValues[K]) =>
    onChange({ ...values, [key]: value });

  const pickedContacts = contacts.filter((c) => values.contactIds.includes(c.id));
  const pickedMembers = roster.filter((m) => values.memberIds.includes(m.id));
  const pickedCompanies = companies.filter((c) => values.companyIds.includes(c.id));
  const companyNames = pickedCompanies.map((c) => c.name);

  /*
    The team: always all of us, minus whoever is already on. Four names is not
    a search problem, so typing only ever narrows a list you can already see.
  */
  const teamQ = teamQuery.trim().toLowerCase();
  const teamOptions: PickOption[] = roster
    .filter((m) => !values.memberIds.includes(m.id))
    .filter((m) => teamQ.length === 0 || m.display_name.toLowerCase().includes(teamQ))
    .map((m) => ({
      id: m.id,
      label: m.display_name,
      hint: "Opus Kap",
      initials: m.initials,
      color: m.color ?? "#87252b",
    }));

  /*
    The book: the chosen company's people when you have typed nothing, and the
    whole book the moment you type.

    Marcelo's rule, and it is the right way round. Most of the time the person
    you are adding works at the company you just picked, and making somebody
    search a set of four is making them work for nothing. But the supplier who
    brought somebody from another firm is exactly the meeting you would
    otherwise have to undo the company to record — so typing still reaches
    everybody.
  */
  const contactQ = contactQuery.trim().toLowerCase();
  const atCompany =
    values.companyIds.length > 0
      ? contacts.filter((c) => c.company_id && values.companyIds.includes(c.company_id))
      : [];
  const contactPool = contactQ.length > 0 ? contacts : atCompany;
  const contactOptions: PickOption[] = contactPool
    .filter((c) => !values.contactIds.includes(c.id))
    .filter(
      (c) =>
        contactQ.length === 0 ||
        `${fullName(c)} ${c.company ?? ""}`.toLowerCase().includes(contactQ)
    )
    .slice(0, 12)
    .map((c) => ({
      id: c.id,
      label: fullName(c),
      hint: c.company ?? undefined,
      initials: initialsOf(c),
      color: avatarColor(c),
    }));

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

  const companyQ = companyQuery.trim().toLowerCase();
  const companyOptions: PickOption[] = companies
    .filter((c) => !values.companyIds.includes(c.id))
    .filter((c) => companyQ.length === 0 || c.name.toLowerCase().includes(companyQ))
    .slice(0, 12)
    .map((c) => ({ id: c.id, label: c.name }));

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
        /* Somebody who was not at this meeting. What was decided, no controls. */
        <dl className="flex flex-col gap-2 border-t-[1.5px] border-border pt-3">
          <ReadRow label="Title" value={values.title} />
          <ReadRow label="About" value={values.description} />
          <ReadRow
            label="When"
            value={values.metAt ? `${values.metOn} · ${values.metAt}` : values.metOn}
          />
          <ReadRow
            label={companyNames.length === 1 ? "Company" : "Companies"}
            value={companyNames.join(", ") || "Worked out from who was there"}
          />
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
              /* Same reason as the minutes box: a phone keyboard capitalises
                 the first letter before there is a word to judge, and a title
                 is exactly where a product name gets typed. */
              autoCapitalize="off"
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
              autoCapitalize="off"
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

          {/*
            Up to four. A call with somebody from AAA and somebody from ADV
            Mobil had to pick one or be filed as nobody's, which is what this
            replaces. At the limit the box says so rather than going quiet.
          */}
          <Field
            label={values.companyIds.length === 1 ? "Company" : "Companies"}
            htmlFor="meeting-companies"
          >
            <PickCombo
              id="meeting-companies"
              placeholder={
                values.companyIds.length >= COMPANY_LIMIT
                  ? `${COMPANY_LIMIT} is the most`
                  : "Who was the meeting with?"
              }
              picked={pickedCompanies.map((c) => ({ id: c.id, label: c.name }))}
              options={values.companyIds.length >= COMPANY_LIMIT ? [] : companyOptions}
              query={companyQuery}
              onQuery={setCompanyQuery}
              onPick={(id) => set("companyIds", [...values.companyIds, id])}
              onRemove={(id) =>
                set(
                  "companyIds",
                  values.companyIds.filter((x) => x !== id)
                )
              }
              emptyText={
                values.companyIds.length >= COMPANY_LIMIT
                  ? `Four companies is the most one meeting can be with. Take one off to swap it.`
                  : companyQ.length > 0
                    ? "No company in the book by that name."
                    : "Every company is already on."
              }
            />
            <p className="text-timestamp text-sub text-pretty">
              Pick these first — the address book below then lists the people who work at them.
              Leave it empty and the company follows whoever you add.
            </p>
          </Field>

          <Field label="From Opus Kap" htmlFor="meeting-team">
            <PickCombo
              id="meeting-team"
              placeholder="Who else from the team was there?"
              picked={pickedMembers.map((m) => ({
                id: m.id,
                label: m.display_name,
                initials: m.initials,
                color: m.color ?? "#87252b",
              }))}
              options={teamOptions}
              query={teamQuery}
              onQuery={setTeamQuery}
              onPick={(id) => set("memberIds", [...values.memberIds, id])}
              onRemove={(id) =>
                set(
                  "memberIds",
                  values.memberIds.filter((x) => x !== id)
                )
              }
              emptyText={
                teamQ.length > 0 ? "Nobody on the team by that name." : "Everybody is already on."
              }
              /*
                On somebody else's meeting you may add anybody and take off
                only the people you added. Marcelo's rule, and it closes two
                holes at once: Dee could take Marcelo off his own meeting, and
                taking YOURSELF off is a one-way door — being on it is what
                gives you the right to change any of this, and there would be
                no way back in without asking the author.

                A name missing from `memberAddedBy` was added in this session,
                so by definition by whoever is looking.
              */
              canRemove={(id) =>
                isAuthor ||
                (id !== meId && (memberAddedBy?.[id] === undefined || memberAddedBy[id] === meId))
              }
              removeHint={
                isAuthor
                  ? undefined
                  : "You were at this meeting, so you can correct it — you can take off the people you added, but not the others and not yourself."
              }
            />
          </Field>

          <Field label="From the address book" htmlFor="meeting-contacts">
            <PickCombo
              id="meeting-contacts"
              placeholder={
                companyNames.length > 0 ? "Anyone else, or search the book" : "Type a name from the book"
              }
              picked={pickedContacts.map((c) => ({
                id: c.id,
                label: fullName(c),
                initials: initialsOf(c),
                color: avatarColor(c),
              }))}
              options={contactOptions}
              query={contactQuery}
              onQuery={setContactQuery}
              onPick={(id) => set("contactIds", [...values.contactIds, id])}
              onRemove={(id) =>
                set(
                  "contactIds",
                  values.contactIds.filter((x) => x !== id)
                )
              }
              heading={
                contactQ.length === 0 && companyNames.length > 0
                  ? `At ${companyNames.join(", ")}`
                  : undefined
              }
              emptyText={
                contactQ.length > 0
                  ? "Nobody in the book by that name."
                  : companyNames.length > 0
                    ? `Nobody in the book is linked to ${companyNames.join(" or ")} yet — type a name to search the whole book.`
                    : "Pick a company above, or type a name to search the book."
              }
            />
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
