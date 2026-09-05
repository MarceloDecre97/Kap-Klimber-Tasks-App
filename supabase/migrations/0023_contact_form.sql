-- ---------------------------------------------------------------------------
-- 0023 — Categories that stay true, and two missing address fields
--
-- The category field was being asked to carry two different things at once.
-- Supplier, Investor and Partner describe what kind of organisation somebody
-- is, and essentially never change. Prospect and Customer described where
-- they were in a sales relationship, which changes on a clock nobody watches
-- — so half the book would quietly become wrong, and a wrong label is worse
-- than a missing one.
--
-- They merge into Fleets: anyone who might buy or has bought. Whether they
-- actually bought is work, and this app already tracks work.
-- ---------------------------------------------------------------------------

-- Fleets takes over from Prospects, so contacts keep their row rather than
-- being emptied and re-picked one at a time.
update public.contact_categories
set label = 'Fleets', icon = 'truck', sort_order = 10
where label = 'Prospects';

-- Anyone already filed as a Customer moves across before that row goes.
update public.contacts
set category_id = (select id from public.contact_categories where label = 'Fleets')
where category_id = (select id from public.contact_categories where label = 'Customers');

delete from public.contact_categories where label = 'Customers';

/*
  Nothing is lost by this. contact_events records the category as its *label*
  in plain text, so "changed category from Prospects to Other" stays readable
  for ever, whatever happens to the row it once pointed at.
*/

-- ---------------------------------------------------------------------------
-- Where they are
--
-- Country was a real gap: with only State to work with, "Switzerland" ended
-- up in it. Street keeps the whole line — Swiss addresses put the number
-- after the street and US ones put it before, and one field carries both
-- without forcing a convention on either.
-- ---------------------------------------------------------------------------
alter table public.contacts
  add column if not exists suite text check (suite is null or char_length(suite) <= 100),
  add column if not exists country text check (country is null or char_length(country) <= 80);

comment on column public.contacts.suite is
  'Unit, apartment or suite. Separate from street because it is the part a courier needs and a mail merge drops.';
