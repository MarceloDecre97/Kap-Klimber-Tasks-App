import { createClient } from "@/lib/supabase/server";
import { LoginFlow } from "@/components/auth/login-flow";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const supabase = await createClient();
  const { data: roster } = await supabase.rpc("list_team_roster");

  return (
    <main className="flex min-h-dvh flex-col bg-bg safe-top safe-bottom">
      <div className="flex flex-1 flex-col gap-6 px-5 pt-8 max-w-[520px] w-full mx-auto">
        <LoginFlow roster={roster ?? []} />
      </div>
    </main>
  );
}
