"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { ChevronRight } from "lucide-react";
import Image from "next/image";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { requestOtp, verifyOtp } from "@/app/login/actions";
import type { RosterEntry } from "@/lib/supabase/database.types";

type Step = { name: "pick" } | { name: "verify"; member: RosterEntry; maskedEmail: string };

export function LoginFlow({ roster }: { roster: RosterEntry[] }) {
  const [step, setStep] = useState<Step>({ name: "pick" });

  if (step.name === "verify") {
    return <VerifyStep member={step.member} maskedEmail={step.maskedEmail} onBack={() => setStep({ name: "pick" })} />;
  }

  return <PickStep roster={roster} onSent={(member, maskedEmail) => setStep({ name: "verify", member, maskedEmail })} />;
}

function PickStep({
  roster,
  onSent,
}: {
  roster: RosterEntry[];
  onSent: (member: RosterEntry, maskedEmail: string) => void;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleTap(member: RosterEntry) {
    setError(null);
    setPendingId(member.id);
    startTransition(async () => {
      const result = await requestOtp(member.id);
      if (!result.ok) {
        setError(result.error);
        setPendingId(null);
        return;
      }
      onSent(member, result.maskedEmail);
    });
  }

  return (
    <>
      <div className="flex items-center gap-3 pt-2">
        <Image
          src="/kap-klimber-logo.svg"
          alt="Kap Klimber"
          width={140}
          height={22}
          className="h-5 w-auto dark:invert"
          priority
        />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-screen-title">Who are you?</h1>
        <p className="text-[18px] leading-7 text-sub text-pretty">
          Tap your name. No password. This phone will remember you.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        {roster.map((member) => (
          <button
            key={member.id}
            type="button"
            disabled={isPending}
            onClick={() => handleTap(member)}
            className="flex h-[72px] w-full items-center gap-4 rounded-2xl border-[1.5px] border-border bg-card px-4 shadow-[0_1px_3px_rgba(2,6,23,0.08)] transition-transform duration-150 ease-out active:scale-[0.97] active:bg-muted disabled:opacity-60 cursor-pointer"
          >
            <Avatar initials={member.initials} color={member.color} size={48} />
            <span className="text-[20px] leading-7 font-bold text-fg">{member.display_name}</span>
            <span className="ml-auto flex items-center text-sub">
              {pendingId === member.id ? (
                <span className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <ChevronRight aria-hidden className="size-5" />
              )}
            </span>
          </button>
        ))}
        {roster.length === 0 && (
          <p className="text-[18px] leading-7 text-sub">No team members are set up yet.</p>
        )}
      </div>
      {error && (
        <p role="alert" className="text-[18px] leading-7 font-bold text-danger text-pretty">
          {error}
        </p>
      )}
      <p className="text-center text-[16px] leading-[22px] text-sub">Not on this list? Ask Marcelo to add you.</p>
    </>
  );
}

function VerifyStep({
  member,
  maskedEmail,
  onBack,
}: {
  member: RosterEntry;
  maskedEmail: string;
  onBack: () => void;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isResending, setIsResending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function submit(value: string) {
    setError(null);
    startTransition(async () => {
      const result = await verifyOtp(member.id, value);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.replace("/tasks");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6 pt-2">
      <button
        type="button"
        onClick={onBack}
        className="self-start text-[18px] leading-7 font-bold text-brand underline underline-offset-[3px] cursor-pointer"
      >
        ← Not {member.display_name}?
      </button>
      <div className="flex flex-col gap-2">
        <Avatar initials={member.initials} color={member.color} size={48} />
        <h1 className="text-screen-title pt-2">Enter your code</h1>
        <p className="text-[18px] leading-7 text-sub text-pretty">
          We sent a 6-digit code to {maskedEmail}. It's good for 10 minutes.
        </p>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit(code);
        }}
        className="flex flex-col gap-4"
      >
        <input
          ref={inputRef}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="000000"
          aria-label="6-digit code"
          aria-invalid={!!error}
          className="h-[60px] rounded-2xl border-[1.5px] border-border bg-card px-4 text-center text-[28px] font-bold tracking-[0.3em] text-fg focus-visible:border-prim focus-visible:outline-[3px] focus-visible:outline-offset-2 aria-invalid:border-danger"
        />
        {error && (
          <p role="alert" className="text-[18px] leading-7 font-bold text-danger text-pretty">
            {error}
          </p>
        )}
        <Button type="submit" disabled={code.length !== 6 || isPending}>
          {isPending ? "Checking…" : "Continue"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={isResending}
          onClick={() => {
            setIsResending(true);
            setError(null);
            startTransition(async () => {
              const result = await requestOtp(member.id);
              setIsResending(false);
              if (!result.ok) setError(result.error);
            });
          }}
        >
          {isResending ? "Sending…" : "Send a new code"}
        </Button>
      </form>
    </div>
  );
}
