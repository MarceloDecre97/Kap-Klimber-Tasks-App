import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";
import { getSupabaseAnonKey, getSupabaseUrl } from "./env";

const PUBLIC_PATHS = ["/login"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * Refreshes the Supabase session on every request and gates access to the
 * app behind an authenticated + provisioned team member. This is the single
 * source of truth for route protection — do not rely on client-side checks
 * alone, since Server Components/Actions trust the session cookie set here.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // IMPORTANT: do not run any logic between createServerClient and this
  // call — it refreshes the auth token and must run on every request.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    /*
      The query string is part of where you were going.

      This used to send only the pathname, which quietly broke every link that
      carries one — above all the `?task=` in a notification email. Somebody
      tapping "your reminder on Book the crane" from their inbox signed in and
      landed on the bare Tasklist, with no idea which of forty cards they had
      been sent to look at. The link worked; it just forgot its destination at
      the door.

      The original search is cleared from the login URL itself before `next`
      is set, or the parameters of the page you were trying to reach would
      ride along on the login page as well.
    */
    const target = `${pathname}${request.nextUrl.search}`;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", target);
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
