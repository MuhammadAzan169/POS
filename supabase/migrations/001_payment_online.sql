-- =====================================================================
--  Migration 001 — payment method "Other" becomes "Online"
--
--  Run this in the Supabase SQL Editor if your database was created before
--  this change. schema.sql already has the new constraint, but
--  `create table if not exists` never alters an existing table, so an
--  existing project needs this.
--
--  Safe to run more than once.
-- =====================================================================

-- Drop the old constraint (its generated name is <table>_<column>_check).
alter table sales drop constraint if exists sales_payment_check;

-- Any rows already recorded as 'Other' become 'Online'.
update sales set payment = 'Online' where payment = 'Other';

-- Re-apply with the new set of allowed values.
alter table sales
  add constraint sales_payment_check
  check (payment in ('Cash', 'Card', 'Online'));
