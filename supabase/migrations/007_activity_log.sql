-- =====================================================================
--  007 — Activity log
--
--  Run this AFTER 006. Safe to re-run: every statement is idempotent, and
--  nothing here drops or rewrites existing data.
--
--  What it adds:
--    * activity_log — who deleted or edited a money document, when, and the
--      whole record as it stood so it can be put back.
--
--  The problem it solves: a shopkeeper could delete an invoice and the owner
--  would never know. The sale simply stopped existing — no gap anybody would
--  notice, nothing in the day book, and the takings quietly went down. Keeping
--  a note that "something was deleted" is not enough either; the only honest
--  fix is to keep the record itself.
--
--  `snapshot` is therefore the WHOLE row as JSONB. That is what makes restore
--  real rather than a promise: putting it back re-inserts the original id and
--  invoice number, so nothing is renumbered and the stock movement the deletion
--  reversed can be replayed exactly.
--
--  APPEND-ONLY BY INTENT. The app never deletes from this table — a record of a
--  deletion that could itself be deleted would be no record at all. `restored_at`
--  is stamped rather than the row being removed, because "this was deleted on
--  the 3rd and put back on the 5th" is the true history and both halves matter.
-- =====================================================================

create table if not exists activity_log (
  id          text primary key,
  -- A wall-clock moment, not a trading day: this is about who did what and
  -- when, which is a different question from which day it books onto.
  at          timestamptz not null default now(),
  action      text not null check (action in ('deleted', 'edited', 'restored')),
  entity      text not null check (entity in (
                'sale', 'purchase', 'return', 'transfer', 'expense',
                'day-session', 'customer-payment', 'supplier-payment',
                'set-off', 'adjustment')),
  -- Deliberately NOT a foreign key: the row it points at has usually been
  -- deleted, which is the whole reason this entry exists.
  entity_id   text not null,
  label       text default '',
  amount      numeric(12,2) not null default 0,
  shop_id     text references shops(id) on delete set null,
  by_user_id  text references users(id) on delete set null,
  -- Kept on the row so an old entry still reads correctly after the person who
  -- did it is renamed or removed, exactly like messages.from_name.
  by_name     text default '',
  by_role     text not null default 'shop' check (by_role in ('admin', 'shop')),
  snapshot    jsonb,
  restored_at timestamptz,
  restored_by text
);

/* ------------------------------------------------------------------ indexes */

-- The list is always read newest-first, and usually filtered to one shop.
create index if not exists activity_at_idx    on activity_log (at desc);
create index if not exists activity_shop_idx  on activity_log (shop_id, at desc);
create index if not exists activity_entity_idx on activity_log (entity, at desc);

/* --------------------------------------------------- RLS for the new table

   Same open policy the other tables already use: anyone with the anon key can
   read and write.

   Worth saying plainly: with the policy below, the same key that can delete an
   invoice can also delete the log entry proving it. The app never issues that
   delete, but the database currently permits it. When Supabase Auth replaces
   the demo login, this table wants a policy of its own — insert and select for
   everyone, update only to mark a restore, and delete for nobody at all.
                                                                            */
do $$
begin
  alter table activity_log enable row level security;
  drop policy if exists "demo_open_access" on activity_log;
  create policy "demo_open_access" on activity_log
    for all to anon, authenticated using (true) with check (true);
  grant select, insert, update, delete on activity_log to anon, authenticated;
end $$;
