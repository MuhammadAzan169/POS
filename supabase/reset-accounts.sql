-- ===========================================================================
-- WIPE ALL LOGINS — start the account setup over
--
-- Deletes every login and every profile, so the app returns to its first-run
-- state and /admin offers "Create the owner account" again.
--
-- Use this while setting the system up, or before handing it to a client so
-- they claim the owner account themselves. It touches ACCOUNTS ONLY — shops,
-- products, sales and every other record are left exactly as they are.
--
-- THIS CANNOT BE UNDONE.
--
-- HOW TO RUN
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
-- ===========================================================================

-- Profiles first, explicitly.
--
-- `staff.id` cascades from auth.users, so deleting the logins would normally
-- take these with them — but a profile can outlive its login if the two were
-- ever cleaned up in the wrong order, and the symptom is confusing: the app
-- reports "this system already has an owner" while refusing to let anyone in
-- as one. Clearing both, in this order, cannot leave that state behind.
delete from staff;
delete from auth.users;

-- All three should read 0, 0, false.
select
  (select count(*) from auth.users) as logins,
  (select count(*) from staff)      as profiles,
  has_owner()                       as owner_claimed;
