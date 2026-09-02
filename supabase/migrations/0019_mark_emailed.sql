-- ---------------------------------------------------------------------------
-- The same door for email that 0017 opened for push.
--
-- guard_notification_update pins emailed_at exactly as it pinned pushed_at,
-- and for the same good reason: a member must not be able to forge having
-- been emailed, or suppress an email by claiming they already were. 0017
-- released both columns, but only inside a transaction that announces itself,
-- and only one function knew how to announce it.
--
-- Without this the emailer would have looked like it worked — no error, the
-- right rows matched, nothing written — and then emailed the same thing every
-- minute for an hour. That failure has already happened once on this table;
-- it is not being allowed to happen a second time on the column next door.
-- ---------------------------------------------------------------------------

create or replace function public.mark_notifications_emailed(p_ids uuid[])
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
  set emailed_at = now()
  where id = any(p_ids) and emailed_at is null;
  get diagnostics touched = row_count;
  perform set_config('app.notify_op', '', true);

  return touched;
end;
$$;

revoke all on function public.mark_notifications_emailed(uuid[]) from public;
revoke all on function public.mark_notifications_emailed(uuid[]) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Nothing already in the table gets emailed
-- ---------------------------------------------------------------------------

-- Every existing notification predates email entirely. Left unstamped, the
-- first run of the emailer would post the whole history of the project to
-- four inboxes at once.
do $$
begin
  perform set_config('app.notify_op', '1', true);
  update public.notifications
  set emailed_at = now()
  where emailed_at is null and created_at < now() - interval '5 minutes';
  perform set_config('app.notify_op', '', true);
end $$;

-- The emailer asks the same question every minute: what has not been emailed
-- yet? Same shape as notifications_unpushed_idx, same reason.
create index if not exists notifications_unemailed_idx
  on public.notifications (created_at)
  where emailed_at is null;
