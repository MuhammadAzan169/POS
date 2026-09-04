-- Per-shop bill design.
--
-- A branch that sends a delivery challan with its own terms, while the rest of
-- the group sends an invoice, keeps those differences here.
--
-- Only the OVERRIDDEN parts are stored, not a copy of the whole design: a shop
-- that changes nothing but the title keeps following the business-wide design
-- for everything else, so a group-wide change still reaches it. Null means the
-- outlet follows the business design entirely.

alter table shops add column if not exists bill jsonb;
