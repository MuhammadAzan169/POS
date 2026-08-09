# Supabase setup

Three steps, about five minutes. Nothing here needs the CLI.

## 1. Create the project

1. [supabase.com](https://supabase.com) → **New project**
2. **Save the database password** you set — it is shown once. (The app doesn't
   use it; it's for direct Postgres/CLI access.)
3. Region: pick the specific city closest to you (Mumbai / Singapore for Pakistan).
4. Security options: leave **Enable Data API** on. `schema.sql` handles RLS and
   grants itself, so it works whether or not the other two boxes are ticked.

## 2. Create the tables and load the data

In the dashboard: **SQL Editor → New query**, then run these in order:

1. Paste all of [`schema.sql`](./schema.sql) → **Run**
2. Paste all of [`seed.sql`](./seed.sql) → **Run**

Both are safe to run more than once — tables use `create table if not exists`
and every row is upserted, so re-running never duplicates data.

`seed.sql` is generated from `src/lib/seed-data.ts`, which is the same data the
app shows in demo mode — so what lands in Postgres is exactly what you already
see in the UI. After changing the seed data, regenerate it:

```bash
node scripts/gen-seed-sql.mjs
```

## 3. Point the app at it

Copy `.env.example` to `.env` and fill in the two Supabase values from
**Project Settings → API Keys**:

```
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

Restart `npm run dev` — Vite only reads `.env` at startup.

## How to tell it worked

The header shows an amber **"Demo data"** chip whenever the app is running on
built-in data. Once Supabase is connected the chip disappears. If it turns red
and says **"Database error"**, hover it for the reason.

A quick end-to-end check: record a sale, then refresh the page. On demo data the
sale vanishes; on Supabase it is still there.

## What's stored where

| Table | Notes |
|---|---|
| `shops`, `users`, `suppliers`, `products` | Plain reference tables |
| `inventory` | One row per product per shop, keyed on both |
| `sales`, `purchases`, `returns` | Line items are `jsonb` — see the comment in `schema.sql` |
| `expenses` | One row per expense |
| `app_state` | Single row holding settings + discount rules as `jsonb` |

## Security, honestly

RLS is enabled, but the current policy allows anyone with the anon key to read
and write — and that key ships inside the browser bundle. This matches the app
as it stands: it still uses its own demo login, so Postgres cannot tell one user
from another.

**Use demo data only until Supabase Auth is added.** The policies in
`schema.sql` are written so that swapping them for `auth.uid()`-based rules is
a contained change.
