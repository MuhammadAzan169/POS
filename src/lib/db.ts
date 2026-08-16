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
  type Customer,
  type CustomerPayment,
  type DaySession,
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
  type Transfer,
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
  daySessions: DaySession[];
  transfers: Transfer[];
  customers: Customer[];
  customerPayments: CustomerPayment[];
  settings: Settings;
  discounts: DiscountRules;
  /**
   * Tables or columns a migration should have added but which are not there
   * yet. Empty/undefined means the database is fully up to date.
   */
  pendingMigration?: string[];
}

/* ------------------------------------------------------------------ mappers */

const rowToShop = (r: any): Shop => ({
  id: r.id, name: r.name, kind: r.kind === "wholesale" ? "wholesale" : "retail",
  address: r.address ?? "", phone: r.phone ?? "", active: r.active,
});
const shopToRow = (s: Shop) => ({
  id: s.id, name: s.name, kind: s.kind ?? "retail", address: s.address, phone: s.phone, active: s.active,
});

const rowToUser = (r: any): User => ({
  id: r.id, name: r.name, email: r.email, role: r.role, shopId: r.shop_id ?? undefined, active: r.active, lastLogin: r.last_login ?? undefined,
});
const userToRow = (u: User) => ({
  id: u.id, name: u.name, email: u.email, role: u.role, shop_id: u.shopId ?? null, active: u.active, last_login: u.lastLogin ?? null,
});

const rowToProduct = (r: any): Product => ({
  id: r.id, barcode: r.barcode ?? "", name: r.name, category: r.category ?? "", brand: r.brand ?? "",
  size: r.size ?? undefined, color: r.color ?? undefined,
  cost: Number(r.cost), price: Number(r.price),
  wholesalePrice: r.wholesale_price === null || r.wholesale_price === undefined ? undefined : Number(r.wholesale_price),
  lowAlert: r.low_alert, active: r.active,
});
const productToRow = (p: Product) => ({
  id: p.id, barcode: p.barcode, name: p.name, category: p.category, brand: p.brand,
  size: p.size ?? null, color: p.color ?? null, cost: p.cost, price: p.price,
  wholesale_price: p.wholesalePrice ?? null, low_alert: p.lowAlert, active: p.active,
});

const rowToInventory = (r: any): InventoryRow => ({ productId: r.product_id, shopId: r.shop_id, qty: r.qty });
const inventoryToRow = (r: InventoryRow) => ({ product_id: r.productId, shop_id: r.shopId, qty: r.qty });

const rowToSale = (r: any): Sale => ({
  id: r.id, invoice: r.invoice, shopId: r.shop_id, date: r.date,
  businessDate: r.business_date ?? undefined, sessionId: r.session_id ?? undefined,
  customer: r.customer, customerId: r.customer_id ?? undefined, cashier: r.cashier,
  lines: r.lines ?? [], subtotal: Number(r.subtotal), discount: Number(r.discount), total: Number(r.total),
  profit: Number(r.profit), payment: r.payment, status: r.status, synced: r.synced,
});
const saleToRow = (s: Sale) => ({
  id: s.id, invoice: s.invoice, shop_id: s.shopId, date: s.date,
  business_date: s.businessDate ?? null, session_id: s.sessionId ?? null,
  customer: s.customer, customer_id: s.customerId ?? null, cashier: s.cashier,
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
  createdBy: r.created_by ?? undefined, createdByShopId: r.created_by_shop_id ?? undefined,
  paid: r.paid ?? undefined,
});
const purchaseToRow = (p: Purchase) => ({
  id: p.id, bill_no: p.billNo, supplier: p.supplier, supplier_id: p.supplierId ?? null,
  date: p.date, lines: p.lines, total: p.total,
  created_by: p.createdBy ?? null, created_by_shop_id: p.createdByShopId ?? null,
  paid: p.paid ?? true,
});

const rowToExpense = (r: any): Expense => ({
  id: r.id, date: r.date, shopId: r.shop_id, category: r.category, description: r.description ?? "",
  amount: Number(r.amount), addedBy: r.added_by ?? "", sessionId: r.session_id ?? undefined,
});
const expenseToRow = (e: Expense) => ({
  id: e.id, date: e.date, shop_id: e.shopId, category: e.category, description: e.description,
  amount: e.amount, added_by: e.addedBy, session_id: e.sessionId ?? null,
});

