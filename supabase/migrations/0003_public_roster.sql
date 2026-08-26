-- The "who are you?" screen has to list team members before anyone is
-- signed in, but public.members (and its RLS policy) is only readable by
-- already-authenticated team members, and never exposes email addresses to
-- the browser. This SECURITY DEFINER function is the single, narrow
-- exception: it returns only the four fields the picker needs, for anyone.
create function public.list_team_roster()
returns table (id uuid, display_name text, initials text, color text)
language sql
security definer
set search_path = public
stable
as $$
  select id, display_name, initials, color
  from public.members
  where is_active
  order by display_name;
$$;

revoke all on function public.list_team_roster() from public;
grant execute on function public.list_team_roster() to anon, authenticated;
