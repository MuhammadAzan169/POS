-- =====================================================================
--  002 — Day book, shop types, wholesale pricing and stock transfers
--
--  Run this ONCE against a database already created with the ORIGINAL
--  schema.sql. A database created from the CURRENT schema.sql already has
--  everything below; running it anyway is harmless (every statement is
--  IF NOT EXISTS / idempotent).
--
--  Nothing here drops or rewrites existing data. Sales recorded before this
--  migration keep a null business_date, and the app falls back to their
--  calendar date, so history stays readable.
-- =====================================================================

/* ---------------------------------------------- shop types & wholesale price */

alter table shops    add column if not exists kind text not null default 'retail';
alter table products add column if not exists wholesale_price numeric(12,2);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'shops_kind_check') then
    alter table shops add constraint shops_kind_check check (kind in ('retail', 'wholesale'));
  end if;
end $$;

/* -------------------------------------------------------------- day sessions */

create table if not exists day_sessions (
  id                  text primary key,
  shop_id             text not null references shops(id) on delete cascade,
  business_date       date not null,
  opened_at           timestamptz not null,
  opened_by           text default '',
  opening_cash        numeric(12,2) not null default 0,
  status              text not null default 'open' check (status in ('open', 'closed')),
  closed_at           timestamptz,
  closed_by           text,
  counted_cash        numeric(12,2),
  cash_taken_by_owner numeric(12,2),
  cash_left_in_shop   numeric(12,2),
  notes               text
);

-- Two open sessions at one shop would double-count every sale.
create unique index if not exists day_sessions_one_open_per_shop
  on day_sessions (shop_id) where status = 'open';

/* ------------------------------------------ trading day stamps on sales/spend */

alter table sales    add column if not exists business_date date;
alter table sales    add column if not exists session_id text references day_sessions(id) on delete set null;
alter table expenses add column if not exists session_id text references day_sessions(id) on delete set null;

-- Backfill: existing sales keep counting on the calendar day they were rung up.
-- Timezone matters here — the app treats a sale's day as the LOCAL date, so pick
-- the zone your shops actually trade in rather than leaving it as UTC.
update sales
   set business_date = (date at time zone 'Asia/Karachi')::date
 where business_date is null;

/* ----------------------------------------------- purchases raised by a shop */

alter table purchases add column if not exists created_by text default '';
alter table purchases add column if not exists created_by_shop_id text references shops(id) on delete set null;
alter table purchases add column if not exists paid boolean not null default true;

/* ----------------------------------------------------------- stock transfers */

create table if not exists transfers (
  id           text primary key,
  transfer_no  text not null,
  date         date not null,
  from_shop_id text not null references shops(id) on delete cascade,
  to_shop_id   text not null references shops(id) on delete cascade,
  items        jsonb not null default '[]'::jsonb,
  notes        text default '',
  created_by   text default '',
  constraint transfers_distinct_shops check (from_shop_id <> to_shop_id)
);

/* ------------------------------------------------------------------ indexes */

create index if not exists sales_business_day_idx on sales (shop_id, business_date desc);
create index if not exists sales_session_idx      on sales (session_id);
create index if not exists day_sessions_shop_idx  on day_sessions (shop_id, business_date desc);
create index if not exists transfers_from_idx     on transfers (from_shop_id, date desc);
create index if not exists transfers_to_idx       on transfers (to_shop_id, date desc);
create index if not exists expenses_session_idx   on expenses (session_id);

/* ----------------------------------------- RLS for the two new tables

   Same open policy the other tables already use: anyone with the anon key can
   read and write. See the warning at the bottom of schema.sql — this is fine
   for demo data and NOT for real sales records.
                                                                            */
do $$
declare t text;
begin
  foreach t in array array['day_sessions','transfers']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "demo_open_access" on %I', t);
    execute format(
      'create policy "demo_open_access" on %I for all to anon, authenticated using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on %I to anon, authenticated', t);
  end loop;
end $$;
