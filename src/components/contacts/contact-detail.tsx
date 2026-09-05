"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Download, Mail, Pencil, Phone, RotateCcw, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import {
  DeleteContactDialog,
  type BlockingTaskInfo,
} from "@/components/contacts/delete-contact-dialog";
import { blockingTasksFor, restoreContact } from "@/app/contacts/actions";
import { Avatar } from "@/components/ui/avatar";
import { CategoryBadge } from "@/components/contacts/category-badge";
import {
  avatarColor,
  formatAddress,
  fullName,
  initialsOf,
  roleLine,
} from "@/lib/contacts-view";
import { formatTimestamp } from "@/lib/utils";
import type { ContactEvent, ContactSummary } from "@/lib/data/contacts";

/**
 * One contact, in full.
 *
 * Its own route rather than a sheet over the list: it is a place you can be
 * sent to — from a task's contact pill, or a link somebody pastes — and a
 * sheet has no address.
 */
export function ContactDetail({
  contact,
  events,
}: {
  contact: ContactSummary;
  events: ContactEvent[];
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [deleting, setDeleting] = useState<"blocked" | "confirm" | "erase" | null>(null);
  const [blocking, setBlocking] = useState<BlockingTaskInfo[]>([]);
  const [isPending, startTransition] = useTransition();

  const role = roleLine(contact);
  const address = formatAddress(contact);
  const phone = contact.mobile ?? contact.office_phone;

  /*
    Which dialog to open is the database's answer, not a guess made here.
    Asking first is what lets the blocked case name the task and offer to
    open it, instead of the delete simply failing with a message.
  */
  function beginDelete() {
    startTransition(async () => {
      const result = await blockingTasksFor(contact.id);
      if (!result.ok) {
        showToast({ message: result.error });
        return;
      }
      setBlocking(result.tasks);
      setDeleting(result.tasks.length > 0 ? "blocked" : "confirm");
    });
  }

  function putBack() {
    startTransition(async () => {
      const result = await restoreContact(contact.id);
      if (!result.ok) {
        showToast({ message: result.error });
        return;
      }
      router.refresh();
      showToast({ message: "Contact put back" });
    });
  }

  return (
    <div className="flex h-full flex-col bg-bg">
      <header className="flex shrink-0 items-center gap-2 border-b-[1.5px] border-border bg-card px-3 pt-[calc(env(safe-area-inset-top)+8px)] pb-3">
        <Link
          href="/contacts"
          className="flex h-14 items-center gap-2 rounded-xl px-3 text-[18px] leading-7 font-bold text-brand"
        >
          <ChevronLeft aria-hidden className="size-5" />
          Contacts
        </Link>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-6">
        <div className="mx-auto flex w-full max-w-[640px] flex-col gap-6">
          {contact.deleted_at && (
            <p className="rounded-2xl border-[1.5px] border-danger bg-card px-4 py-3 text-[17px] leading-6 text-danger text-pretty">
              This contact is in Recently deleted
              {contact.deleted_by ? `, put there by ${contact.deleted_by.display_name}` : ""}.
            </p>
          )}

          <div className="flex items-start gap-4">
            <Avatar initials={initialsOf(contact)} color={avatarColor(contact)} size={56} />
            <div className="flex min-w-0 grow flex-col gap-2">
              <h1 className="text-screen-title text-fg text-pretty wrap-anywhere">
                {fullName(contact)}
              </h1>
              {role && (
                <p className="text-[18px] leading-7 text-sub text-pretty wrap-anywhere">{role}</p>
              )}
              {contact.category && (
                <span>
                  <CategoryBadge category={contact.category} />
                </span>
              )}
            </div>
          </div>

          {/*
            Save first, then reach.

            "Add to phone contacts" is the primary because it is the thing
            that stops you needing this screen at all — after it, the number
            is where you already look for numbers. Call and Email are the
            right-now actions beside it.

            All three arrive in phase 6; nothing renders a dead control until
            it can do what it says.
          */}
          <div className="flex flex-wrap gap-3">
            {/*
              The primary action, and deliberately so: saving the card is
              what stops you needing this screen at all. Call and Email are
              the do-it-now actions beside it.
            */}
            <a
              href={`/contacts/${contact.id}/vcard`}
              className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-btn px-5 text-chip text-on-btn transition-transform duration-150 active:scale-[0.97] hover:bg-btn-hover"
            >
              <Download aria-hidden className="size-5" strokeWidth={2} />
              Add to phone contacts
            </a>
            {phone && (
              <a
                href={`tel:${phone.replace(/[^\d+]/g, "")}`}
                className="inline-flex h-14 items-center gap-2 rounded-2xl border-[1.5px] border-border bg-card px-4 text-chip text-fg hover:bg-muted"
              >
                <Phone aria-hidden className="size-5" strokeWidth={1.75} />
                Call
              </a>
            )}
            {contact.email && (
              <a
                href={`mailto:${contact.email}`}
                className="inline-flex h-14 items-center gap-2 rounded-2xl border-[1.5px] border-border bg-card px-4 text-chip text-fg hover:bg-muted"
              >
                <Mail aria-hidden className="size-5" strokeWidth={1.75} />
                Email
              </a>
            )}
          </div>

          <Section heading="How to reach them">
            <Row label="Mobile" value={contact.mobile} href={contact.mobile ? `tel:${contact.mobile.replace(/[^\d+]/g, "")}` : null} />
            <Row label="Office phone" value={contact.office_phone} href={contact.office_phone ? `tel:${contact.office_phone.replace(/[^\d+]/g, "")}` : null} />
            <Row label="Email" value={contact.email} href={contact.email ? `mailto:${contact.email}` : null} />
            <Row label="Second email" value={contact.email2} href={contact.email2 ? `mailto:${contact.email2}` : null} />
            <Row label="Website" value={contact.website} href={externalHref(contact.website)} />
          </Section>

          {address && (
            <Section heading="Where they are">
              <Row label="Address" value={address} />
            </Section>
          )}

          <Section heading="Details">
            <Row label="Where they came from" value={contact.source} />
            <Row label="Notes" value={contact.notes} />
          </Section>

          {contact.created_by && (
            <p className="text-timestamp text-sub">
              Added by {contact.created_by.display_name} · {formatTimestamp(contact.created_at)}
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            {contact.deleted_at ? (
              <>
                <button
                  type="button"
                  onClick={putBack}
                  disabled={isPending}
                  className="inline-flex h-14 cursor-pointer items-center justify-center gap-2 rounded-2xl border-[1.5px] border-border bg-card px-4 text-chip text-fg hover:bg-muted disabled:opacity-60"
                >
                  <RotateCcw aria-hidden className="size-5" strokeWidth={1.75} />
                  Put back
                </button>
                <button
                  type="button"
                  onClick={() => setDeleting("erase")}
                  disabled={isPending}
                  className="inline-flex h-14 cursor-pointer items-center justify-center gap-2 rounded-2xl border-[1.5px] border-danger bg-card px-4 text-chip text-danger hover:bg-danger-hover-bg disabled:opacity-60"
                >
                  <Trash2 aria-hidden className="size-5" strokeWidth={1.75} />
                  Erase for good
                </button>
              </>
            ) : (
              <>
                <Link
                  href={`/contacts/${contact.id}/edit`}
                  className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl border-[1.5px] border-border bg-card px-4 text-chip text-fg hover:bg-muted"
                >
                  <Pencil aria-hidden className="size-5" strokeWidth={1.75} />
                  Edit contact
                </Link>
                <button
                  type="button"
                  onClick={beginDelete}
                  disabled={isPending}
                  className="inline-flex h-14 cursor-pointer items-center justify-center gap-2 rounded-2xl border-[1.5px] border-border bg-card px-4 text-chip text-sub hover:border-danger hover:bg-danger-hover-bg hover:text-danger disabled:opacity-60"
                >
                  <Trash2 aria-hidden className="size-5" strokeWidth={1.75} />
                  Delete contact
                </button>
              </>
            )}
          </div>

          <Activity events={events} />
        </div>
      </div>

      <DeleteContactDialog
        contact={deleting ? contact : null}
        mode={deleting ?? "confirm"}
        blocking={blocking}
        onClose={() => setDeleting(null)}
        onDeleted={() => {
          setDeleting(null);
          router.refresh();
          showToast({ message: `${fullName(contact)} moved to Recently deleted` });
        }}
        /*
          Erasing leaves this page pointing at a row that no longer exists,
          so it goes back to the book rather than refreshing into a 404.
          No Undo on the toast: there is nothing left to bring back.
        */
        onErased={() => {
          setDeleting(null);
          router.replace("/contacts");
          router.refresh();
          showToast({ message: `${fullName(contact)} erased` });
        }}
        onError={(message) => showToast({ message })}
      />
    </div>
  );
}

/**
 * A stored website is whatever somebody typed. "kapklimber.com" without a
 * scheme is a *relative* link — it would navigate inside the app — so the
 * scheme is added when it is missing, and anything that is not http(s) is
 * rendered as plain text rather than followed.
 */
function externalHref(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) return `https://${trimmed}`;
  return null;
}

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-field-label text-sub">{heading}</h2>
      <div className="flex flex-col divide-y-[1.5px] divide-border rounded-2xl border-[1.5px] border-border bg-card">
        {children}
      </div>
    </div>
  );
}

