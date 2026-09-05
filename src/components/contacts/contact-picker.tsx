"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, Search, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import {
  EMPTY_CONTACT_FILTERS,
  avatarColor,
  fullName,
  initialsOf,
  matchesContact,
  roleLine,
} from "@/lib/contacts-view";
import { cn } from "@/lib/utils";
import type { ContactSummary } from "@/lib/data/contacts";

/** The cap, in one place, matching the trigger in 0022_contacts.sql. */
const MAX_CONTACTS = 2;

/**
 * Attaching contacts to a task.
 *
 * Deliberately a picker and not a form: a contact has to be in the book
 * before it can go on a task. Creating one here would mean somebody typing a
 * name into a task, never filling in a number, and leaving the book full of
 * half-people — which is the opposite of what the book is for.
 *
 * At the cap the rows stay visible and tappable rather than being greyed
 * out, because "why can I not tap this?" is a worse question than a panel
 * that says what to do about it.
 */
export function ContactPicker({
  contacts,
  selectedIds,
  onChange,
}: {
  contacts: ContactSummary[];
  selectedIds: string[];
  onChange: (next: string[]) => void;
}) {
  const [query, setQuery] = useState("");

  const selected = useMemo(
    () =>
      selectedIds
        .map((id) => contacts.find((c) => c.id === id))
        .filter((c): c is ContactSummary => !!c),
    [contacts, selectedIds]
  );

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return contacts
      .filter((c) => !selectedIds.includes(c.id))
      .filter((c) => matchesContact(c, { ...EMPTY_CONTACT_FILTERS, query: q }))
      .slice(0, 6);
  }, [contacts, query, selectedIds]);

  const atCap = selectedIds.length >= MAX_CONTACTS;

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((c) => c !== id));
      return;
    }
    if (atCap) return;
    onChange([...selectedIds, id]);
    setQuery("");
  }

  if (contacts.length === 0) {
    return (
      <p className="text-[16px] leading-6 text-sub text-pretty">
        The address book is empty.{" "}
        <Link href="/contacts/new" className="text-brand underline underline-offset-4">
          Add a contact
        </Link>{" "}
        and you can attach them here.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {selected.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {selected.map((contact) => (
            <div
              key={contact.id}
              className="flex min-h-14 items-center gap-2.5 rounded-2xl border-[1.5px] border-fg bg-muted py-1.5 pl-1.5 pr-1.5"
            >
              <Avatar initials={initialsOf(contact)} color={avatarColor(contact)} size={40} />
              <span className="flex min-w-0 grow flex-col">
                <span className="text-[16px] leading-[22px] font-bold text-fg wrap-anywhere">
                  {fullName(contact)}
                </span>
                {roleLine(contact) && (
                  <span className="text-[15px] leading-5 text-sub wrap-anywhere">
                    {roleLine(contact)}
                  </span>
                )}
              </span>
              <button
                type="button"
                aria-label={`Take ${fullName(contact)} off this task`}
                onClick={() => toggle(contact.id)}
                className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-sub hover:bg-card hover:text-fg"
              >
                <X aria-hidden className="size-5" strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
      )}

      {atCap ? (
        <p className="rounded-2xl border-[1.5px] border-border bg-card px-4 py-3 text-[16px] leading-6 text-sub text-pretty">
          Two contacts is the limit. Take one off to swap it.
        </p>
      ) : (
        <>
          <label className="relative flex items-center">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-4 size-[22px] text-sub"
              strokeWidth={1.75}
            />
            <span className="sr-only">Search the address book</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search the book by name or company"
              className="h-[60px] w-full rounded-2xl border-[1.5px] border-border bg-card pl-[50px] pr-4 text-[18px] leading-7 text-fg placeholder:text-sub"
            />
          </label>

          {query.trim() && results.length === 0 && (
            <p className="text-[16px] leading-6 text-sub text-pretty">
              Nobody in the book matches that. Only people already in Contacts can be attached —{" "}
              <Link href="/contacts/new" className="text-brand underline underline-offset-4">
                add them first
              </Link>
              .
            </p>
          )}

          {results.length > 0 && (
            <div className="flex flex-col gap-2.5">
              {results.map((contact) => (
                <button
                  key={contact.id}
                  type="button"
                  onClick={() => toggle(contact.id)}
                  className={cn(
                    "flex min-h-14 items-center gap-2.5 rounded-2xl border-[1.5px] border-border bg-card p-1.5 text-left",
                    "cursor-pointer transition-colors duration-150 hover:bg-muted"
                  )}
                >
                  <Avatar initials={initialsOf(contact)} color={avatarColor(contact)} size={40} />
                  <span className="flex min-w-0 grow flex-col pr-2">
                    <span className="text-[16px] leading-[22px] font-bold text-fg wrap-anywhere">
                      {fullName(contact)}
                    </span>
                    {roleLine(contact) && (
                      <span className="text-[15px] leading-5 text-sub wrap-anywhere">
                        {roleLine(contact)}
                      </span>
                    )}
                  </span>
                  <Check aria-hidden className="mr-2 size-5 shrink-0 text-sub" strokeWidth={2} />
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
