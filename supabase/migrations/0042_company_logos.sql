-- ---------------------------------------------------------------------------
-- 0042 — A company's own mark, instead of a generic one
--
-- Every company in the book wears the icon of its first type, so the
-- companies page is a column of identical grey buildings. The mark a company
-- already puts on its own website is better at saying which one you are
-- looking at than any icon we could pick.
--
-- Fetched once and kept, rather than asked for at render time:
--
--   A favicon service (Google's, DuckDuckGo's) is one line of code and sends
--   the list of who Opus Kap does business with to a third party on every
--   page view. Not for a private address book.
--
--   Hotlinking the company's own /favicon.ico does the same to them, breaks
--   when they redesign, and makes the page wait on somebody else's server.
--
-- So the bytes live here. They are tiny — a favicon is measured in single
-- kilobytes — and a four-person company's address book will hold dozens of
-- them, not thousands. A table of its own rather than a column on companies,
-- so the contacts page, which embeds companies, does not start carrying a
-- kilobyte of image per person.
-- ---------------------------------------------------------------------------

create table if not exists public.company_logos (
  company_id uuid primary key references public.companies (id) on delete cascade,
  /*
    The image itself, base64 in a data: URI, ready to go straight into an
    img src. Capped at roughly 150KB of encoded text — an apple-touch-icon is
    usually under 20KB and anything far past that is not an icon.
  */
  data_uri text not null check (char_length(data_uri) between 32 and 200000),
  /* What it was fetched from, so a wrong one can be explained rather than guessed at. */
  source_url text,
  content_type text,
  fetched_at timestamptz not null default now(),
  fetched_by uuid references public.members (id) on delete set null
);

comment on table public.company_logos is
  'A company mark fetched once from its own website and kept here, so no third party is told who we work with and no page waits on somebody else''s server. Falls back to the type icon when absent.';

alter table public.company_logos enable row level security;

/*
  Team-wide, both ways. This is a picture a company publishes on its own
  website — there is nothing here to protect beyond the fact that we hold
  it, which the companies table already discloses to the same people.
*/
drop policy if exists "company_logos_select" on public.company_logos;
create policy "company_logos_select"
  on public.company_logos for select
  to authenticated
  using (public.is_team_member());

drop policy if exists "company_logos_write" on public.company_logos;
create policy "company_logos_write"
  on public.company_logos for all
  to authenticated
  using (public.is_team_member())
  with check (public.is_team_member());
