-- ===========================================================================
-- Accounts: who may sign in, and what they are allowed to be.
--
-- The rule this file exists to enforce: authentication says WHO you are, the
-- database says WHAT you are. A browser can obtain a session on its own — the
-- anon key ships inside the page — so it must never be able to assert a role.
-- Every role in this system comes from the `staff` table, and rows in it can
-- only be written by the two functions below.
-- ===========================================================================

create table if not exists staff (
  -- The Supabase auth account this profile belongs to. Deleting the account
  -- takes the profile with it, so a removed user cannot leave a live role
  -- behind.
  id        uuid primary key references auth.users(id) on delete cascade,
  name      text not null,
  role      text not null check (role in ('admin', 'shop')),
  -- Which outlet a shop worker belongs to. Null for the owner, who sees all.
  shop_id   text references shops(id) on delete set null,
  -- Switched off by the owner. Checked on every read and write, so access ends
  -- the moment it is unticked rather than whenever the session happens to
  -- expire — a worker dismissed at noon should not still be ringing up sales.
  active    boolean not null default true,
  created_at timestamptz not null default now()
);

-- At most one owner may be claimed through the UI. This index is what makes the
-- claim race-proof: two people pressing the button at the same moment cannot
-- both become admin, because the second insert violates it.
create unique index if not exists staff_single_owner
  on staff ((role)) where role = 'admin';

alter table staff enable row level security;

-- A signed-in user may read their own profile, and nothing else. This is how
-- the app discovers its own role; it is not a directory of everybody.
drop policy if exists "read own profile" on staff;
create policy "read own profile" on staff
  for select to authenticated
  using (id = auth.uid());

-- The owner may read and manage every profile.
drop policy if exists "owner manages staff" on staff;
create policy "owner manages staff" on staff
  for all to authenticated
  using (
    exists (
      select 1 from staff me
      where me.id = auth.uid() and me.role = 'admin' and me.active
    )
  )
  with check (
    exists (
      select 1 from staff me
      where me.id = auth.uid() and me.role = 'admin' and me.active
    )
  );

-- ---------------------------------------------------------------------------
-- Helpers the policies on every other table will use.
--
-- SECURITY DEFINER so they can look at `staff` without the caller needing
-- permission to read it, and STABLE so Postgres evaluates them once per query
-- rather than once per row.
-- ---------------------------------------------------------------------------

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from staff
    where id = auth.uid() and role = 'admin' and active
  );
$$;

-- The shop a signed-in worker belongs to, or null. An inactive worker belongs
-- to no shop, which is what makes deactivation take effect immediately.
create or replace function my_shop() returns text
language sql stable security definer set search_path = public as $$
  select shop_id from staff
  where id = auth.uid() and active and role = 'shop'
    and (shop_id is null or exists (
      -- A worker at a shop that has itself been deactivated loses access too.
      select 1 from shops s where s.id = staff.shop_id and s.active
    ));
$$;

create or replace function has_access() returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or my_shop() is not null;
$$;

-- ---------------------------------------------------------------------------
-- Is there an owner yet?
--
-- Called by the sign-in page before anyone has signed in, so it is readable by
-- anonymous visitors. It returns a single boolean and nothing else — no
-- addresses, no names, no count.
-- ---------------------------------------------------------------------------
create or replace function has_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where role = 'admin');
$$;

grant execute on function has_owner() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Claiming the owner account.
--
-- The first person to sign up becomes the owner, and the door then closes
-- permanently: every later call raises, whatever the caller does. That is why
-- this is safe to leave reachable — it is not guarded by a setting somebody has
-- to remember to switch off, and it cannot be re-opened from the browser.
--
-- If a stranger reaches the app before the client does, they would get the
-- owner account — so this is claimed once, immediately after deploying, and the
-- unique index above means nobody can take it afterwards.
-- ---------------------------------------------------------------------------
create or replace function claim_owner(owner_name text)
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

  insert into staff (id, name, role, shop_id, active)
  values (auth.uid(), coalesce(nullif(trim(owner_name), ''), 'Owner'), 'admin', null, true)
  returning * into claimed;

  return claimed;
end;
$$;

grant execute on function claim_owner(text) to authenticated;
