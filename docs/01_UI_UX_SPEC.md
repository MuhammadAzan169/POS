# A-POS — UI / UX Specification

> **Document 1 of 2.** This describes *what the user sees and clicks* — every screen,
> every button, for every role. Document 2 (`02_TECH_ARCHITECTURE.md`) covers how it is
> built (stack, database, offline sync).
>
> **Currency:** Rs (PKR) — configurable in Settings.
> This plan **supersedes** the small Flask prototype in the project root; that was a
> throwaway demo. The real product is built per these two documents.

---

## 1. The business in one picture

```
                WHOLESALER(S) / SUPPLIERS
                          |
                          |  (1) ADMIN records a PURCHASE bill
                          v
              +-----------------------------+
              |   Each purchased line item   |
              |   is assigned to ONE shop    |   <-- "Direct to shop" (no warehouse)
              +-----------------------------+
                   |          |          |
                   v          v          v
               SHOP 1      SHOP 2      SHOP 3      <-- each has its OWN inventory
                   |          |          |
                   |  (2) SHOP sells -> stock goes down, sale recorded
                   |          |          |
                   v          v          v
         (3) ADMIN sees EVERYTHING + PROFIT across all shops.
             Each SHOP sees only ITS OWN data and NEVER sees profit/cost.
```

- **One wholesale bill can feed several shops**: when entering a purchase, the admin can
  add multiple lines and pick a destination shop per line (e.g. 10 lipsticks → Shop 1,
  10 → Shop 2). This keeps the simple "direct to shop" model while still letting the
  owner distribute a single purchase.
- A **sale** at a shop reduces *that shop's* inventory only.
- A **return** at a shop puts the item back into *that shop's* inventory.

---

## 2. Roles & access (the golden rules)

There are exactly **4 logins**: 1 **Admin** (the owner) + 3 **Shop** logins (one per shop).

| Area | Admin | Shop login |
|------|:-----:|:----------:|
| See all shops' data | ✅ | ❌ (only own shop) |
| **See cost & profit** | ✅ | ❌ **never** |
| Manage product catalog (add/edit/price) | ✅ | ❌ (view names + sell price only) |
| Record purchases from wholesaler | ✅ | ❌ |
| Make sales (POS) | ✅ (any shop) | ✅ (own shop) |
| Returns / refunds | ✅ (all) | ✅ (own shop) |
| Record expenses | ✅ (all) | ✅ (own shop) |
| Reports with profit | ✅ | ❌ |
| Reports (own sales, no profit) | ✅ | ✅ |
| Manage users / shops / settings | ✅ | ❌ |

> **Profit & cost are the owner's private numbers.** Shop staff see selling price and
> their own sales totals, but never cost, margin, or profit anywhere in the UI.

---

## 3. Look, feel & layout

- **Style:** clean, high-contrast, large tap targets (shops may use a touch screen or
  tablet). Cosmetics/clothing = friendly but professional. Primary colour can be the
  owner's brand colour (set in Settings).
- **Layout:** left **sidebar** navigation + top **header bar** (shows logged-in
  name/role, current shop, online/offline badge, logout).
- **Responsive:** works on desktop (main use), tablet, and phone.
- **Two menus** depending on who logs in (see §4 and §5).
- **Global elements present on every screen:**
  - **Online/Offline badge** (top-right): green "Online" or amber "Offline — N sales queued".
  - **Sync button/indicator**: shows last sync time; spins while syncing.
  - **Search** where relevant.
  - **Toasts/notifications** for success ("Sale saved"), warning ("Low stock"), error.

---

## 4. ADMIN — screen by screen

Sidebar (Admin): **Dashboard · Sales · Purchases · Products · Inventory · Returns ·
Expenses · Reports · Shops · Users · Settings**

### 4.1 Login
- Fields: **Email**, **Password**, **[Sign in]** button, "Forgot password?" link.
- On success → Admin Dashboard.

### 4.2 Dashboard (owner's command centre)
**Purpose:** at-a-glance health of all 3 shops + profit.

