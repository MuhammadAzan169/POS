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
  type Activity,
  type Adjustment,
  type Customer,
  type CustomerPayment,
  type DaySession,
  type DiscountRules,
  type Expense,
  type InventoryRow,
  type Message,
  type Product,
  type Purchase,
  type ReturnRec,
  type Sale,
  type SetOff,
  type Settings,
  type Shop,
  type Supplier,
  type SupplierPayment,
  type Transfer,
  type User,
} from "./store-types";
import { purchaseSettlement } from "./store-types";
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
  supplierPayments: SupplierPayment[];
  setOffs: SetOff[];
  adjustments: Adjustment[];
  /** Deletions and edits worth answering for, newest first. */
  activity: Activity[];
  messages: Message[];
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
  profitTarget: r.profit_target === null || r.profit_target === undefined ? undefined : Number(r.profit_target),
  wholesaleProfitTarget:
    r.wholesale_profit_target === null || r.wholesale_profit_target === undefined
      ? undefined
      : Number(r.wholesale_profit_target),
  lowAlert: r.low_alert, active: r.active,
});
const productToRow = (p: Product) => ({
  id: p.id, barcode: p.barcode, name: p.name, category: p.category, brand: p.brand,
  size: p.size ?? null, color: p.color ?? null, cost: p.cost, price: p.price,
  wholesale_price: p.wholesalePrice ?? null,
  profit_target: p.profitTarget ?? null,
  wholesale_profit_target: p.wholesaleProfitTarget ?? null,
  low_alert: p.lowAlert, active: p.active,
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
  payment: r.payment ?? undefined,
  amountPaid: r.amount_paid === null || r.amount_paid === undefined ? undefined : Number(r.amount_paid),
  dueDate: r.due_date ?? undefined,
  sessionId: r.session_id ?? undefined,
});
const purchaseToRow = (p: Purchase) => ({
  id: p.id, bill_no: p.billNo, supplier: p.supplier, supplier_id: p.supplierId ?? null,
  date: p.date, lines: p.lines, total: p.total,
  created_by: p.createdBy ?? null, created_by_shop_id: p.createdByShopId ?? null,
  // The old boolean is kept in step with the new numbers so a database still
  // reading `paid` — or a report written against it — never disagrees.
  paid: purchaseSettlement(p).balance === 0,
  payment: p.payment ?? null,
  amount_paid: p.amountPaid ?? null,
  due_date: p.dueDate ?? null,
  session_id: p.sessionId ?? null,
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
  creditLimit: Number(r.credit_limit ?? 0), linkedSupplierId: r.linked_supplier_id ?? undefined,
  active: r.active,
});
const customerToRow = (c: Customer) => ({
  id: c.id, name: c.name, contact: c.contact, phone: c.phone, address: c.address, notes: c.notes,
  kind: c.kind, credit_limit: c.creditLimit, linked_supplier_id: c.linkedSupplierId ?? null,
  active: c.active,
});

const rowToCustomerPayment = (r: any): CustomerPayment => ({
  id: r.id, customerId: r.customer_id, date: r.date, amount: Number(r.amount), method: r.method,
  shopId: r.shop_id, sessionId: r.session_id ?? undefined, note: r.note ?? "", receivedBy: r.received_by ?? "",
});
const customerPaymentToRow = (p: CustomerPayment) => ({
  id: p.id, customer_id: p.customerId, date: p.date, amount: p.amount, method: p.method,
  shop_id: p.shopId, session_id: p.sessionId ?? null, note: p.note, received_by: p.receivedBy,
});

const rowToSupplierPayment = (r: any): SupplierPayment => ({
  id: r.id, supplierId: r.supplier_id, date: r.date, amount: Number(r.amount), method: r.method,
  shopId: r.shop_id ?? "", sessionId: r.session_id ?? undefined, note: r.note ?? "", paidBy: r.paid_by ?? "",
});
const supplierPaymentToRow = (p: SupplierPayment) => ({
  id: p.id, supplier_id: p.supplierId, date: p.date, amount: p.amount, method: p.method,
  // Head office pays with no till behind it, and an empty string is not a shop
  // id — storing null keeps the foreign key honest.
  shop_id: p.shopId || null, session_id: p.sessionId ?? null, note: p.note, paid_by: p.paidBy,
});

const rowToSetOff = (r: any): SetOff => ({
  id: r.id, date: r.date, customerId: r.customer_id, supplierId: r.supplier_id,
  amount: Number(r.amount), note: r.note ?? "", createdBy: r.created_by ?? "",
});
const setOffToRow = (x: SetOff) => ({
  id: x.id, date: x.date, customer_id: x.customerId, supplier_id: x.supplierId,
  amount: x.amount, note: x.note, created_by: x.createdBy,
});

