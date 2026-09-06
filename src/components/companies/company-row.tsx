"use client";

import Link from "next/link";
import { ChevronRight, MapPin } from "lucide-react";
import {
  COMPANY_TYPE_ICONS,
  DEFAULT_COMPANY_TYPE_ICON,
  companyPeopleLine,
  type CompanySummary,
} from "@/lib/companies-view";
import { formatAddress } from "@/lib/contacts-view";
import { cn } from "@/lib/utils";

/**
 * One company in the book.
 *
 * The twin of ContactRow, down to the selection behaviour: a link on a
 * phone, a button on a wide screen where it opens the panel beside the list
 * instead of a new page. The two books are meant to feel like one thing.
 */
export function CompanyRow({
  company,
  className,
  onSelect,
  selected,
}: {
  company: CompanySummary;
  className?: string;
  /** Given only on a wide screen, where the row fills the panel. */
  onSelect?: () => void;
  selected?: boolean;
}) {
  const Icon = COMPANY_TYPE_ICONS[company.type?.icon ?? ""] ?? DEFAULT_COMPANY_TYPE_ICON;
  const address = formatAddress(company);

  const rowClass = cn(
    "flex min-h-14 w-full items-start gap-3 rounded-2xl border-[1.5px] bg-card p-3.5 text-left",
    "shadow-[0_1px_3px_rgba(2,6,23,0.08)] transition-colors duration-150 hover:bg-muted",
    selected ? "border-brand bg-muted" : "border-border",
    className
  );

  const inner = (
    <>
      <span
        aria-hidden
        className="mt-0.5 inline-flex size-11 shrink-0 items-center justify-center rounded-xl border-[1.5px] border-border bg-muted text-sub"
      >
        <Icon className="size-[22px]" strokeWidth={1.75} />
      </span>

      <span className="flex min-w-0 grow flex-col gap-1.5">
        <span className="text-card-title text-fg text-pretty wrap-anywhere">{company.name}</span>

        <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {company.type && (
            <span className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-border px-2.5 py-1 text-timestamp text-sub">
              <Icon aria-hidden className="size-[18px] shrink-0" strokeWidth={1.75} />
              {company.type.label}
            </span>
          )}
          <span className="text-timestamp text-sub">
            {companyPeopleLine(company.contact_count ?? 0)}
          </span>
        </span>

        {address && (
          <span className="inline-flex items-start gap-1.5 text-timestamp text-sub wrap-anywhere">
            <MapPin aria-hidden className="mt-0.5 size-[18px] shrink-0" strokeWidth={1.75} />
            {address}
          </span>
        )}
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
    <Link href={`/companies/${company.id}`} className={rowClass}>
      {inner}
    </Link>
  );
}
