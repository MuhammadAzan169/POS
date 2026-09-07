-- ===========================================================================
-- Rebuilds every data policy from a clean slate.
--
-- Migration 015 added the right policies but did not remove older ones, and
-- policies are OR'd together: one permissive leftover is enough to undo all of
-- them. A live test caught exactly that — a cashier could still change a
-- product's price, because some earlier policy on `products` still allowed it
-- alongside the new read-only one.
--
-- So this drops EVERY policy on these tables by name, whatever it is called and
-- wherever it came from, and then creates only the intended set. Running it
-- twice leaves the same result as running it once, which is the property that
-- was missing before.
--
-- `staff` is left alone: its two policies are correct and already tested.
-- ===========================================================================

do $$
declare
  t text;
  p record;
  tables text[] := array[
    'shops','users','suppliers','products','inventory','sales','purchases',
    'expenses','returns','day_sessions','transfers','customers',
    'customer_payments','supplier_payments','set_offs','balance_adjustments',
    'activity_log','messages','app_state'
  ];
begin
  foreach t in array tables
  loop
    -- Every policy on the table, by name, regardless of origin.
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy %I on %I', p.policyname, t);
    end loop;

    execute format('alter table %I enable row level security', t);
    -- A policy says which rows; a grant says whether the table can be reached
    -- at all. Anonymous visitors lose the second, so a future policy mistake is
    -- exposed to signed-in staff rather than to the internet.
    execute format('revoke all on %I from anon', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop;
end $$;

-- ------------------------------------------------- reference data: read-only
-- A cashier needs prices to sell; the price itself is the owner's to set.
do $$
declare t text;
begin
  foreach t in array array['shops','products','suppliers','app_state']
  loop
    execute format('create policy "read reference" on %I for select to authenticated using (has_access())', t);
    execute format('create policy "owner writes reference" on %I for all to authenticated using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;

-- ------------------------------------------------------------- owner only
do $$
declare t text;
begin
  foreach t in array array['users','supplier_payments','set_offs','balance_adjustments']
  loop
    execute format('create policy "owner only" on %I for all to authenticated using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;

create policy "read own user row" on users
  for select to authenticated using (id = auth.uid()::text);

-- ------------------------------------------- customers: shared, not per shop
-- One buyer has one balance, whichever branch they walk into.
create policy "staff use customers" on customers
  for select to authenticated using (has_access());
create policy "staff add customers" on customers
  for insert to authenticated with check (has_access());
create policy "staff edit customers" on customers
  for update to authenticated using (has_access()) with check (has_access());

-- --------------------------------------------------------- the shop's own
do $$
declare t text;
begin
  foreach t in array array['inventory','sales','expenses','returns','day_sessions','customer_payments','messages','activity_log']
  loop
    execute format(
      'create policy "own shop" on %I for all to authenticated
         using (is_admin() or shop_id = my_shop())
         with check (is_admin() or shop_id = my_shop())', t);
  end loop;
end $$;

-- Both ends of a transfer can see it.
create policy "own shop" on transfers
  for all to authenticated
  using (is_admin() or from_shop_id = my_shop() or to_shop_id = my_shop())
  with check (is_admin() or from_shop_id = my_shop() or to_shop_id = my_shop());

-- A shop sees only the purchase bills it raised itself.
create policy "own shop" on purchases
  for all to authenticated
  using (is_admin() or created_by_shop_id = my_shop())
  with check (is_admin() or created_by_shop_id = my_shop());

-- ---------------------------------------------------------------- the result
-- `products` should have exactly two rows here: "read reference" (SELECT) and
-- "owner writes reference" (ALL). Anything else on it is a leftover.
select tablename, policyname, cmd, roles::text
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
