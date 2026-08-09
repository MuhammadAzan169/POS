/**
 * Supabase data access.
 *
 * Postgres columns are snake_case; the app's types are camelCase. Every table
 * gets a pair of mappers so the conversion lives in exactly one place.
 *
 * Line arrays (sale lines, purchase lines, return items) are stored as JSONB
 * rather than child tables: the app always loads and saves a sale as one whole
 * object and never queries lines independently, so child tables would add joins
 * and round-trips for no gain. JSONB is still queryable from SQL if needed.
 */
import { supabase } from "./supabase";
import {
  DEFAULT_DISCOUNTS,
  type DiscountRules,
  type Expense,
  type InventoryRow,
  type Product,
  type Purchase,
  type ReturnRec,
  type Sale,
  type Settings,
  type Shop,
  type Supplier,
  type User,
} from "./store-types";
import { DEFAULT_SETTINGS } from "./seed-data";

/** Everything the app holds in memory, loaded in one go. */
export interface Snapshot {
  shops: Shop[];
  users: User[];
  products: Product[];
  inventory: InventoryRow[];
  sales: Sale[];
  purchases: Purchase[];
  suppliers: Supplier[];
  expenses: Expense[];
  returns: ReturnRec[];
  settings: Settings;
  discounts: DiscountRules;
}

/* ------------------------------------------------------------------ mappers */

const rowToShop = (r: any): Shop => ({ id: r.id, name: r.name, address: r.address ?? "", phone: r.phone ?? "", active: r.active });
const shopToRow = (s: Shop) => ({ id: s.id, name: s.name, address: s.address, phone: s.phone, active: s.active });

const rowToUser = (r: any): User => ({
  id: r.id, name: r.name, email: r.email, role: r.role, shopId: r.shop_id ?? undefined, active: r.active, lastLogin: r.last_login ?? undefined,
});
const userToRow = (u: User) => ({
  id: u.id, name: u.name, email: u.email, role: u.role, shop_id: u.shopId ?? null, active: u.active, last_login: u.lastLogin ?? null,
});

const rowToProduct = (r: any): Product => ({
  id: r.id, barcode: r.barcode ?? "", name: r.name, category: r.category ?? "", brand: r.brand ?? "",
  size: r.size ?? undefined, color: r.color ?? undefined,
  cost: Number(r.cost), price: Number(r.price), lowAlert: r.low_alert, active: r.active,
});
const productToRow = (p: Product) => ({
  id: p.id, barcode: p.barcode, name: p.name, category: p.category, brand: p.brand,
  size: p.size ?? null, color: p.color ?? null, cost: p.cost, price: p.price, low_alert: p.lowAlert, active: p.active,
});

const rowToInventory = (r: any): InventoryRow => ({ productId: r.product_id, shopId: r.shop_id, qty: r.qty });
const inventoryToRow = (r: InventoryRow) => ({ product_id: r.productId, shop_id: r.shopId, qty: r.qty });

const rowToSale = (r: any): Sale => ({
  id: r.id, invoice: r.invoice, shopId: r.shop_id, date: r.date, customer: r.customer, cashier: r.cashier,
  lines: r.lines ?? [], subtotal: Number(r.subtotal), discount: Number(r.discount), total: Number(r.total),
  profit: Number(r.profit), payment: r.payment, status: r.status, synced: r.synced,
});
const saleToRow = (s: Sale) => ({
  id: s.id, invoice: s.invoice, shop_id: s.shopId, date: s.date, customer: s.customer, cashier: s.cashier,
  lines: s.lines, subtotal: s.subtotal, discount: s.discount, total: s.total, profit: s.profit,
  payment: s.payment, status: s.status, synced: s.synced,
});

const rowToSupplier = (r: any): Supplier => ({
  id: r.id, name: r.name, contact: r.contact ?? "", phone: r.phone ?? "", email: r.email ?? "",
  address: r.address ?? "", notes: r.notes ?? "", active: r.active,
});
const supplierToRow = (s: Supplier) => ({
  id: s.id, name: s.name, contact: s.contact, phone: s.phone, email: s.email, address: s.address, notes: s.notes, active: s.active,
});

const rowToPurchase = (r: any): Purchase => ({
  id: r.id, billNo: r.bill_no, supplier: r.supplier, supplierId: r.supplier_id ?? undefined,
  date: r.date, lines: r.lines ?? [], total: Number(r.total),
});
const purchaseToRow = (p: Purchase) => ({
  id: p.id, bill_no: p.billNo, supplier: p.supplier, supplier_id: p.supplierId ?? null,
  date: p.date, lines: p.lines, total: p.total,
});

const rowToExpense = (r: any): Expense => ({
  id: r.id, date: r.date, shopId: r.shop_id, category: r.category, description: r.description ?? "",
  amount: Number(r.amount), addedBy: r.added_by ?? "",
});
const expenseToRow = (e: Expense) => ({
  id: e.id, date: e.date, shop_id: e.shopId, category: e.category, description: e.description, amount: e.amount, added_by: e.addedBy,
});

