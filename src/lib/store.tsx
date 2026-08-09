import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Role = "admin" | "shop";

export interface Shop {
  id: string;
  name: string;
  address: string;
  phone: string;
  active: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  shopId?: string;
  active: boolean;
  lastLogin?: string;
}

export interface Product {
  id: string;
  barcode: string;
  name: string;
  category: string;
  brand: string;
  size?: string;
  color?: string;
  cost: number;
  price: number;
  lowAlert: number;
  active: boolean;
}

export interface InventoryRow {
  productId: string;
  shopId: string;
  qty: number;
}

export interface SaleLine {
  productId: string;
  name: string;
  qty: number;
  price: number;
  cost: number;
  discount: number;
}

export interface Sale {
  id: string;
  invoice: string;
  shopId: string;
  date: string;
  customer: string;
  cashier: string;
  lines: SaleLine[];
  subtotal: number;
  discount: number;
  total: number;
  profit: number;
  payment: "Cash" | "Card" | "Other";
  status: "Completed" | "Returned" | "Partial";
  synced: boolean;
}

export interface Purchase {
  id: string;
  billNo: string;
  supplier: string;
  date: string;
  lines: { productId: string; shopId: string; qty: number; rate: number }[];
  total: number;
}

export interface Expense {
  id: string;
  date: string;
  shopId: string;
  category: string;
  description: string;
  amount: number;
  addedBy: string;
}

/**
 * Two distinct flows share this record:
 *  - "customer": a shopper brings goods back. Stock goes UP, money goes out.
 *  - "supplier": we send goods back to the wholesaler. Stock goes DOWN, we get credit.
 */
export type ReturnKind = "customer" | "supplier";

export interface ReturnRec {
  id: string;
  kind: ReturnKind;
  returnNo: string;
  date: string;
  shopId: string;
  /** Customer returns reference a sale invoice; supplier returns reference a purchase bill. */
  invoice: string;
  /** Supplier returns only. */
  supplier?: string;
  items: { productId: string; name: string; qty: number }[];
  /** Refund paid to the customer, or credit owed by the supplier. */
  refund: number;
  reason: string;
}

/** Which blocks appear on a printed receipt, and how it's laid out. */
export interface ReceiptDesign {
  showBusinessName: boolean;
  showAddress: boolean;
  showPhone: boolean;
  showHeaderText: boolean;
  showFooterText: boolean;
  showInvoiceNo: boolean;
  showDateTime: boolean;
  showCashier: boolean;
  showCustomer: boolean;
  showShopName: boolean;
  showItemBarcodes: boolean;
  showUnitPrice: boolean;
  showPaymentLine: boolean;
  showThankYouDivider: boolean;
  paperWidth: "58mm" | "80mm" | "A4";
  fontSize: "sm" | "md" | "lg";
  align: "left" | "center";
}

export const DEFAULT_RECEIPT: ReceiptDesign = {
  showBusinessName: true,
  showAddress: true,
  showPhone: true,
  showHeaderText: true,
  showFooterText: true,
  showInvoiceNo: true,
  showDateTime: true,
  showCashier: true,
  showCustomer: true,
  showShopName: true,
  showItemBarcodes: false,
  showUnitPrice: true,
  showPaymentLine: true,
  showThankYouDivider: true,
  paperWidth: "80mm",
  fontSize: "md",
  align: "center",
};

/**
 * Discounts live here rather than on Settings so the Discounts tab owns them.
 * A product's own percentage wins; anything without one uses `overallPct`.
 * Both are capped by `maxPct`.
 */
export interface DiscountRules {
  enabled: boolean;
  overallPct: number;
  maxPct: number;
  perProduct: Record<string, number>;
}

export const DEFAULT_DISCOUNTS: DiscountRules = {
  enabled: true,
  overallPct: 0,
  maxPct: 20,
  perProduct: {},
};

export interface Settings {
  businessName: string;
  currency: string;
  address: string;
  phone: string;
  taxNumber: string;
  invoicePrefix: string;
  receiptHeader: string;
  receiptFooter: string;
  lowStockDefault: number;
  receipt: ReceiptDesign;
}

