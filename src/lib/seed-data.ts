/**
 * The demo dataset.
 *
 * It is the single source of truth for two things:
 *  1. what the app shows when Supabase isn't configured, and
 *  2. what `scripts/gen-seed-sql.mjs` writes into supabase/seed.sql.
 *
 * Keeping one copy means the rows in Postgres are exactly the rows you see in
 * the UI today — nothing is hand-retyped into SQL and left to drift.
 */
import {
  DEFAULT_RECEIPT,
  type Expense,
  type InventoryRow,
  type Product,
  type Purchase,
  type Sale,
  type SaleLine,
  type Settings,
  type Shop,
  type Supplier,
  type User,
} from "./store-types";

export const SHOPS: Shop[] = [
  { id: "s1", name: "Main Branch", address: "Liberty Market, Lahore", phone: "0300-1111111", active: true },
  { id: "s2", name: "Gulberg Outlet", address: "MM Alam Rd, Lahore", phone: "0300-2222222", active: true },
  { id: "s3", name: "DHA Outlet", address: "Phase 5, DHA, Lahore", phone: "0300-3333333", active: true },
];

export const USERS: User[] = [
  { id: "u0", name: "Owner", email: "admin@apos.pk", role: "admin", active: true, lastLogin: "2026-06-28 09:14" },
  { id: "u1", name: "Shop 1 Cashier", email: "shop1@apos.pk", role: "shop", shopId: "s1", active: true, lastLogin: "2026-06-28 10:02" },
  { id: "u2", name: "Shop 2 Cashier", email: "shop2@apos.pk", role: "shop", shopId: "s2", active: true, lastLogin: "2026-06-27 18:45" },
  { id: "u3", name: "Shop 3 Cashier", email: "shop3@apos.pk", role: "shop", shopId: "s3", active: true, lastLogin: "2026-06-28 11:20" },
];

export const PRODUCTS: Product[] = [
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

export const SUPPLIERS: Supplier[] = [
  {
    id: "sup1", name: "Glow Cosmetics Pvt", contact: "Bilal Ahmed", phone: "0321-4567890",
    email: "orders@glowcosmetics.pk", address: "Hall Road, Lahore", notes: "Delivers Mon & Thu. 30-day credit.", active: true,
  },
  {
    id: "sup2", name: "Luxe Distributors", contact: "Sana Malik", phone: "0300-9876543",
    email: "sales@luxedist.pk", address: "Shahalam Market, Lahore", notes: "Minimum order Rs 50,000.", active: true,
  },
  {
    id: "sup3", name: "Aira Textiles", contact: "Imran Sheikh", phone: "0333-1122334",
    email: "imran@airatextiles.pk", address: "Faisalabad", notes: "Seasonal stock, 2-week lead time.", active: true,
  },
];

export function genInventory(): InventoryRow[] {
  const rows: InventoryRow[] = [];
  PRODUCTS.forEach((p, i) => {
    SHOPS.forEach((s, j) => {
      rows.push({ productId: p.id, shopId: s.id, qty: Math.max(0, 12 + ((i * 3 + j * 7) % 18) - (i % 5 === 0 ? 10 : 0)) });
    });
  });
  return rows;
}

export function genSales(): Sale[] {
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
        date.setHours(10 + (k * 3) % 9, (k * 17) % 60, 0, 0);
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

export function genPurchases(): Purchase[] {
  return Array.from({ length: 6 }).map((_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - i * 4);
    const supplier = SUPPLIERS[i % SUPPLIERS.length];
    const lines = [
      { productId: PRODUCTS[i % PRODUCTS.length].id, shopId: SHOPS[i % 3].id, qty: 20, rate: PRODUCTS[i % PRODUCTS.length].cost },
      { productId: PRODUCTS[(i + 2) % PRODUCTS.length].id, shopId: SHOPS[(i + 1) % 3].id, qty: 15, rate: PRODUCTS[(i + 2) % PRODUCTS.length].cost },
    ];
    const total = lines.reduce((a, l) => a + l.qty * l.rate, 0);
    return {
      id: `pur-${i + 1}`,
      billNo: `BILL-${2000 + i}`,
      supplier: supplier.name,
      supplierId: supplier.id,
      date: date.toISOString().slice(0, 10),
      lines,
      total,
    };
  });
}

export function genExpenses(): Expense[] {
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

export const DEFAULT_SETTINGS: Settings = {
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