const rowToAdjustment = (r: any): Adjustment => ({
  id: r.id, date: r.date,
  customerId: r.customer_id ?? undefined, supplierId: r.supplier_id ?? undefined,
  amount: Number(r.amount), reason: r.reason ?? "", createdBy: r.created_by ?? "",
});
const adjustmentToRow = (a: Adjustment) => ({
  id: a.id, date: a.date,
  customer_id: a.customerId ?? null, supplier_id: a.supplierId ?? null,
  amount: a.amount, reason: a.reason, created_by: a.createdBy,
});

const rowToActivity = (r: any): Activity => ({
  id: r.id, at: r.at, action: r.action, entity: r.entity, entityId: r.entity_id,
  label: r.label ?? "", amount: Number(r.amount ?? 0), shopId: r.shop_id ?? undefined,
  byUserId: r.by_user_id ?? undefined, byName: r.by_name ?? "", byRole: r.by_role === "admin" ? "admin" : "shop",
  snapshot: r.snapshot ?? null,
  restoredAt: r.restored_at ?? undefined, restoredBy: r.restored_by ?? undefined,
});
const activityToRow = (a: Activity) => ({
  id: a.id, at: a.at, action: a.action, entity: a.entity, entity_id: a.entityId,
  label: a.label, amount: a.amount, shop_id: a.shopId ?? null,
  by_user_id: a.byUserId ?? null, by_name: a.byName, by_role: a.byRole,
  // The whole deleted row travels as JSONB, which is what makes a restore put
  // back the original id and numbering rather than a fresh copy.
  snapshot: a.snapshot ?? null,
  restored_at: a.restoredAt ?? null, restored_by: a.restoredBy ?? null,
});