interface StoreState {
  user: User | null;
  /** False until the saved session has been read from localStorage. */
  ready: boolean;
  online: boolean;
  shops: Shop[];
  users: User[];
  products: Product[];
  inventory: InventoryRow[];
  sales: Sale[];
  purchases: Purchase[];
  expenses: Expense[];
  returns: ReturnRec[];
  settings: Settings;
  discounts: DiscountRules;
  login: (email: string, password: string) => User | null;
  logout: () => void;
  setOnline: (v: boolean) => void;
  addSale: (s: Omit<Sale, "id" | "invoice" | "synced">) => Sale;
  updateSale: (s: Sale) => void;
  deleteSale: (id: string) => void;
  addPurchase: (p: Omit<Purchase, "id">) => void;
  addExpense: (e: Omit<Expense, "id">) => void;
  addReturn: (r: Omit<ReturnRec, "id" | "returnNo">) => void;
  updateProductAlert: (productId: string, lowAlert: number) => void;
  addProduct: (p: Omit<Product, "id">) => void;
  updateProduct: (p: Product) => void;
  addShop: (s: Omit<Shop, "id">) => void;
  updateShop: (s: Shop) => void;
  addUser: (u: Omit<User, "id">) => void;
  updateSettings: (s: Partial<Settings>) => void;
  updateReceiptDesign: (r: Partial<ReceiptDesign>) => void;
  updateDiscounts: (d: Partial<DiscountRules>) => void;
  setProductDiscount: (productId: string, pct: number | null) => void;
}

const SHOPS: Shop[] = [
  { id: "s1", name: "Main Branch", address: "Liberty Market, Lahore", phone: "0300-1111111", active: true },
  { id: "s2", name: "Gulberg Outlet", address: "MM Alam Rd, Lahore", phone: "0300-2222222", active: true },
  { id: "s3", name: "DHA Outlet", address: "Phase 5, DHA, Lahore", phone: "0300-3333333", active: true },
];

const USERS: User[] = [
  { id: "u0", name: "Owner", email: "admin@apos.pk", role: "admin", active: true, lastLogin: "2026-06-28 09:14" },
  { id: "u1", name: "Shop 1 Cashier", email: "shop1@apos.pk", role: "shop", shopId: "s1", active: true, lastLogin: "2026-06-28 10:02" },
  { id: "u2", name: "Shop 2 Cashier", email: "shop2@apos.pk", role: "shop", shopId: "s2", active: true, lastLogin: "2026-06-27 18:45" },
  { id: "u3", name: "Shop 3 Cashier", email: "shop3@apos.pk", role: "shop", shopId: "s3", active: true, lastLogin: "2026-06-28 11:20" },
];

const PRODUCTS: Product[] = [
  { id: "p1", barcode: "8901001", name: "Matte Lipstick — Ruby 02", category: "Cosmetics", brand: "Glow", size: "—", color: "Ruby", cost: 280, price: 450, lowAlert: 6, active: true },
  { id: "p2", barcode: "8901002", name: "Kajal Pencil — Black", category: "Cosmetics", brand: "Glow", cost: 80, price: 150, lowAlert: 10, active: true },
  { id: "p3", barcode: "8901003", name: "Foundation Stick — Beige", category: "Cosmetics", brand: "Luxe", color: "Beige", cost: 620, price: 1100, lowAlert: 4, active: true },
  { id: "p4", barcode: "8901004", name: "Compact Powder", category: "Cosmetics", brand: "Luxe", cost: 480, price: 850, lowAlert: 5, active: true },
  { id: "p5", barcode: "8901005", name: "Cotton Kurti — Medium", category: "Clothing", brand: "Aira", size: "M", color: "White", cost: 1100, price: 2200, lowAlert: 3, active: true },
  { id: "p6", barcode: "8901006", name: "Embroidered Shawl", category: "Clothing", brand: "Aira", color: "Maroon", cost: 1800, price: 3500, lowAlert: 3, active: true },
  { id: "p7", barcode: "8901007", name: "Hair Serum 100ml", category: "Hair Care", brand: "Glow", cost: 540, price: 950, lowAlert: 5, active: true },
  { id: "p8", barcode: "8901008", name: "Perfume — Rose 50ml", category: "Fragrance", brand: "Luxe", cost: 1500, price: 2800, lowAlert: 3, active: true },
  { id: "p9", barcode: "8901009", name: "Face Wash 150ml", category: "Skin Care", brand: "Glow", cost: 220, price: 420, lowAlert: 8, active: true },
  { id: "p10", barcode: "8901010", name: "Nail Polish — Coral", category: "Cosmetics", brand: "Glow", color: "Coral", cost: 90, price: 200, lowAlert: 10, active: true },
];

