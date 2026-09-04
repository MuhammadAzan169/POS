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
  -- This outlet's own logo for its bills, as a data URL. Null falls back to the
  -- business-wide logo held in app_state.
  logo     text,
  -- Only the parts of the bill design this outlet wants differently; null means
  -- it follows the business-wide design in app_state entirely.
  bill     jsonb,
  active   boolean not null default true
);
alter table shops add column if not exists logo text;
alter table shops add column if not exists bill jsonb;

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
  -- The profit the owner wants per unit. When set, the selling price becomes
  -- cost + this and is recalculated whenever a bill changes the cost, so a
  -- delivery at a higher rate moves the PRICE instead of eating the margin.
  -- NULL keeps the older behaviour: price as typed, profit whatever is left.
  profit_target   numeric(12,2),
  wholesale_profit_target numeric(12,2),
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
  -- The supplier record for the SAME business, when you both buy from and sell
  -- to them. What makes a set-off possible.
  linked_supplier_id text references suppliers(id) on delete set null,
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

-- Money paid OUT to a supplier — settling their bills, or placed with them
-- ahead of a delivery. The mirror image of customer_payments, and deliberately
-- the same shape: both sides of the business run on "goods now, money later".
--
-- shop_id is nullable on purpose: head office pays most bills by transfer, with
-- no till behind it. A payment that names a shop is cash out of that drawer and
-- the evening count has to expect it to be gone.
create table if not exists supplier_payments (
  id          text primary key,
  supplier_id text not null references suppliers(id) on delete cascade,
  date        date not null,
  amount      numeric(12,2) not null default 0,
  method      text not null default 'Cash' check (method in ('Cash', 'Card', 'Online')),
  shop_id     text references shops(id) on delete set null,
  session_id  text references day_sessions(id) on delete set null,
  note        text default '',
  paid_by     text default ''
);

-- Two debts between the same business cancelled against each other. No money
-- moves, which is exactly why it is its own row rather than a fake payment on
-- each side: the statement should say what happened, and deleting it has to put
-- both balances back exactly as they were.
create table if not exists set_offs (
  id          text primary key,
  date        date not null,
  customer_id text not null references customers(id) on delete cascade,
  supplier_id text not null references suppliers(id) on delete cascade,
  amount      numeric(12,2) not null default 0,
  note        text default '',
  created_by  text default ''
);

-- The owner moving what a party owes by hand: writing off a bad debt, carrying
-- in a balance from before the app, or agreeing a correction.
--
-- `amount` is SIGNED, always in the direction of what is owed — negative writes
-- debt off, positive adds to it. Exactly one of customer_id / supplier_id is
-- set: a row naming both would be counted by whichever balance looked for it
-- first, and a row naming neither would silently do nothing.
--
-- Nothing here moves money, so an adjustment never reaches a till or a cash
-- count. It can erase a debt in one row, so it is the first table that should
-- be locked to an owner role once real balances are in play.
create table if not exists balance_adjustments (
  id          text primary key,
  date        date not null,
  customer_id text references customers(id) on delete cascade,
  supplier_id text references suppliers(id) on delete cascade,
  amount      numeric(12,2) not null default 0,
  reason      text default '',
  created_by  text default '',
  constraint balance_adjustments_one_side check (
    (customer_id is not null and supplier_id is null)
    or (customer_id is null and supplier_id is not null)
  )
);

