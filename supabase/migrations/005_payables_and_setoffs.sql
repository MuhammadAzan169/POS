-- =====================================================================
--  005 — Payables, credit purchases and set-offs
--
--  Run this AFTER 004. Safe to re-run: every statement is idempotent, and
--  nothing here drops or rewrites existing data.
--
--  What it adds:
--    * purchases.payment / amount_paid / due_date / session_id
--        — a bill can now be paid in full, part paid, or wholly on account,
--          with a due date and the till the cash came out of. The old
--          `paid` boolean stays and is kept in step, so anything still
--          reading it keeps working.
--    * supplier_payments — money paid to a supplier, or placed with them in
--          advance. The mirror image of customer_payments.
--    * set_offs          — a debt cancelled against a debt, for a partner you
--          both buy from and sell to.
--    * customers.linked_supplier_id — ties a customer record to the supplier
--          record for the SAME business, which is what makes a set-off
--          possible in the first place.
--
--  As everywhere else in this app, no balance is stored. What a supplier is
--  owed is summed from their bills, payments, returns and set-offs each time,
--  so editing a bill can never leave a total behind that disagrees with it.
-- =====================================================================

/* ------------------------------------------------- credit terms on a bill */

alter table purchases add column if not exists payment     text;
alter table purchases add column if not exists amount_paid numeric(12,2);
alter table purchases add column if not exists due_date    date;
alter table purchases add column if not exists session_id  text references day_sessions(id) on delete set null;

-- Added as a named constraint rather than inline so re-running this file
-- replaces it instead of stacking a second copy that must also pass.
do $$
begin
  alter table purchases drop constraint if exists purchases_payment_check;
  alter table purchases
    add constraint purchases_payment_check
    check (payment is null or payment in ('Cash', 'Card', 'Online', 'Credit'));
end $$;

/* --------------------------------------------------------- supplier payments

   shop_id is NULLABLE on purpose: head office pays most bills by transfer,
   with no till behind it. A payment that names a shop is cash out of that
   shop's drawer and the evening count has to expect it to be gone.
                                                                            */

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

/* ----------------------------------------------------------------- set-offs

   No money moves in a set-off, which is exactly why it gets its own table
   rather than being written as a fake payment on each side: the statement
   should say what happened, and deleting the row has to put both balances
   back exactly as they were.
                                                                            */

create table if not exists set_offs (
  id          text primary key,
  date        date not null,
  customer_id text not null references customers(id) on delete cascade,
  supplier_id text not null references suppliers(id) on delete cascade,
  amount      numeric(12,2) not null default 0,
  note        text default '',
  created_by  text default ''
);

/* --------------------------------------- the same business on both sides */

alter table customers
  add column if not exists linked_supplier_id text references suppliers(id) on delete set null;

/* ------------------------------------------------------------------ indexes */

create index if not exists sup_pay_supplier_idx on supplier_payments (supplier_id, date desc);
create index if not exists sup_pay_session_idx  on supplier_payments (session_id);
create index if not exists set_off_customer_idx on set_offs (customer_id, date desc);
create index if not exists set_off_supplier_idx on set_offs (supplier_id, date desc);
create index if not exists purchases_supplier_idx on purchases (supplier_id, date desc);
create index if not exists purchases_session_idx on purchases (session_id);

/* --------------------------------------------------- RLS for the new tables

   Same open policy the other tables already use: anyone with the anon key can
   read and write. See the warning at the bottom of schema.sql — this is fine
   for demo data and NOT for real supplier or customer records.
                                                                            */
do $$
declare t text;
begin
  foreach t in array array['supplier_payments','set_offs']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "demo_open_access" on %I', t);
    execute format(
      'create policy "demo_open_access" on %I for all to anon, authenticated using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on %I to anon, authenticated', t);
  end loop;
end $$;