const rowToDaySession = (r: any): DaySession => ({
  id: r.id, shopId: r.shop_id, businessDate: r.business_date, openedAt: r.opened_at, openedBy: r.opened_by ?? "",
  openingCash: Number(r.opening_cash), status: r.status,
  closedAt: r.closed_at ?? undefined, closedBy: r.closed_by ?? undefined,
  countedCash: r.counted_cash === null || r.counted_cash === undefined ? undefined : Number(r.counted_cash),
  cashTakenByOwner: r.cash_taken_by_owner === null || r.cash_taken_by_owner === undefined ? undefined : Number(r.cash_taken_by_owner),
  cashLeftInShop: r.cash_left_in_shop === null || r.cash_left_in_shop === undefined ? undefined : Number(r.cash_left_in_shop),
  notes: r.notes ?? undefined,
});
const daySessionToRow = (s: DaySession) => ({
  id: s.id, shop_id: s.shopId, business_date: s.businessDate, opened_at: s.openedAt, opened_by: s.openedBy,
  opening_cash: s.openingCash, status: s.status,
  closed_at: s.closedAt ?? null, closed_by: s.closedBy ?? null,
  counted_cash: s.countedCash ?? null, cash_taken_by_owner: s.cashTakenByOwner ?? null,
  cash_left_in_shop: s.cashLeftInShop ?? null, notes: s.notes ?? null,
});

const rowToCustomer = (r: any): Customer => ({
  id: r.id, name: r.name, contact: r.contact ?? "", phone: r.phone ?? "", address: r.address ?? "",
  notes: r.notes ?? "", kind: r.kind === "wholesale" ? "wholesale" : "retail",
  creditLimit: Number(r.credit_limit ?? 0), active: r.active,
});
const customerToRow = (c: Customer) => ({
  id: c.id, name: c.name, contact: c.contact, phone: c.phone, address: c.address, notes: c.notes,
  kind: c.kind, credit_limit: c.creditLimit, active: c.active,
});

const rowToCustomerPayment = (r: any): CustomerPayment => ({
  id: r.id, customerId: r.customer_id, date: r.date, amount: Number(r.amount), method: r.method,
  shopId: r.shop_id, sessionId: r.session_id ?? undefined, note: r.note ?? "", receivedBy: r.received_by ?? "",
});
const customerPaymentToRow = (p: CustomerPayment) => ({
  id: p.id, customer_id: p.customerId, date: p.date, amount: p.amount, method: p.method,
  shop_id: p.shopId, session_id: p.sessionId ?? null, note: p.note, received_by: p.receivedBy,
});

