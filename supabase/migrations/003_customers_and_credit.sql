-- =====================================================================
--  003 — Customers and credit (khata)
--
--  Run this AFTER 002. Safe to re-run: every statement is idempotent, and
--  nothing here drops or rewrites existing data.
--
--  What it adds:
--    * customers          — buyers you deal with by name, mostly trade buyers
--    * customer_payments  — money received against what they owe
--    * sales.customer_id  — links an invoice to a saved customer
--    * payment = 'Credit' — goods out now, money later
--
--  Balances are deliberately NOT stored on the customer row. They are summed
--  from sales and payments every time, because a stored total drifts the first
--  time a sale is edited, deleted or returned and then quietly disagrees with
--  the invoices it was meant to summarise.
-- =====================================================================

/* ----------------------------------------------------------------- customers */

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

/* ------------------------------------------------- link sales to a customer */

alter table sales add column if not exists customer_id text references customers(id) on delete set null;

/* --------------------------------------------------- allow Credit as payment

   The original CHECK constraint only permitted Cash/Card/Online, so a credit
   sale would be rejected outright. Replace it rather than adding a second one:
   two CHECKs both have to pass, and the old one never would.
                                                                            */
do $$
declare c text;
begin
  -- Drop whatever the payment CHECK is currently called; Postgres names it
  -- sales_payment_check by default, but a hand-created schema may differ.
  for c in
    select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
     where rel.relname = 'sales'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%payment%'
  loop
    execute format('alter table sales drop constraint %I', c);
  end loop;

  alter table sales
    add constraint sales_payment_check
    check (payment in ('Cash', 'Card', 'Online', 'Credit'));
end $$;

/* ------------------------------------------------------------------ indexes */

create index if not exists sales_customer_idx    on sales (customer_id, date desc);
create index if not exists cust_pay_customer_idx on customer_payments (customer_id, date desc);
create index if not exists cust_pay_session_idx  on customer_payments (session_id);

/* --------------------------------------------------- RLS for the new tables

   Same open policy the other tables already use: anyone with the anon key can
   read and write. See the warning at the bottom of schema.sql — this is fine
   for demo data and NOT for real customer records.
                                                                            */
do $$
declare t text;
begin
  foreach t in array array['customers','customer_payments']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "demo_open_access" on %I', t);
    execute format(
      'create policy "demo_open_access" on %I for all to anon, authenticated using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on %I to anon, authenticated', t);
  end loop;
end $$;
