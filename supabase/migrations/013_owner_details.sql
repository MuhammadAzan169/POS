-- The owner's own details, captured when they claim the account.
--
-- A phone number belongs on the profile rather than only in the business
-- settings: it is how you reach the PERSON who owns the login, which is not
-- always the number printed on the shop's bills.

alter table staff add column if not exists phone text;

-- Replaces the two-argument version from migration 011. Same guarantees: the
-- caller must be signed in, and the unique index on `role = 'admin'` means only
-- the first claim can ever succeed, however many people call this at once.
create or replace function claim_owner(owner_name text, owner_phone text default null)
returns staff
language plpgsql security definer set search_path = public as $$
declare
  claimed staff;
begin
  if auth.uid() is null then
    raise exception 'Sign in first';
  end if;

  if exists (select 1 from staff where role = 'admin') then
    raise exception 'This system already has an owner';
  end if;

  insert into staff (id, name, role, shop_id, active, phone)
  values (
    auth.uid(),
    coalesce(nullif(trim(owner_name), ''), 'Owner'),
    'admin',
    null,
    true,
    nullif(trim(owner_phone), '')
  )
  returning * into claimed;

  return claimed;
end;
$$;

grant execute on function claim_owner(text, text) to authenticated;