- **KPI cards (today / this month, toggle):**
  - Total Sales (Rs), Total Profit (Rs), # Invoices, Total Expenses, **Net Profit** (sales profit − expenses).
- **Per-shop comparison** table/bar chart: each shop's sales, profit, # invoices.
- **Low-stock panel:** items at/below alert level, grouped by shop, with **[Reorder]**
  shortcut (pre-fills a purchase).
- **Recent activity:** latest sales, returns, expenses across shops (each row clickable).
- **Date filter:** Today / This Week / This Month / Custom range.
- Buttons: **[New Purchase]**, **[View Reports]**, refresh.

### 4.3 Sales (all shops)
**Purpose:** every invoice from every shop, with profit.

- **Filters:** shop (All / Shop 1/2/3), date range, search by invoice/customer/cashier.
- **Table columns:** Invoice, Date, Shop, Customer, Items, Total (Rs), **Profit (Rs)**, Status (Completed / Returned / Partially returned), Sync status.
- **Row click → Invoice detail** drawer: line items (qty, price, **cost**, **profit**),
  customer, totals. Buttons: **[Print/Receipt]**, **[Process Return]**, **[Export PDF]**.
- Top buttons: **[Export CSV]**.

### 4.4 Purchases (from wholesaler) — admin only
**Purpose:** record what the owner bought and send it to shops.

- **Purchases list:** Bill No, Supplier, Date, Total Amount, # items, destination shops. Filter by supplier/date. **[+ New Purchase]**.
- **New Purchase form:**
  - Header: **Supplier** (dropdown + [＋ add supplier]), **Bill No**, **Bill Date**, **Purchase Date**.
  - **Line items grid** (repeatable rows):
    | Product (search/scan or [＋ new product]) | Destination **Shop** | Qty | Rate (cost) | Amount (auto) |
    - Each line picks **which shop** receives that quantity → that shop's inventory increases.
    - **[+ Add line]**, **[Duplicate line]**, remove (×) per line.
    - Optional helper **[Split across shops]**: enter total qty, divide equally/manually among shops (auto-creates lines).
  - Footer: **Total Amount** (auto). Buttons: **[Save Purchase]**, **[Save & New]**, **[Cancel]**.
  - On save: inventory updated per shop; product **cost** updated (latest cost) for profit calc.
- **Purchase detail:** read-only view + **[Edit]** (admin), **[Delete]** (with confirm; reverses inventory).

### 4.5 Products (catalogue) — admin manages
**Purpose:** the master item list shared by all shops. **Admin sets cost & selling price.**

- **List:** Barcode, Name, Category, Brand, Size, Color, **Cost** (admin only), **Sell Price**, total stock across shops, Active. Search + category/brand filters.
- Buttons: **[+ Add Product]**, **[Import from Excel/CSV]**, **[Export]**, per-row **[Edit]**, **[Deactivate]**.
- **Add/Edit Product form:** Barcode/Item code, Name, Category, Brand, Size, Color,
  **Cost**, **Sell Price**, default **Low-stock alert** qty, optional photo, Active toggle.
  - Live margin preview ("Margin: Rs X / Y%") — **admin only**.
- **Barcode:** a USB scanner can fill the Barcode field by scanning.

### 4.6 Inventory (all shops)
**Purpose:** see stock per shop in one place.

- **View toggle:** by **Shop** (pick a shop → its full stock) or by **Product** (one item → quantity in each shop).
- **Table:** Product, Shop, Quantity, Low-alert, Status (OK / LOW / OUT).
- Buttons: **[Stock Adjustment]** (correct count after physical audit, with reason), and
  *(optional/Phase 2)* **[Transfer between shops]** (move qty Shop A → Shop B).
- Low/out rows highlighted; **[Reorder]** shortcut → New Purchase prefilled.

### 4.7 Returns (all shops)
- **List:** Return No, Date, Shop, original Invoice, Items, Refund (Rs), Reason.
- **Process Return** (also reachable from an invoice): pick invoice → select items & qty to
  return → restock to that shop → refund recorded → sale marked Returned/Partial; **profit reversed**.
