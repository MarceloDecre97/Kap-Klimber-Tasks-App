-- ---------------------------------------------------------------------------
-- Phase 6: the off switches.
--
-- Built last on purpose. These turn channels off, and turning off a channel
-- nobody has seen work is how an app ends up silent and gets called finished.
-- Push and email are both proven now, so it is safe to be able to stop them.
--
-- Two design rules, both of them the reason this table looks the way it does.
--
--   1. Everything is on until somebody says otherwise. A missing row means
--      full notifications, so nobody has to configure anything to be told
--      what is happening. The settings exist for the person who wants less,
--      not to make the app work.
--
--   2. Opt-OUTs are stored, never opt-ins. A new notification kind added next
--      year is on for everyone the day it ships, rather than silently off for
--      every existing member because their row predates it. Storing the
--      positive list would have made every future feature invisible by
--      default, and that failure is completely silent.
-- ---------------------------------------------------------------------------

create table if not exists public.notification_prefs (
  member_id uuid primary key references public.members (id) on delete cascade,

  -- Kinds this person does not want pushed to their devices, and does not
  -- want emailed. Empty means everything. The bell is not listed and never
  -- will be: the inbox is the record, and a record with holes in it is worse
  -- than no record.
  push_off text[] not null default '{}',
  email_off text[] not null default '{}',

  /*
    Quiet hours, on the app's one shared clock like everything else.

    Null means none. They may wrap midnight — 22:00 to 07:00 is the obvious
    setting and the one that spans two days, so the comparison below has to
    handle from > to rather than assuming a simple between.
  */
  quiet_from time,
  quiet_to time,

  updated_at timestamptz not null default now()
);

comment on table public.notification_prefs is
  'Per-member opt-outs. A missing row means everything is on, which is the default for every member.';

comment on column public.notification_prefs.push_off is
  'Kinds NOT pushed. Stored as opt-outs so a new kind is on for everybody the day it ships.';

-- ---------------------------------------------------------------------------
-- Your own row, and nobody else's
-- ---------------------------------------------------------------------------

alter table public.notification_prefs enable row level security;

drop policy if exists "notification_prefs_select_own" on public.notification_prefs;
create policy "notification_prefs_select_own"
  on public.notification_prefs for select
  to authenticated
  using (public.is_team_member() and member_id = public.current_member_id());

drop policy if exists "notification_prefs_insert_own" on public.notification_prefs;
create policy "notification_prefs_insert_own"
  on public.notification_prefs for insert
  to authenticated
  with check (public.is_team_member() and member_id = public.current_member_id());

drop policy if exists "notification_prefs_update_own" on public.notification_prefs;
create policy "notification_prefs_update_own"
  on public.notification_prefs for update
  to authenticated
  using (public.is_team_member() and member_id = public.current_member_id())
  with check (public.is_team_member() and member_id = public.current_member_id());

-- Spelled out rather than inherited from Supabase's project defaults, for the
-- same reason 0016 spells out the notifications grants: a database built from
-- these files alone would otherwise get policies with no privilege to exercise
-- them, and fail with a flat "permission denied" that explains nothing.
--
-- No delete. Clearing your preferences is setting them back to empty, which is
-- an update; a delete would leave a member with no row and the same result by
-- a second route nobody would think to look for.
grant select, insert, update on public.notification_prefs to authenticated;

-- ---------------------------------------------------------------------------
-- Are we inside quiet hours right now?
-- ---------------------------------------------------------------------------

-- In SQL rather than TypeScript because the wrap-around is the only genuinely
-- fiddly part of this feature, and one implementation of it is one thing to
-- get wrong. The dispatcher reads the answer, it does not re-derive it.
create or replace function public.in_quiet_hours(
  p_from time,
  p_to time,
  p_at timestamptz default now()
)
returns boolean
language sql
stable
set search_path = public
as $$
  select case
    -- No quiet hours set, or half-set: not quiet. A single bound is not a
    -- window, and guessing which half was meant would be worse than ignoring
    -- it.
    when p_from is null or p_to is null then false
    -- from == to would be either "never" or "always" depending on how you
    -- read it. Never is the safer reading: a setting nobody deliberately
    -- chose must not silence every notification for a day.
    when p_from = p_to then false
    -- The ordinary case, inside one day: 13:00 to 14:00.
    when p_from < p_to then
      (p_at at time zone public.app_timezone())::time >= p_from
      and (p_at at time zone public.app_timezone())::time < p_to
    -- Across midnight: 22:00 to 07:00 is late evening OR early morning.
    else
      (p_at at time zone public.app_timezone())::time >= p_from
      or (p_at at time zone public.app_timezone())::time < p_to
  end;
$$;

comment on function public.in_quiet_hours(time, time, timestamptz) is
  'True inside a quiet window on the app clock. Handles windows that wrap midnight.';
