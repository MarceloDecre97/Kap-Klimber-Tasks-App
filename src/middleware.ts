import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image (Next.js internals)
     * - api/cron — machine callers, see below
     * - static assets (svg, png, jpg, ico, webmanifest, etc.)
     *
     * The scheduled dispatcher is called by Supabase, not by a person, and
     * has no session to present. Left in here it was redirected to /login
     * like any other signed-out request — and because the caller follows
     * redirects, the job reported a cheerful 200 while receiving the login
     * page and delivering nothing. It is not unprotected: the route checks a
     * shared secret in constant time before it does anything at all.
     */
    "/((?!_next/static|_next/image|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)",
  ],
};