- Buttons: **[New Return]**, **[View]**, **[Export]**.

### 4.8 Expenses (all shops)
**Purpose:** real net profit = sales profit − expenses.

- **List:** Date, Shop, Category (Rent, Salary, Bills, Transport, Misc…), Description, Amount, Added by. Filters: shop, category, date.
- Buttons: **[+ Add Expense]** (Shop, Date, Category, Description, Amount), **[Edit]**, **[Delete]**, **[Export]**.

### 4.9 Reports (the money view)
**Purpose:** owner's analytics. **Includes profit.**

- **Report types (tabs/dropdown):**
  1. **Sales report** — by date range, per shop or consolidated: totals, profit, top items, busiest days.
  2. **Purchase report** — spend by supplier/shop/date.
  3. **Inventory report** — current stock value (at cost) per shop, low/out lists, dead stock.
  4. **Profit & Loss** — sales profit − expenses = **net profit**, per shop and combined.
  5. **Expense report** — by category/shop/date.
- **Controls:** date range, shop filter, **[Run]**, **[Export CSV]**, **[Export PDF]**, simple charts.

### 4.10 Shops (manage locations)
- **List:** Name, Location/Address, Phone, Linked login, Active.
- Buttons: **[+ Add Shop]**, **[Edit]**, **[Deactivate]**.
- Add/Edit: Name, Address, Phone, receipt header text (optional override).

### 4.11 Users (manage the 3 shop logins)
- **List:** Name, Email, Role (Admin/Shop), Assigned shop, Active, Last login.
- Buttons: **[+ Add Shop Login]** (Name, Email, temp Password, choose Shop), **[Reset Password]**, **[Enable/Disable]**.
- Admin can have only the one owner account; shops get one each.

### 4.12 Settings
- **Business:** business name, logo, **currency** (default Rs), address/phone.
- **Receipt:** header lines, footer ("Thank You!"), show/hide phone, thermal width (58/80mm).
- **Defaults:** default low-stock alert, allow discount at checkout (on/off + max %).
- **Data:** **[Export backup]**, **[Download all data CSV]**.
- **Account:** change own password.

---

## 5. SHOP login — screen by screen

A shop login is **locked to its own shop**. It never sees other shops, cost, or profit.

Sidebar (Shop): **Dashboard · New Sale · Sales · Returns · Inventory · Expenses · Account**

### 5.1 Login
- Email + Password → Shop Dashboard. The shop name is shown in the header at all times.

### 5.2 Dashboard (own shop only)
- **KPI cards (today):** My Sales (Rs), # Invoices, # Items sold. *(No profit shown.)*
- **Low-stock panel:** items in *this* shop at/below alert → suggests telling the owner /
  **[Request restock]** (sends a note to admin).
- **Recent sales** (this shop), each clickable to reprint.
- **Online/Offline badge** prominent; if offline, shows "N sales waiting to sync".

### 5.3 New Sale (POS) — the most-used screen
**Purpose:** fast checkout, **works offline**.

- **Scan/Search bar (auto-focused):** scan a barcode or type code/name → item added to cart.
  (USB scanner "types" code + Enter.)
- **Cart table:** Item, Sell Price, **Qty** (editable, +/−), **Discount** (only if enabled by admin), Line total, remove (×).
- **Right/summary panel:** Subtotal, Discount, **Grand Total (Rs)**, **Customer** (optional: Walk-in or pick/add), **Payment** (Cash / Card / Other), amount tendered → change due.
- **Buttons:** **[Complete Sale]** (or **F9**), **[Hold]** (park a cart), **[Clear]**.
- On complete:
  - Stock for those items reduces in this shop (immediately, even offline).
  - A **receipt** screen opens → **[Print]** (thermal-friendly) / **[Share]** / **[New Sale]**.
  - If offline: sale is **queued locally** and the badge count goes up; it syncs automatically when back online (invoice number is finalised on sync).
