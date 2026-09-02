-- ---------------------------------------------------------------------------
-- The dispatcher could never record that it had sent anything.
--
-- Found by reading net._http_response against the live database: the cron job
-- was firing every minute, returning 200, and reporting a *rising* number of
-- notifications considered — 2, 3, 4, 6, 8, 9, 10 — while `pushed_at` stayed
-- null on every row in the table. It was re-sending the same notifications
-- once a minute for the full hour of the push window, and would have gone on
-- doing so the moment anyone re-enabled notifications on a device.
--
-- The cause is guard_notification_update() from 0012, which pins every column
-- except read_at:
--
--     new.pushed_at = old.pushed_at;
--
-- That guard is right about what it is defending — a member must not be able
-- to rewrite what their own notification says, or forge having been sent one
-- — but it applies to the dispatcher too. The service role bypasses row-level
-- security; it does not bypass triggers. So markPushed() issued an update that
-- affected the right rows, returned no error, and changed nothing.
--
-- The worst part of the failure is how quiet it was. Postgres reported
-- success, PostgREST reported success, the route returned
-- {"ok":true,"considered":8}, and the cron log said "succeeded". Every surface
-- in the chain said it had worked.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. A way for the dispatcher to say so
-- ---------------------------------------------------------------------------

-- Same shape as the deletion functions in 0014: a transaction-local setting is
-- the signal, and the guard stands aside only while it is set. Deliberately
-- not a check on the current role — "is this the service key" is a question
-- about *who* is asking, and the guard needs the answer to *what operation is
-- this*. A role check would also quietly hand every future service-role caller
-- permission to rewrite delivery stamps, which is not the same grant at all.
create or replace function public.mark_notifications_pushed(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  touched integer;
begin
  if p_ids is null or array_length(p_ids, 1) is null then
    return 0;
  end if;

  perform set_config('app.notify_op', '1', true);
  update public.notifications
  set pushed_at = now()
  where id = any(p_ids) and pushed_at is null;
  get diagnostics touched = row_count;
  perform set_config('app.notify_op', '', true);

  -- Returned rather than discarded so the route can say how many rows it
  -- actually stamped. A silent no-op is exactly what went wrong here, and the
  -- fix should be incapable of failing the same way twice.
  return touched;
end;
$$;

-- The dispatcher runs as the service role, which does not go through these
-- grants — but a stray grant to `authenticated` would let any signed-in member
-- mark their own notifications as delivered and suppress their own push, so
-- the absence has to be deliberate and stated.
revoke all on function public.mark_notifications_pushed(uuid[]) from public;
revoke all on function public.mark_notifications_pushed(uuid[]) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The guard stands aside for that one operation
-- ---------------------------------------------------------------------------

-- Everything else it pinned before, it still pins — including for the
-- dispatcher. Only the two delivery stamps are released, and only inside a
-- transaction that has announced itself.
create or replace function public.guard_notification_update()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  delivering boolean := coalesce(current_setting('app.notify_op', true), '') = '1';
begin
  new.id = old.id;
  new.member_id = old.member_id;
  new.actor_id = old.actor_id;
  new.task_id = old.task_id;
  new.note_id = old.note_id;
  new.kind = old.kind;
  new.payload = old.payload;
  new.dedupe_key = old.dedupe_key;
  new.created_at = old.created_at;

  if not delivering then
    new.pushed_at = old.pushed_at;
    new.emailed_at = old.emailed_at;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Stop the backlog before it is ever sent
-- ---------------------------------------------------------------------------

-- Everything currently unstamped is history: it was written while the bell was
-- the only channel, and its recipients have long since read it. Left as-is,
-- the first person to turn notifications back on would receive the lot.
-- Through the same signal the dispatcher uses, because the guard applies to
-- this statement too — running it bare would silently change nothing, which is
-- the exact bug this migration exists to fix.
do $$
begin
  perform set_config('app.notify_op', '1', true);
  update public.notifications
  set pushed_at = now()
  where pushed_at is null and created_at < now() - interval '5 minutes';
  raise notice 'Stamped % old notifications as already handled.', (select count(*) from public.notifications where pushed_at is not null);
  perform set_config('app.notify_op', '', true);
end $$;
