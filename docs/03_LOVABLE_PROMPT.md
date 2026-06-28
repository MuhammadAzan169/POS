# A-POS — Lovable Build Prompts (FRONTEND / UI ONLY)

> **Scope: UI + frontend only.** No Supabase, no backend, no database. Lovable should build
> all screens with realistic **mock data** held in app state. The goal is a clickable,
> good-looking, fully navigable prototype of every screen and button.
>
> How to use:
> 1. In Lovable, **attach `01_UI_UX_SPEC.md`** (the screen-by-screen spec).
> 2. Paste **PART A (Master Prompt)** first. Review what it builds.
> 3. Paste the **PART B** follow-ups **one at a time**, in order, reviewing after each.
> 4. See **PART C** for tips.
>
> (Backend, auth, security and the database come later — see `02_TECH_ARCHITECTURE.md`.
> This prompt deliberately keeps all data in a single mock layer so that swap is easy.)

---

## PART A — MASTER PROMPT (paste first, with `01_UI_UX_SPEC.md` attached)

```text
Build the FRONTEND ONLY of a multi-shop Point of Sale + Inventory web app called "A-POS",
for a retail owner who runs 3 shops (mainly cosmetics, plus clothing and related items).
I have attached a detailed UI/UX specification — treat it as the source of truth for screens,
buttons, and per-role behavior.

IMPORTANT SCOPE:
- This is a UI / frontend prototype only. Do NOT add Supabase, any backend, authentication
  server, or a real database. Use MOCK DATA held in app state.
- Keep ALL mock data and data-access in one centralized place (e.g. /src/lib/mockData.ts and
  /src/lib/api.ts that returns promises from the mock data). Every screen reads/writes through
  this layer only. This makes it easy to replace with a real backend later. Do not scatter
  hardcoded data inside components.

== TECH & QUALITY ==
- React + TypeScript + Vite, Tailwind CSS, shadcn/ui components, lucide-react icons.
- Clean, typed, reusable components. Fully responsive (desktop primary, tablet + phone).
  Touch-friendly with large tap targets (shops may use a tablet at the counter).
- Professional, modern retail design (see DESIGN below). Smooth, polished, production-looking.

== ROLES (mock, no real auth) ==
There are 4 "users": 1 ADMIN (owner) + 3 SHOP logins (Shop 1, Shop 2, Shop 3).
- Build a simple mock Login screen with preset accounts: clicking "Admin", "Shop 1",
  "Shop 2", or "Shop 3" logs you in as that role (no passwords needed — it's a prototype).
  Also add a small role/shop switcher in the header so I can preview each view quickly.
- ADMIN view: full app, sees ALL shops, and sees COST & PROFIT everywhere.
- SHOP view: locked to its own shop; can make sales, returns, expenses and view its own
  inventory and its own sales — and must NEVER show cost, margin, or profit anywhere.
- Role-based navigation: render the ADMIN menu vs the SHOP menu accordingly. Shop screens
  show only that shop's mock data.

== BUSINESS MODEL (so the mock data and screens make sense) ==
- "Direct to shop" stock: admin records PURCHASES from a wholesaler; each purchased line is
  assigned to a destination shop, increasing that shop's stock. One bill can feed many shops.
- Admin sets a single SELLING PRICE per product (used by all shops) and the COST.
  Profit = price - cost. Cost & profit are the owner's private numbers (admin only).
- A SALE reduces that shop's stock; a RETURN restocks it; EXPENSES reduce net profit (P&L).

== MOCK DATA TO SEED (in /src/lib/mockData.ts) ==
- 3 shops: "Shop 1 - Main", "Shop 2", "Shop 3".
- ~15-20 products (cosmetics + clothing): barcode, name, category, brand, size, color,
  cost, price, low_alert, photo (use placeholder images).
- inventory: a quantity for each product in each shop (some LOW / OUT for realism).
- 3-4 suppliers; 6-8 customers.
- ~20 sample sales across the 3 shops with line items (compute net + profit), a couple of
  returns, and several expenses (rent, salary, bills) — enough to make dashboards/reports
  look real with non-zero numbers.
All amounts in "Rs" (PKR), thousands separators, no decimals by default.

== DESIGN ==
- Clean, modern retail dashboard. Light theme with ONE tasteful primary accent — a
  refined rose/pink suited to a cosmetics brand (professional, not loud). Good spacing,
  rounded cards, subtle shadows, clear typography.
- Layout: left SIDEBAR navigation + top HEADER (user name, role, current shop, an
  Online/Offline badge placeholder, role switcher, Logout).
- Card-based dashboards; clean data tables with status chips (OK / LOW / OUT;
  Completed / Returned); toasts for success/error; nice empty states.
- Make it feel like a premium SaaS POS product.

== WHAT TO BUILD IN THIS FIRST STEP ==
1. The centralized mock data + mock api layer described above (with TypeScript types).
2. The mock Login screen (preset Admin / Shop 1/2/3) + header role switcher.
3. The app shell: responsive sidebar + header, the two menus (admin vs shop), routing,
   Online/Offline badge placeholder, toasts, and theming/design system.
4. Admin Dashboard and Shop Dashboard: KPI cards, low-stock panel, recent activity —
   all wired to the mock data (admin shows profit; shop does NOT).

Do NOT build every screen yet. Stop after this foundation so I can review, then I'll ask for
each module next. Reuse the mock api layer for everything.
```

