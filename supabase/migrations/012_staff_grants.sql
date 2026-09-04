-- Table grants for `staff`.
--
-- Row-level security decides WHICH rows a role may touch; a grant decides
-- whether it may touch the table at all. Without the grant the policies never
-- get a chance to run, and the query fails outright — which is what happened
-- when the owner account was created successfully but the app could not read
-- the row back, and reported "could not sign in" for an account that existed.
--
-- This project does not hand out grants automatically (see the same explicit
-- grants at the bottom of schema.sql), so `staff` needs its own.

-- Signed-in users only. `anon` is deliberately left out: nobody should be able
-- to read the staff list without signing in, and the two policies in migration
-- 011 then narrow this to "your own row", or "everything" for the owner.
grant select, insert, update, delete on staff to authenticated;

-- Reading it back is what the app does on every load, so make sure the policy
-- that allows it exists even if 011 was run before this file existed.
drop policy if exists "read own profile" on staff;
create policy "read own profile" on staff
  for select to authenticated
  using (id = auth.uid());
