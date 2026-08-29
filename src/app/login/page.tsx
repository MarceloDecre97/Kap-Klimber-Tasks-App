import { createClient } from "@/lib/supabase/server";
import { LoginFlow } from "@/components/auth/login-flow";
import { safeInternalPath } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createClient();
  const { data: roster } = await supabase.rpc("list_team_roster");

  // Where the middleware was sending this person before it stopped them at
  // the door. Read here rather than in the client component so the value is
  // vetted on the server, and so the page needs no Suspense boundary.
  const raw = (await searchParams).next;
  const next = safeInternalPath(typeof raw === "string" ? raw : null);

  return (
    <main className="flex h-full flex-col overflow-y-auto bg-bg safe-top safe-bottom">
      <div className="flex flex-1 flex-col gap-6 px-5 pt-8 max-w-[520px] w-full mx-auto">
        <LoginFlow roster={roster ?? []} next={next} />
      </div>
    </main>
  );
}