/** Renders nothing at all when there is no value — an empty field is noise. */
function Row({
  label,
  value,
  href,
}: {
  label: string;
  value: string | null;
  href?: string | null;
}) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3">
      <span className="text-timestamp text-sub">{label}</span>
      {href ? (
        <a
          href={href}
          {...(href.startsWith("http") ? { target: "_blank", rel: "noreferrer noopener" } : {})}
          className="text-[18px] leading-7 text-brand underline underline-offset-4 wrap-anywhere"
        >
          {value}
        </a>
      ) : (
        <span className="text-[18px] leading-7 text-fg text-pretty wrap-anywhere">{value}</span>
      )}
    </div>
  );
}

/**
 * Who changed what.
 *
 * The price of letting anyone edit anyone's contact, and the thing that
 * makes that rule safe rather than alarming.
 */
function Activity({ events }: { events: ContactEvent[] }) {
  if (events.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-field-label text-sub">Activity</h2>
      <ol className="flex flex-col divide-y-[1.5px] divide-border rounded-2xl border-[1.5px] border-border bg-card">
        {events.map((event) => (
          <li key={event.id} className="flex flex-col gap-0.5 px-4 py-3">
            <span className="text-[17px] leading-6 text-fg text-pretty">
              {describeEvent(event)}
            </span>
            <span className="text-timestamp text-sub">{formatTimestamp(event.created_at)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function describeEvent(event: ContactEvent): string {
  const who = event.member?.display_name ?? "Someone";
  switch (event.kind) {
    case "created":
      return `${who} added this contact`;
    case "deleted":
      return `${who} moved this contact to Recently deleted`;
    case "restored":
      return `${who} put this contact back`;
    case "edited": {
      const field = event.field ?? "something";
      if (event.from_value && event.to_value) {
        return `${who} changed ${field.toLowerCase()} from ${event.from_value} to ${event.to_value}`;
      }
      if (event.to_value) return `${who} set ${field.toLowerCase()} to ${event.to_value}`;
      return `${who} cleared ${field.toLowerCase()}`;
    }
    default:
      return `${who} made a change`;
  }
}
