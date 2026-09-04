-- ===========================================================================
-- WIPE ALL DATA — hand-over reset
--
-- Empties every table so the client starts on a clean database, and leaves the
-- structure exactly as it is. Run this ONCE, when the demo data has served its
-- purpose and before the shop records anything real.
--
-- THIS CANNOT BE UNDONE. Everything below is deleted:
--   every sale, purchase, return, transfer and expense
--   every customer, supplier and the balances derived from them
--   every product, shop, user, message and day book entry
--   the settings row, including the bill design and any logos
--
-- Take a backup first — Settings -> Export backup, or the nightly job in
-- .github/workflows/backup.yml if that is already running.
--
-- HOW TO RUN
--   Supabase dashboard -> SQL Editor -> New query -> paste all of this -> Run.
--
-- AFTERWARDS
--   The app opens on an empty system. Create the shops first, then products,
--   then staff — inventory and sales hang off a shop, so nothing else can be
--   added until at least one exists.
-- ===========================================================================

begin;

-- Order matters where rows reference each other: the things that point at
-- something else go before the things they point at.
delete from set_offs;
delete from balance_adjustments;
delete from customer_payments;
delete from supplier_payments;
delete from returns;
delete from transfers;
delete from sales;
delete from purchases;
delete from expenses;
delete from day_sessions;
delete from activity_log;
delete from messages;
delete from inventory;
delete from customers;
delete from suppliers;
delete from products;
delete from users;
delete from shops;

-- The settings row holds the business name, the receipt and bill design, and
-- any uploaded logo. Removing it puts the app back on its defaults, which the
-- owner then fills in for their own business.
delete from app_state;

commit;

-- A quick count to confirm. Every number should be 0.
select
  (select count(*) from shops)     as shops,
  (select count(*) from users)     as users,
  (select count(*) from products)  as products,
  (select count(*) from sales)     as sales,
  (select count(*) from purchases) as purchases,
  (select count(*) from customers) as customers,
  (select count(*) from suppliers) as suppliers,
  (select count(*) from app_state) as settings;
