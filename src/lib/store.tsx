import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

// Domain types live in store-types.ts; re-exported so existing imports
// from "@/lib/store" continue to work unchanged.
export * from "./store-types";
import type {
  Customer,
  CustomerPayment,
  DaySession,
  DiscountRules,
  Expense,
  InventoryRow,
  Product,
  Purchase,
  ReceiptDesign,
  ReturnKind,
  ReturnRec,
  Role,
  Sale,
  SaleLine,
  Settings,
  Shop,
  Supplier,
  Transfer,
  User,
} from "./store-types";
import { DEFAULT_DISCOUNTS, DEFAULT_RECEIPT } from "./store-types";
import { openSessionFor } from "./day-book";
import { dayOf, todayISO } from "./dates";
import { db, loadSnapshot } from "./db";
import { isSupabaseConfigured } from "./supabase";

// Calendar helpers moved to dates.ts so day-book.ts can share them; re-exported
// here because every screen imports them from "@/lib/store".
export * from "./dates";
export * from "./day-book";

interface StoreState {
  user: User | null;
  /** False until the saved session and the Supabase snapshot have loaded. */
  ready: boolean;
  /** True when reading/writing Supabase; false when running on built-in demo data. */
  usingSupabase: boolean;
  /** Set when Supabase was configured but could not be reached. */
  dbError: string | null;
  /**
   * Tables/columns a migration should have added but hasn't. The app runs
   * normally on real data; the affected features just can't save yet.
   */
  pendingMigration: string[] | null;
  online: boolean;
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
  login: (email: string, password: string) => User | null;
  logout: () => void;
  setOnline: (v: boolean) => void;
  addSale: (s: Omit<Sale, "id" | "invoice" | "synced">) => Sale;
  updateSale: (s: Sale) => void;
  deleteSale: (id: string) => void;
  addPurchase: (p: Omit<Purchase, "id">) => void;
  addSupplier: (s: Omit<Supplier, "id">) => Supplier;
  updateSupplier: (s: Supplier) => void;
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

  /* ------------------------------------------------------------- day book */
  /** Opens the trading day for a shop. Returns null if one is already open. */
  openDay: (input: { shopId: string; openingCash: number; openedBy: string }) => DaySession | null;
  /** Closes the day and settles the cash: what was counted, taken, and left behind. */
  closeDay: (input: {
    sessionId: string;
    countedCash: number;
    cashTakenByOwner: number;
    cashLeftInShop: number;
    closedBy: string;
    notes?: string;
  }) => void;

  /* ------------------------------------------------------ stock transfers */
  addTransfer: (t: Omit<Transfer, "id" | "transferNo">) => void;

  /* ------------------------------------------------- customers and credit */
  addCustomer: (c: Omit<Customer, "id">) => Customer;
  updateCustomer: (c: Customer) => void;
  /** Records money received against a customer's outstanding balance. */
  addCustomerPayment: (p: Omit<CustomerPayment, "id">) => void;
}
// The demo dataset now lives in seed-data.ts so the SQL seed generator can
// emit exactly the same rows the UI shows.
import {
  CUSTOMERS,
  DEFAULT_SETTINGS,
  PRODUCTS,
  SHOPS,
  SUPPLIERS,
  USERS,
  genCustomerPayments,
  genDaySessions,
  genExpenses,
  genInventory,
  genPurchases,
  genSales,
} from "./seed-data";

const StoreContext = createContext<StoreState | null>(null);

const LS_USER = "apos.user";

