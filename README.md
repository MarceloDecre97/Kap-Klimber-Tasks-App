# Kap Klimber Tasks

A shared, mobile-first task list for a small team. Tap-your-name sign-in,
five priority/status values with icon + word badges, inline filters and
sort, notes on every task, dark mode. Built with Next.js (App Router) and
Supabase.

## Stack

- **Next.js 16** (App Router, Server Actions, Turbopack) + TypeScript
- **Tailwind CSS v4** for styling, tokenized to the team's design system
- **Supabase** — Postgres, Auth, and Row Level Security as the only
  authorization boundary
- **Vercel** for hosting

## How sign-in works

There's no self-service sign-up. The team roster lives in `public.members`,
provisioned out-of-band (see **Provisioning team members** below). The
"Who are you?" screen lists active members by name; tapping one goes to a
password field. This is real per-user Supabase Auth underneath — each
person gets their own session and `auth.uid()`, RLS applies exactly as
normal, nothing about the security model changes based on login method.

**Password login is a temporary simplification** (`signInWithPassword` in
`src/app/login/actions.ts`), swapped in because email deliverability for
the original design's passwordless email-OTP flow needed a working SMTP
provider that took a while to sort out. The OTP code
(`requestOtp`/`verifyOtp` in that same file) is untouched and unused —
switching back later is just swapping which function `login-flow.tsx`
calls. Either way, the picker never exposes email addresses to the
browser — it's served by a `SECURITY DEFINER` Postgres function
(`list_team_roster()`) that returns only name/initials/color, and the
tapped member's email is resolved server-side.

## Getting started

1. **Create a Supabase project** at [supabase.com](https://supabase.com).
2. **Run the migrations** in `supabase/migrations/` in order, either by
   pasting them into the Supabase SQL editor or with the Supabase CLI:
   ```bash
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```
3. **Copy env vars**: `cp .env.example .env.local` and fill in
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY` from Project Settings → API, and
   `SEED_INITIAL_PASSWORD` (a password of your choosing — see below).
4. **Provision team members** (see below).
5. ```bash
   npm install
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000).

## Notification environment variables

None of these are needed to run the app. The bell works without any of them;
each one switches on a further channel, and the code says "not configured"
rather than failing when one is missing.

| Variable | Type in Vercel | What it does |
| --- | --- | --- |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Config | Identifies the app to push services. Public by design. |
| `VAPID_PRIVATE_KEY` | **Secret** | Signs each push. |
| `VAPID_SUBJECT` | Config | A `mailto:` a push service can reach. Never shown to anyone. |
| `CRON_SECRET` | **Secret** | Proves a call to `/api/cron/notify` came from the scheduled job. Must match the pg_cron job exactly. |
| `RESEND_API_KEY` | **Secret** | Sends email. Create it with **Sending access** only, scoped to the verified subdomain — a full-access key could also read the account and manage domains. |
| `APP_URL` | Config, optional | Where links in emails point. Vercel supplies its own production domain automatically, so this is only needed for a custom domain. |

Adding a variable in Vercel does not affect the running deployment: it is
picked up on the next build, so redeploy afterwards.

### The two scheduled jobs

Both live in `supabase/scheduling/` and are run by hand in the SQL editor,
not by a migration.

- `notify-every-minute.sql` wakes the dispatcher, which sends push and email.
  It carries a URL and the cron secret, which is why it is not committed with
  real values in it.
- `scheduled-rules-every-minute.sql` runs the reminder and due-date rules.
  Nothing to fill in — it never leaves the database.

## Provisioning team members

There's no admin UI yet (it's planned — see below), so the roster is
managed by editing `scripts/members.json` and running:

```bash
npm run seed:members
```

This creates an `auth.users` row for each new email (via the Supabase
admin API) and upserts a matching `public.members` row. Every member
listed — new or already existing — gets their password set (or reset) to
`SEED_INITIAL_PASSWORD`, so re-running it after changing that value
updates everyone's password. Share that password with the team out of
band (Slack, verbally — not in this repo). This script is the **only**
place in the codebase that uses `SUPABASE_SERVICE_ROLE_KEY` — never add
that key to anything that ships to the browser or to a Vercel serverless
function that handles user requests.

## Security notes

- **RLS everywhere.** Every table denies by default; policies only grant
  access to signed-in, active team members (see
  `supabase/migrations/0002_rls.sql`). There is no anon read/write access
  anywhere except the narrow `list_team_roster()` function used by the
  pre-login picker.
- **Shared-team trust model.** Any active member can read/write any task
  (matches the product: five colleagues, one shared list). RLS doesn't
  restrict edits to a task's creator — that's intentional, not an
  oversight.
- **Service role stays server-only.** `src/lib/supabase/admin.ts` is
  guarded with the `server-only` package and used only by the login
  server actions (to resolve a tapped member to an email before a
  session exists) and by `scripts/seed-members.ts`.
- **Route protection is layered.** `src/middleware.ts` redirects
  unauthenticated requests to `/login` for every route; every Server
  Action independently re-checks the session via `getCurrentMember()`
  rather than trusting the middleware alone. (Named `middleware.ts` rather
  than Next 16's newer `proxy.ts` convention — Vercel's deploy adapter
  didn't wire routes correctly for a `proxy.ts` project as of this
  writing; `middleware.ts` still works and is fully supported, just
  deprecated.)
- **Security headers** (CSP, HSTS, X-Frame-Options, etc.) are set in
  `next.config.ts`.
- **Login rate limiting**: Supabase Auth rate-limits both the OTP-send and
  password-attempt paths by default.

## What's next (by design)

The task description called this phase "just the tasks interface" — an
admin panel for managing team members and categories is coming later. In
the meantime, `scripts/seed-members.ts` is the roster admin tool and
categories can be added inline by any team member (the "Other" chip on
the task form), matching the product spec.

## Deploying

1. Push this repo to GitHub and import it in Vercel.
2. Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
   `SUPABASE_SERVICE_ROLE_KEY` in the Vercel project settings (Production
   **and** Preview) — the service role key is used at runtime by the login
   Server Action (`src/lib/supabase/admin.ts`), not just by the seed
   script, so it's required there too. `SEED_INITIAL_PASSWORD` is the one
   exception — it's only read by `scripts/seed-members.ts`, which you run
   from your own machine, so it doesn't need to be in Vercel at all.
3. Deploy. No build configuration is needed — it's a standard Next.js
   App Router app.
4. Run the migrations and, from your own machine (with `.env.local`
   pointed at the production Supabase project), `npm run seed:members`
   before the first real users sign in.
