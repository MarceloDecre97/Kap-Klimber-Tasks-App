"use client";

import Link from "next/link";
import { ChevronRight, Phone } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { avatarColor, fullName, initialsOf, roleLine } from "@/lib/contacts-view";
import { cn } from "@/lib/utils";
import type { TaskContact } from "@/lib/data/tasks";

/**
 * A contact attached to a task, below "Move status on".
 *
 * The whole reason the address book exists: whoever picks up "follow up with
 * the fleet safety director" should have the number without leaving the task.
 *
 * One pill, one action — it opens the contact. The phone icon is a label
 * rather than a second target, because a live `tel:` inside a tappable row is
 * how a thumb aiming for the row ends up dialling somebody by accident.
 * Calling is one more tap away, on the page this opens.
 */
export function TaskContactPill({ contact }: { contact: TaskContact }) {
  const role = roleLine(contact);
  const phone = contact.mobile ?? contact.office_phone;

  return (
    <Link
      href={`/contacts/${contact.id}`}
      className={cn(
        "flex min-h-14 items-center gap-2.5 rounded-full border-[1.5px] border-border bg-card py-1.5 pl-1.5 pr-3.5",
        "transition-colors duration-150 hover:bg-muted"
      )}
    >
      <Avatar initials={initialsOf(contact)} color={avatarColor(contact)} size={40} />
      <span className="flex min-w-0 grow flex-col">
        <span className="text-[16px] leading-[22px] font-bold text-fg text-pretty wrap-anywhere">
          {fullName(contact)}
          {/*
            A contact in Recently deleted keeps its pill — the task still
            happened, and the contact can still be put back. Saying so here
            stops it reading as a number somebody can still ring.
          */}
          {contact.deleted_at && <span className="font-normal text-sub"> · deleted</span>}
        </span>
        {role && (
          <span className="text-[15px] leading-5 text-sub text-pretty wrap-anywhere">{role}</span>
        )}
      </span>
      {phone && (
        <Phone aria-hidden className="size-[18px] shrink-0 text-brand" strokeWidth={1.75} />
      )}
      <ChevronRight aria-hidden className="size-[22px] shrink-0 text-sub" strokeWidth={1.75} />
    </Link>
  );
}
