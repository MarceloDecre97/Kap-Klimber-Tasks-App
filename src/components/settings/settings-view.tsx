"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, LogOut } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { PushSwitch } from "@/components/settings/push-switch";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { signOut } from "@/app/settings/actions";

export function SettingsView({
  member,
}: {
  member: { id: string; display_name: string; initials: string; color: string; email: string };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex h-full flex-col bg-bg">
      <header className="flex shrink-0 items-center gap-2 border-b-[1.5px] border-border bg-card px-3 pt-[calc(env(safe-area-inset-top)+8px)] pb-3">
        <Link
          href="/tasks"
          className="flex h-14 items-center gap-2 rounded-xl px-3 text-[18px] leading-7 font-bold text-brand"
        >
          <ChevronLeft aria-hidden className="size-5" />
          Tasks
        </Link>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-6 flex flex-col gap-8">
        <div className="flex items-center gap-4">
          <Avatar initials={member.initials} color={member.color} size={56} />
          <div className="flex flex-col">
            <span className="text-card-title text-fg">{member.display_name}</span>
            <span className="text-[16px] leading-[22px] text-sub">{member.email}</span>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="text-field-label">Notifications</div>
          <PushSwitch />
        </div>

        <div className="flex flex-col gap-3">
          <div className="text-field-label">Appearance</div>
          <ThemeToggle className="w-auto" />
        </div>

        <div className="flex flex-col gap-2 pt-6 border-t-[1.5px] border-border">
          <Button
            variant="secondary"
            disabled={isPending}
            onClick={() => {
              startTransition(async () => {
                await signOut();
                router.replace("/login");
                router.refresh();
              });
            }}
          >
            <LogOut aria-hidden className="size-5" />
            {isPending ? "Signing out…" : "Sign out"}
          </Button>
        </div>
      </div>
    </div>
  );
}
