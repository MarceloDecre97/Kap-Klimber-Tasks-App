import Link from "next/link";
import { Building2, ChevronLeft, ChevronRight } from "lucide-react";
import { companyPeopleLine, type CompanySummary } from "@/lib/companies-view";
import { formatAddress } from "@/lib/contacts-view";

/**
 * Every company in the book.
 *
 * A sub-page of Contacts rather than a fourth thing in the nav: nobody comes
 * to this app to look at companies, they come to look at people. This is
 * where you go when an address is wrong and you want to fix it once.
 *
 * There is no "Add company" button anywhere, deliberately. A company arrives
 * because somebody added a contact who works there, which is the only reason
 * one has ever been needed.
 */
export function CompaniesList({ companies }: { companies: CompanySummary[] }) {
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
        <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h1 className="text-screen-title text-fg">Companies</h1>
            <p className="text-[17px] leading-6 text-sub text-pretty">
              Fix an address here and it is fixed for everyone who works there.
            </p>
          </div>

          {companies.length === 0 ? (
            <p className="rounded-2xl border-[1.5px] border-border bg-card px-4 py-6 text-[18px] leading-7 text-sub text-pretty">
              No companies yet. Add a contact and type where they work — the company appears here
              on its own.
            </p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {companies.map((company) => {
                const address = formatAddress(company);
                return (
                  <li key={company.id}>
                    <Link
                      href={`/companies/${company.id}`}
                      className="flex min-h-[76px] items-center gap-3 rounded-2xl border-[1.5px] border-border bg-card px-4 py-3 hover:bg-muted"
                    >
                      <Building2 aria-hidden className="size-6 shrink-0 text-sub" strokeWidth={1.75} />
                      <span className="flex min-w-0 grow flex-col gap-0.5">
                        <span className="text-card-title text-fg wrap-anywhere">{company.name}</span>
                        <span className="text-timestamp text-sub wrap-anywhere">
                          {companyPeopleLine(company.contact_count ?? 0)}
                          {address ? ` · ${address}` : ""}
                        </span>
                      </span>
                      <ChevronRight aria-hidden className="size-5 shrink-0 text-sub" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
