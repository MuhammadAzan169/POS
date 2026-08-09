-- =====================================================================
--  A-POS — database schema
--  Run this ONCE in the Supabase dashboard: SQL Editor -> New query -> Run.
--  Safe to re-run: every object is created with IF NOT EXISTS / OR REPLACE.
-- =====================================================================

-- Ids are text (not uuid) so the demo data keeps its readable keys
-- ("s1", "p10", "sup2") and the app can generate ids client-side while offline.

create table if not exists shops (
  id       text primary key,
  name     text not null,
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

create table if not exists products (
  id        text primary key,
  barcode   text default '',
  name      text not null,
  category  text default '',
  brand     text default '',
  size      text,
  color     text,
  cost      numeric(12,2) not null default 0,
  price     numeric(12,2) not null default 0,
  low_alert integer not null default 5,
  active    boolean not null default true
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
create table if not exists sales (
  id       text primary key,
  invoice  text not null,
  shop_id  text not null references shops(id) on delete cascade,
  date     timestamptz not null,
  customer text default '',
  cashier  text default '',
  lines    jsonb not null default '[]'::jsonb,
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  total    numeric(12,2) not null default 0,
  profit   numeric(12,2) not null default 0,
  payment  text not null default 'Cash' check (payment in ('Cash', 'Card', 'Other')),
  status   text not null default 'Completed' check (status in ('Completed', 'Returned', 'Partial')),
  synced   boolean not null default true
);

create table if not exists purchases (
  id          text primary key,
  bill_no     text not null,
  supplier    text not null,
  supplier_id text references suppliers(id) on delete set null,
  date        date not null,
  lines       jsonb not null default '[]'::jsonb,
  total       numeric(12,2) not null default 0
);

create table if not exists expenses (
  id          text primary key,
  date        date not null,
  shop_id     text not null references shops(id) on delete cascade,
  category    text not null default 'Misc',
  description text default '',
  amount      numeric(12,2) not null default 0,
  added_by    text default ''
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
  foreach t in array array['shops','users','suppliers','products','inventory','sales','purchases','expenses','returns','app_state']
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