---

## PART B — FOLLOW-UP PROMPTS (paste one at a time, after each builds & you review)

### B1 — Products, Suppliers, Shops, Users (admin master data, UI only)
```text
Build the ADMIN master-data screens (UI only, using the mock api layer), per the attached spec:
- Products: list with search + category/brand filters; Add/Edit form (barcode, name, category,
  brand, size, color, COST, SELL PRICE, low-stock alert, photo, active). Show a live margin
  (Rs and %) on the form — ADMIN ONLY. Include a (mock) "Import from CSV" button.
- Suppliers: list + add/edit.
- Shops: list + add/edit (name, address, phone, receipt header).
- Users: show the 4 mock logins; add/edit a shop login form (name, email, choose shop),
  reset password + enable/disable buttons (mock actions, just update local state).
Barcode field should accept fast typed input (a USB scanner types the code + Enter).
All create/edit/delete just update the mock data in state and show a toast.
```

### B2 — Purchases (direct-to-shop) + Inventory (UI only)
```text
Build PURCHASES and INVENTORY (admin, UI only):
- New Purchase form: header (supplier, bill no, bill date, purchase date) + a repeatable
  line-items grid where each line picks Product, DESTINATION SHOP, Qty, Rate(cost); amount
  auto-calculates; footer total. Include a "Split across shops" helper. On save, update the
  mock inventory of each destination shop and add to the purchases list. Add list + detail view.
- Inventory: toggle between "by shop" (pick a shop -> its stock) and "by product" (one item ->
  qty per shop). Columns: product, shop, quantity, low-alert, status chip (OK/LOW/OUT). Add a
  Stock Adjustment action (change + reason) that updates mock state. Highlight low/out rows and
  add a "Reorder" shortcut that prefills a new purchase.
```

### B3 — POS (New Sale) + Sales + Receipt (UI only)  ← most important
```text
Build the SHOP POS exactly per the spec (UI only, mock data):
- New Sale (for a shop view, scoped to its shop): auto-focused scan/search bar (type barcode
  or name -> item added to cart). Cart table: item, sell price, qty (editable +/-), discount
  (if enabled in settings), line total, remove. Summary panel: subtotal, discount, grand total,
  optional customer (walk-in or pick/add), payment method, amount tendered -> change due.
  Buttons: Complete Sale (also F9), Hold, Clear.
- On Complete Sale: decrement that shop's mock inventory, add the sale to mock sales with a
  generated invoice number formatted INV-<SHOPCODE>-000123, then open a thermal-friendly
  receipt (58/80mm look) with Print and Share buttons. NEVER show cost/profit on this screen.
- Sales list: SHOP view shows ONLY its own sales and NO profit column; ADMIN view shows ALL
  sales WITH a profit column. Row -> invoice detail/receipt with reprint.
- Out-of-stock guard: warn if selling more than the on-hand mock quantity.
```

### B4 — Returns, Expenses, Reports & P&L (UI only)
```text
Build the remaining modules (UI only, mock data):
- Returns: from an invoice, pick items + qty to return -> update mock state (restock that
  shop, mark the sale returned/partial). Shop does its own; admin sees all. List + detail.
- Expenses: add (date, category, description, amount); shop adds for its own shop, admin for
  any. List with filters.
- Reports (ADMIN, includes profit): Sales report, Purchase report, Inventory report (stock
  value at cost per shop), Profit & Loss (sales profit - expenses = net profit, per shop and
  combined), Expense report. Date-range + shop filters, simple charts (use a chart lib), and
  CSV/PDF export buttons (mock/export current mock data). Confirm SHOP views never show profit.
- Settings: business name/logo, currency (Rs), receipt header/footer, default low-stock alert,
  "allow discount at checkout" toggle + max %, and (mock) data export buttons.
```

### B5 — Polish pass (UI)
```text
Do a design + UX polish pass across the whole app:
- Consistent spacing, typography, and the rose accent throughout; refined cards, tables, chips.
- Nice empty states, loading skeletons, and smooth transitions.
- Make sure it looks great on tablet and phone (the POS especially).
- Double-check: in every SHOP view there is absolutely no cost, margin, or profit shown.
- Add small niceties: keyboard focus on the scan box, F9 to complete a sale, toast feedback.
```

---

## PART C — PRO TIPS

1. **Attach `01_UI_UX_SPEC.md`** and keep referencing it ("per the attached spec"). Re-attach
   if a new session loses context.
2. **Build in small steps.** Paste PART A, review, then B1, B2, … one at a time, clicking
   through each module before moving on. Avoid one giant prompt.
3. **Keep data centralized.** If you notice hardcoded data inside a component, tell Lovable:
   "move this into the central mock api layer so the backend can replace it later."
4. **Check the profit rule.** Switch to a Shop view and confirm NO cost/profit appears
   anywhere. Ask Lovable to fix if it leaks.
5. **Iterate on look last.** Get screens working first, then refine: "make the dashboard cards
   more modern", "tighten table spacing", "use a softer rose accent".
6. **Use Lovable's GitHub sync** for version history.
7. **When you're ready for a real backend,** the centralized mock api layer is your seam:
   you (or a developer) swap the mock calls for Supabase per `02_TECH_ARCHITECTURE.md` without
   touching the UI.
