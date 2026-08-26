-- =====================================================================
--  008 — Profit per unit, set by the owner
--
--  Run this AFTER 007. Safe to re-run: every statement is idempotent, and
--  nothing here drops or rewrites existing data.
--
--  What it adds:
--    * products.profit_target           — rupees of profit per unit at retail
--    * products.wholesale_profit_target — the same at the wholesale counter
--
--  Why. Profit in this app is `price - cost`, frozen onto each invoice line at
--  the moment of sale. That is correct, and it is also why a delivery at a
--  higher rate used to eat the margin silently: the cost went up, the price
--  stayed where it was, and every sale afterwards earned less without anybody
--  choosing that.
--
--  A target inverts the relationship for products that have one. The owner
--  states the profit they want per unit, and the selling price becomes
--  cost + target — recalculated whenever a purchase bill changes the cost. The
--  margin then survives the next delivery instead of quietly shrinking.
--
--  NULL means the old behaviour, which stays the default: the price is whatever
--  was typed and the profit is whatever is left over. Nothing changes for a
--  product until somebody sets a figure here.
--
--  Past sales are untouched either way. Each invoice line stores the cost it
--  was sold at, so history never moves when a price or cost changes today.
-- =====================================================================

alter table products add column if not exists profit_target           numeric(12,2);
alter table products add column if not exists wholesale_profit_target numeric(12,2);

-- A negative target would mean deliberately selling below cost, which is a
-- decision to make on the price field directly rather than to arrive at by
-- arithmetic. The app clamps it too; this stops a hand-written UPDATE.
do $$
begin
  alter table products drop constraint if exists products_profit_target_check;
  alter table products
    add constraint products_profit_target_check
    check (
      (profit_target is null or profit_target >= 0)
      and (wholesale_profit_target is null or wholesale_profit_target >= 0)
    );
end $$;
