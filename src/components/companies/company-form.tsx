"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Group } from "@/components/contacts/form-field";
import {
  CompanyFields,
  EMPTY_COMPANY_DETAILS,
  type CompanyDetails,
} from "@/components/companies/company-fields";
import { createCompany } from "@/app/companies/actions";
import { nearCompanyMatches, type CompanySummary, type CompanyType } from "@/lib/companies-view";

type Draft = CompanyDetails & { name: string };

/**
 * A company added on its own.
 *
 * The second door into the same room. Typing a company on a contact still
 * creates it — that was never the step worth removing — but a company you
 * have just heard of, with nobody named at it yet, needed somewhere to go
 * that was not "invent a person to hang it on".
 *
 * It carries the same near-duplicate question the contact form does, for the
 * same reason: "ADV Mobil" and "ADV Mobil LLC" are one company typed twice,
 * and once both exist nobody ever notices.
 */
export function CompanyForm({
  companies,
  types,
}: {
  companies: CompanySummary[];
  types: CompanyType[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>({ ...EMPTY_COMPANY_DETAILS, name: "" });
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function patch(next: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...next }));
    setError(null);
  }

  const typed = draft.name.trim();
  const near = nearCompanyMatches(typed, companies);
  const showNear = near.length > 0 && dismissed !== typed.toLowerCase();

  function save() {
    if (!typed) {
      setError("A company needs a name.");
      return;
    }
    startTransition(async () => {
      const result = await createCompany(draft);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.replace(`/companies/${result.companyId}`);
      router.refresh();
    });
  }

  return (
    <div className="flex h-full flex-col bg-bg">
      <header className="flex shrink-0 items-center gap-2 border-b-[1.5px] border-border bg-card px-3 pt-[calc(env(safe-area-inset-top)+8px)] pb-3">
        <Link
          href="/contacts?book=companies"
          className="flex h-14 items-center gap-2 rounded-xl px-3 text-[18px] leading-7 font-bold text-brand"
        >
          <ChevronLeft aria-hidden className="size-5" />
          Back
        </Link>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-6">
        <div className="mx-auto flex w-full max-w-[640px] flex-col gap-6">
          <h1 className="text-screen-title text-fg">New company</h1>

          {error && (
            <p className="rounded-2xl border-[1.5px] border-danger bg-danger-hover-bg px-4 py-3 text-[17px] leading-6 text-danger text-pretty">
              {error}
            </p>
          )}

          <Group heading="The company" hint="The name is the only thing it needs. The rest can wait.">
            <Field label="Name" required>
              <Input
                value={draft.name}
                onChange={(e) => {
                  patch({ name: e.target.value });
                  setDismissed(null);
                }}
                maxLength={120}
                autoComplete="off"
              />
            </Field>

            {showNear && (
              <div className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-brand bg-card px-4 py-3">
                <span className="flex items-start gap-2 text-[17px] leading-6 text-fg text-pretty">
                  <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-brand" strokeWidth={2} />
                  <span>
                    <span className="font-bold">{near[0]!.name}</span> is already in the book. Did
                    you mean that one?
                  </span>
                </span>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/companies/${near[0]!.id}`}
                    className="inline-flex h-14 items-center gap-2 rounded-2xl bg-btn px-5 text-chip text-on-btn hover:bg-btn-hover"
                  >
                    Open that one
                  </Link>
                  <button
                    type="button"
                    onClick={() => setDismissed(typed.toLowerCase())}
                    className="inline-flex h-14 cursor-pointer items-center rounded-2xl border-[1.5px] border-border bg-card px-4 text-chip text-fg hover:bg-muted"
                  >
                    Create it separately
                  </button>
                </div>
              </div>
            )}

            <CompanyFields types={types} value={draft} onChange={patch} />
          </Group>

          <div className="flex flex-col gap-3 pb-4">
            <Button variant="primary" onClick={save} disabled={isPending}>
              {isPending ? "Saving…" : "Save company"}
            </Button>
            <Button variant="secondary" onClick={() => router.back()} disabled={isPending}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