const rowToMessage = (r: any): Message => ({
  id: r.id, shopId: r.shop_id, fromRole: r.from_role === "admin" ? "admin" : "shop",
  fromUserId: r.from_user_id ?? undefined, fromName: r.from_name ?? "", body: r.body ?? "",
  createdAt: r.created_at, readByAdmin: Boolean(r.read_by_admin), readByShop: Boolean(r.read_by_shop),
});
const messageToRow = (m: Message) => ({
  id: m.id, shop_id: m.shopId, from_role: m.fromRole, from_user_id: m.fromUserId ?? null,
  from_name: m.fromName, body: m.body, created_at: m.createdAt,
  read_by_admin: m.readByAdmin, read_by_shop: m.readByShop,
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

  const [
    core, daySessions, transfers, customers, customerPayments,
    supplierPayments, setOffs, adjustments, activity, messages,
  ] = await Promise.all([
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
    selectOptional(
      "supplier_payments",
      () => supabase!.from("supplier_payments").select("*").order("date", { ascending: false }),
      rowToSupplierPayment,
      missing,
    ),
    selectOptional(
      "set_offs",
      () => supabase!.from("set_offs").select("*").order("date", { ascending: false }),
      rowToSetOff,
      missing,
    ),
    selectOptional(
      "balance_adjustments",
      () => supabase!.from("balance_adjustments").select("*").order("date", { ascending: false }),
      rowToAdjustment,
      missing,
    ),
    // Only the recent tail: the log grows for ever and nobody scrolls a year
    // back, so the whole history is not worth loading on every boot.
    selectOptional(
      "activity_log",
      () => supabase!.from("activity_log").select("*").order("at", { ascending: false }).limit(500),
      rowToActivity,
      missing,
    ),
    // Only the recent tail: a thread is read newest-first and nobody scrolls a
    // year back, so the whole history is not worth loading on every boot.
    selectOptional(
      "messages",
      () => supabase!.from("messages").select("*").order("created_at", { ascending: false }).limit(500),
      rowToMessage,
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
  // Part-paid bills need somewhere to record how much was paid; without the
  // column every bill still reads as all-or-nothing through `paid`.
  // A product row without the column simply comes back without a target, which
  // reads as "not pinned" — correct, but worth naming so the owner knows why
  // the field they filled in did not stick.
  const productRows = (products.data ?? []) as any[];
  if (productRows.length > 0 && !("profit_target" in productRows[0])) missing.push("products.profit_target");
  const purchaseRows = (purchases.data ?? []) as any[];
  if (purchaseRows.length > 0 && !("amount_paid" in purchaseRows[0])) missing.push("purchases.amount_paid");

  return {
    shops: shopRows.map(rowToShop),
    users: (users.data ?? []).map(rowToUser),
    products: productRows.map(rowToProduct),
    inventory: (inventory.data ?? []).map(rowToInventory),
    sales: saleRows.map(rowToSale),
    purchases: purchaseRows.map(rowToPurchase),
    suppliers: (suppliers.data ?? []).map(rowToSupplier),
    expenses: (expenses.data ?? []).map(rowToExpense),
    returns: (returns.data ?? []).map(rowToReturn),
    daySessions,
    transfers,
    customers,
    customerPayments,
    supplierPayments,
    setOffs,
    adjustments,
    activity,
    // Oldest first: a conversation reads downwards, so the UI never has to
    // reverse it and the two orderings can't drift apart.
    messages: [...messages].reverse(),
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

  upsertSupplierPayment: (p: SupplierPayment) =>
    run(() => supabase!.from("supplier_payments").upsert(supplierPaymentToRow(p))),
  deleteSupplierPayment: (id: string) =>
    run(() => supabase!.from("supplier_payments").delete().eq("id", id)),

  upsertSetOff: (x: SetOff) => run(() => supabase!.from("set_offs").upsert(setOffToRow(x))),
  deleteSetOff: (id: string) => run(() => supabase!.from("set_offs").delete().eq("id", id)),

  /**
   * The log is append-only by design, so there is no delete here — only an
   * upsert, which doubles as the write that marks an entry restored.
   */
  upsertActivity: (a: Activity) => run(() => supabase!.from("activity_log").upsert(activityToRow(a))),

  upsertAdjustment: (a: Adjustment) =>
    run(() => supabase!.from("balance_adjustments").upsert(adjustmentToRow(a))),
  deleteAdjustment: (id: string) =>
    run(() => supabase!.from("balance_adjustments").delete().eq("id", id)),

  /** Inventory is keyed by (product_id, shop_id), so upsert needs that conflict target. */
  upsertInventory: (rows: InventoryRow[]) =>
    run(() => supabase!.from("inventory").upsert(rows.map(inventoryToRow), { onConflict: "product_id,shop_id" })),

  upsertProducts: (rows: Product[]) => run(() => supabase!.from("products").upsert(rows.map(productToRow))),

  upsertMessage: (m: Message) => run(() => supabase!.from("messages").upsert(messageToRow(m))),
  deleteMessage: (id: string) => run(() => supabase!.from("messages").delete().eq("id", id)),

  /** Wipes one shop's whole conversation in a single statement. */
  deleteThread: (shopId: string) =>
    run(() => supabase!.from("messages").delete().eq("shop_id", shopId)),

  /**
   * Marks every message in one shop's thread as seen by the given side.
   *
   * Done as one statement rather than a row-per-message loop: opening a thread
   * with forty unread messages would otherwise fire forty requests, and the
   * filter is exactly the same condition the unread badge counts.
   */
  markThreadRead: (shopId: string, role: "admin" | "shop") =>
    run(() =>
      supabase!
        .from("messages")
        .update(role === "admin" ? { read_by_admin: true } : { read_by_shop: true })
        .eq("shop_id", shopId)
        // Your own messages need no marking, and excluding them keeps the write
        // to the rows that actually change.
        .neq("from_role", role),
    ),

  /** Settings and discounts share one singleton row. */
  saveAppState: (settings: Settings, discounts: DiscountRules) =>
    run(() => supabase!.from("app_state").upsert({ id: "singleton", settings, discounts })),
};

/**
 * Live message delivery.
 *
 * Postgres changes are pushed over a websocket, so a message typed at head
 * office appears on the shop's screen without either side reloading. Returns an
 * unsubscribe function; a no-op when Supabase isn't configured, which keeps the
 * caller free of `if (supabase)` branches.
 *
 * All three events matter: INSERT delivers, UPDATE is how "read" propagates so
 * the sender sees their ticks turn, and DELETE has to reach the other side too
 * — a deleted message that stays on someone else's screen until they reload is
 * worse than not deleting it at all.
 */
export function subscribeToMessages(handlers: {
  onUpsert: (m: Message) => void;
  onDelete: (id: string) => void;
}): () => void {
  if (!supabase) return () => {};
  const channel = supabase
    .channel("messages-live")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "messages" },
      (payload) => {
        if (payload.eventType === "DELETE") {
          // `replica identity full` (set by the migration) means the deleted row
          // arrives whole rather than as a bare primary key.
          const id = (payload.old as { id?: string } | null)?.id;
          if (id) handlers.onDelete(id);
          return;
        }
        handlers.onUpsert(rowToMessage(payload.new));
      },
    )
    .subscribe();
  return () => { void supabase!.removeChannel(channel); };
}
