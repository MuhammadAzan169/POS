-- =====================================================================
--  A-POS — database schema
--  Run this ONCE in the Supabase dashboard: SQL Editor -> New query -> Run.
--  Safe to re-run: every object is created with IF NOT EXISTS / OR REPLACE.
-- =====================================================================

-- Ids are text (not uuid) so the demo data keeps its readable keys
-- ("s1", "p10", "sup2") and the app can generate ids client-side while offline.

-- `kind` is a SALES CHANNEL, not a supply chain role: retail outlets serve
-- walk-in shoppers at products.price, wholesale outlets serve outside bulk
-- buyers at products.wholesale_price. Both are ordinary selling locations.
create table if not exists shops (
  id       text primary key,
  name     text not null,
  kind     text not null default 'retail' check (kind in ('retail', 'wholesale')),
  address  text default '',
  phone    text default '',
  active   boolean not null default true
);

create table if not exists users (
  id         text primary key,
  name       text not null,
  email      text not null unique,
  role       text not null check (role in ('admin', 'shop')),
  shop_id    text references shops(id) on delete set null,
  active     boolean not null default true,
  last_login text
);

create table if not exists suppliers (
  id      text primary key,
  name    text not null,
  contact text default '',
  phone   text default '',
  email   text default '',
  address text default '',
  notes   text default '',
  active  boolean not null default true
);

-- `wholesale_price` is null for products that are only sold at retail; the app
-- falls back to `price` in that case.
create table if not exists products (
  id              text primary key,
  barcode         text default '',
  name            text not null,
  category        text default '',
  brand           text default '',
  size            text,
  color           text,
  cost            numeric(12,2) not null default 0,
  price           numeric(12,2) not null default 0,
  wholesale_price numeric(12,2),
  low_alert       integer not null default 5,
  active          boolean not null default true
);

-- One row per product per shop. The composite key is what the app upserts on.
create table if not exists inventory (
  product_id text not null references products(id) on delete cascade,
  shop_id    text not null references shops(id) on delete cascade,
  qty        integer not null default 0,
  primary key (product_id, shop_id)
);

-- `lines` holds the sold items as JSONB. The app always reads and writes a sale
-- as a whole, so child tables would only add joins. Still queryable, e.g.
--   select * from sales, jsonb_to_recordset(lines) as l(name text, qty int);
-- A day session is one shop's trading day: opened when the shopkeeper unlocks
-- the door, closed when they lock up — which is often after midnight. Sales are
-- stamped with the session's business_date, so late-night takings still land on
-- the day the shop opened rather than splitting across two calendar dates.
--
-- The closing figures settle the till: what was counted, what the owner took
-- away, and what stayed as the next morning's float.
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

-- At most one session may be open per shop, or every sale would be counted
-- twice. Enforced in the database because the app is not the only possible
-- writer. (A partial unique index applies only to the rows it filters on.)
create unique index if not exists day_sessions_one_open_per_shop
  on day_sessions (shop_id) where status = 'open';

-- Buyers you deal with by name: mostly trade customers at a wholesale counter
-- who take stock on account and settle later. `credit_limit` of 0 means no
-- limit is enforced.
create table if not exists customers (
  id           text primary key,
  name         text not null,
  contact      text default '',
  phone        text default '',
  address      text default '',
  notes        text default '',
  kind         text not null default 'retail' check (kind in ('retail', 'wholesale')),
  credit_limit numeric(12,2) not null default 0,
  active       boolean not null default true
);

-- Money received against what a customer already owes. Deliberately NOT a
-- column on customers: a stored balance drifts the moment a sale is edited or
-- returned, so the balance is always summed from sales and these rows.
create table if not exists customer_payments (
  id          text primary key,
  customer_id text not null references customers(id) on delete cascade,
  date        date not null,
  amount      numeric(12,2) not null default 0,
  method      text not null default 'Cash' check (method in ('Cash', 'Card', 'Online')),
  shop_id     text not null references shops(id) on delete cascade,
  session_id  text references day_sessions(id) on delete set null,
  note        text default '',
  received_by text default ''
);

-- `payment = 'Credit'` means the goods left but the money did not. Such a sale
-- still counts towards takings and profit, but contributes nothing to the
-- drawer, so the day's cash count must exclude it.
create table if not exists sales (
  id            text primary key,
  invoice       text not null,
  shop_id       text not null references shops(id) on delete cascade,
  date          timestamptz not null,
  business_date date,
  session_id    text references day_sessions(id) on delete set null,
  customer      text default '',
  customer_id   text references customers(id) on delete set null,
  cashier       text default '',
  lines         jsonb not null default '[]'::jsonb,
  subtotal      numeric(12,2) not null default 0,
  discount      numeric(12,2) not null default 0,
  total         numeric(12,2) not null default 0,
  profit        numeric(12,2) not null default 0,
  payment       text not null default 'Cash' check (payment in ('Cash', 'Card', 'Online', 'Credit')),
  status        text not null default 'Completed' check (status in ('Completed', 'Returned', 'Partial')),
  synced        boolean not null default true
);

