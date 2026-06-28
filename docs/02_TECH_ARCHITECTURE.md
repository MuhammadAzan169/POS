# A-POS — Technical & Architecture Plan

> **Document 2 of 2.** How the system is built: stack, database, security (how profit
> stays admin-only), offline-first sync, deployment, and the build roadmap.
> Read `01_UI_UX_SPEC.md` first for what each screen does.

---

## 1. Recommended stack (and why)

| Layer | Choice | Why this one |
|------|--------|--------------|
| **Frontend** | **React + TypeScript** (Vite) as a **PWA** | A POS is highly interactive and must run **offline** — a client-side SPA + service worker is the natural fit. TypeScript prevents money/qty bugs. |
| **UI kit** | Tailwind CSS + a component lib (shadcn/ui or MUI) | Fast, consistent, touch-friendly screens. |
| **Local (offline) DB** | **Dexie.js** (wrapper over IndexedDB) | Caches the catalogue + queues sales/returns/expenses while offline. |
| **Backend + DB** | **Supabase** (hosted **PostgreSQL** + **Auth** + auto REST/Realtime) | Gives us a real relational DB, user logins, row-level security, and an API **without writing a server**. Generous **free tier**. |
| **Server logic** | Supabase **Postgres functions (RPC)** + **Row-Level Security** | Sales/returns run as atomic DB transactions; security enforced in the database, not just the UI. |
| **Hosting** | **Vercel** or **Netlify** (frontend) + Supabase (backend) | Both have free tiers; deploy from GitHub on every push. |

**Why Supabase over alternatives**
- **vs Firebase:** Supabase is real **SQL** — perfect for inventory/sales/profit reports (joins, sums, date ranges). Firebase (NoSQL) makes reporting painful.
- **vs building our own Node/Flask server:** Supabase removes the server, auth, and hosting work. Less to build, less to break, free to run.
- **It is free to start** (see §11) and we can self-host or upgrade later without changing the code much.

> **Skill note:** you said "some experience". React + Supabase is the right tool for a
> real multi-user offline POS, but it is a step up from the Flask demo. The build is
> phased (§10) so each phase is runnable and reviewable — I'll scaffold everything and
> keep the code commented.

---

## 2. High-level architecture

```
   SHOP DEVICE (browser / PWA)            ADMIN DEVICE (browser)
   +-------------------------+            +-----------------------+
   |  React PWA              |            |  React PWA            |
   |  - POS / sales / etc.   |            |  - full admin UI      |
   |  - Dexie (IndexedDB):   |            +-----------+-----------+
   |    * cached catalogue   |                        |
   |    * queued sales       |   HTTPS (when online)  |
   +-----------+-------------+                        |
               |  sync when online                   |
               v                                      v
        +-------------------------------------------------------+
        |                     SUPABASE                          |
        |  Auth (4 logins)                                      |
        |  PostgreSQL  (shops, products, inventory, sales, ...) |
        |  Row-Level Security (per-shop + hide profit)          |
        |  RPC functions: process_sale(), process_return()      |
        |  Realtime (optional: live dashboards)                 |
        +-------------------------------------------------------+
```

- The UI **only talks to Supabase** (no custom backend).
- **Security is enforced in Postgres** via RLS + views, so even if someone hits the API
  directly, a shop login cannot read another shop's data or any cost/profit.

---

## 3. Data model (PostgreSQL)

### 3.1 Tables overview

| Table | Purpose |
|-------|---------|
| `shops` | The 2–3 shops. |
| `profiles` | One row per login; holds role (`admin`/`shop`) and `shop_id`. Linked to Supabase `auth.users`. |
| `suppliers` | Wholesalers. |
| `products` | Master catalogue; **cost & price set by admin**. |
| `inventory` | Stock **per product per shop** (the core of "what's in each shop"). |
| `purchases` | Wholesale bill header (supplier, bill no, date). |
| `purchase_items` | Bill lines; each line has a **destination shop** → raises that shop's inventory. |
| `sales` | Sale header per shop (totals + **profit**). |
| `sale_items` | Sale lines (snapshot of price & cost for accurate profit). |
| `returns` / `return_items` | Refunds; restock the shop, reverse profit. |
| `expenses` | Shop expenses for net-profit. |
| `customers` | Optional buyer info. |
| `stock_adjustments` | Audit corrections (physical count fixes). |

### 3.2 Schema (DDL sketch)

