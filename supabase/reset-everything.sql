-- ===========================================================================
-- FULL RESET — back to a brand new system
--
-- Empties everything: every login, every shop, every product, every sale, and
-- the business settings. The structure is untouched — tables, policies and
-- functions all stay — so the app runs immediately afterwards and asks to be
-- set up from scratch at /admin.
--
-- This is the state the client should receive: nothing of yours left in it,
-- and the owner account theirs to claim.
--
-- THIS CANNOT BE UNDONE. If there is anything worth keeping, take a backup
-- first — Actions -> Nightly backup -> Run workflow, and wait for the artifact.
--
-- HOW TO RUN
--   Supabase dashboard -> SQL Editor -> New query -> paste all of this -> Run.
--   Expect a row of zeroes at the end, and owner_claimed = false.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Accounts.
--
-- Profiles explicitly before logins. `staff.id` cascades from auth.users so
-- deleting the logins would normally take the profiles with them — but a
-- profile that outlives its login leaves the system insisting it already has an
-- owner while refusing to let anyone in as one, which is a confusing state to
-- hand to someone else.
-- ---------------------------------------------------------------------------
delete from staff;
delete from auth.users;

-- ---------------------------------------------------------------------------
-- 2. The business records.
--
-- Ordered so that rows pointing at other rows go first. Postgres would sort
-- most of this out through the foreign keys, but being explicit means a failure
-- names the table it happened on rather than a constraint deep in a cascade.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 3. The settings row.
--
-- Holds the business name, the receipt and bill design, and any uploaded logo.
-- Removing it returns the app to its defaults, which the new owner then fills
-- in for their own business during setup.
-- ---------------------------------------------------------------------------
delete from app_state;

commit;

-- ---------------------------------------------------------------------------
-- Everything below should read 0, and owner_claimed should be false.
-- ---------------------------------------------------------------------------
select
  (select count(*) from auth.users) as logins,
  (select count(*) from staff)      as profiles,
  (select count(*) from shops)      as shops,
  (select count(*) from products)   as products,
  (select count(*) from sales)      as sales,
  (select count(*) from customers)  as customers,
  (select count(*) from suppliers)  as suppliers,
  (select count(*) from app_state)  as settings,
  has_owner()                       as owner_claimed;
