-- =====================================================================
--  004 — Messages between the owner and each shop
--
--  Run this AFTER 003. Safe to re-run: every statement is idempotent, and
--  nothing here drops or rewrites existing data.
--
--  What it adds:
--    * messages — one row per message, in a thread belonging to one shop
--
--  There is one thread per SHOP, not per user. A shop is a place with a phone
--  and a till, and whoever is standing behind it needs the whole conversation —
--  threading by person would hide yesterday's instruction from today's staff.
--
--  Read state is two booleans rather than a join table: this is a two-sided
--  conversation (the owner, and the shop), so "has the other side seen it" is
--  genuinely one bit each.
-- =====================================================================

create table if not exists messages (
  id          text primary key,
  shop_id     text not null references shops(id) on delete cascade,
  -- 'admin' or 'shop': who is speaking. Kept alongside the sender's id so an
  -- old message still reads correctly after a user is renamed or deleted.
  from_role   text not null check (from_role in ('admin', 'shop')),
  from_user_id text,
  from_name   text not null default '',
  body        text not null,
  created_at  timestamptz not null default now(),
  read_by_admin boolean not null default false,
  read_by_shop  boolean not null default false
);

create index if not exists messages_shop_idx    on messages (shop_id, created_at desc);
create index if not exists messages_created_idx on messages (created_at desc);

/* ------------------------------------------------------------------ realtime

   Realtime delivery is per-publication: without this the table is readable but
   no INSERT ever reaches a subscribed client, and the chat would only update on
   a page reload. Wrapped because adding a table that is already a member of the
   publication raises an error.
                                                                             */
do $$
begin
  alter publication supabase_realtime add table messages;
exception
  when duplicate_object then null;
  when undefined_object then null;  -- publication absent on a self-hosted setup
end $$;

-- Sends the whole row (not just the primary key) on UPDATE, so a message being
-- marked as read arrives with its contents intact.
alter table messages replica identity full;

/* ---------------------------------------------------------------------- RLS

   Same open policy the other tables already use: anyone with the anon key can
   read and write. See the warning at the bottom of schema.sql — that applies
   with extra force here, because these rows are people talking to each other.
                                                                             */
do $$
begin
  alter table messages enable row level security;
  drop policy if exists "demo_open_access" on messages;
  create policy "demo_open_access" on messages
    for all to anon, authenticated using (true) with check (true);
  grant select, insert, update, delete on messages to anon, authenticated;
end $$;
