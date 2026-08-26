-- Kap Klimber Tasks — initial schema
-- Team members are provisioned out-of-band (scripts/seed-members.ts, or later an
-- admin panel) using the Supabase service role. Sign-in is passwordless email OTP
-- restricted to pre-provisioned auth.users rows (shouldCreateUser: false on the
-- client), so this schema never has to trust a self-service sign-up.

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ---------------------------------------------------------------------------
-- members
-- ---------------------------------------------------------------------------
create table public.members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  email citext not null unique,
  display_name text not null check (char_length(trim(display_name)) between 1 and 80),
  initials text not null check (char_length(initials) between 1 and 2),
  color text not null default '#87252B' check (color ~* '^#[0-9a-f]{6}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.members is 'Team roster. Rows are provisioned by an admin (script or future admin panel), not by self sign-up.';

-- Keep members.user_id linked automatically if an admin later creates the
-- matching auth user through a path that does not set it explicitly.
create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.members
  set user_id = new.id
  where email = new.email and user_id is null;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  label text not null unique check (char_length(trim(label)) between 1 and 60),
  is_default boolean not null default false,
  created_by uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.categories is 'Task categories. Anyone on the team can add one (the "Other" chip flow); editing/removing is reserved for the future admin panel.';

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 200),
  description text check (description is null or char_length(description) <= 4000),
  category_id uuid references public.categories (id) on delete set null,
  priority text not null default 'medium'
    check (priority in ('asap', 'high', 'medium', 'low', 'someday')),
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'for_review', 'waiting', 'complete')),
  reminder_at timestamptz,
  created_by uuid not null references public.members (id),
  completed_at timestamptz,
  completed_by uuid references public.members (id),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_status_idx on public.tasks (status) where deleted_at is null;
create index tasks_priority_idx on public.tasks (priority) where deleted_at is null;
create index tasks_category_idx on public.tasks (category_id) where deleted_at is null;
create index tasks_reminder_idx on public.tasks (reminder_at) where deleted_at is null;
create index tasks_deleted_idx on public.tasks (deleted_at);

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- task_assignees (many-to-many)
-- ---------------------------------------------------------------------------
create table public.task_assignees (
  task_id uuid not null references public.tasks (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (task_id, member_id)
);

create index task_assignees_member_idx on public.task_assignees (member_id);

-- ---------------------------------------------------------------------------
-- task_notes
-- ---------------------------------------------------------------------------
create table public.task_notes (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  member_id uuid not null references public.members (id),
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index task_notes_task_idx on public.task_notes (task_id, created_at);

-- ---------------------------------------------------------------------------
-- seed default categories
-- ---------------------------------------------------------------------------
insert into public.categories (label, is_default) values
  ('General', true),
  ('Client outreach', true),
  ('Site visits', true),
  ('Scheduling', true),
  ('Purchasing', true),
  ('Admin', true);
