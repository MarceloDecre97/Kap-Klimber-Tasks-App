-- ---------------------------------------------------------------------------
-- 0032 — Links on a task
--
-- Tasks in this team routinely point at a document in the shared Drive, and
-- until now the only place to put one was the description. That is where
-- they went, and it is why the description overflowed its card: a Drive URL
-- is eighty unbroken characters with nowhere to wrap.
--
-- A link here is a name and a URL. Only the name is ever shown, which is the
-- whole point — "JV Exec Summary" reads, and the URL behind it does not have
-- to.
--
-- Three per task. Not a suggestion: the form says so in words and the
-- trigger below makes it true, because the form is one of several ways a row
-- can reach this table.
-- ---------------------------------------------------------------------------

create table if not exists public.task_links (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  /*
    Capped at 40 rather than left open. The name is drawn on one line of a
    390px phone, and a label that wraps to three lines defeats the reason
    this table exists. The interface truncates with an ellipsis as well —
    this is the guarantee behind that, not a substitute for it.
  */
  label      text not null check (length(btrim(label)) between 1 and 40),
  /*
    The scheme check is the security boundary, and it lives here rather than
    only in the form.

    A link is somebody's pasted text that becomes a clickable anchor. Left
    unchecked, `javascript:...` in this column is a script that runs when a
    teammate taps what looks like a document. Escaping it at render time
    would not help: the browser follows the scheme, it does not read the
    text. So the value never enters the column at all.

    2048 is the practical URL ceiling every browser agrees on.
  */
  url        text not null check (url ~* '^https?://' and length(url) between 1 and 2048),
  /* Ties the display order to the order they were added, not to a clock. */
  position   smallint not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references public.members (id) on delete set null
);

create index if not exists task_links_task_idx on public.task_links (task_id, position, created_at);

comment on table public.task_links is
  'Up to three named links per task. Cascades with the task. Only the label is displayed; http(s) is enforced here because the column feeds an anchor tag.';

-- ---------------------------------------------------------------------------
-- At most three
--
-- Same shape as guard_task_contact_limit in 0022, and for the same reason:
-- three is the number the section is drawn for.
-- ---------------------------------------------------------------------------
create or replace function public.guard_task_link_limit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  existing integer;
begin
  select count(*) into existing
  from public.task_links
  where task_id = new.task_id;

  if existing >= 3 then
    raise exception 'A task can carry three links at most. Remove one to add another.';
  end if;
  return new;
end;
$$;

drop trigger if exists task_links_limit on public.task_links;
create trigger task_links_limit
  before insert on public.task_links
  for each row execute function public.guard_task_link_limit();

-- ---------------------------------------------------------------------------
-- RLS: the same rule the rest of a task follows
--
-- A link is part of the task, not private to whoever pasted it, so any
-- active member reads and writes it. Authorship is recorded for the log, not
-- for permission — the person who adds the document is rarely the only one
-- who should be able to fix a typo in its name.
-- ---------------------------------------------------------------------------
alter table public.task_links enable row level security;

drop policy if exists "task_links_select" on public.task_links;
create policy "task_links_select"
  on public.task_links for select
  to authenticated
  using (public.is_team_member());

drop policy if exists "task_links_insert" on public.task_links;
create policy "task_links_insert"
  on public.task_links for insert
  to authenticated
  with check (public.is_team_member());

drop policy if exists "task_links_update" on public.task_links;
create policy "task_links_update"
  on public.task_links for update
  to authenticated
  using (public.is_team_member())
  with check (public.is_team_member());

drop policy if exists "task_links_delete" on public.task_links;
create policy "task_links_delete"
  on public.task_links for delete
  to authenticated
  using (public.is_team_member());