-- Who deleted or edited a money document, when, and the whole record as it
-- stood so it can be put back.
--
-- Without this a shopkeeper could delete an invoice and the owner would never
-- know: no gap anybody would notice, nothing in the day book, and the takings
-- quietly lower. `snapshot` holds the whole row as JSONB, which is what makes
-- restore real — it re-inserts the original id and invoice number rather than a
-- fresh copy, so nothing is renumbered.
--
-- APPEND-ONLY BY INTENT: the app never deletes from here, and `restored_at` is
-- stamped rather than the row removed. "Deleted on the 3rd, put back on the
-- 5th" is the true history and both halves matter.
create table if not exists activity_log (
  id          text primary key,
  at          timestamptz not null default now(),
  action      text not null check (action in ('deleted', 'edited', 'restored')),
  entity      text not null check (entity in (
                'sale', 'purchase', 'return', 'transfer', 'expense',
                'day-session', 'customer-payment', 'supplier-payment',
                'set-off', 'adjustment')),
  -- Deliberately NOT a foreign key: the row it points at has usually been
  -- deleted, which is the whole reason the entry exists.
  entity_id   text not null,
  label       text default '',
  amount      numeric(12,2) not null default 0,
  shop_id     text references shops(id) on delete set null,
  by_user_id  text references users(id) on delete set null,
  by_name     text default '',
  by_role     text not null default 'shop' check (by_role in ('admin', 'shop')),
  snapshot    jsonb,
  restored_at timestamptz,
  restored_by text
);

-- One message thread per SHOP rather than per person: a shop is a place with a
-- till, and whoever is standing behind it needs the whole conversation.
create table if not exists messages (
  id            text primary key,
  shop_id       text not null references shops(id) on delete cascade,
  from_role     text not null check (from_role in ('admin', 'shop')),
  from_user_id  text,
  from_name     text not null default '',
  body          text not null,
  created_at    timestamptz not null default now(),
  read_by_admin boolean not null default false,
  read_by_shop  boolean not null default false
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
  -- Legacy all-or-nothing flag. Kept in step with amount_paid by the app so
  -- anything still reading it stays correct.
  paid                boolean not null default true,
  -- How the bill was settled. 'Credit' is stock in with the money still owed.
  payment             text check (payment is null or payment in ('Cash', 'Card', 'Online', 'Credit')),
  -- Paid up front. Less than total is a part payment, which is the common case.
  amount_paid         numeric(12,2),
  due_date            date,
  -- Set when a shopkeeper raised and paid the bill out of an open till.
  session_id          text references day_sessions(id) on delete set null
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
create index if not exists sup_pay_supplier_idx   on supplier_payments (supplier_id, date desc);
create index if not exists sup_pay_session_idx    on supplier_payments (session_id);
create index if not exists set_off_customer_idx   on set_offs (customer_id, date desc);
create index if not exists set_off_supplier_idx   on set_offs (supplier_id, date desc);
create index if not exists purchases_supplier_idx on purchases (supplier_id, date desc);
create index if not exists adj_customer_idx        on balance_adjustments (customer_id, date desc);
create index if not exists adj_supplier_idx        on balance_adjustments (supplier_id, date desc);
create index if not exists activity_at_idx          on activity_log (at desc);
create index if not exists activity_shop_idx        on activity_log (shop_id, at desc);
create index if not exists activity_entity_idx      on activity_log (entity, at desc);
create index if not exists purchases_supplier_idx on purchases (supplier_id);
create index if not exists purchases_date_idx     on purchases (date desc);
create index if not exists expenses_shop_date_idx on expenses (shop_id, date desc);
create index if not exists returns_kind_date_idx  on returns (kind, date desc);
create index if not exists products_barcode_idx   on products (barcode);
create index if not exists messages_shop_idx      on messages (shop_id, created_at desc);
create index if not exists messages_created_idx   on messages (created_at desc);

-- Realtime delivery is per-publication: without this a message is stored but
-- never pushed, so the chat would only update on a page reload.
do $$
begin
  alter publication supabase_realtime add table messages;
exception
  when duplicate_object then null;
  when undefined_object then null;  -- publication absent on a self-hosted setup
end $$;

-- Sends the whole row on UPDATE, so "marked as read" arrives with its contents.
alter table messages replica identity full;

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
  foreach t in array array['shops','users','suppliers','products','inventory','sales','purchases','expenses','returns','day_sessions','transfers','customers','customer_payments','supplier_payments','set_offs','balance_adjustments','activity_log','messages','app_state']
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
