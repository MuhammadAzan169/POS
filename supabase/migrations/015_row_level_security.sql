-- ===========================================================================
-- Row-level security for the business data.
--
-- Until now every table carried one policy — `for all to anon, authenticated
-- using (true)` — which was honest while the app had its own pretend login, and
-- is a hole the moment it holds a real shop's money. The anon key ships inside
-- the page, so "open to anon" means open to anyone who views source.
--
-- The rules this file enforces:
--
--   nobody signed out    sees nothing, writes nothing, anywhere
--   the owner            sees and does everything
--   a shop worker        sees and does their OWN SHOP only, and may not touch
--                        prices, other shops, or the money owed between the
--                        business and its suppliers
--
-- Both roles are read through `is_admin()` and `my_shop()` from migration 011.
-- They are SECURITY DEFINER, which matters for two reasons: they can read
-- `staff` without the caller being allowed to, and they do not re-enter the
-- policy that called them — the recursion that broke migration 011.
--
-- `my_shop()` returns null unless the worker is active AND their shop is
-- active, so switching either off ends access on the next statement rather than
-- whenever a token happens to expire.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Clear the old blanket policy and take the grants away from anon.
--
-- Revoking the grant matters as much as dropping the policy: a policy decides
-- which rows, a grant decides whether the table can be touched at all, and
-- leaving anon with the grant would mean any future policy mistake is exposed
-- to the whole internet rather than to signed-in staff.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['shops','users','suppliers','products','inventory','sales','purchases','expenses','returns','day_sessions','transfers','customers','customer_payments','supplier_payments','set_offs','balance_adjustments','activity_log','messages','app_state']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "demo_open_access" on %I', t);
    execute format('revoke all on %I from anon', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Reference data: everyone signed in reads it, only the owner changes it.
--
-- A cashier needs product names and prices to sell anything, and shop names to
-- read a transfer — but must not be able to edit a price, which is the number
-- the business's margin is made of.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['shops','products','suppliers','app_state']
  loop
    execute format('drop policy if exists "read reference" on %I', t);
    execute format('create policy "read reference" on %I for select to authenticated using (has_access())', t);
    execute format('drop policy if exists "owner writes reference" on %I', t);
    execute format('create policy "owner writes reference" on %I for all to authenticated using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Owner-only, entirely: what the business owes its suppliers, and every
-- hand-made correction to a balance. None of it belongs to a counter.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['users','supplier_payments','set_offs','balance_adjustments']
  loop
    execute format('drop policy if exists "owner only" on %I', t);
    execute format('create policy "owner only" on %I for all to authenticated using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;

-- A worker may read their own row in the legacy users table, so a screen that
-- shows "signed in as" has something to show.
drop policy if exists "read own user row" on users;
create policy "read own user row" on users
  for select to authenticated using (id = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Customers are shared across the business.
--
-- A trade buyer walks into whichever branch is nearest, and their balance is
-- one balance — scoping them per shop would give the same person a different
-- account in each outlet. Staff may add and update, because that is a counter
-- job; deleting stays with the owner.
-- ---------------------------------------------------------------------------
drop policy if exists "staff use customers" on customers;
create policy "staff use customers" on customers
  for select to authenticated using (has_access());

drop policy if exists "staff add customers" on customers;
create policy "staff add customers" on customers
  for insert to authenticated with check (has_access());

drop policy if exists "staff edit customers" on customers;
create policy "staff edit customers" on customers
  for update to authenticated using (has_access()) with check (has_access());

-- ---------------------------------------------------------------------------
-- The shop's own records.
--
-- One policy per table, same shape: the owner, or the worker whose shop this
-- row belongs to. `with check` uses the same test as `using`, so a worker
-- cannot write a row into somebody else's shop any more than they can read one.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['inventory','sales','expenses','returns','day_sessions','customer_payments','messages']
  loop
    execute format('drop policy if exists "own shop" on %I', t);
    execute format(
      'create policy "own shop" on %I for all to authenticated
         using (is_admin() or shop_id = my_shop())
         with check (is_admin() or shop_id = my_shop())', t);
  end loop;
end $$;

-- A transfer has two ends, and both shops need to see it: the one sending the
-- stock and the one receiving it.
drop policy if exists "own shop" on transfers;
create policy "own shop" on transfers
  for all to authenticated
  using (is_admin() or from_shop_id = my_shop() or to_shop_id = my_shop())
  with check (is_admin() or from_shop_id = my_shop() or to_shop_id = my_shop());

-- Purchases are the owner's business — what stock cost, and from whom. A shop
-- sees only the bills it raised itself, which is how a shopkeeper who buys
-- something in locally still sees their own entry.
drop policy if exists "own shop" on purchases;
create policy "own shop" on purchases
  for all to authenticated
  using (is_admin() or created_by_shop_id = my_shop())
  with check (is_admin() or created_by_shop_id = my_shop());

-- The activity log records deletions and edits. A worker sees what happened at
-- their own counter; the owner sees everything, which is the point of it.
drop policy if exists "own shop" on activity_log;
create policy "own shop" on activity_log
  for all to authenticated
  using (is_admin() or shop_id = my_shop())
  with check (is_admin() or shop_id = my_shop());

-- ---------------------------------------------------------------------------
-- What this looks like afterwards. Every row should name a policy, and none of
-- them should mention anon.
-- ---------------------------------------------------------------------------
select tablename, policyname, cmd, roles::text
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
