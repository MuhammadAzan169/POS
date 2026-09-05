-- ===========================================================================
-- ROW-LEVEL SECURITY — the real one.
--
-- Until now every table carried `demo_open_access`: `for all to anon,
-- authenticated using (true)`. That is what let the app run before there was
-- any sign-in, and it means exactly what it says — anybody holding the anon
-- key, which ships inside the JavaScript every visitor downloads, could read
-- and write every sale, cost price and customer balance without an account.
--
-- This replaces all of it with two questions, asked per row:
--
--   is_admin()   the owner. Sees and does everything.
--   my_shop()    the shop this signed-in worker belongs to, or NULL.
--
-- Both come from migration 011 and are SECURITY DEFINER, so they look at
-- `staff` without re-entering the policies being evaluated. `my_shop()` returns
-- NULL for a worker who has been switched off, OR whose shop has been switched
-- off — which is what makes deactivation take effect on the next request
-- rather than whenever a session happens to expire.
--
-- `anon` is granted nothing anywhere. Signing in is now the price of entry.
--
-- SAFE TO RE-RUN.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- Clear the old blanket policy and the grants that made it reachable.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'shops','users','suppliers','products','inventory','sales','purchases',
    'expenses','returns','day_sessions','transfers','customers',
    'customer_payments','supplier_payments','set_offs','balance_adjustments',
    'activity_log','messages','app_state'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "demo_open_access" on %I', t);
    -- Nothing anonymous, anywhere. Table-level first: a grant is what decides
    -- whether a role may touch the table at all, and no policy can loosen it.
    execute format('revoke all on %I from anon', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Reference data: everyone signed in may read it, only the owner may change it.
--
-- A cashier needs shop names to read a transfer, product names to sell, and the
-- business settings to print a bill. None of that is worth hiding from someone
-- who already works there, and hiding it would break the till.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['shops','users','suppliers','products','app_state']
  loop
    execute format('drop policy if exists "read for staff" on %I', t);
    execute format(
      'create policy "read for staff" on %I for select to authenticated using (has_access())', t);

    execute format('drop policy if exists "owner writes" on %I', t);
    execute format(
      'create policy "owner writes" on %I for all to authenticated using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;

-- Products and customers are created at the counter, so a shop worker may add
-- and correct them — but not delete, which is how history goes missing.
drop policy if exists "staff add products" on products;
create policy "staff add products" on products
  for insert to authenticated with check (has_access());
drop policy if exists "staff edit products" on products;
create policy "staff edit products" on products
  for update to authenticated using (has_access()) with check (has_access());

-- ---------------------------------------------------------------------------
-- The shop's own records.
--
-- Same shape everywhere: the owner sees all of it, a worker sees the rows
-- belonging to their shop and no others.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'inventory','sales','expenses','returns','day_sessions',
    'customer_payments','messages'
  ]
  loop
    execute format('drop policy if exists "owner all" on %I', t);
    execute format(
      'create policy "owner all" on %I for all to authenticated using (is_admin()) with check (is_admin())', t);

    execute format('drop policy if exists "own shop" on %I', t);
    execute format(
      'create policy "own shop" on %I for all to authenticated
         using (shop_id = my_shop()) with check (shop_id = my_shop())', t);
  end loop;
end $$;

-- Purchases record which shop raised them in a differently named column.
drop policy if exists "owner all" on purchases;
create policy "owner all" on purchases
  for all to authenticated using (is_admin()) with check (is_admin());
drop policy if exists "own shop" on purchases;
create policy "own shop" on purchases
  for all to authenticated
  using (created_by_shop_id = my_shop())
  with check (created_by_shop_id = my_shop());

-- A transfer has two ends, and both shops need to see it: the one sending the
-- stock and the one receiving it. Only the sending shop may create or change
-- one, so goods cannot be moved out of a branch by the branch receiving them.
drop policy if exists "owner all" on transfers;
create policy "owner all" on transfers
  for all to authenticated using (is_admin()) with check (is_admin());
drop policy if exists "either end reads" on transfers;
create policy "either end reads" on transfers
  for select to authenticated
  using (from_shop_id = my_shop() or to_shop_id = my_shop());
drop policy if exists "sender writes" on transfers;
create policy "sender writes" on transfers
  for all to authenticated
  using (from_shop_id = my_shop())
  with check (from_shop_id = my_shop());

-- Customers are the whole business's, not one branch's: the same trade buyer
-- collects from whichever shop is nearest, and a balance split per branch would
-- be a different figure on every screen.
drop policy if exists "read for staff" on customers;
create policy "read for staff" on customers
  for select to authenticated using (has_access());
drop policy if exists "staff add customers" on customers;
create policy "staff add customers" on customers
  for insert to authenticated with check (has_access());
drop policy if exists "staff edit customers" on customers;
create policy "staff edit customers" on customers
  for update to authenticated using (has_access()) with check (has_access());
drop policy if exists "owner writes" on customers;
create policy "owner writes" on customers
  for all to authenticated using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- The owner's ledger: paying suppliers, cancelling debts against each other,
-- and moving a balance by hand. These decide what the business owes and is
-- owed, and they are reached from screens only the owner has. Owner only.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['supplier_payments','set_offs','balance_adjustments']
  loop
    execute format('drop policy if exists "owner only" on %I', t);
    execute format(
      'create policy "owner only" on %I for all to authenticated using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;

-- The deletion history. Anyone signed in may add to it — it is written as a
-- side effect of deleting something — but only the owner reads it, because it
-- is the record of what everyone else did.
drop policy if exists "owner reads log" on activity_log;
create policy "owner reads log" on activity_log
  for all to authenticated using (is_admin()) with check (is_admin());
drop policy if exists "staff append log" on activity_log;
create policy "staff append log" on activity_log
  for insert to authenticated with check (has_access());

commit;

-- ---------------------------------------------------------------------------
-- What the database now believes. Every table should list policies, and none
-- of them should mention `anon`.
-- ---------------------------------------------------------------------------
select tablename, policyname, cmd, roles::text
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
