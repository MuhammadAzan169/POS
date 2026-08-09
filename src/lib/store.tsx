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

export interface ReturnRec {
  id: string;
  returnNo: string;
  date: string;
  shopId: string;
  invoice: string;
  items: { name: string; qty: number }[];
  refund: number;
  reason: string;
}

export interface Settings {
  businessName: string;
  currency: string;
  address: string;
  phone: string;
  receiptHeader: string;
  receiptFooter: string;
  lowStockDefault: number;
  allowDiscount: boolean;
  maxDiscount: number;
}

interface StoreState {
  user: User | null;
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
  login: (email: string, password: string) => User | null;
  logout: () => void;
  setOnline: (v: boolean) => void;
  addSale: (s: Omit<Sale, "id" | "invoice" | "synced">) => Sale;
  addPurchase: (p: Omit<Purchase, "id">) => void;
  addExpense: (e: Omit<Expense, "id">) => void;
  addReturn: (r: Omit<ReturnRec, "id" | "returnNo">) => void;
  addProduct: (p: Omit<Product, "id">) => void;
  updateProduct: (p: Product) => void;
  addShop: (s: Omit<Shop, "id">) => void;
  updateShop: (s: Shop) => void;
  addUser: (u: Omit<User, "id">) => void;
  updateSettings: (s: Partial<Settings>) => void;
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
  receiptHeader: "Thank you for shopping with us",
  receiptFooter: "Thank You! Visit again",
  lowStockDefault: 5,
  allowDiscount: true,
  maxDiscount: 20,
};

const StoreContext = createContext<StoreState | null>(null);

const LS_USER = "apos.user";

export function StoreProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
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

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(LS_USER) : null;
      if (raw) setUser(JSON.parse(raw));
    } catch {}
  }, []);

  const value = useMemo<StoreState>(
    () => ({
      user,
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
          invoice: `INV-S${shopIdx}-${String(counter).padStart(6, "0")}`,
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
      addPurchase: (p) => {
        const purchase: Purchase = { ...p, id: `pur-${Date.now()}` };
        setPurchases((prev) => [purchase, ...prev]);
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
        const rr: ReturnRec = { ...r, id: `ret-${Date.now()}`, returnNo: `RET-${1000 + returns.length + 1}` };
        setReturns((prev) => [rr, ...prev]);
      },
      addProduct: (p) => setProducts((prev) => [...prev, { ...p, id: `p-${Date.now()}` }]),
      updateProduct: (p) => setProducts((prev) => prev.map((x) => (x.id === p.id ? p : x))),
      addShop: (s) => setShops((prev) => [...prev, { ...s, id: `s-${Date.now()}` }]),
      updateShop: (s) => setShops((prev) => prev.map((x) => (x.id === s.id ? s : x))),
      addUser: (u) => setUsers((prev) => [...prev, { ...u, id: `u-${Date.now()}` }]),
      updateSettings: (s) => setSettings((prev) => ({ ...prev, ...s })),
    }),
    [user, online, shops, users, products, inventory, sales, purchases, expenses, returns, settings],
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