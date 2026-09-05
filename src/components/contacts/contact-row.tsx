"use client";

import Link from "next/link";
import { ChevronRight, Phone } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { CategoryBadge } from "@/components/contacts/category-badge";
import { avatarColor, fullName, initialsOf, roleLine } from "@/lib/contacts-view";
import { cn } from "@/lib/utils";
import type { ContactSummary } from "@/lib/data/contacts";

/**
 * One person in the book.
 *
 * A link rather than a button, so the browser can prefetch it and so
 * middle-click and the back button behave the way they do everywhere else in
 * this app.
 *
 * The phone number is text here, not a `tel:` link. A row is one target with
 * one meaning — tapping it opens the person — and a second live target
 * inside it is how a thumb aiming for the row ends up dialling instead.
 */
export function ContactRow({
  contact,
  className,
  onSelect,
  selected,
}: {
  contact: ContactSummary;
  className?: string;
  /*
    Given only on a wide screen, where the row opens the panel beside the
    list instead of a new page. Without it the row stays a link, which is
    what every phone in the team gets.
  */
  onSelect?: () => void;
  selected?: boolean;
}) {
  const role = roleLine(contact);
  const phone = contact.mobile ?? contact.office_phone;

  const rowClass = cn(
    "flex min-h-14 w-full items-start gap-3 rounded-2xl border-[1.5px] bg-card p-3.5 text-left",
    "shadow-[0_1px_3px_rgba(2,6,23,0.08)] transition-colors duration-150 hover:bg-muted",
    selected ? "border-brand bg-muted" : "border-border",
    className
  );

  const inner = (
    <>
      <Avatar
        initials={initialsOf(contact)}
        color={avatarColor(contact)}
        size={44}
        className="mt-0.5"
      />

      <span className="flex min-w-0 grow flex-col gap-1.5">
        <span className="text-card-title text-fg text-pretty wrap-anywhere">{fullName(contact)}</span>
        {role && <span className="text-[18px] leading-7 text-sub text-pretty wrap-anywhere">{role}</span>}

        <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {contact.category && <CategoryBadge category={contact.category} />}
          {phone && (
            <span className="inline-flex items-center gap-1.5 text-timestamp text-sub">
              <Phone aria-hidden className="size-[18px] shrink-0" strokeWidth={1.75} />
              {phone}
            </span>
          )}
        </span>
      </span>

      <ChevronRight aria-hidden className="mt-2 size-[22px] shrink-0 text-sub" strokeWidth={1.75} />
    </>
  );

  if (onSelect) {
    return (
      <button type="button" onClick={onSelect} aria-current={selected} className={cn(rowClass, "cursor-pointer")}>
        {inner}
      </button>
    );
  }

  return (
    <Link href={`/contacts/${contact.id}`} className={rowClass}>
      {inner}
    </Link>
  );
}
