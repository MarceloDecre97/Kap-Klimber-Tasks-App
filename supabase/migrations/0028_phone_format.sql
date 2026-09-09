-- ---------------------------------------------------------------------------
-- 0028 — One way of writing a phone number
--
-- The book held "9055550110", "(905) 555-0110" and "+41 79 357 3300" side by
-- side, which reads as three different kinds of thing. Everything written from
-- now on goes through src/lib/phones.ts on the way in; this brings the numbers
-- already there into line with it.
--
-- The function below is a translation of that TypeScript, and it exists only
-- for the length of this migration — it is dropped at the bottom. A permanent
-- second copy of a rule is a second thing to get wrong, and the whole reason
-- the formatting lives in one place is that it must not drift.
--
-- The rule is narrow on purpose: format what is unambiguous, and leave
-- everything else exactly as it was. A number this cannot parse is somebody's
-- real number written in a way we did not anticipate, and mangling it here
-- would be worse than the inconsistency being fixed.
-- ---------------------------------------------------------------------------

create or replace function pg_temp.calling_codes()
returns text[]
language sql
immutable
as $$
  -- Longest first, so 212 wins over 21 and 1 is only reached last.
  select array[
    '211','212','213','216','218','220','221','222','223','224','225','226',
    '227','228','229','230','231','232','233','234','235','236','237','238',
    '239','240','241','242','243','244','245','246','248','249','250','251',
    '252','253','254','255','256','257','258','260','261','262','263','264',
    '265','266','267','268','269','290','291','297','298','299','350','351',
    '352','353','354','355','356','357','358','359','370','371','372','373',
    '374','375','376','377','378','380','381','382','383','385','386','387',
    '389','420','421','423','500','501','502','503','504','505','506','507',
    '508','509','590','591','592','593','595','597','598','599','670','673',
    '674','675','676','677','678','679','680','681','682','683','685','686',
    '687','688','689','690','691','692','850','852','853','855','856','880',
    '886','960','961','962','963','964','965','966','967','968','970','972',
    '973','974','975','976','977','992','993','994','995','996','998',
    '20','27','30','31','32','33','34','36','39','40','41','43','44','45',
    '46','47','48','49','51','52','53','54','55','56','57','58','60','61',
    '62','63','64','65','66','81','82','84','86','90','91','92','93','94',
    '95','98','1','7'
  ];
$$;

/*
  "(123)-456-7890", or "456-7890" for a bare local seven.

  The seven-digit form is only offered when no country code was given. After a
  "+" a seven-digit remainder is not a local number — it is a foreign number
  missing its last digits, and "+41 79 357 33" must not become "+41 793-5733".
*/
create or replace function pg_temp.group_national(digits text, allow_local boolean)
returns text
language sql
immutable
as $$
  select case
    when length(digits) = 10
      then '(' || substr(digits,1,3) || ')-' || substr(digits,4,3) || '-' || substr(digits,7,4)
    when allow_local and length(digits) = 7
      then substr(digits,1,3) || '-' || substr(digits,4,4)
    else null
  end;
$$;

create or replace function pg_temp.format_phone(raw text)
returns text
language plpgsql
immutable
as $$
declare
  v text := btrim(coalesce(raw, ''));
  digits text;
  code text;
  national text;
begin
  if v = '' then return ''; end if;
  digits := regexp_replace(v, '\D', '', 'g');
  if digits = '' then return v; end if;

  -- A country code is only ever taken from an explicit "+".
  if left(v, 1) = '+' then
    foreach code in array pg_temp.calling_codes() loop
      if left(digits, length(code)) = code then
        national := pg_temp.group_national(substr(digits, length(code) + 1), false);
        if national is not null then
          return '+' || code || ' ' || national;
        end if;
        -- Longer codes were tried first, so nothing better is coming.
        exit;
      end if;
    end loop;
    return v;
  end if;

  -- Eleven digits starting with 1 and no plus: almost always a US number
  -- typed with its country code, so it is treated as one.
  if length(digits) = 11 and left(digits, 1) = '1' then
    national := pg_temp.group_national(substr(digits, 2), false);
    if national is not null then
      return '+1 ' || national;
    end if;
  end if;

  return coalesce(pg_temp.group_national(digits, true), v);
end;
$$;

-- ---------------------------------------------------------------------------
-- The backfill
--
-- Only rows the formatter actually changes are touched, so nothing's
-- updated_at moves for a number that was already written correctly.
-- ---------------------------------------------------------------------------
update public.contacts
set mobile = pg_temp.format_phone(mobile)
where mobile is not null and mobile <> pg_temp.format_phone(mobile);

update public.contacts
set office_phone = pg_temp.format_phone(office_phone)
where office_phone is not null and office_phone <> pg_temp.format_phone(office_phone);

update public.companies
set company_number = pg_temp.format_phone(company_number)
where company_number is not null and company_number <> pg_temp.format_phone(company_number);

-- Gone with the session. The rule lives in src/lib/phones.ts and nowhere else.
drop function if exists pg_temp.format_phone(text);
drop function if exists pg_temp.group_national(text, boolean);
drop function if exists pg_temp.calling_codes();