```sql
-- ---------- shops & users ----------
create table shops (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  address     text,
  phone       text,
  active      boolean default true,
  created_at  timestamptz default now()
);

-- role lives here; row id == auth.users.id
create type user_role as enum ('admin','shop');
create table profiles (
  id        uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role      user_role not null default 'shop',
  shop_id   uuid references shops(id),      -- null for admin
  active    boolean default true
);

-- ---------- catalogue ----------
create table suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null, phone text, address text
);

create table products (
  id         uuid primary key default gen_random_uuid(),
  barcode    text unique,
  name       text not null,
  category   text, brand text, size text, color text,
  cost       numeric(12,2) default 0,   -- ADMIN ONLY (see §5)
  price      numeric(12,2) default 0,   -- selling price (admin sets)
  low_alert  int default 0,
  photo_url  text,
  active     boolean default true,
  created_at timestamptz default now()
);

-- stock per shop
create table inventory (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id),
  shop_id    uuid not null references shops(id),
  quantity   int not null default 0,
  low_alert  int default 0,
  unique (product_id, shop_id)
);

-- ---------- purchases (direct to shop) ----------
create table purchases (
  id          uuid primary key default gen_random_uuid(),
  bill_no     text,
  bill_date   date,
  purchase_date date default current_date,
  supplier_id uuid references suppliers(id),
  total_amount numeric(12,2) default 0,
  created_by  uuid references profiles(id),
  created_at  timestamptz default now()
);

create table purchase_items (
  id          uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references purchases(id) on delete cascade,
  product_id  uuid not null references products(id),
  shop_id     uuid not null references shops(id),   -- destination shop
  qty         int not null,
  rate        numeric(12,2) not null,               -- cost per unit
  amount      numeric(12,2) generated always as (qty * rate) stored
);

-- ---------- sales ----------
create table sales (
  id           uuid primary key default gen_random_uuid(),
  client_ref   text,                 -- id generated on device (offline-safe, unique)
  invoice_no   text,                 -- finalised server-side on sync
  shop_id      uuid not null references shops(id),
  customer_id  uuid references customers(id),
  cashier_id   uuid references profiles(id),
  sale_date    timestamptz default now(),
  subtotal     numeric(12,2) default 0,
  discount     numeric(12,2) default 0,
  total        numeric(12,2) default 0,
  total_profit numeric(12,2) default 0,   -- ADMIN ONLY
  payment_method text default 'cash',
  status       text default 'completed',  -- completed | returned | partial
  created_at   timestamptz default now(),
  unique (shop_id, client_ref)            -- makes re-sync idempotent
);

create table sale_items (
  id          uuid primary key default gen_random_uuid(),
  sale_id     uuid not null references sales(id) on delete cascade,
  product_id  uuid references products(id),
  name        text,                  -- snapshot
  qty         int not null,
  price       numeric(12,2) not null, -- sell price at time of sale
  cost        numeric(12,2) not null, -- cost snapshot  (ADMIN ONLY)
  discount    numeric(12,2) default 0,
  net         numeric(12,2) not null,
  profit      numeric(12,2) not null  -- ADMIN ONLY
);

-- ---------- returns ----------
create table returns (
  id uuid primary key default gen_random_uuid(),
  return_no text, sale_id uuid references sales(id),
  shop_id uuid not null references shops(id),
  return_date timestamptz default now(),
  total_refund numeric(12,2) default 0,
  reason text, created_by uuid references profiles(id)
);
create table return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references returns(id) on delete cascade,
  product_id uuid references products(id),
  qty int not null, refund_amount numeric(12,2) not null
);

-- ---------- expenses ----------
create table expenses (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id),
  expense_date date default current_date,
  category text, description text,
  amount numeric(12,2) not null,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  name text, contact text, whatsapp text, shop_id uuid references shops(id)
);

create table stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id), shop_id uuid references shops(id),
  change int not null, reason text, created_by uuid references profiles(id),
  created_at timestamptz default now()
);
```

### 3.3 Relationships (ERD in words)
- `shops 1—* inventory *—1 products` (stock is the junction, per shop).
- `purchases 1—* purchase_items`; each item → `(product, shop)` → **+inventory**.
- `sales 1—* sale_items`; each sale → `shop`; completing → **−inventory**.
- `returns 1—* return_items`; → **+inventory**, reverses profit.
- `profiles.shop_id` ties a shop login to exactly one shop. Admin has `shop_id = null`.

---

## 4. Authentication & roles

- Supabase **Auth** holds the 4 accounts (email + password).
- A `profiles` row per user stores **role** and **shop_id**.
- On login the app loads the profile → decides Admin menu vs Shop menu and which shop.
- Admin creates shop logins from the **Users** screen (server-side via a secure admin
  function or the Supabase dashboard initially).

