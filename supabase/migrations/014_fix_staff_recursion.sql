-- ===========================================================================
-- Fixes an infinite recursion in the `staff` policies.
--
-- Migration 011 wrote the owner's policy as a subquery over `staff` itself:
--
--   using (exists (select 1 from staff me where me.id = auth.uid() ...))
--
-- Reading `staff` then evaluates that policy, which reads `staff`, which
-- evaluates the policy... Postgres detects it and raises "infinite recursion
-- detected in policy for relation staff", and because policies are evaluated
-- together, the error takes down the perfectly good "read own row" policy
-- alongside it.
--
-- The symptom was baffling from the outside: creating the owner account
-- SUCCEEDED — the row is there, has_owner() returns true — but the app could
-- not read the row back one line later, and reported "could not sign in" for an
-- account that had just been created.
--
-- The fix is to ask the question through `is_admin()`, which is SECURITY
-- DEFINER: it runs as the table's owner, for whom row-level security is not
-- applied, so the lookup does not re-enter the policy it is being called from.
-- ===========================================================================

drop policy if exists "owner manages staff" on staff;
create policy "owner manages staff" on staff
  for all to authenticated
  using (is_admin())
  with check (is_admin());

-- Unchanged in behaviour, restated so this file is enough on its own: everyone
-- signed in may read their own row, which is how the app learns its own role.
drop policy if exists "read own profile" on staff;
create policy "read own profile" on staff
  for select to authenticated
  using (id = auth.uid());

grant select, insert, update, delete on staff to authenticated;

-- Should list exactly the two policies above.
select policyname, cmd from pg_policies where tablename = 'staff' order by policyname;
