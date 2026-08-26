-- =====================================================================
--  006 — Hand-made balance adjustments
--
--  Run this AFTER 005. Safe to re-run: every statement is idempotent, and
--  nothing here drops or rewrites existing data.
--
--  What it adds:
--    * balance_adjustments — the owner moving what a party owes by hand.
--
--  Three things need it and nothing else provides them:
--
--    * Writing off a bad debt. A customer who will never pay leaves a
--      receivable on the books for ever, overstating what the business is
--      worth. The owner needs to say "that money is gone" WITHOUT deleting
--      the invoices, which are the record of goods that really left the shop.
--    * An opening balance. Somebody already owed you when you started using
--      the app. There is no invoice to point at, but the debt is real.
--    * An agreed correction — rounding an old account off, goodwill, a late
--      fee. The small movements every khata has.
--
--  `amount` is SIGNED, always in the direction of what is owed: negative
--  writes debt off, positive adds to it. One signed number rather than a kind
--  plus a magnitude, so the arithmetic needs no branch and the stored figure
--  cannot disagree with its own label.
--
--  Nothing here moves money, so an adjustment never reaches a till or a day's
--  cash count — exactly like a set-off.
-- =====================================================================

/* --------------------------------------------------- balance adjustments

   Exactly one of customer_id / supplier_id is set. A row naming both would be
   counted by whichever balance happened to look for it first; a row naming
   neither would be counted by nobody and silently do nothing. The CHECK makes
   both impossible rather than leaving it to the application.
                                                                            */

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

/* ------------------------------------------------------------------ indexes */

create index if not exists adj_customer_idx on balance_adjustments (customer_id, date desc);
create index if not exists adj_supplier_idx on balance_adjustments (supplier_id, date desc);

/* --------------------------------------------------- RLS for the new table

   Same open policy the other tables already use: anyone with the anon key can
   read and write. See the warning at the bottom of schema.sql.

   Worth saying plainly here: this table can erase a debt in one row. Once real
   customer balances are in play it is the first thing that should be locked to
   an owner role, ahead of everything else in the schema.
                                                                            */
do $$
begin
  alter table balance_adjustments enable row level security;
  drop policy if exists "demo_open_access" on balance_adjustments;
  create policy "demo_open_access" on balance_adjustments
    for all to anon, authenticated using (true) with check (true);
  grant select, insert, update, delete on balance_adjustments to anon, authenticated;
end $$;
