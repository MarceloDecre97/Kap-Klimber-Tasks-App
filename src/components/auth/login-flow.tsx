"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { ChevronRight, Eye, EyeOff } from "lucide-react";
import Image from "next/image";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { signInWithPassword } from "@/app/login/actions";
import type { RosterEntry } from "@/lib/supabase/database.types";

type Step = { name: "pick" } | { name: "password"; member: RosterEntry };

export function LoginFlow({ roster }: { roster: RosterEntry[] }) {
  const [step, setStep] = useState<Step>({ name: "pick" });

  if (step.name === "password") {
    return <PasswordStep member={step.member} onBack={() => setStep({ name: "pick" })} />;
  }

  return <PickStep roster={roster} onPick={(member) => setStep({ name: "password", member })} />;
}

function PickStep({ roster, onPick }: { roster: RosterEntry[]; onPick: (member: RosterEntry) => void }) {
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
        <p className="text-[18px] leading-7 text-sub text-pretty">Tap your name, then enter your password.</p>
      </div>
      <div className="flex flex-col gap-3">
        {roster.map((member) => (
          <button
            key={member.id}
            type="button"
            onClick={() => onPick(member)}
            className="flex h-[72px] w-full items-center gap-4 rounded-2xl border-[1.5px] border-border bg-card px-4 shadow-[0_1px_3px_rgba(2,6,23,0.08)] transition-transform duration-150 ease-out active:scale-[0.97] active:bg-muted cursor-pointer"
          >
            <Avatar initials={member.initials} color={member.color} size={48} />
            <span className="text-[20px] leading-7 font-bold text-fg">{member.display_name}</span>
            <span className="ml-auto flex items-center text-sub">
              <ChevronRight aria-hidden className="size-5" />
            </span>
          </button>
        ))}
        {roster.length === 0 && (
          <p className="text-[18px] leading-7 text-sub">No team members are set up yet.</p>
        )}
      </div>
      <p className="text-center text-[16px] leading-[22px] text-sub">Not on this list? Ask Marcelo to add you.</p>
    </>
  );
}

function PasswordStep({ member, onBack }: { member: RosterEntry; onBack: () => void }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function submit() {
    if (!password) return;
    setError(null);
    startTransition(async () => {
      const result = await signInWithPassword(member.id, password);
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
        <h1 className="text-screen-title pt-2">Enter your password</h1>
        <p className="text-[18px] leading-7 text-sub text-pretty">Welcome back, {member.display_name}.</p>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="flex flex-col gap-4"
      >
        <div className="relative">
          <input
            ref={inputRef}
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            aria-label="Password"
            aria-invalid={!!error}
            className="h-[60px] w-full rounded-2xl border-[1.5px] border-border bg-card pl-4 pr-14 text-[18px] text-fg focus-visible:border-prim focus-visible:outline-[3px] focus-visible:outline-offset-2 aria-invalid:border-danger"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-3 top-1/2 -translate-y-1/2 flex size-9 items-center justify-center text-sub cursor-pointer"
          >
            {showPassword ? <EyeOff aria-hidden className="size-5" /> : <Eye aria-hidden className="size-5" />}
          </button>
        </div>
        {error && (
          <p role="alert" className="text-[18px] leading-7 font-bold text-danger text-pretty">
            {error}
          </p>
        )}
        <Button type="submit" disabled={!password || isPending}>
          {isPending ? "Checking…" : "Continue"}
        </Button>
      </form>
    </div>
  );
}