-- Your own stock moving between your own locations — internal distribution,
-- never a sale. One row covers both sides of the movement.
create table if not exists transfers (
  id           text primary key,
  transfer_no  text not null,
  date         date not null,
  from_shop_id text not null references shops(id) on delete cascade,
  to_shop_id   text not null references shops(id) on delete cascade,
  items        jsonb not null default '[]'::jsonb,
  notes        text default '',
  created_by   text default '',
  -- Stock cannot move from a shop to itself; that would silently do nothing.
  constraint transfers_distinct_shops check (from_shop_id <> to_shop_id)
);

-- `created_by_shop_id` is set when a shopkeeper bought stock in themselves,
-- rather than head office buying on their behalf.
create table if not exists purchases (
  id                  text primary key,
  bill_no             text not null,
  supplier            text not null,
  supplier_id         text references suppliers(id) on delete set null,
  date                date not null,
  lines               jsonb not null default '[]'::jsonb,
  total               numeric(12,2) not null default 0,
  created_by          text default '',
  created_by_shop_id  text references shops(id) on delete set null,
  paid                boolean not null default true
);

-- `session_id` marks money that came out of the till while the day was open, so
-- the evening cash count subtracts it.
create table if not exists expenses (
  id          text primary key,
  date        date not null,
  shop_id     text not null references shops(id) on delete cascade,
  category    text not null default 'Misc',
  description text default '',
  amount      numeric(12,2) not null default 0,
  added_by    text default '',
  session_id  text references day_sessions(id) on delete set null
);

create table if not exists returns (
  id          text primary key,
  kind        text not null check (kind in ('customer', 'supplier')),
  return_no   text not null,
  date        date not null,
  shop_id     text not null references shops(id) on delete cascade,
  invoice     text not null,
  supplier    text,
  supplier_id text references suppliers(id) on delete set null,
  items       jsonb not null default '[]'::jsonb,
  refund      numeric(12,2) not null default 0,
  reason      text default ''
);

-- Business settings and discount rules are a single row of JSONB, so adding a
-- setting later needs no migration.
create table if not exists app_state (
  id        text primary key default 'singleton',
  settings  jsonb not null default '{}'::jsonb,
  discounts jsonb not null default '{}'::jsonb
);

-- Indexes for the lookups the app actually performs.
create index if not exists sales_shop_date_idx    on sales (shop_id, date desc);
create index if not exists sales_invoice_idx      on sales (invoice);
-- The dashboard and reports group by TRADING day, not calendar day.
create index if not exists sales_business_day_idx on sales (shop_id, business_date desc);
create index if not exists sales_session_idx      on sales (session_id);
create index if not exists day_sessions_shop_idx  on day_sessions (shop_id, business_date desc);
create index if not exists transfers_from_idx     on transfers (from_shop_id, date desc);
create index if not exists transfers_to_idx       on transfers (to_shop_id, date desc);
create index if not exists expenses_session_idx   on expenses (session_id);
create index if not exists sales_customer_idx     on sales (customer_id, date desc);
create index if not exists cust_pay_customer_idx  on customer_payments (customer_id, date desc);
create index if not exists cust_pay_session_idx   on customer_payments (session_id);
create index if not exists purchases_supplier_idx on purchases (supplier_id);
create index if not exists purchases_date_idx     on purchases (date desc);
create index if not exists expenses_shop_date_idx on expenses (shop_id, date desc);
create index if not exists returns_kind_date_idx  on returns (kind, date desc);
create index if not exists products_barcode_idx   on products (barcode);

-- =====================================================================
--  Row Level Security
--
--  RLS is ON, with policies that currently allow anyone holding the anon key
--  to read and write. That matches the app today: it still uses its own demo
--  login, so Postgres has no way to tell one user from another.
--
--  >>> This means anyone with your anon key (which ships in the browser bundle)
--  >>> can read and modify this data. Fine for demo data; NOT for real
--  >>> customer or sales records.
--
--  When Supabase Auth is added, replace each policy below with one based on
--  auth.uid() / the user's shop, e.g.:
--    create policy "shop reads own sales" on sales for select
--      using (shop_id = (select shop_id from users where id = auth.uid()::text));
-- =====================================================================

do $$
declare t text;
begin
  foreach t in array array['shops','users','suppliers','products','inventory','sales','purchases','expenses','returns','day_sessions','transfers','customers','customer_payments','app_state']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "demo_open_access" on %I', t);
    execute format(
      'create policy "demo_open_access" on %I for all to anon, authenticated using (true) with check (true)', t);
    -- Explicit grants so the table is reachable through the Data API even if
    -- "Automatically expose new tables" was switched off on the project.
    execute format('grant select, insert, update, delete on %I to anon, authenticated', t);
  end loop;
end $$;
