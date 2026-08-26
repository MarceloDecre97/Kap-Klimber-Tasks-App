# Kap Klimber Tasks

A shared, mobile-first task list for a small team. Tap-your-name sign-in
(no passwords), five priority/status values with icon + word badges,
inline filters and sort, notes on every task, dark mode. Built with
Next.js (App Router) and Supabase.

## Stack

- **Next.js 16** (App Router, Server Actions, Turbopack) + TypeScript
- **Tailwind CSS v4** for styling, tokenized to the team's design system
- **Supabase** — Postgres, Auth (passwordless email OTP), and Row Level
  Security as the only authorization boundary
- **Vercel** for hosting

## How sign-in works

There's no self-service sign-up and no password. The team roster lives in
`public.members`, provisioned out-of-band (see **Provisioning team
members** below). The "Who are you?" screen lists active members by name;
tapping one sends a 6-digit code to that member's email
(`supabase.auth.signInWithOtp` with `shouldCreateUser: false`, so an
unlisted email can never create an account) and verifying it signs them
in. The picker itself never exposes email addresses to the browser — it's
served by a `SECURITY DEFINER` Postgres function
(`list_team_roster()`) that returns only name/initials/color.

## Getting started

1. **Create a Supabase project** at [supabase.com](https://supabase.com).
2. **Run the migrations** in `supabase/migrations/` in order, either by
   pasting them into the Supabase SQL editor or with the Supabase CLI:
   ```bash
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```
3. **Copy env vars**: `cp .env.example .env.local` and fill in
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
   `SUPABASE_SERVICE_ROLE_KEY` from Project Settings → API.
4. **Provision team members** (see below).
5. ```bash
   npm install
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000).

## Provisioning team members

There's no admin UI yet (it's planned — see below), so the roster is
managed by editing `scripts/members.json` and running:

```bash
npm run seed:members
```

This creates an `auth.users` row for each new email (via the Supabase
admin API — no password, they'll sign in with the OTP flow above) and
upserts a matching `public.members` row. Re-running it is safe; it
updates existing members by email rather than duplicating them. This
script is the **only** place in the codebase that uses
`SUPABASE_SERVICE_ROLE_KEY` — never add that key to anything that ships
to the browser or to a Vercel serverless function that handles user
requests.

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
- **Route protection is layered.** `src/proxy.ts` redirects unauthenticated
  requests to `/login` for every route; every Server Action independently
  re-checks the session via `getCurrentMember()` rather than trusting the
  proxy alone.
- **Security headers** (CSP, HSTS, X-Frame-Options, etc.) are set in
  `next.config.ts`.
- **OTP rate limiting** relies on Supabase Auth's built-in email-send
  limits; the client also disables the "send a new code" button while a
  request is in flight.

## What's next (by design)

The task description called this phase "just the tasks interface" — an
admin panel for managing team members and categories is coming later. In
the meantime, `scripts/seed-members.ts` is the roster admin tool and
categories can be added inline by any team member (the "Other" chip on
the task form), matching the product spec.

## Deploying

1. Push this repo to GitHub and import it in Vercel.
2. Add the three env vars from `.env.example` in the Vercel project
   settings (Production **and** Preview).
3. Deploy. No build configuration is needed — it's a standard Next.js
   App Router app.
4. Run the migrations and `npm run seed:members` against the production
   Supabase project before the first real users sign in.