---

## 5. Security — how profit/cost stays ADMIN-ONLY

Two layers:

**A) Row-Level Security (RLS)** — controls *which rows* each login can touch:
```sql
alter table inventory enable row level security;
-- shop sees/edits only its own shop's stock; admin sees all
create policy inv_shop_read on inventory for select
  using ( exists (select 1 from profiles p where p.id = auth.uid()
                  and (p.role='admin' or p.shop_id = inventory.shop_id)) );
-- similar policies on sales, sale_items, expenses, returns, purchase_items...
```

**B) Hiding cost & profit columns** — RLS is row-level, so to hide *columns* we expose
**views without the secret columns** and revoke direct table access for shops:
```sql
-- what a SHOP login is allowed to read for products (no cost):
create view v_products_shop as
  select id, barcode, name, category, brand, size, color, price, low_alert, active
  from products;

-- what a SHOP login reads for its sales (no profit / no cost):
create view v_sales_shop as
  select id, invoice_no, shop_id, customer_id, sale_date, subtotal,
         discount, total, payment_method, status
  from sales;
```
- **Shop app** queries `v_products_shop`, `v_sales_shop` (+ filtered `sale_items` view without `cost`/`profit`).
- **Admin app** queries the full base tables (cost, profit, all shops).
- Base `products.cost`, `sales.total_profit`, `sale_items.cost/profit` are **not selectable**
  by the shop role (grants revoked). Result: profit is invisible to shops even via the raw API.

---

## 6. Server logic (RPC functions = atomic transactions)

Sales/returns must update several tables at once and never half-apply, so they run as
Postgres functions called from the app:

- **`process_sale(payload jsonb) returns sales`**
  1. Insert `sales` (idempotent on `(shop_id, client_ref)` — safe to retry after offline).
  2. Insert `sale_items` with **cost snapshot** + computed **profit**.
  3. **Decrease `inventory`** for each line at that shop.
  4. Compute & store `total`, `total_profit`; assign next `invoice_no` (e.g. `INV-S1-000123`).
  - Returns the saved sale (with final invoice number) to the device.

- **`process_return(payload)`** — insert return + items, **restock** inventory, reverse
  profit, set sale `status`.

- **`record_purchase(payload)`** — insert purchase + items, **increase inventory** per
  destination shop, update product `cost` (latest), compute totals.

> Using `(shop_id, client_ref)` as a unique key makes re-sending a queued offline sale
> **idempotent** — if the device retries, the DB won't create a duplicate.

---

## 7. Frontend structure (React + Vite, suggested)

```
src/
  main.tsx app.tsx routes.tsx
  lib/
    supabase.ts        # Supabase client
    db.ts              # Dexie schema (offline cache + queues)
    sync.ts            # push queued ops, pull catalogue/inventory
    auth.ts            # session + profile/role
    money.ts           # currency formatting (Rs)
  components/          # Button, Table, Card, OfflineBadge, ...
  features/
    auth/              # login, reset
    dashboard/
    pos/               # New Sale (offline-first), Cart, Receipt
    sales/  returns/  inventory/  products/
    purchases/  suppliers/  expenses/  reports/
    shops/  users/  settings/
  guards/RequireRole.tsx   # route protection by role
```