export function StoreProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [usingSupabase, setUsingSupabase] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [pendingMigration, setPendingMigration] = useState<string[] | null>(null);
  const [online, setOnline] = useState(true);
  const [shops, setShops] = useState<Shop[]>(SHOPS);
  const [users, setUsers] = useState<User[]>(USERS);
  const [products, setProducts] = useState<Product[]>(PRODUCTS);
  const [inventory, setInventory] = useState<InventoryRow[]>(() => genInventory());
  const [sales, setSales] = useState<Sale[]>(() => genSales());
  const [purchases, setPurchases] = useState<Purchase[]>(() => genPurchases());
  const [suppliers, setSuppliers] = useState<Supplier[]>(SUPPLIERS);
  const [expenses, setExpenses] = useState<Expense[]>(() => genExpenses());
  const [returns, setReturns] = useState<ReturnRec[]>([]);
  const [daySessions, setDaySessions] = useState<DaySession[]>(() => genDaySessions());
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [customers, setCustomers] = useState<Customer[]>(CUSTOMERS);
  const [customerPayments, setCustomerPayments] = useState<CustomerPayment[]>(() => genCustomerPayments());
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [discounts, setDiscounts] = useState<DiscountRules>(DEFAULT_DISCOUNTS);

  useEffect(() => {
    let cancelled = false;

    const restoreSession = () => {
      try {
        const raw = typeof window !== "undefined" ? window.localStorage.getItem(LS_USER) : null;
        if (raw) setUser(JSON.parse(raw));
      } catch {
        /* corrupt entry — start signed out */
      }
    };

    const boot = async () => {
      restoreSession();

      // No Supabase configured: keep the built-in demo data so a fresh clone runs.
      if (!isSupabaseConfigured) {
        if (!cancelled) setReady(true);
        return;
      }

      try {
        const snap = await loadSnapshot();
        if (cancelled) return;
        // An empty database means schema.sql ran but seed.sql did not; keeping the
        // demo data is friendlier than showing a blank app.
        if (snap.products.length === 0 && snap.shops.length === 0) {
          setDbError("Connected, but the database is empty — run supabase/seed.sql.");
        } else {
          setShops(snap.shops);
          setUsers(snap.users);
          setProducts(snap.products);
          setInventory(snap.inventory);
          setSales(snap.sales);
          setPurchases(snap.purchases);
          setSuppliers(snap.suppliers);
          setExpenses(snap.expenses);
          setReturns(snap.returns);
          setDaySessions(snap.daySessions);
          setTransfers(snap.transfers);
          setCustomers(snap.customers);
          setCustomerPayments(snap.customerPayments);
          setSettings(snap.settings);
          setDiscounts(snap.discounts);
          setUsingSupabase(true);
          // A database still on the original schema is running fine on real
          // data — it just can't record day sessions or transfers yet. That is
          // an upgrade notice, not an error, so it never blocks the app.
          setPendingMigration(snap.pendingMigration ?? null);
        }
      } catch (e) {
        // Fall back to demo data rather than leaving the till unusable.
        if (!cancelled) setDbError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setReady(true);
      }
    };

    void boot();
    return () => { cancelled = true; };
  }, []);

  /**
   * Local state has already been updated by the time this runs, so a failed
   * write is reported rather than blocking the UI. No-op on demo data.
   */
  const persist = (label: string, op: () => Promise<{ error?: string }>) => {
    if (!isSupabaseConfigured) return;
    void op().then((r) => {
      if (r.error) {
        console.error(`[supabase] ${label} failed:`, r.error);
        setDbError(`Could not save ${label}: ${r.error}`);
      }
    });
  };

  const value = useMemo<StoreState>(
    () => ({
      user,
      ready,
      usingSupabase,
      dbError,
      pendingMigration,
      online,
      shops,
      users,
      products,
      inventory,
      sales,
      purchases,
      suppliers,
      expenses,
      returns,
      daySessions,
      transfers,
      customers,
      customerPayments,
      settings,
      discounts,
      login: (email, _password) => {
        const u = users.find((x) => x.email.toLowerCase() === email.toLowerCase());
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
        // The open session decides which trading day this sale counts towards.
        // Past midnight that is still yesterday's date, which is the whole point
        // of the day book — a shop open until 2am books into the day it opened.
        const session = openSessionFor(daySessions, s.shopId);
        const sale: Sale = {
          ...s,
          id: `sale-${Date.now()}`,
          invoice: `${settings.invoicePrefix || "INV"}-S${shopIdx}-${String(counter).padStart(6, "0")}`,
          businessDate: s.businessDate ?? session?.businessDate ?? dayOf(s.date),
          sessionId: s.sessionId ?? session?.id,
          synced: online,
        };
        setSales((prev) => [sale, ...prev]);
        persist("the sale", () => db.upsertSale(sale));
        setInventory((prev) =>
          prev.map((row) => {
            if (row.shopId !== s.shopId) return row;
            const line = s.lines.find((l) => l.productId === row.productId);
            if (!line) return row;
            return { ...row, qty: Math.max(0, row.qty - line.qty) };
          }),
        );
        persist("stock levels", () =>
          db.upsertInventory(
            s.lines.map((l) => ({
              productId: l.productId,
              shopId: s.shopId,
              qty: Math.max(0, (inventory.find((r) => r.productId === l.productId && r.shopId === s.shopId)?.qty ?? 0) - l.qty),
            })),
          ),
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
        persist("the sale", () => db.upsertSale(updated));
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
          persist("stock levels", () =>
            db.upsertInventory(next.filter((r) => r.shopId === updated.shopId && ids.has(r.productId))),
          );
          return next;
        });
      },
      /** Removing a sale returns its items to stock, unless it was already returned. */
      deleteSale: (id) => {
        const sale = sales.find((s) => s.id === id);
        setSales((prev) => prev.filter((s) => s.id !== id));
        persist("the deletion", () => db.deleteSale(id));
        if (!sale || sale.status === "Returned") return;
        setInventory((prev) => {
          const next = [...prev];
          sale.lines.forEach((l) => {
            const i = next.findIndex((r) => r.productId === l.productId && r.shopId === sale.shopId);
            if (i >= 0) next[i] = { ...next[i], qty: next[i].qty + l.qty };
            else next.push({ productId: l.productId, shopId: sale.shopId, qty: l.qty });
          });
          persist("stock levels", () =>
            db.upsertInventory(next.filter((r) => r.shopId === sale.shopId && sale.lines.some((l) => l.productId === r.productId))),
          );
          return next;
        });
      },
      addPurchase: (p) => {
        const purchase: Purchase = { ...p, id: `pur-${Date.now()}` };
        setPurchases((prev) => [purchase, ...prev]);
        persist("the purchase", () => db.upsertPurchase(purchase));
        // The purchase form promises "latest cost will update for <product>";
        // nothing was actually doing it. Past sales keep the cost they recorded.
        setProducts((prev) =>
          prev.map((prod) => {
            const line = p.lines.find((l) => l.productId === prod.id && l.rate > 0);
            return line ? { ...prod, cost: line.rate } : prod;
          }),
        );
        persist("product costs", () =>
          db.upsertProducts(
            products
              .filter((prod) => p.lines.some((l) => l.productId === prod.id && l.rate > 0))
              .map((prod) => ({ ...prod, cost: p.lines.find((l) => l.productId === prod.id)!.rate })),
          ),
        );
        setInventory((prev) => {
          const next = [...prev];
          p.lines.forEach((l) => {
            const idx = next.findIndex((r) => r.productId === l.productId && r.shopId === l.shopId);
            if (idx >= 0) next[idx] = { ...next[idx], qty: next[idx].qty + l.qty };
            else next.push({ productId: l.productId, shopId: l.shopId, qty: l.qty });
          });
          persist("stock levels", () =>
            db.upsertInventory(next.filter((r) => p.lines.some((l) => l.productId === r.productId && l.shopId === r.shopId))),
          );
          return next;
        });
      },
      addSupplier: (sup) => {
        const created: Supplier = { ...sup, id: `sup-${Date.now()}` };
        setSuppliers((prev) => [...prev, created]);
        persist("the supplier", () => db.upsertSupplier(created));
        return created;
      },
      updateSupplier: (sup) => {
        setSuppliers((prev) => prev.map((x) => (x.id === sup.id ? sup : x)));
        persist("the supplier", () => db.upsertSupplier(sup));
        // Bills store the name too, so renaming a supplier must not orphan them.
        setPurchases((prev) => prev.map((p) => (p.supplierId === sup.id ? { ...p, supplier: sup.name } : p)));
        setReturns((prev) => prev.map((r) => (r.supplierId === sup.id ? { ...r, supplier: sup.name } : r)));
      },
      addExpense: (e) => {
        // Money spent while the till is open comes OUT of the drawer, so the
        // expense is tied to the session and subtracted at the evening count.
        // A back-dated expense is bookkeeping, not a drawer movement, so it is
        // deliberately left unattached.
        const session = openSessionFor(daySessions, e.shopId);
        const attach = session && dayOf(e.date) === session.businessDate ? session.id : undefined;
        const expense: Expense = { ...e, id: `exp-${Date.now()}`, sessionId: e.sessionId ?? attach };
        setExpenses((prev) => [expense, ...prev]);
        persist("the expense", () => db.upsertExpense(expense));
      },
      addReturn: (r) => {
        const isSupplier = r.kind === "supplier";
        const prefix = isSupplier ? "SRET" : "RET";
        const sameKind = returns.filter((x) => x.kind === r.kind).length;
        const rr: ReturnRec = { ...r, id: `ret-${Date.now()}`, returnNo: `${prefix}-${1000 + sameKind + 1}` };
        setReturns((prev) => [rr, ...prev]);
        persist("the return", () => db.upsertReturn(rr));

        // A customer return must also close out the original invoice, otherwise the
        // same invoice stays returnable and sales totals stay inflated.
        if (!isSupplier) {
          setSales((prev) => {
            const updated = prev.map((s) => (s.invoice === r.invoice ? { ...s, status: "Returned" as const, profit: 0 } : s));
            const touched = updated.find((s) => s.invoice === r.invoice);
            if (touched) persist("the invoice status", () => db.upsertSale(touched));
            return updated;
          });
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
          persist("stock levels", () =>
            db.upsertInventory(next.filter((row) => row.shopId === r.shopId && r.items.some((i) => i.productId === row.productId))),
          );
          return next;
        });
      },
      addProduct: (p) => {
        const product: Product = { ...p, id: `p-${Date.now()}` };
        setProducts((prev) => [...prev, product]);
        persist("the product", () => db.upsertProduct(product));
      },
      updateProduct: (p) => {
        setProducts((prev) => prev.map((x) => (x.id === p.id ? p : x)));
        persist("the product", () => db.upsertProduct(p));
      },
      updateProductAlert: (productId, lowAlert) =>
        setProducts((prev) => {
          const next = prev.map((x) => (x.id === productId ? { ...x, lowAlert: Math.max(0, lowAlert) } : x));
          const changed = next.find((x) => x.id === productId);
          if (changed) persist("the alert level", () => db.upsertProduct(changed));
          return next;
        }),
      addShop: (s) => {
        const shop: Shop = { ...s, id: `s-${Date.now()}` };
        setShops((prev) => [...prev, shop]);
        persist("the shop", () => db.upsertShop(shop));
      },
      updateShop: (s) => {
        setShops((prev) => prev.map((x) => (x.id === s.id ? s : x)));
        persist("the shop", () => db.upsertShop(s));
      },
      addUser: (u) => {
        const created: User = { ...u, id: `u-${Date.now()}` };
        setUsers((prev) => [...prev, created]);
        persist("the user", () => db.upsertUser(created));
      },
      updateSettings: (s) => {
        setSettings((prev) => {
          const next = { ...prev, ...s };
          persist("settings", () => db.saveAppState(next, discounts));
          return next;
        });
      },
      updateReceiptDesign: (r) => {
        setSettings((prev) => {
          const next = { ...prev, receipt: { ...prev.receipt, ...r } };
          persist("the receipt design", () => db.saveAppState(next, discounts));
          return next;
        });
      },
      updateDiscounts: (d) => {
        setDiscounts((prev) => {
          const next = { ...prev, ...d };
          persist("discounts", () => db.saveAppState(settings, next));
          return next;
        });
      },
      setProductDiscount: (productId, pct) =>
        setDiscounts((prev) => {
          const perProduct = { ...prev.perProduct };
          // null clears the override so the product falls back to the overall rate.
          if (pct === null) delete perProduct[productId];
          else perProduct[productId] = Math.min(100, Math.max(0, pct));
          const next = { ...prev, perProduct };
          persist("discounts", () => db.saveAppState(settings, next));
          return next;
        }),

      /**
       * Starts the trading day.
       *
       * The business date is today's LOCAL date at the moment of opening. A shop
       * unlocking at 08:00 books to today; one that opened yesterday evening and
       * never closed keeps its original date until someone ends the day.
       */
      openDay: ({ shopId, openingCash, openedBy }) => {
        // Two open sessions at one shop would double-count every sale, so the
        // guard lives here rather than only in the UI that calls it.
        if (openSessionFor(daySessions, shopId)) return null;
        const session: DaySession = {
          id: `day-${Date.now()}`,
          shopId,
          businessDate: todayISO(),
          openedAt: new Date().toISOString(),
          openedBy,
          openingCash: Math.max(0, openingCash),
          status: "open",
        };
        setDaySessions((prev) => [session, ...prev]);
        persist("the day open", () => db.upsertDaySession(session));
        return session;
      },

      closeDay: ({ sessionId, countedCash, cashTakenByOwner, cashLeftInShop, closedBy, notes }) => {
        setDaySessions((prev) => {
          const next = prev.map((s) =>
            s.id === sessionId
              ? {
                  ...s,
                  status: "closed" as const,
                  closedAt: new Date().toISOString(),
                  closedBy,
                  countedCash: Math.max(0, countedCash),
                  cashTakenByOwner: Math.max(0, cashTakenByOwner),
                  // What stays behind becomes the next session's opening float,
                  // which is how yesterday's leftover cash shows up in tomorrow's
                  // total instead of vanishing between the two days.
                  cashLeftInShop: Math.max(0, cashLeftInShop),
                  notes,
                }
              : s,
          );
          const closed = next.find((s) => s.id === sessionId);
          if (closed) persist("the day close", () => db.upsertDaySession(closed));
          return next;
        });
      },

      addTransfer: (t) => {
        const transfer: Transfer = {
          ...t,
          id: `trf-${Date.now()}`,
          transferNo: `TRF-${1000 + transfers.length + 1}`,
        };
        setTransfers((prev) => [transfer, ...prev]);
        persist("the transfer", () => db.upsertTransfer(transfer));

        // One movement, two sides: the source loses the stock and the
        // destination gains it, in a single state update so they cannot drift.
        setInventory((prev) => {
          const next = [...prev];
          const bump = (productId: string, shopId: string, delta: number) => {
            const i = next.findIndex((r) => r.productId === productId && r.shopId === shopId);
            if (i >= 0) next[i] = { ...next[i], qty: Math.max(0, next[i].qty + delta) };
            else if (delta > 0) next.push({ productId, shopId, qty: delta });
          };
          t.items.forEach((item) => {
            bump(item.productId, t.fromShopId, -item.qty);
            bump(item.productId, t.toShopId, item.qty);
          });
          persist("stock levels", () =>
            db.upsertInventory(
              next.filter(
                (r) =>
                  (r.shopId === t.fromShopId || r.shopId === t.toShopId) &&
                  t.items.some((i) => i.productId === r.productId),
              ),
            ),
          );
          return next;
        });
      },

      addCustomer: (c) => {
        const created: Customer = { ...c, id: `cust-${Date.now()}` };
        setCustomers((prev) => [...prev, created]);
        persist("the customer", () => db.upsertCustomer(created));
        return created;
      },

      updateCustomer: (c) => {
        setCustomers((prev) => prev.map((x) => (x.id === c.id ? c : x)));
        persist("the customer", () => db.upsertCustomer(c));
        // Invoices print the name they were issued with, so a rename has to
        // reach them too or old bills credit a customer who no longer exists.
        setSales((prev) => prev.map((s) => (s.customerId === c.id ? { ...s, customer: c.name } : s)));
      },

      addCustomerPayment: (p) => {
        // Collected while the till is open, so it's drawer cash and the evening
        // count must expect it. Attached by session id rather than by date so a
        // payment taken at 1am still belongs to the day that's still open.
        const session = openSessionFor(daySessions, p.shopId);
        const attach = session && dayOf(p.date) <= session.businessDate ? session.id : undefined;
        const payment: CustomerPayment = { ...p, id: `pay-${Date.now()}`, sessionId: p.sessionId ?? attach };
        setCustomerPayments((prev) => [payment, ...prev]);
        persist("the payment", () => db.upsertCustomerPayment(payment));
      },
    }),
    [user, ready, usingSupabase, dbError, pendingMigration, online, shops, users, products, inventory, sales, purchases, suppliers, expenses, returns, daySessions, transfers, customers, customerPayments, settings, discounts],
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

/**
 * Rebuilds stock as it stood at the END of `asOf` (YYYY-MM-DD).
 *
 * There are no historical snapshots, so this rewinds today's quantities back
 * through every movement recorded AFTER that day:
 *   sales after      → stock was higher then  (add back)
 *   purchases after  → stock was lower then   (subtract)
 *   customer returns after → stock was lower then (subtract)
 *   supplier returns after → stock was higher then (add back)
 *   transfers after  → the source held more and the destination held less
 *
 * Accurate only as far back as the recorded movements go.
 */
export function stockAsOf(
  asOf: string,
  data: {
    inventory: InventoryRow[];
    sales: Sale[];
    purchases: Purchase[];
    returns: ReturnRec[];
    transfers?: Transfer[];
  },
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

  // Rewinding a transfer puts the goods back where they came from.
  (data.transfers ?? [])
    .filter((t) => dayOf(t.date) > asOf)
    .forEach((t) =>
      t.items.forEach((i) => {
        shift(i.productId, t.fromShopId, i.qty);
        shift(i.productId, t.toShopId, -i.qty);
      }),
    );

  return [...map.values()].map((r) => ({ ...r, qty: Math.max(0, r.qty) }));
}