- **Out-of-stock guard:** warns if selling more than on hand (admin can allow/deny via setting).
- **No cost or profit anywhere on this screen.**

### 5.4 Sales (own invoices)
- **List:** Invoice, Date, Customer, Items, **Total** (no profit), Status, Sync status.
- Row → receipt view: **[Print]**, **[Share]**, **[Process Return]**.
- Filters: date range, search.

### 5.5 Returns (own shop)
- **[New Return]** → find own invoice → choose items/qty → restock this shop → refund recorded.
- List of past returns (no profit shown).

### 5.6 Inventory (own shop, read-mostly)
- **Table:** Product, Quantity, Low-alert, Status. Search.
- **No cost/value shown** (that's a profit-adjacent number → admin only).
- **[Request restock]** for low items (notifies admin). Optional **[Stock Adjustment]** if owner allows.

### 5.7 Expenses (own shop)
- **[+ Add Expense]** (Date, Category, Description, Amount) — e.g. shop rent, bill, tea.
- List of this shop's expenses. *(Owner sees these in the consolidated P&L.)*

### 5.8 Account
- Change password; view shop info (read-only).

---

## 6. Offline behaviour in the UI (because shops need it)

- A persistent **badge** shows **Online** / **Offline**.
- While offline the shop can still: **search the catalogue, make sales, take returns,
  add expenses** (all stored locally).
- Each queued action shows a small **"pending sync"** dot; the header shows **"N waiting"**.
- When connection returns, a **sync** runs automatically (and on demand via the sync icon);
  items flip from "pending" to "synced", invoice numbers finalise.
- If a sync conflict ever occurs (rare — one login per shop), the item is flagged
  **"Needs review"** and the admin is notified. (Details in Doc 2 §8.)

---

## 7. Receipt layout (thermal 58/80mm friendly)

```
        *** BUSINESS NAME ***
          Shop 1 — Main Branch
        Phone: 0xxx-xxxxxxx
------------------------------------
Invoice: INV-S1-000123
Date: 2026-06-29 18:42   Cashier: Shop 1
Customer: Walk-in
------------------------------------
Item                Qty   Price    Net
Lipstick Matte 02    2     450     900
Kajal Black          1     150     150
------------------------------------
Subtotal                         1,050
Discount                            50
TOTAL                            1,000
Cash 1,000   Change 0
------------------------------------
        Thank You! Visit again
```
- Admin can edit header/footer in Settings. **No cost/profit ever printed.**

---

## 8. Permissions matrix (quick reference for the build)

| Screen / action | Admin | Shop |
|---|:--:|:--:|
| Dashboard (all shops, profit) | ✅ | ❌ |
| Dashboard (own shop, no profit) | ✅ | ✅ |
| New Sale | ✅ | ✅ own |
| Sales list + profit | ✅ | ❌ |
| Sales list (own, no profit) | ✅ | ✅ |
| Purchases | ✅ | ❌ |
| Products: view name + sell price | ✅ | ✅ |
| Products: view cost / edit / price | ✅ | ❌ |
| Inventory (all shops) | ✅ | ❌ |
| Inventory (own shop) | ✅ | ✅ |
| Returns | ✅ all | ✅ own |
| Expenses | ✅ all | ✅ own |
| Reports / P&L (profit) | ✅ | ❌ |
| Shops / Users / Settings | ✅ | ❌ |

---

## 9. Screen inventory (build checklist)

**Shared:** Login, Forgot/Reset password, 404/empty/error states, Offline banner, Toasts.
**Admin (12):** Dashboard, Sales, Purchases (+New/Detail), Products (+Form), Inventory,
Returns (+New), Expenses (+New), Reports, Shops (+Form), Users (+Form), Settings.
**Shop (8):** Dashboard, New Sale (POS) + Receipt, Sales, Returns (+New), Inventory,
Expenses (+New), Account.

> Continue to **`02_TECH_ARCHITECTURE.md`** for the stack, database schema, security
> (how profit is hidden at the data layer), offline sync, deployment, and the build roadmap.