- **Routing/menus** branch on `role`: admin routes vs shop routes (and shop routes are
  scoped to the user's `shop_id`).
- **`RequireRole`** blocks shop logins from admin pages in the UI (RLS blocks at the API too).

---

## 8. Offline-first strategy (you asked for this)

**Goal:** a shop keeps selling if the internet drops, then everything syncs automatically.

**What's cached on the device (Dexie/IndexedDB):**
- The shop's **product catalogue** (barcode, name, price) and its **inventory** quantities.
- A **queue** of actions made offline: sales, returns, expenses.

**Making a sale offline:**
1. Look up the item in the local cache (scan works offline).
2. Save the sale to the local queue with a **`client_ref` UUID** + timestamp.
3. **Optimistically decrement** the cached inventory so the screen stays accurate.
4. Show receipt with a **temporary** reference; badge shows "1 waiting to sync".

**Syncing (auto when back online + manual button):**
1. For each queued action call the matching RPC (`process_sale`, …).
2. Server is **idempotent** (unique `client_ref`) → no duplicates if retried.
3. On success: mark local item **synced**, store the **final invoice_no**, refresh cached inventory from server.

**Conflict handling (rare, because one login per shop):**
- Stock conflicts can only happen if the *same shop login* sells on two devices at once.
  The server is the source of truth; if stock would go negative, the sale still records
  but is **flagged "needs review"** and the admin is notified to correct via Stock Adjustment.
- Catalogue/price changes always come **from server → device** (admin owns prices), so no
  conflict there.

**Tech:** Service Worker (Workbox via `vite-plugin-pwa`) caches the app shell; Dexie holds
data; a small `sync.ts` runs on `online` events and on app focus.

> If true offline turns out to be rarely needed, we can ship Phase 1 online-only first and
> turn on the offline layer in Phase 4 — the code is structured so the POS already reads
> through the cache, making that switch low-risk.

---

## 9. Key flows (end to end)

1. **Purchase → stock:** Admin saves a purchase with lines (product, **destination shop**,
   qty, rate) → `record_purchase` raises each shop's inventory and updates product cost.
2. **Sale (online):** Shop scans items → `process_sale` → inventory −, sale + profit stored,
   invoice returned, receipt printed.
3. **Sale (offline):** queued locally, inventory decremented in cache → syncs later.
4. **Return:** select invoice + items → `process_return` → inventory +, profit reversed.
5. **Expense:** shop/admin adds expense → feeds **net profit** in admin P&L.
6. **Reports:** admin runs SQL-backed aggregates (sales, profit, inventory value, P&L).

---

## 10. Build roadmap (phased, each phase is usable)

| Phase | Deliverable | Includes |
|------|-------------|----------|
| **0. Setup** | Project skeleton runs | Supabase project, React+Vite+Tailwind+PWA scaffold, Supabase client, schema + RLS migrated, seed the 3 shops + 4 logins, **import existing `POS.xlsx` products**. |
| **1. Catalogue & inventory** | Admin can manage data | Products (cost/price), Suppliers, Shops, Users, Inventory view, Purchases (direct-to-shop). |
| **2. POS (online)** | Shops can sell | New Sale, barcode, `process_sale`, receipt, Sales list, stock decrement, role-based menus + RLS (profit hidden). |
| **3. Returns, Expenses, Reports** | Owner gets the money view | Returns, Expenses, Dashboard KPIs, Reports + **P&L (net profit)**, CSV/PDF export. |
| **4. Offline-first** | Shops sell without internet | Dexie cache + queue, service worker, auto-sync, idempotent RPC, conflict flagging. |
| **5. Polish** | Production-ready | Thermal print formatting, backups, stock adjustments, transfer-between-shops (optional), refinements. |

**Migration of current data:** the existing `POS.xlsx` products/customers/suppliers are
imported into Supabase during Phase 0 (reuse the logic from the prototype's `import_excel.py`).

---

## 11. Cost & the Supabase free tier

- **Supabase Free:** ~500 MB Postgres, 50,000 monthly active users, 1 GB file storage,
  social/email auth, unlimited API requests. **More than enough** for 4 logins and years
  of a few-thousand products + sales.
- **Caveat:** a free project **pauses after ~1 week of zero activity** — not an issue for a
  shop used daily; a quick dashboard visit (or a tiny scheduled ping) keeps it awake.
  Upgrading to Pro (~$25/mo) removes this and adds daily backups *if/when you want it*.
- **Frontend hosting:** Vercel/Netlify free tier covers this app comfortably.
- **Net:** **Rs 0 / $0 to start.** Optional ~$25/mo later for backups/scale.

---

## 12. Security & data-safety checklist
- RLS on every table; profit/cost via admin-only views + revoked column grants.
- All money math done **server-side** in RPC (clients can't fake totals/profit).
- HTTPS everywhere (Supabase + Vercel default).
- Strong passwords for the 4 accounts; admin can reset shop passwords.
- **Backups:** periodic CSV export (built in) + optional Supabase paid daily backups.

---

## 13. Open questions / decisions for later (not blocking)
1. **Currency** assumed **Rs (PKR)** — confirm symbol/format.
2. **Invoice format** — proposed `INV-S1-000123` (shop-prefixed). OK?
3. **Discounts at checkout** — allow for shops? cap %? (Settings toggle planned.)
4. **Transfer stock shop→shop** — include now or later? (Phase 5 optional.)
5. **Customer khata/credit** — excluded for now; easy to add later (a `customer_ledger` table).
6. **Languages** — English only, or also Urdu labels?

> When you're happy with these two documents, say **"start Phase 0"** and I'll scaffold the
> project, create the Supabase schema + RLS, seed the shops/logins, and import your existing
> `POS.xlsx` products.
