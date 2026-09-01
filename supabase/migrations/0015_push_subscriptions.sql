-- ---------------------------------------------------------------------------
-- Where a notification goes when nobody has the app open.
--
-- A push subscription is issued by the browser, not by us: it is an endpoint
-- at Apple, Google or Mozilla plus two keys that let a message be encrypted so
-- only that browser can read it. We store it and can send to it; we cannot
-- read anything back from it, and it stops working the moment the person
-- turns notifications off.
--
-- One row per device, not per person. Somebody's phone and their laptop are
-- separate subscriptions with separate endpoints, either can be revoked on
-- its own, and a phone that is replaced simply stops accepting deliveries —
-- at which point the dispatcher removes the row rather than retrying forever.
-- ---------------------------------------------------------------------------

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  -- The push service's address for this browser. Unique because re-subscribing
  -- the same device returns the same endpoint, and that must update the row
  -- rather than accumulate duplicates that all deliver to one phone.
  endpoint text not null unique,
  -- The browser's own encryption keys. Useless to anyone else: they encrypt
  -- *to* that browser, they do not authenticate as it.
  p256dh text not null,
  auth text not null,
  -- Only so a person can tell their own devices apart when we ever show them.
  user_agent text,
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  -- A push service reporting the subscription gone is definitive, and the
  -- dispatcher deletes the row. This counts the softer failures — timeouts,
  -- 5xx — so a permanently sick endpoint can be spotted rather than retried
  -- silently forever.
  failure_count integer not null default 0
);

comment on table public.push_subscriptions is
  'One row per browser that has agreed to receive notifications. Written by the app as the member; read by the dispatcher as the service role.';

create index if not exists push_subscriptions_member_idx
  on public.push_subscriptions (member_id);

alter table public.push_subscriptions enable row level security;

-- Your own devices, and nobody else's — a member can neither see where a
-- teammate's notifications go nor unsubscribe them.
drop policy if exists "push_subscriptions_select_own" on public.push_subscriptions;
create policy "push_subscriptions_select_own"
  on public.push_subscriptions for select
  to authenticated
  using (public.is_team_member() and member_id = public.current_member_id());

drop policy if exists "push_subscriptions_insert_own" on public.push_subscriptions;
create policy "push_subscriptions_insert_own"
  on public.push_subscriptions for insert
  to authenticated
  with check (public.is_team_member() and member_id = public.current_member_id());

-- The one policy that is not strictly own-rows, and deliberately so.
--
-- An endpoint identifies a *browser*, not a person. If Keith signs in on a
-- laptop Marcelo used, the browser hands back the same endpoint, and Keith's
-- subscription has to take that row over — otherwise re-subscribing fails
-- silently on any shared device and notifications simply never arrive.
--
-- It stays safe because of the `with check`: whoever claims a row can only
-- ever point it at themselves. The worst anyone can do is redirect their own
-- browser's notifications to their own account, which is what pressing the
-- switch means.
drop policy if exists "push_subscriptions_update_own" on public.push_subscriptions;
create policy "push_subscriptions_claim"
  on public.push_subscriptions for update
  to authenticated
  using (public.is_team_member())
  with check (public.is_team_member() and member_id = public.current_member_id());

drop policy if exists "push_subscriptions_delete_own" on public.push_subscriptions;
create policy "push_subscriptions_delete_own"
  on public.push_subscriptions for delete
  to authenticated
  using (public.is_team_member() and member_id = public.current_member_id());

-- ---------------------------------------------------------------------------
-- What the dispatcher looks for
-- ---------------------------------------------------------------------------

-- It runs every minute and asks the same question every time: what has not
-- been pushed yet? Without this that is a scan of the whole table, growing
-- forever, sixty times an hour.
create index if not exists notifications_unpushed_idx
  on public.notifications (created_at)
  where pushed_at is null;

-- ---------------------------------------------------------------------------
-- Counting the soft failures
-- ---------------------------------------------------------------------------

-- A read-then-write from the dispatcher would race two deliveries to the same
-- device against each other and lose a count. One statement cannot.
--
-- Service role only: it is called by the dispatcher, never by the app, and
-- how often somebody's phone is failing is not something a teammate needs to
-- be able to edit.
create or replace function public.increment_push_failure(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.push_subscriptions
  set failure_count = failure_count + 1
  where id = p_id;
$$;

revoke all on function public.increment_push_failure(uuid) from public;
revoke all on function public.increment_push_failure(uuid) from authenticated;