const rowToReturn = (r: any): ReturnRec => ({
  id: r.id, kind: r.kind, returnNo: r.return_no, date: r.date, shopId: r.shop_id, invoice: r.invoice,
  supplier: r.supplier ?? undefined, supplierId: r.supplier_id ?? undefined,
  items: r.items ?? [], refund: Number(r.refund), reason: r.reason ?? "",
});
const returnToRow = (r: ReturnRec) => ({
  id: r.id, kind: r.kind, return_no: r.returnNo, date: r.date, shop_id: r.shopId, invoice: r.invoice,
  supplier: r.supplier ?? null, supplier_id: r.supplierId ?? null, items: r.items, refund: r.refund, reason: r.reason,
});

/* -------------------------------------------------------------------- reads */

/** Loads the whole dataset. Throws if Supabase is unreachable so the caller can fall back. */
export async function loadSnapshot(): Promise<Snapshot> {
  if (!supabase) throw new Error("Supabase is not configured");

  const [shops, users, products, inventory, sales, purchases, suppliers, expenses, returns, appState] =
    await Promise.all([
      supabase.from("shops").select("*").order("name"),
      supabase.from("users").select("*").order("name"),
      supabase.from("products").select("*").order("name"),
      supabase.from("inventory").select("*"),
      supabase.from("sales").select("*").order("date", { ascending: false }),
      supabase.from("purchases").select("*").order("date", { ascending: false }),
      supabase.from("suppliers").select("*").order("name"),
      supabase.from("expenses").select("*").order("date", { ascending: false }),
      supabase.from("returns").select("*").order("date", { ascending: false }),
      supabase.from("app_state").select("*").eq("id", "singleton").maybeSingle(),
    ]);

  const failed = [shops, users, products, inventory, sales, purchases, suppliers, expenses, returns, appState]
    .find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  return {
    shops: (shops.data ?? []).map(rowToShop),
    users: (users.data ?? []).map(rowToUser),
    products: (products.data ?? []).map(rowToProduct),
    inventory: (inventory.data ?? []).map(rowToInventory),
    sales: (sales.data ?? []).map(rowToSale),
    purchases: (purchases.data ?? []).map(rowToPurchase),
    suppliers: (suppliers.data ?? []).map(rowToSupplier),
    expenses: (expenses.data ?? []).map(rowToExpense),
    returns: (returns.data ?? []).map(rowToReturn),
    settings: { ...DEFAULT_SETTINGS, ...((appState.data?.settings as Partial<Settings>) ?? {}) },
    discounts: { ...DEFAULT_DISCOUNTS, ...((appState.data?.discounts as Partial<DiscountRules>) ?? {}) },
  };
}

/* ------------------------------------------------------------------- writes */

/**
 * Writes are fire-and-forget from the UI's point of view: local state has
 * already been updated, so a failure surfaces as a toast rather than blocking
 * the till. Every call is a no-op when Supabase isn't configured.
 */
type Result = { error?: string };

async function run(fn: () => PromiseLike<{ error: { message: string } | null }>): Promise<Result> {
  if (!supabase) return {};
  try {
    const { error } = await fn();
    return error ? { error: error.message } : {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export const db = {
  upsertShop: (s: Shop) => run(() => supabase!.from("shops").upsert(shopToRow(s))),
  upsertUser: (u: User) => run(() => supabase!.from("users").upsert(userToRow(u))),
  upsertProduct: (p: Product) => run(() => supabase!.from("products").upsert(productToRow(p))),
  upsertSupplier: (s: Supplier) => run(() => supabase!.from("suppliers").upsert(supplierToRow(s))),
  upsertSale: (s: Sale) => run(() => supabase!.from("sales").upsert(saleToRow(s))),
  deleteSale: (id: string) => run(() => supabase!.from("sales").delete().eq("id", id)),
  upsertPurchase: (p: Purchase) => run(() => supabase!.from("purchases").upsert(purchaseToRow(p))),
  upsertExpense: (e: Expense) => run(() => supabase!.from("expenses").upsert(expenseToRow(e))),
  upsertReturn: (r: ReturnRec) => run(() => supabase!.from("returns").upsert(returnToRow(r))),

  /** Inventory is keyed by (product_id, shop_id), so upsert needs that conflict target. */
  upsertInventory: (rows: InventoryRow[]) =>
    run(() => supabase!.from("inventory").upsert(rows.map(inventoryToRow), { onConflict: "product_id,shop_id" })),

  upsertProducts: (rows: Product[]) => run(() => supabase!.from("products").upsert(rows.map(productToRow))),

  /** Settings and discounts share one singleton row. */
  saveAppState: (settings: Settings, discounts: DiscountRules) =>
    run(() => supabase!.from("app_state").upsert({ id: "singleton", settings, discounts })),
};