function genInventory(): InventoryRow[] {
  const rows: InventoryRow[] = [];
  PRODUCTS.forEach((p, i) => {
    SHOPS.forEach((s, j) => {
      rows.push({ productId: p.id, shopId: s.id, qty: Math.max(0, 12 + ((i * 3 + j * 7) % 18) - (i % 5 === 0 ? 10 : 0)) });
    });
  });
  return rows;
}

function genSales(): Sale[] {
  const out: Sale[] = [];
  const customers = ["Walk-in", "Ayesha K.", "Fatima R.", "Hassan A.", "Walk-in", "Maria S.", "Walk-in"];
  let counter = 100;
  for (let d = 0; d < 14; d++) {
    SHOPS.forEach((shop, si) => {
      const n = 2 + ((d + si) % 4);
      for (let k = 0; k < n; k++) {
        const p1 = PRODUCTS[(d + k + si) % PRODUCTS.length];
        const p2 = PRODUCTS[(d + k * 2 + si * 3) % PRODUCTS.length];
        const lines: SaleLine[] = [
          { productId: p1.id, name: p1.name, qty: 1 + (k % 3), price: p1.price, cost: p1.cost, discount: 0 },
          { productId: p2.id, name: p2.name, qty: 1, price: p2.price, cost: p2.cost, discount: 0 },
        ];
        const subtotal = lines.reduce((a, l) => a + l.qty * l.price, 0);
        const profit = lines.reduce((a, l) => a + l.qty * (l.price - l.cost), 0);
        const date = new Date();
        date.setDate(date.getDate() - d);
        date.setHours(10 + (k * 3) % 9, (k * 17) % 60);
        counter++;
        out.push({
          id: `sale-${counter}`,
          invoice: `INV-S${si + 1}-${String(counter).padStart(6, "0")}`,
          shopId: shop.id,
          date: date.toISOString(),
          customer: customers[(d + k) % customers.length],
          cashier: `Shop ${si + 1}`,
          lines,
          subtotal,
          discount: 0,
          total: subtotal,
          profit,
          payment: k % 3 === 0 ? "Card" : "Cash",
          status: "Completed",
          synced: true,
        });
      }
    });
  }
  return out;
}

function genPurchases(): Purchase[] {
  const suppliers = ["Glow Cosmetics Pvt", "Luxe Distributors", "Aira Textiles"];
  return Array.from({ length: 6 }).map((_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - i * 4);
    const lines = [
      { productId: PRODUCTS[i % PRODUCTS.length].id, shopId: SHOPS[i % 3].id, qty: 20, rate: PRODUCTS[i % PRODUCTS.length].cost },
      { productId: PRODUCTS[(i + 2) % PRODUCTS.length].id, shopId: SHOPS[(i + 1) % 3].id, qty: 15, rate: PRODUCTS[(i + 2) % PRODUCTS.length].cost },
    ];
    const total = lines.reduce((a, l) => a + l.qty * l.rate, 0);
    return {
      id: `pur-${i + 1}`,
      billNo: `BILL-${2000 + i}`,
      supplier: suppliers[i % suppliers.length],
      date: date.toISOString().slice(0, 10),
      lines,
      total,
    };
  });
}

