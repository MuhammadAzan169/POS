-- ===========================================================================
-- WIPE ALL LOGINS — start the account setup over
--
-- Deletes every login and every profile, so the app goes back to its first-run
-- state: /admin will offer "Create the owner account" again.
--
-- Use this while setting the system up, or before handing it to a client so
-- they claim the owner account themselves. It touches accounts ONLY — shops,
-- products, sales and every other record are left exactly as they are.
--
-- THIS CANNOT BE UNDONE. Anyone signed in is signed out for good and will need
-- a new account.
--
-- HOW TO RUN
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
-- ===========================================================================

-- `staff.id` references auth.users with `on delete cascade`, so removing the
-- login removes the profile with it — no second delete, and no chance of
-- leaving a profile pointing at an account that no longer exists.
delete from auth.users;

-- Should both be 0, and has_owner() should now be false.
select
  (select count(*) from auth.users) as logins,
  (select count(*) from staff)      as profiles,
  has_owner()                       as owner_claimed;
