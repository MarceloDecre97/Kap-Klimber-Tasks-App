-- ---------------------------------------------------------------------------
-- 0054 — One device writes the minutes at a time
--
-- The stale check (0046) already stops a second screen flattening the first:
-- it compares the updated_at the page last saw and refuses. What it cannot do
-- is stop the typing. Marcelo writes on a laptop and, when the laptop dies or
-- the call is on speaker, on a phone — and the losing screen only finds out
-- it was losing after a paragraph has been written into it.
--
-- So the write box is claimed. Whoever opens it first holds it; everybody
-- else gets the minutes to read and a line saying where they are being
-- written. His words: "I should only be able to have the read section
-- available and if I try to go to the edit or write section I would get a
-- message just saying this meeting is being edited on another device."
--
-- THE LOCK MUST EXPIRE. A phone that dies mid-meeting, a laptop lid closed, a
-- tab killed by the OS — none of those release anything, and a lock nobody
-- can take back locks you out of your own minutes with no way in. So it is a
-- lease: refreshed while the box is open, and gone sixty seconds after the
-- refreshes stop. Long enough that a tunnel does not steal it; short enough
-- that walking away costs a minute.
--
-- It is the BODY that is claimed, not the meeting. The details around it
-- belong to everybody who was in the room (0051) and two people fixing a date
-- and a title at once is not a document being overwritten.
-- ---------------------------------------------------------------------------

/** Sixty seconds without a heartbeat and the lease is anybody's. */
create or replace function public.meeting_lock_ttl()
returns interval
language sql
immutable
as $$ select interval '60 seconds' $$;

create table if not exists public.meeting_locks (
  meeting_id uuid primary key references public.meetings (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  /*
    The browser, not the person. Marcelo on his laptop and Marcelo on his
    phone are two writers of one document, which is the case this exists for —
    a lock keyed by member alone would let exactly the collision it is meant
    to prevent.
  */
  device_id text not null check (char_length(device_id) between 8 and 64),
  claimed_at timestamptz not null default now(),
  refreshed_at timestamptz not null default now()
);

comment on table public.meeting_locks is
  'Who is typing into which minutes, right now. A lease, not a lock: it expires meeting_lock_ttl() after the last heartbeat, because no device reliably announces that it has stopped.';

alter table public.meeting_locks enable row level security;

drop policy if exists "meeting_locks_select" on public.meeting_locks;
create policy "meeting_locks_select"
  on public.meeting_locks for select
  to authenticated
  using (public.is_team_member());

/* No write policy: the two functions below are the only way in. */

-- ---------------------------------------------------------------------------
-- Claiming, and finding out you did not
--
-- One call does both. It always returns who holds the lease now — yours or
-- somebody else's — so the page never has to ask a second question to find
-- out what to draw, and there is no window between "is it free" and "take it"
-- for the other device to slip through.
-- ---------------------------------------------------------------------------
create type public.meeting_lock_state as (
  held_by_me boolean,
  member_id uuid,
  display_name text,
  device_id text,
  refreshed_at timestamptz
);

create or replace function public.claim_meeting_lock(p_meeting_id uuid, p_device_id text)
returns public.meeting_lock_state
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public.current_member_id();
  held public.meeting_locks;
  out_state public.meeting_lock_state;
begin
  if me is null then
    raise exception 'Not on the team.';
  end if;
  if not public.can_edit_meeting(p_meeting_id) then
    raise exception 'Only the person who wrote these minutes can change them.';
  end if;
  if p_device_id is null or char_length(p_device_id) not between 8 and 64 then
    raise exception 'Invalid device.';
  end if;

  /* An expired lease is nobody's. Cleared here rather than by a job: the only
     moment it matters is the moment somebody asks for it. */
  delete from public.meeting_locks
   where meeting_id = p_meeting_id
     and refreshed_at < now() - public.meeting_lock_ttl();

  insert into public.meeting_locks (meeting_id, member_id, device_id)
  values (p_meeting_id, me, p_device_id)
  on conflict (meeting_id) do update
    set refreshed_at = now()
  where public.meeting_locks.member_id = me
    and public.meeting_locks.device_id = p_device_id;

  select * into held from public.meeting_locks where meeting_id = p_meeting_id;

  select (held.member_id = me and held.device_id = p_device_id),
         held.member_id,
         mem.display_name,
         held.device_id,
         held.refreshed_at
    into out_state
    from public.members mem where mem.id = held.member_id;

  return out_state;
end;
$$;

comment on function public.claim_meeting_lock(uuid, text) is
  'Take or refresh the write lease on a meeting''s minutes, and say who holds it now. Call it again every few seconds while the box is open — a lease that stops being refreshed expires.';

revoke all on function public.claim_meeting_lock(uuid, text) from public;
grant execute on function public.claim_meeting_lock(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Letting go
--
-- Best effort, and deliberately so. `pagehide` and `visibilitychange` fire
-- most of the time and a dead battery fires neither, which is what the expiry
-- above is for. This is the fast path, not the guarantee.
-- ---------------------------------------------------------------------------
create or replace function public.release_meeting_lock(p_meeting_id uuid, p_device_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public.current_member_id();
begin
  if me is null then
    return;
  end if;
  delete from public.meeting_locks
   where meeting_id = p_meeting_id
     and member_id = me
     and device_id = p_device_id;
end;
$$;

comment on function public.release_meeting_lock(uuid, text) is
  'Give up your own write lease. Only ever deletes your own row, so a stale call from an old tab cannot take the lock from the device that has it now.';

revoke all on function public.release_meeting_lock(uuid, text) from public;
grant execute on function public.release_meeting_lock(uuid, text) to authenticated;