function genExpenses(): Expense[] {
  const cats = ["Rent", "Salary", "Bills", "Transport", "Misc"];
  return Array.from({ length: 12 }).map((_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - i * 2);
    return {
      id: `exp-${i + 1}`,
      date: date.toISOString().slice(0, 10),
      shopId: SHOPS[i % 3].id,
      category: cats[i % cats.length],
      description: `${cats[i % cats.length]} for ${SHOPS[i % 3].name}`,
      amount: 1500 + (i * 350) % 6000,
      addedBy: i % 2 === 0 ? "Owner" : `Shop ${(i % 3) + 1} Cashier`,
    };
  });
}

const DEFAULT_SETTINGS: Settings = {
  businessName: "A-POS Retail",
  currency: "Rs",
  address: "Lahore, Pakistan",
  phone: "0300-1234567",
  taxNumber: "",
  invoicePrefix: "INV",
  receiptHeader: "Thank you for shopping with us",
  receiptFooter: "Thank You! Visit again",
  lowStockDefault: 5,
  receipt: DEFAULT_RECEIPT,
};

const StoreContext = createContext<StoreState | null>(null);

const LS_USER = "apos.user";

export function StoreProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(true);
  const [shops, setShops] = useState<Shop[]>(SHOPS);
  const [users, setUsers] = useState<User[]>(USERS);
  const [products, setProducts] = useState<Product[]>(PRODUCTS);
  const [inventory, setInventory] = useState<InventoryRow[]>(() => genInventory());
  const [sales, setSales] = useState<Sale[]>(() => genSales());
  const [purchases, setPurchases] = useState<Purchase[]>(() => genPurchases());
  const [expenses, setExpenses] = useState<Expense[]>(() => genExpenses());
  const [returns, setReturns] = useState<ReturnRec[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [discounts, setDiscounts] = useState<DiscountRules>(DEFAULT_DISCOUNTS);

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(LS_USER) : null;
      if (raw) setUser(JSON.parse(raw));
    } catch {}
    // Marks the session restored. Guards let the app avoid treating the brief
    // "not loaded yet" window as "signed out" and bouncing to the login screen.
    setReady(true);
  }, []);

  const value = useMemo<StoreState>(
    () => ({
      user,
      ready,
      online,
      shops,
      users,
      products,
      inventory,
      sales,
      purchases,
      expenses,
      returns,
      settings,
      discounts,
      login: (email, _password) => {
        const u = USERS.find((x) => x.email.toLowerCase() === email.toLowerCase());
        if (!u) return null;
        setUser(u);
        try { window.localStorage.setItem(LS_USER, JSON.stringify(u)); } catch {}
        return u;
      },
      logout: () => {
        setUser(null);
        try { window.localStorage.removeItem(LS_USER); } catch {}
      },
      setOnline,
      addSale: (s) => {
        const counter = sales.length + 200;
        const shopIdx = shops.findIndex((x) => x.id === s.shopId) + 1;
        const sale: Sale = {
          ...s,
          id: `sale-${Date.now()}`,
          invoice: `${settings.invoicePrefix || "INV"}-S${shopIdx}-${String(counter).padStart(6, "0")}`,
          synced: online,
        };
        setSales((prev) => [sale, ...prev]);
        setInventory((prev) =>
          prev.map((row) => {
            if (row.shopId !== s.shopId) return row;
            const line = s.lines.find((l) => l.productId === row.productId);
            if (!line) return row;
            return { ...row, qty: Math.max(0, row.qty - line.qty) };
          }),
        );
        return sale;
      },
      /**
       * Editing a completed sale has to move stock by the DIFFERENCE between the
       * old and new line quantities, or inventory silently drifts.
       */
      updateSale: (updated) => {
        const previous = sales.find((s) => s.id === updated.id);
        setSales((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
        if (!previous) return;
        setInventory((prev) => {
          const next = [...prev];
          const bump = (productId: string, delta: number) => {
            if (delta === 0) return;
            const i = next.findIndex((r) => r.productId === productId && r.shopId === updated.shopId);
            if (i >= 0) next[i] = { ...next[i], qty: Math.max(0, next[i].qty + delta) };
            else if (delta > 0) next.push({ productId, shopId: updated.shopId, qty: delta });
          };
          const ids = new Set([...previous.lines, ...updated.lines].map((l) => l.productId));
          ids.forEach((id) => {
            const before = previous.lines.find((l) => l.productId === id)?.qty ?? 0;
            const after = updated.lines.find((l) => l.productId === id)?.qty ?? 0;
            // Selling fewer units puts the difference back on the shelf.
            bump(id, before - after);
          });
          return next;
        });
      },
      /** Removing a sale returns its items to stock, unless it was already returned. */
      deleteSale: (id) => {
        const sale = sales.find((s) => s.id === id);
        setSales((prev) => prev.filter((s) => s.id !== id));
        if (!sale || sale.status === "Returned") return;
        setInventory((prev) => {
          const next = [...prev];
          sale.lines.forEach((l) => {
            const i = next.findIndex((r) => r.productId === l.productId && r.shopId === sale.shopId);
            if (i >= 0) next[i] = { ...next[i], qty: next[i].qty + l.qty };
            else next.push({ productId: l.productId, shopId: sale.shopId, qty: l.qty });
          });
          return next;
        });
      },
      addPurchase: (p) => {
        const purchase: Purchase = { ...p, id: `pur-${Date.now()}` };
        setPurchases((prev) => [purchase, ...prev]);
        // The purchase form promises "latest cost will update for <product>";
        // nothing was actually doing it. Past sales keep the cost they recorded.
        setProducts((prev) =>
          prev.map((prod) => {
            const line = p.lines.find((l) => l.productId === prod.id && l.rate > 0);
            return line ? { ...prod, cost: line.rate } : prod;
          }),
        );
        setInventory((prev) => {
          const next = [...prev];
          p.lines.forEach((l) => {
            const idx = next.findIndex((r) => r.productId === l.productId && r.shopId === l.shopId);
            if (idx >= 0) next[idx] = { ...next[idx], qty: next[idx].qty + l.qty };
            else next.push({ productId: l.productId, shopId: l.shopId, qty: l.qty });
          });
          return next;
        });
      },
      addExpense: (e) => setExpenses((prev) => [{ ...e, id: `exp-${Date.now()}` }, ...prev]),
      addReturn: (r) => {
        const isSupplier = r.kind === "supplier";
        const prefix = isSupplier ? "SRET" : "RET";
        const sameKind = returns.filter((x) => x.kind === r.kind).length;
        const rr: ReturnRec = { ...r, id: `ret-${Date.now()}`, returnNo: `${prefix}-${1000 + sameKind + 1}` };
        setReturns((prev) => [rr, ...prev]);

        // A customer return must also close out the original invoice, otherwise the
        // same invoice stays returnable and sales totals stay inflated.
        if (!isSupplier) {
          setSales((prev) => prev.map((s) => (s.invoice === r.invoice ? { ...s, status: "Returned", profit: 0 } : s)));
        }

        // Customer returns put stock back on the shelf; supplier returns take it away.
        const sign = isSupplier ? -1 : 1;
        setInventory((prev) => {
          const next = [...prev];
          r.items.forEach((item) => {
            const idx = next.findIndex((row) => row.productId === item.productId && row.shopId === r.shopId);
            if (idx >= 0) next[idx] = { ...next[idx], qty: Math.max(0, next[idx].qty + sign * item.qty) };
            else if (!isSupplier) next.push({ productId: item.productId, shopId: r.shopId, qty: item.qty });
          });
          return next;
        });
      },
      addProduct: (p) => setProducts((prev) => [...prev, { ...p, id: `p-${Date.now()}` }]),
      updateProduct: (p) => setProducts((prev) => prev.map((x) => (x.id === p.id ? p : x))),
      updateProductAlert: (productId, lowAlert) =>
        setProducts((prev) => prev.map((x) => (x.id === productId ? { ...x, lowAlert: Math.max(0, lowAlert) } : x))),
      addShop: (s) => setShops((prev) => [...prev, { ...s, id: `s-${Date.now()}` }]),
      updateShop: (s) => setShops((prev) => prev.map((x) => (x.id === s.id ? s : x))),
      addUser: (u) => setUsers((prev) => [...prev, { ...u, id: `u-${Date.now()}` }]),
      updateSettings: (s) => setSettings((prev) => ({ ...prev, ...s })),
      updateReceiptDesign: (r) => setSettings((prev) => ({ ...prev, receipt: { ...prev.receipt, ...r } })),
      updateDiscounts: (d) => setDiscounts((prev) => ({ ...prev, ...d })),
      setProductDiscount: (productId, pct) =>
        setDiscounts((prev) => {
          const perProduct = { ...prev.perProduct };
          // null clears the override so the product falls back to the overall rate.
          if (pct === null) delete perProduct[productId];
          else perProduct[productId] = Math.min(100, Math.max(0, pct));
          return { ...prev, perProduct };
        }),
    }),
    [user, ready, online, shops, users, products, inventory, sales, purchases, expenses, returns, settings, discounts],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

export function formatRs(n: number, currency = "Rs") {
  return `${currency} ${n.toLocaleString("en-PK", { maximumFractionDigits: 0 })}`;
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The discount percentage that actually applies to a product.
 * Product override wins over the overall rate; both are capped by maxPct.
 * Single source of truth so POS, the Discounts tab and receipts never disagree.
 */
export function discountPctFor(productId: string, d: DiscountRules) {
  if (!d.enabled) return 0;
  const raw = d.perProduct[productId] ?? d.overallPct;
  return Math.min(Math.max(raw, 0), Math.max(0, d.maxPct));
}

/** Money off a line, rounded to whole currency units. */
export function discountAmountFor(productId: string, unitPrice: number, qty: number, d: DiscountRules) {
  return Math.round((unitPrice * qty * discountPctFor(productId, d)) / 100);
}

/** YYYY-MM-DD for any stored date, whether it's an ISO timestamp or already a date. */
export function dayOf(date: string) {
  return date.slice(0, 10);
}

/**
 * Rebuilds stock as it stood at the END of `asOf` (YYYY-MM-DD).
 *
 * There are no historical snapshots, so this rewinds today's quantities back
 * through every movement recorded AFTER that day:
 *   sales after      → stock was higher then  (add back)
 *   purchases after  → stock was lower then   (subtract)
 *   customer returns after → stock was lower then (subtract)
 *   supplier returns after → stock was higher then (add back)
 *
 * Accurate only as far back as the recorded movements go.
 */
export function stockAsOf(
  asOf: string,
  data: { inventory: InventoryRow[]; sales: Sale[]; purchases: Purchase[]; returns: ReturnRec[] },
): InventoryRow[] {
  const key = (productId: string, shopId: string) => `${productId}|${shopId}`;
  const map = new Map<string, InventoryRow>();
  data.inventory.forEach((r) => map.set(key(r.productId, r.shopId), { ...r }));

  const shift = (productId: string, shopId: string, delta: number) => {
    const k = key(productId, shopId);
    const row = map.get(k);
    if (row) row.qty += delta;
    else map.set(k, { productId, shopId, qty: delta });
  };

  data.sales
    .filter((s) => dayOf(s.date) > asOf && s.status !== "Returned")
    .forEach((s) => s.lines.forEach((l) => shift(l.productId, s.shopId, l.qty)));

  data.purchases
    .filter((p) => dayOf(p.date) > asOf)
    .forEach((p) => p.lines.forEach((l) => shift(l.productId, l.shopId, -l.qty)));

  data.returns
    .filter((r) => dayOf(r.date) > asOf)
    .forEach((r) =>
      r.items.forEach((i) => shift(i.productId, r.shopId, r.kind === "supplier" ? i.qty : -i.qty)),
    );

  return [...map.values()].map((r) => ({ ...r, qty: Math.max(0, r.qty) }));
}