const rowToTransfer = (r: any): Transfer => ({
  id: r.id, transferNo: r.transfer_no, date: r.date, fromShopId: r.from_shop_id, toShopId: r.to_shop_id,
  items: r.items ?? [], notes: r.notes ?? "", createdBy: r.created_by ?? "",
});
const transferToRow = (t: Transfer) => ({
  id: t.id, transfer_no: t.transferNo, date: t.date, from_shop_id: t.fromShopId, to_shop_id: t.toShopId,
  items: t.items, notes: t.notes, created_by: t.createdBy,
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

/**
 * Postgres raises 42P01 for "relation does not exist"; PostgREST reports the
 * same condition as PGRST205 when the table is missing from its schema cache.
 * Either one means the migration simply has not been run yet.
 */
function isMissingTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  return /does not exist|schema cache/i.test(error.message ?? "");
}

/** Ditto for a column the migration adds to an existing table. */
function isMissingColumn(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "42703" || /column .* does not exist/i.test(error.message ?? "");
}

/**
 * Reads a table that a later migration introduced.
 *
 * A database still on the original schema must keep working: the day book and
 * transfers are additive features, so their tables being absent is a missing
 * upgrade, not a broken install. Treating it as fatal took the entire app —
 * products, sales, the lot — offline over two tables the user may not need yet.
 */
async function selectOptional<T>(
  table: string,
  build: () => PromiseLike<{ data: unknown[] | null; error: { code?: string; message?: string } | null }>,
  map: (row: any) => T,
  missing: string[],
): Promise<T[]> {
  const { data, error } = await build();
  if (error) {
    if (isMissingTable(error)) {
      missing.push(table);
      return [];
    }
    throw new Error(`${table}: ${error.message}`);
  }
  return (data ?? []).map(map);
}

/**
 * Loads the whole dataset.
 *
 * Throws only when something the app genuinely cannot run without fails. Tables
 * and columns added by a migration the user has not applied yet are reported
 * through `snapshot.pendingMigration` instead, so the app runs on real data and
 * tells them exactly what to run.
 */
export async function loadSnapshot(): Promise<Snapshot> {
  if (!supabase) throw new Error("Supabase is not configured");

  const missing: string[] = [];

  const [core, daySessions, transfers, customers, customerPayments] = await Promise.all([
    Promise.all([
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
    ]),
    selectOptional(
      "day_sessions",
      () => supabase!.from("day_sessions").select("*").order("business_date", { ascending: false }),
      rowToDaySession,
      missing,
    ),
    selectOptional(
      "transfers",
      () => supabase!.from("transfers").select("*").order("date", { ascending: false }),
      rowToTransfer,
      missing,
    ),
    selectOptional(
      "customers",
      () => supabase!.from("customers").select("*").order("name"),
      rowToCustomer,
      missing,
    ),
    selectOptional(
      "customer_payments",
      () => supabase!.from("customer_payments").select("*").order("date", { ascending: false }),
      rowToCustomerPayment,
      missing,
    ),
  ]);

  const [shops, users, products, inventory, sales, purchases, suppliers, expenses, returns, appState] = core;

  const failed = core.find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  // `select("*")` never fails on a missing column, so the new fields simply come
  // back undefined and the mappers fall back. Detect it from the data instead so
  // the upgrade notice is still accurate.
  const shopRows = (shops.data ?? []) as any[];
  if (shopRows.length > 0 && !("kind" in shopRows[0])) missing.push("shops.kind");
  const saleRows = (sales.data ?? []) as any[];
  if (saleRows.length > 0 && !("business_date" in saleRows[0])) missing.push("sales.business_date");
  if (saleRows.length > 0 && !("customer_id" in saleRows[0])) missing.push("sales.customer_id");

  return {
    shops: shopRows.map(rowToShop),
    users: (users.data ?? []).map(rowToUser),
    products: (products.data ?? []).map(rowToProduct),
    inventory: (inventory.data ?? []).map(rowToInventory),
    sales: saleRows.map(rowToSale),
    purchases: (purchases.data ?? []).map(rowToPurchase),
    suppliers: (suppliers.data ?? []).map(rowToSupplier),
    expenses: (expenses.data ?? []).map(rowToExpense),
    returns: (returns.data ?? []).map(rowToReturn),
    daySessions,
    transfers,
    customers,
    customerPayments,
    settings: { ...DEFAULT_SETTINGS, ...((appState.data?.settings as Partial<Settings>) ?? {}) },
    discounts: { ...DEFAULT_DISCOUNTS, ...((appState.data?.discounts as Partial<DiscountRules>) ?? {}) },
    pendingMigration: missing.length > 0 ? missing : undefined,
  };
}

/* ------------------------------------------------------------------- writes */

/**
 * Writes are fire-and-forget from the UI's point of view: local state has
 * already been updated, so a failure surfaces as a toast rather than blocking
 * the till. Every call is a no-op when Supabase isn't configured.
 */
type Result = { error?: string };

async function run(fn: () => PromiseLike<{ error: { code?: string; message: string } | null }>): Promise<Result> {
  if (!supabase) return {};
  try {
    const { error } = await fn();
    if (!error) return {};
    // "relation day_sessions does not exist" tells the shopkeeper nothing. Name
    // the actual remedy instead, since there is exactly one.
    if (isMissingTable(error) || isMissingColumn(error)) {
      return { error: "the database is missing an update — run the files in supabase/migrations/" };
    }
    return { error: error.message };
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
  deletePurchase: (id: string) => run(() => supabase!.from("purchases").delete().eq("id", id)),
  upsertExpense: (e: Expense) => run(() => supabase!.from("expenses").upsert(expenseToRow(e))),
  deleteExpense: (id: string) => run(() => supabase!.from("expenses").delete().eq("id", id)),
  upsertReturn: (r: ReturnRec) => run(() => supabase!.from("returns").upsert(returnToRow(r))),
  deleteReturn: (id: string) => run(() => supabase!.from("returns").delete().eq("id", id)),
  upsertDaySession: (s: DaySession) => run(() => supabase!.from("day_sessions").upsert(daySessionToRow(s))),
  deleteDaySession: (id: string) => run(() => supabase!.from("day_sessions").delete().eq("id", id)),
  upsertTransfer: (t: Transfer) => run(() => supabase!.from("transfers").upsert(transferToRow(t))),
  deleteTransfer: (id: string) => run(() => supabase!.from("transfers").delete().eq("id", id)),
  upsertCustomer: (c: Customer) => run(() => supabase!.from("customers").upsert(customerToRow(c))),
  upsertCustomerPayment: (p: CustomerPayment) =>
    run(() => supabase!.from("customer_payments").upsert(customerPaymentToRow(p))),
  deleteCustomerPayment: (id: string) =>
    run(() => supabase!.from("customer_payments").delete().eq("id", id)),

  /** Inventory is keyed by (product_id, shop_id), so upsert needs that conflict target. */
  upsertInventory: (rows: InventoryRow[]) =>
    run(() => supabase!.from("inventory").upsert(rows.map(inventoryToRow), { onConflict: "product_id,shop_id" })),

  upsertProducts: (rows: Product[]) => run(() => supabase!.from("products").upsert(rows.map(productToRow))),

  /** Settings and discounts share one singleton row. */
  saveAppState: (settings: Settings, discounts: DiscountRules) =>
    run(() => supabase!.from("app_state").upsert({ id: "singleton", settings, discounts })),
};
