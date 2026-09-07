import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

// Domain types live in store-types.ts; re-exported so existing imports
// from "@/lib/store" continue to work unchanged.
export * from "./store-types";
import type {
  Activity,
  ActivityEntity,
  Adjustment,
  Customer,
  CustomerPayment,
  DaySession,
  DiscountRules,
  Expense,
  InventoryRow,
  InvoiceDesign,
  Message,
  Product,
  Purchase,
  ReceiptDesign,
  ReturnKind,
  ReturnRec,
  Role,
  Sale,
  SaleLine,
  SetOff,
  Settings,
  Shop,
  Supplier,
  SupplierPayment,
  Transfer,
  User,
} from "./store-types";
import {
  DEFAULT_DISCOUNTS,
  DEFAULT_RECEIPT,
  customerNameOf,
  discountSplitOf,
  isRestorable,
} from "./store-types";
import { openSessionFor } from "./day-book";
import { dayOf, todayISO } from "./dates";
import { db, loadSnapshot, subscribeToMessages } from "./db";
import * as auth from "./auth";
import { staffEmail } from "./auth-identity";
import { maxSetOff } from "./ledger";
import { repriceForCost } from "./store-types";
import { isSupabaseConfigured } from "./supabase";

// Calendar helpers moved to dates.ts so day-book.ts can share them; re-exported
// here because every screen imports them from "@/lib/store".
export * from "./dates";
export * from "./day-book";
export * from "./ledger";

export interface AuthOutcome {
  user: User | null;
  error?: string;
}

interface StoreState {
  user: User | null;
  /** False until the saved session and the Supabase snapshot have loaded. */
  ready: boolean;
  /** True once the database has answered. False means it never did. */
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
  /** Money paid out to suppliers, against their bills or ahead of them. */
  supplierPayments: SupplierPayment[];
  /** Debts cancelled against each other with a partner you both buy from and sell to. */
  setOffs: SetOff[];
  /** Hand-made changes to what a party owes: write-offs, opening balances, corrections. */
  adjustments: Adjustment[];
  /**
   * Deletions and edits worth answering for, newest first.
   *
   * Append-only: an entry that could itself be removed would be no record at
   * all. Deletions carry the whole row, so they can be put back.
   */
  activity: Activity[];
  /** The owner↔shop conversation, oldest first, live over a websocket. */
  messages: Message[];
  settings: Settings;
  discounts: DiscountRules;
  /**
   * Signs in against the database. There is no other path.
   *
   * `kind` decides how the identifier is read: an owner types an email, a shop
   * worker types a username that becomes one.
   */
  signIn: (identifier: string, password: string, kind: "owner" | "staff") => Promise<AuthOutcome>;
  /** Claims the one owner account. Refused by the database once one exists. */
  createOwner: (details: auth.OwnerDetails) => Promise<AuthOutcome>;
  logout: () => void;
  addSale: (s: Omit<Sale, "id" | "invoice" | "synced">) => Sale;
  updateSale: (s: Sale) => void;
  deleteSale: (id: string) => void;
  addPurchase: (p: Omit<Purchase, "id">) => void;
  /** Re-books a bill: stock moves by the difference between old and new lines. */
  updatePurchase: (p: Purchase) => void;
  /** Removes a bill and takes the stock it brought in back off the shelves. */
  deletePurchase: (id: string) => void;
  addSupplier: (s: Omit<Supplier, "id">) => Supplier;
  updateSupplier: (s: Supplier) => void;
  addExpense: (e: Omit<Expense, "id">) => void;
  updateExpense: (e: Expense) => void;
  deleteExpense: (id: string) => void;
  addReturn: (r: Omit<ReturnRec, "id" | "returnNo">) => void;
  /** Corrects a recorded return, moving stock by the difference in quantities. */
  updateReturn: (r: ReturnRec) => void;
  /** Undoes a return: stock goes back as it was, and the invoice re-opens. */
  deleteReturn: (id: string) => void;
  updateProductAlert: (productId: string, lowAlert: number) => void;
  /** Returns the product so a caller can give it an opening stock straight away. */
  addProduct: (p: Omit<Product, "id">) => Product;
  /**
   * Records what is ALREADY on the shelf when a shop starts using the system.
   *
   * Sets the count outright rather than adding to it, because that is what the
   * person doing it is holding: a number they have just counted, not a delivery.
   * It deliberately writes no purchase — there is no bill, no supplier and no
   * cost to book, and inventing one would put money into the accounts that the
   * business never spent.
   */
  setOpeningStock: (shopId: string, entries: { productId: string; qty: number }[]) => void;
  updateProduct: (p: Product) => void;
  addShop: (s: Omit<Shop, "id">) => Shop;
  updateShop: (s: Shop) => void;
  addUser: (u: User) => void;
  updateUser: (u: User) => void;
  updateSettings: (s: Partial<Settings>) => void;
  updateReceiptDesign: (r: Partial<ReceiptDesign>) => void;
  updateInvoiceDesign: (i: Partial<InvoiceDesign>) => void;
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
  /** Corrects a session's figures — the opening float, the cash count, the notes. */
  updateDaySession: (s: DaySession) => void;
  /**
   * Puts a closed day back on the counter, e.g. it was ended by mistake or a
   * sale still has to be rung up. Refuses if another day is already open there.
   */
  reopenDay: (id: string) => boolean;
  /** Deletes a session outright. Refuses while any record still points at it. */
  deleteDaySession: (id: string) => boolean;

  /* ------------------------------------------------------ stock transfers */
  addTransfer: (t: Omit<Transfer, "id" | "transferNo">) => void;
  /** Re-books a movement: the old one is reversed and the new one applied. */
  updateTransfer: (t: Transfer) => void;
  /** Undoes a movement, putting the stock back where it came from. */
  deleteTransfer: (id: string) => void;

  /* ------------------------------------------------- customers and credit */
  addCustomer: (c: Omit<Customer, "id">) => Customer;
  updateCustomer: (c: Customer) => void;
  /** Records money received against a customer's outstanding balance. */
  addCustomerPayment: (p: Omit<CustomerPayment, "id">) => void;
  updateCustomerPayment: (p: CustomerPayment) => void;
  deleteCustomerPayment: (id: string) => void;

  /* ------------------------------------------------- suppliers and payables */
  /** Records money paid to a supplier — settling old bills, or an advance. */
  addSupplierPayment: (p: Omit<SupplierPayment, "id">) => void;
  updateSupplierPayment: (p: SupplierPayment) => void;
  deleteSupplierPayment: (id: string) => void;

  /**
   * Cancels what a partner owes you against what you owe them. Refuses, and
   * returns null, when the amount exceeds what is actually available on either
   * side — a set-off cannot create a debt that was never there.
   */
  addSetOff: (x: Omit<SetOff, "id">) => SetOff | null;
  updateSetOff: (x: SetOff) => void;
  deleteSetOff: (id: string) => void;

  /**
   * Moves what a party owes by hand — writing off a bad debt, carrying in a
   * balance from before the app, or agreeing a correction.
   *
   * `amount` is signed in the direction of what is OWED, so a write-off is
   * negative. Returns null if it names neither a customer nor a supplier, or
   * if the amount is zero: an adjustment of nothing is a mis-click, and storing
   * it would leave a meaningless line on the statement for ever.
   */
  addAdjustment: (a: Omit<Adjustment, "id">) => Adjustment | null;
  updateAdjustment: (a: Adjustment) => void;
  /** Undoes an adjustment, putting the balance back exactly as it was. */
  deleteAdjustment: (id: string) => void;

  /* ------------------------------------------------------------- activity */
  /**
   * Puts a deleted record back exactly as it was — same id, same invoice or
   * bill number — and replays the stock movement the deletion reversed.
   *
   * Returns false when there is nothing to put back: the entry was an edit
   * rather than a deletion, it has already been restored, or something now
   * occupies the same id.
   */
  restoreDeleted: (activityId: string) => boolean;

  /* ---------------------------------------------------------------- messages */
  /** Posts a message into one shop's thread. Returns the stored message. */
  sendMessage: (input: { shopId: string; body: string }) => Message | null;
  /** Marks everything the other side said in this thread as seen. */
  markThreadRead: (shopId: string) => void;
  /** Removes a message you sent by mistake. */
  deleteMessage: (id: string) => void;
  /**
   * Clears a whole conversation. Returns how many messages went, so the caller
   * can say so rather than claiming success over an empty thread.
   */
  clearThread: (shopId: string) => number;
}

/** One signed stock movement: `delta` units of a product at one shop. */
interface StockMove {
  productId: string;
  shopId: string;
  delta: number;
}

/**
 * Applies signed stock movements to an inventory list.
 *
 * Every correction in this store — editing a bill, undoing a transfer, deleting
 * a return — is the same operation with different signs, so they all go through
 * here rather than each re-implementing the find/clamp/insert dance. Quantities
 * never go below zero, and a shop that has never stocked a product gets a row
 * only when stock is actually arriving.
 */
export function applyStock(rows: InventoryRow[], moves: StockMove[]): InventoryRow[] {
  const next = [...rows];
  moves.forEach(({ productId, shopId, delta }) => {
    if (delta === 0) return;
    const i = next.findIndex((r) => r.productId === productId && r.shopId === shopId);
    if (i >= 0) next[i] = { ...next[i], qty: Math.max(0, next[i].qty + delta) };
    else if (delta > 0) next.push({ productId, shopId, qty: delta });
  });
  return next;
}

/** The rows a set of movements touched — the only ones worth writing back. */
function touchedRows(rows: InventoryRow[], moves: StockMove[]) {
  const keys = new Set(moves.map((m) => `${m.productId}|${m.shopId}`));
  return rows.filter((r) => keys.has(`${r.productId}|${r.shopId}`));
}

/**
 * Profit on a sale, recomputed from its own lines.
 *
 * A returned sale has its profit zeroed; undoing that return has to put a real
 * figure back, and the lines are the only record of what it was.
 *
 * A discount given on the whole bill belongs to no line, so it is taken off
 * separately — without that, restoring a sale that had a counter discount would
 * put back the profit it WOULD have made at full price.
 */
function profitOf(sale: Sale) {
  const lines = sale.lines.reduce((a, l) => a + l.qty * (l.price - l.cost) - l.discount, 0);
  return lines - discountSplitOf(sale).bill;
}
import { DEFAULT_SETTINGS } from "./defaults";

const StoreContext = createContext<StoreState | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [usingSupabase, setUsingSupabase] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [pendingMigration, setPendingMigration] = useState<string[] | null>(null);
  /*
   * The real connection, not a switch.
   *
   * This used to be `useState(true)` with a toggle in the header, which meant a
   * shop could be genuinely offline while the badge said Online — and worse,
   * could be told it was offline because someone clicked the pill. The browser
   * already knows; SSR has no navigator, so it renders optimistically and the
   * effect below corrects it on hydration.
   */
  /*
   * Whether an owner account has been claimed. Only meaningful with a database
   * behind the app.
   */

  const [online, setOnline] = useState(true);
  const [shops, setShops] = useState<Shop[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [returns, setReturns] = useState<ReturnRec[]>([]);
  const [daySessions, setDaySessions] = useState<DaySession[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerPayments, setCustomerPayments] = useState<CustomerPayment[]>([]);
  const [supplierPayments, setSupplierPayments] = useState<SupplierPayment[]>([]);
  const [setOffs, setSetOffs] = useState<SetOff[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [discounts, setDiscounts] = useState<DiscountRules>(DEFAULT_DISCOUNTS);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  /**
   * Loads everything the app holds, with the signed-in person's permissions.
   *
   * Separate from boot, and called again after signing in, because the
   * database now refuses to answer anyone anonymous. Loading once on page
   * load meant the read happened BEFORE anybody had signed in: it came back
   * refused, the error stuck to the header, and signing in a moment later
   * never went back for the data. The app sat there signed in and empty,
   * reporting a database error against a database that was working.
   */
  const refreshData = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setDbError("No database configured — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      return;
    }
    try {
      const snap = await loadSnapshot();
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
      setSupplierPayments(snap.supplierPayments);
      setSetOffs(snap.setOffs);
      setAdjustments(snap.adjustments);
      setActivity(snap.activity);
      setMessages(snap.messages);
      setSettings(snap.settings);
      setDiscounts(snap.discounts);
      setUsingSupabase(true);
      // Cleared on success: an error from before signing in should not
      // outlive the sign-in that fixed it.
      setDbError(null);
      // A database still on an older schema is running fine on real data —
      // it just cannot record everything yet. That is an upgrade notice,
      // not an error, so it never blocks the app.
      setPendingMigration(snap.pendingMigration ?? null);
    } catch (e) {
      // Reported rather than papered over: an unreachable database is a
      // problem to fix, not a reason to show numbers that came from nowhere.
      setDbError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      /*
       * Supabase owns the session. The profile is re-read from it on every
       * load, so a worker who has been switched off cannot keep a stale role
       * simply by never signing out.
       */
      const account = await auth.currentUser();
      if (cancelled) return;
      setUser(account);

      // Nothing is readable until somebody has signed in, so an anonymous
      // visitor is left on the sign-in page rather than shown an error.
      if (account) await refreshData();
      if (!cancelled) setReady(true);
    };

    void boot();
    return () => {
      cancelled = true;
    };
  }, [refreshData]);

  /**
   * Live messages.
   *
   * Subscribed once for the life of the provider rather than from the messages
   * screen: the unread badge in the header has to light up while the user is on
   * the till, which is precisely when that screen is not mounted.
   *
   * The same row arrives here after the sender's own optimistic insert, so it is
   * matched by id and replaced rather than appended — otherwise every message
   * you sent would appear twice on your own screen.
   */
  useEffect(() => {
    return subscribeToMessages({
      onUpsert: (incoming) =>
        setMessages((prev) => {
          const i = prev.findIndex((m) => m.id === incoming.id);
          if (i >= 0) {
            const next = [...prev];
            next[i] = incoming;
            return next;
          }
          return [...prev, incoming].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        }),
      // Deleting on one screen has to clear the other; the sender's own state
      // was already updated optimistically, so this is a no-op for them.
      onDelete: (id) => setMessages((prev) => prev.filter((m) => m.id !== id)),
    });
  }, []);

  /**
   * Local state has already been updated by the time this runs, so a failed
   * write is reported rather than blocking the UI.
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

  /**
   * Records something that happened to a money document.
   *
   * Called from inside the mutation rather than from the screen that triggered
   * it, so a new button somewhere else cannot forget to log — every path to a
   * deletion runs through the same few store actions.
   *
   * The snapshot is deep-copied at the moment of recording. Keeping a reference
   * would leave the log pointing at an object the rest of the app is still free
   * to mutate, and a restore would then put back whatever it had become.
   */
  const log = (
    action: Activity["action"],
    entity: ActivityEntity,
    record: { id: string },
    detail: { label: string; amount: number; shopId?: string },
  ) => {
    if (!user) return;
    const entry: Activity = {
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      at: new Date().toISOString(),
      action,
      entity,
      entityId: record.id,
      label: detail.label,
      amount: detail.amount,
      shopId: detail.shopId,
      byUserId: user.id,
      byName: user.name,
      byRole: user.role,
      snapshot: JSON.parse(JSON.stringify(record)),
    };
    setActivity((prev) => [entry, ...prev]);
    persist("the activity log", () => db.upsertActivity(entry));
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
      supplierPayments,
      setOffs,
      adjustments,
      activity,
      messages,
      settings,
      discounts,
      signIn: async (identifier, password, kind) => {
        /*
         * One way in, and it checks the password.
         *
         * There used to be a branch here that signed anyone in whose email
         * appeared in the demo list, without checking the password at all. It
         * existed for the demo, but it was reachable whenever the app decided it
         * was not connected — which turned a database outage into an open door.
         */
        const result = await auth.signIn(identifier, password, kind);
        if (result.user) {
          setUser(result.user);
          /*
           * Started, not awaited.
           *
           * The records are only readable once there is a session, so they are
           * fetched here rather than at page load — but signing in must not
           * WAIT for them. Awaiting meant a slow or failing load left the
           * button saying "Signing in…" for an account that was already signed
           * in, with no way to tell the difference from a wrong password.
           */
          void refreshData();
        }
        return result;
      },
      createOwner: async (details) => {
        const result = await auth.createOwner(details);
        if (!result.user) return result;

        setUser(result.user);
        void refreshData();

        /*
         * The business name is asked for during setup so the very first bill
         * already carries it, rather than saying "A-POS Retail" until somebody
         * finds Settings. Saved after the claim, because writing app_state
         * needs the session the claim just granted.
         */
        const businessName = details.businessName.trim();
        if (businessName) {
          setSettings((prev) => {
            const next = { ...prev, businessName, phone: details.phone.trim() || prev.phone };
            persist("your business details", () => db.saveAppState(next, discounts));
            return next;
          });
        }
        return result;
      },
      logout: () => {
        setUser(null);
        void auth.signOut();
      },
      addSale: (s) => {
        const counter = sales.length + 200;
        const shopIdx = shops.findIndex((x) => x.id === s.shopId) + 1;
        // The open session decides which trading day this sale counts towards.
        // Past midnight that is still yesterday's date, which is the whole point
        // of the day book — a shop open until 2am books into the day it opened.
        const session = openSessionFor(daySessions, s.shopId);
        const sale: Sale = {
          ...s,
          // Normalised here rather than at each caller: every screen that reads
          // a sale can then trust the name is present, and no path can write a
          // row that renders as a blank cell.
          customer: customerNameOf(s),
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
              qty: Math.max(
                0,
                (inventory.find((r) => r.productId === l.productId && r.shopId === s.shopId)?.qty ??
                  0) - l.qty,
              ),
            })),
          ),
        );
        return sale;
      },
      /**
       * Editing a completed sale has to move stock by the DIFFERENCE between the
       * old and new line quantities, or inventory silently drifts.
       */
      updateSale: (edited) => {
        // Clearing the name on an edit means "this was a walk-in", not "this
        // sale has no customer field" — same normalisation as on the way in.
        const updated: Sale = { ...edited, customer: customerNameOf(edited) };
        const previous = sales.find((s) => s.id === updated.id);
        setSales((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
        persist("the sale", () => db.upsertSale(updated));
        if (!previous) return;
        setInventory((prev) => {
          const next = [...prev];
          const bump = (productId: string, delta: number) => {
            if (delta === 0) return;
            const i = next.findIndex(
              (r) => r.productId === productId && r.shopId === updated.shopId,
            );
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
            db.upsertInventory(
              next.filter((r) => r.shopId === updated.shopId && ids.has(r.productId)),
            ),
          );
          return next;
        });
      },
      /** Removing a sale returns its items to stock, unless it was already returned. */
      deleteSale: (id) => {
        const sale = sales.find((s) => s.id === id);
        if (sale)
          log("deleted", "sale", sale, {
            label: sale.invoice,
            amount: sale.total,
            shopId: sale.shopId,
          });
        setSales((prev) => prev.filter((s) => s.id !== id));
        persist("the deletion", () => db.deleteSale(id));
        if (!sale || sale.status === "Returned") return;
        setInventory((prev) => {
          const next = [...prev];
          sale.lines.forEach((l) => {
            const i = next.findIndex(
              (r) => r.productId === l.productId && r.shopId === sale.shopId,
            );
            if (i >= 0) next[i] = { ...next[i], qty: next[i].qty + l.qty };
            else next.push({ productId: l.productId, shopId: sale.shopId, qty: l.qty });
          });
          persist("stock levels", () =>
            db.upsertInventory(
              next.filter(
                (r) =>
                  r.shopId === sale.shopId && sale.lines.some((l) => l.productId === r.productId),
              ),
            ),
          );
          return next;
        });
      },
      addPurchase: (p) => {
        // A bill raised at a shop while its day is open is stamped with that
        // session, so cash handed to the delivery man leaves the drawer on the
        // right trading day — including after midnight, when the calendar date
        // has already moved on but the day has not.
        const session = p.createdByShopId
          ? openSessionFor(daySessions, p.createdByShopId)
          : undefined;
        const purchase: Purchase = {
          ...p,
          id: `pur-${Date.now()}`,
          sessionId: p.sessionId ?? session?.id,
        };
        setPurchases((prev) => [purchase, ...prev]);
        persist("the purchase", () => db.upsertPurchase(purchase));
        /*
          The bill sets the new cost — and, where the owner has pinned a profit
          per unit, the selling price moves with it.

          That is the whole point of a profit target: a delivery at a higher
          rate used to eat the margin silently, because the price stayed where
          it was. Now the price follows the cost and the profit stays exactly
          where it was put. Products with no target are untouched, so this can
          run over every line without asking which ones opted in.

          Past sales keep the cost they recorded, so history never moves.
        */
        const repriced = products
          .filter((prod) => p.lines.some((l) => l.productId === prod.id && l.rate > 0))
          .map((prod) => repriceForCost(prod, p.lines.find((l) => l.productId === prod.id)!.rate));

        setProducts((prev) => prev.map((prod) => repriced.find((x) => x.id === prod.id) ?? prod));
        persist("product costs", () => db.upsertProducts(repriced));
        setInventory((prev) => {
          const next = [...prev];
          p.lines.forEach((l) => {
            const idx = next.findIndex((r) => r.productId === l.productId && r.shopId === l.shopId);
            if (idx >= 0) next[idx] = { ...next[idx], qty: next[idx].qty + l.qty };
            else next.push({ productId: l.productId, shopId: l.shopId, qty: l.qty });
          });
          persist("stock levels", () =>
            db.upsertInventory(
              next.filter((r) =>
                p.lines.some((l) => l.productId === r.productId && l.shopId === r.shopId),
              ),
            ),
          );
          return next;
        });
      },
      /**
       * Re-books a purchase bill.
       *
       * Stock moves by the DIFFERENCE between the old and new lines, per shop —
       * correcting "10 units" to "8" must remove 2, not add 8 on top of what the
       * original bill already delivered.
       */
      updatePurchase: (updated) => {
        const previous = purchases.find((p) => p.id === updated.id);
        setPurchases((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        persist("the purchase", () => db.upsertPurchase(updated));
        if (!previous) return;
        const keys = new Set(
          [...previous.lines, ...updated.lines].map((l) => `${l.productId}|${l.shopId}`),
        );
        const moves: StockMove[] = [...keys].map((k) => {
          const [productId, shopId] = k.split("|");
          const before =
            previous.lines.find((l) => l.productId === productId && l.shopId === shopId)?.qty ?? 0;
          const after =
            updated.lines.find((l) => l.productId === productId && l.shopId === shopId)?.qty ?? 0;
          return { productId, shopId, delta: after - before };
        });
        setInventory((prev) => {
          const next = applyStock(prev, moves);
          persist("stock levels", () => db.upsertInventory(touchedRows(next, moves)));
          return next;
        });
      },

      /** Deleting a bill takes back the stock it put on the shelves. */
      deletePurchase: (id) => {
        const bill = purchases.find((p) => p.id === id);
        if (bill) {
          log("deleted", "purchase", bill, {
            label: bill.billNo,
            amount: bill.total,
            shopId: bill.createdByShopId,
          });
        }
        setPurchases((prev) => prev.filter((p) => p.id !== id));
        persist("the deletion", () => db.deletePurchase(id));
        if (!bill) return;
        const moves: StockMove[] = bill.lines.map((l) => ({
          productId: l.productId,
          shopId: l.shopId,
          delta: -l.qty,
        }));
        setInventory((prev) => {
          const next = applyStock(prev, moves);
          persist("stock levels", () => db.upsertInventory(touchedRows(next, moves)));
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
        setPurchases((prev) =>
          prev.map((p) => (p.supplierId === sup.id ? { ...p, supplier: sup.name } : p)),
        );
        setReturns((prev) =>
          prev.map((r) => (r.supplierId === sup.id ? { ...r, supplier: sup.name } : r)),
        );
      },
      addExpense: (e) => {
        // Money spent while the till is open comes OUT of the drawer, so the
        // expense is tied to the session and subtracted at the evening count.
        // A back-dated expense is bookkeeping, not a drawer movement, so it is
        // deliberately left unattached.
        const session = openSessionFor(daySessions, e.shopId);
        const attach = session && dayOf(e.date) === session.businessDate ? session.id : undefined;
        const expense: Expense = {
          ...e,
          id: `exp-${Date.now()}`,
          sessionId: e.sessionId ?? attach,
        };
        setExpenses((prev) => [expense, ...prev]);
        persist("the expense", () => db.upsertExpense(expense));
      },
      /**
       * Corrects an expense. `sessionId` is carried through untouched: whether
       * the money left the drawer is a fact about when it was spent, not
       * something a later edit to the amount should quietly change.
       */
      updateExpense: (e) => {
        setExpenses((prev) => prev.map((x) => (x.id === e.id ? e : x)));
        persist("the expense", () => db.upsertExpense(e));
      },
      deleteExpense: (id) => {
        const rec = expenses.find((x) => x.id === id);
        if (rec) {
          log("deleted", "expense", rec, {
            label: rec.category || "Expense",
            amount: rec.amount,
            shopId: rec.shopId,
          });
        }
        setExpenses((prev) => prev.filter((x) => x.id !== id));
        persist("the deletion", () => db.deleteExpense(id));
      },
      addReturn: (r) => {
        const isSupplier = r.kind === "supplier";
        const prefix = isSupplier ? "SRET" : "RET";
        const sameKind = returns.filter((x) => x.kind === r.kind).length;
        const rr: ReturnRec = {
          ...r,
          id: `ret-${Date.now()}`,
          returnNo: `${prefix}-${1000 + sameKind + 1}`,
        };
        setReturns((prev) => [rr, ...prev]);
        persist("the return", () => db.upsertReturn(rr));

        // A customer return must also close out the original invoice, otherwise the
        // same invoice stays returnable and sales totals stay inflated.
        if (!isSupplier) {
          setSales((prev) => {
            const updated = prev.map((s) =>
              s.invoice === r.invoice ? { ...s, status: "Returned" as const, profit: 0 } : s,
            );
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
            const idx = next.findIndex(
              (row) => row.productId === item.productId && row.shopId === r.shopId,
            );
            if (idx >= 0)
              next[idx] = { ...next[idx], qty: Math.max(0, next[idx].qty + sign * item.qty) };
            else if (!isSupplier)
              next.push({ productId: item.productId, shopId: r.shopId, qty: item.qty });
          });
          persist("stock levels", () =>
            db.upsertInventory(
              next.filter(
                (row) =>
                  row.shopId === r.shopId && r.items.some((i) => i.productId === row.productId),
              ),
            ),
          );
          return next;
        });
      },
      /**
       * Corrects a recorded return.
       *
       * The refund and reason are just fields, but the item quantities have
       * already moved stock, so the difference is applied in the same direction
       * the original return used: customer returns add to the shelf, supplier
       * returns take away.
       */
      updateReturn: (updated) => {
        const previous = returns.find((r) => r.id === updated.id);
        setReturns((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
        persist("the return", () => db.upsertReturn(updated));
        if (!previous) return;
        const sign = updated.kind === "supplier" ? -1 : 1;
        const ids = new Set([...previous.items, ...updated.items].map((i) => i.productId));
        const moves: StockMove[] = [...ids].map((productId) => {
          const before = previous.items.find((i) => i.productId === productId)?.qty ?? 0;
          const after = updated.items.find((i) => i.productId === productId)?.qty ?? 0;
          return { productId, shopId: updated.shopId, delta: sign * (after - before) };
        });
        setInventory((prev) => {
          const next = applyStock(prev, moves);
          persist("stock levels", () => db.upsertInventory(touchedRows(next, moves)));
          return next;
        });
      },

      /**
       * Undoes a return entirely — the usual fix when one was recorded against
       * the wrong invoice. Stock goes back exactly as it was, and a customer
       * return also re-opens the invoice it closed, with its profit restored
       * from the lines (it was zeroed when the return was recorded).
       */
      deleteReturn: (id) => {
        const rec = returns.find((r) => r.id === id);
        if (rec)
          log("deleted", "return", rec, {
            label: rec.returnNo,
            amount: rec.refund,
            shopId: rec.shopId,
          });
        setReturns((prev) => prev.filter((r) => r.id !== id));
        persist("the deletion", () => db.deleteReturn(id));
        if (!rec) return;

        if (rec.kind === "customer") {
          setSales((prev) => {
            const next = prev.map((s) =>
              s.invoice === rec.invoice && s.status === "Returned"
                ? { ...s, status: "Completed" as const, profit: profitOf(s) }
                : s,
            );
            const restored = next.find((s) => s.invoice === rec.invoice);
            if (restored) persist("the invoice status", () => db.upsertSale(restored));
            return next;
          });
        }

        // Mirror image of addReturn: a customer return had put stock back, so
        // undoing it takes that stock away again, and vice versa.
        const sign = rec.kind === "supplier" ? 1 : -1;
        const moves: StockMove[] = rec.items.map((i) => ({
          productId: i.productId,
          shopId: rec.shopId,
          delta: sign * i.qty,
        }));
        setInventory((prev) => {
          const next = applyStock(prev, moves);
          persist("stock levels", () => db.upsertInventory(touchedRows(next, moves)));
          return next;
        });
      },

      addProduct: (p) => {
        const product: Product = { ...p, id: `p-${Date.now()}` };
        setProducts((prev) => [...prev, product]);
        persist("the product", () => db.upsertProduct(product));
        return product;
      },
      setOpeningStock: (shopId, entries) => {
        if (!shopId || entries.length === 0) return;

        setInventory((prev) => {
          const next = [...prev];
          const written: InventoryRow[] = [];

          for (const { productId, qty } of entries) {
            // A count cannot be negative, and a fractional one is a typo.
            const counted = Math.max(0, Math.round(qty));
            const i = next.findIndex((r) => r.productId === productId && r.shopId === shopId);
            const row: InventoryRow = { productId, shopId, qty: counted };
            if (i >= 0) next[i] = row;
            else next.push(row);
            written.push(row);
          }

          persist("the opening stock", () => db.upsertInventory(written));
          return next;
        });
      },
      updateProduct: (p) => {
        setProducts((prev) => prev.map((x) => (x.id === p.id ? p : x)));
        persist("the product", () => db.upsertProduct(p));
      },
      updateProductAlert: (productId, lowAlert) =>
        setProducts((prev) => {
          const next = prev.map((x) =>
            x.id === productId ? { ...x, lowAlert: Math.max(0, lowAlert) } : x,
          );
          const changed = next.find((x) => x.id === productId);
          if (changed) persist("the alert level", () => db.upsertProduct(changed));
          return next;
        }),
      addShop: (s) => {
        const shop: Shop = { ...s, id: `s-${Date.now()}` };
        setShops((prev) => [...prev, shop]);
        persist("the shop", () => db.upsertShop(shop));
        // Returned so the caller can attach things to it — the counter's login
        // is created in the same breath as the shop, and needs its id.
        return shop;
      },
      updateShop: (s) => {
        setShops((prev) => prev.map((x) => (x.id === s.id ? s : x)));
        persist("the shop", () => db.upsertShop(s));
      },
      /*
       * Adding an account is not something the browser can do.
       *
       * A row in a table is not a login: creating one needs Supabase's admin
       * API and the service key, which only the server holds. The Shops page
       * and the Users page call `createStaffAccount` for that, and this is left
       * only to put the new account into the list without a reload.
       */
      addUser: (u) => {
        setUsers((prev) => [...prev, u]);
      },
      updateUser: (u) => {
        setUsers((prev) => prev.map((x) => (x.id === u.id ? u : x)));
        persist("the account", () => db.upsertStaff(u));
        // The signed-in user is held separately, so editing your own account
        // has to refresh that copy too — otherwise the header keeps showing the
        // old name until the next sign-in.
        setUser((cur) => (cur?.id === u.id ? u : cur));
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
      updateInvoiceDesign: (i) => {
        setSettings((prev) => {
          const next = { ...prev, invoice: { ...prev.invoice, ...i } };
          persist("the bill design", () => db.saveAppState(next, discounts));
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

      /**
       * Corrects a session's own figures — the opening float that was mistyped,
       * the cash count, the note explaining a short till. It deliberately cannot
       * change which sales belong to the day: those carry their own session id.
       */
      updateDaySession: (s) => {
        setDaySessions((prev) => prev.map((x) => (x.id === s.id ? s : x)));
        persist("the day book entry", () => db.upsertDaySession(s));
      },

      /**
       * Re-opens a day that was closed too early. The cash figures recorded at
       * close are cleared, because they described a drawer that is about to keep
       * moving — leaving them behind would show a count that no longer holds.
       */
      reopenDay: (id) => {
        const session = daySessions.find((s) => s.id === id);
        if (!session || session.status === "open") return false;
        // A second open day at one shop would double-count every sale rung up
        // afterwards, so this is refused rather than resolved arbitrarily.
        if (openSessionFor(daySessions, session.shopId)) return false;
        const reopened: DaySession = {
          ...session,
          status: "open",
          closedAt: undefined,
          closedBy: undefined,
          countedCash: undefined,
          cashTakenByOwner: undefined,
          cashLeftInShop: undefined,
        };
        setDaySessions((prev) => prev.map((s) => (s.id === id ? reopened : s)));
        persist("the day book entry", () => db.upsertDaySession(reopened));
        return true;
      },

      /**
       * Deletes a day that should never have been started — a double tap in the
       * morning, or the wrong shop. Refused once anything has been booked to it:
       * those records would be left pointing at a session that no longer exists,
       * and their takings would vanish from every day-book total.
       */
      deleteDaySession: (id) => {
        const used =
          sales.some((s) => s.sessionId === id) ||
          expenses.some((e) => e.sessionId === id) ||
          customerPayments.some((p) => p.sessionId === id);
        if (used) return false;
        const rec = daySessions.find((s) => s.id === id);
        if (rec) {
          log("deleted", "day-session", rec, {
            label: `Trading day ${rec.businessDate}`,
            amount: rec.countedCash ?? rec.openingCash,
            shopId: rec.shopId,
          });
        }
        setDaySessions((prev) => prev.filter((s) => s.id !== id));
        persist("the deletion", () => db.deleteDaySession(id));
        return true;
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

      /**
       * Re-books a movement by reversing the old one and applying the new, in a
       * single update. Both shops and both directions change together, so an
       * edited transfer can never leave stock stranded at the wrong branch.
       */
      updateTransfer: (updated) => {
        const previous = transfers.find((t) => t.id === updated.id);
        setTransfers((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        persist("the transfer", () => db.upsertTransfer(updated));
        if (!previous) return;
        const moves: StockMove[] = [
          ...previous.items.flatMap((i) => [
            { productId: i.productId, shopId: previous.fromShopId, delta: i.qty },
            { productId: i.productId, shopId: previous.toShopId, delta: -i.qty },
          ]),
          ...updated.items.flatMap((i) => [
            { productId: i.productId, shopId: updated.fromShopId, delta: -i.qty },
            { productId: i.productId, shopId: updated.toShopId, delta: i.qty },
          ]),
        ];
        setInventory((prev) => {
          const next = applyStock(prev, moves);
          persist("stock levels", () => db.upsertInventory(touchedRows(next, moves)));
          return next;
        });
      },

      /** Undoes a movement: the goods go back to the shop they came from. */
      deleteTransfer: (id) => {
        const transfer = transfers.find((t) => t.id === id);
        if (transfer) {
          const units = transfer.items.reduce((a, i) => a + i.qty, 0);
          log("deleted", "transfer", transfer, {
            label: transfer.transferNo,
            amount: units,
            shopId: transfer.fromShopId,
          });
        }
        setTransfers((prev) => prev.filter((t) => t.id !== id));
        persist("the deletion", () => db.deleteTransfer(id));
        if (!transfer) return;
        const moves: StockMove[] = transfer.items.flatMap((i) => [
          { productId: i.productId, shopId: transfer.fromShopId, delta: i.qty },
          { productId: i.productId, shopId: transfer.toShopId, delta: -i.qty },
        ]);
        setInventory((prev) => {
          const next = applyStock(prev, moves);
          persist("stock levels", () => db.upsertInventory(touchedRows(next, moves)));
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
        setSales((prev) =>
          prev.map((s) => (s.customerId === c.id ? { ...s, customer: c.name } : s)),
        );
      },

      addCustomerPayment: (p) => {
        // Collected while the till is open, so it's drawer cash and the evening
        // count must expect it. Attached by session id rather than by date so a
        // payment taken at 1am still belongs to the day that's still open.
        const session = openSessionFor(daySessions, p.shopId);
        const attach = session && dayOf(p.date) <= session.businessDate ? session.id : undefined;
        const payment: CustomerPayment = {
          ...p,
          id: `pay-${Date.now()}`,
          sessionId: p.sessionId ?? attach,
        };
        setCustomerPayments((prev) => [payment, ...prev]);
        persist("the payment", () => db.upsertCustomerPayment(payment));
      },

      /**
       * Corrects a receipt — a mistyped amount, or cash booked as card. The
       * customer's balance is derived from these rows rather than stored, so it
       * follows the correction with no separate adjustment.
       */
      updateCustomerPayment: (p) => {
        setCustomerPayments((prev) => prev.map((x) => (x.id === p.id ? p : x)));
        persist("the payment", () => db.upsertCustomerPayment(p));
      },
      deleteCustomerPayment: (id) => {
        const pay = customerPayments.find((x) => x.id === id);
        if (pay) {
          log("deleted", "customer-payment", pay, {
            label: `${pay.method} receipt`,
            amount: pay.amount,
            shopId: pay.shopId,
          });
        }
        setCustomerPayments((prev) => prev.filter((x) => x.id !== id));
        persist("the deletion", () => db.deleteCustomerPayment(id));
      },

      /* --------------------------------------------- suppliers and payables */

      addSupplierPayment: (p) => {
        // Cash paid out of a shop's till has to leave that day's count, so the
        // payment is attached by session id exactly as a receipt is. Head-office
        // payments carry no shop and so touch no drawer.
        const session = p.shopId ? openSessionFor(daySessions, p.shopId) : undefined;
        const attach = session && dayOf(p.date) <= session.businessDate ? session.id : undefined;
        const payment: SupplierPayment = {
          ...p,
          id: `spay-${Date.now()}`,
          sessionId: p.sessionId ?? attach,
        };
        setSupplierPayments((prev) => [payment, ...prev]);
        persist("the supplier payment", () => db.upsertSupplierPayment(payment));
      },

      updateSupplierPayment: (p) => {
        setSupplierPayments((prev) => prev.map((x) => (x.id === p.id ? p : x)));
        persist("the supplier payment", () => db.upsertSupplierPayment(p));
      },

      deleteSupplierPayment: (id) => {
        const pay = supplierPayments.find((x) => x.id === id);
        if (pay) {
          log("deleted", "supplier-payment", pay, {
            label: `${pay.method} payment`,
            amount: pay.amount,
            shopId: pay.shopId || undefined,
          });
        }
        setSupplierPayments((prev) => prev.filter((x) => x.id !== id));
        persist("the deletion", () => db.deleteSupplierPayment(id));
      },

      addSetOff: (x) => {
        const customer = customers.find((c) => c.id === x.customerId);
        const supplier = suppliers.find((sp) => sp.id === x.supplierId);
        if (!customer || !supplier) return null;

        // Both balances are derived, so the ceiling has to be recomputed here
        // rather than trusted from whatever the form last rendered — another
        // till may have taken a payment in between.
        const available = maxSetOff(customer, supplier, {
          sales,
          customerPayments,
          purchases,
          supplierPayments,
          returns,
          setOffs,
        });
        const amount = Math.round(Math.min(x.amount, available));
        if (amount <= 0) return null;

        const rec: SetOff = { ...x, amount, id: `off-${Date.now()}` };
        setSetOffs((prev) => [rec, ...prev]);
        persist("the set-off", () => db.upsertSetOff(rec));
        return rec;
      },

      updateSetOff: (x) => {
        setSetOffs((prev) => prev.map((y) => (y.id === x.id ? x : y)));
        persist("the set-off", () => db.upsertSetOff(x));
      },

      deleteSetOff: (id) => {
        const rec = setOffs.find((x) => x.id === id);
        if (rec) log("deleted", "set-off", rec, { label: "Set-off", amount: rec.amount });
        setSetOffs((prev) => prev.filter((x) => x.id !== id));
        persist("the deletion", () => db.deleteSetOff(id));
      },

      addAdjustment: (a) => {
        // One side, one party. A row naming both, or neither, would be counted
        // by whichever balance happened to look for it.
        const named = Boolean(a.customerId) !== Boolean(a.supplierId);
        const amount = Math.round(a.amount);
        if (!named || amount === 0) return null;

        const rec: Adjustment = { ...a, amount, id: `adj-${Date.now()}` };
        setAdjustments((prev) => [rec, ...prev]);
        persist("the adjustment", () => db.upsertAdjustment(rec));
        return rec;
      },

      updateAdjustment: (a) => {
        setAdjustments((prev) => prev.map((x) => (x.id === a.id ? a : x)));
        persist("the adjustment", () => db.upsertAdjustment(a));
      },

      deleteAdjustment: (id) => {
        const rec = adjustments.find((x) => x.id === id);
        if (rec) {
          log("deleted", "adjustment", rec, {
            label: rec.amount < 0 ? "Write-off" : "Balance adjustment",
            amount: Math.abs(rec.amount),
          });
        }
        setAdjustments((prev) => prev.filter((x) => x.id !== id));
        persist("the deletion", () => db.deleteAdjustment(id));
      },

      /* ----------------------------------------------------------- activity */

      restoreDeleted: (activityId) => {
        const entry = activity.find((a) => a.id === activityId);
        if (!entry || !isRestorable(entry)) return false;

        /*
         * The snapshot is whichever record was deleted — a sale, a purchase, a
         * return — so all that is known here is that it has an id. Each branch
         * below narrows it to the type it actually restores.
         */
        const snap = entry.snapshot as { id?: string } | null | undefined;
        if (!snap?.id) return false;

        /** Stock the deletion gave back has to be taken away again, and vice versa. */
        const replay = (moves: StockMove[]) => {
          if (moves.length === 0) return;
          setInventory((prev) => {
            const next = applyStock(prev, moves);
            persist("stock levels", () => db.upsertInventory(touchedRows(next, moves)));
            return next;
          });
        };

        // Anything already occupying this id means the record came back by
        // another route — re-inserting would duplicate it.
        const taken = (rows: { id: string }[]) => rows.some((r) => r.id === snap.id);

        switch (entry.entity) {
          case "sale": {
            if (taken(sales)) return false;
            const rec = snap as unknown as Sale;
            setSales((prev) => [rec, ...prev]);
            persist("the restored sale", () => db.upsertSale(rec));
            // Deleting a completed sale put its items back on the shelf, so
            // restoring takes them off again. A returned sale never moved
            // stock, so nothing is replayed for it.
            if (rec.status !== "Returned") {
              replay(
                rec.lines.map((l) => ({
                  productId: l.productId,
                  shopId: rec.shopId,
                  delta: -l.qty,
                })),
              );
            }
            break;
          }
          case "purchase": {
            if (taken(purchases)) return false;
            const rec = snap as unknown as Purchase;
            setPurchases((prev) => [rec, ...prev]);
            persist("the restored purchase", () => db.upsertPurchase(rec));
            replay(
              rec.lines.map((l) => ({ productId: l.productId, shopId: l.shopId, delta: l.qty })),
            );
            break;
          }
          case "return": {
            if (taken(returns)) return false;
            const rec = snap as ReturnRec;
            setReturns((prev) => [rec, ...prev]);
            persist("the restored return", () => db.upsertReturn(rec));
            // A customer return closes the invoice it belongs to again.
            if (rec.kind === "customer") {
              setSales((prev) => {
                const next = prev.map((x) =>
                  x.invoice === rec.invoice ? { ...x, status: "Returned" as const, profit: 0 } : x,
                );
                const closed = next.find((x) => x.invoice === rec.invoice);
                if (closed) persist("the invoice status", () => db.upsertSale(closed));
                return next;
              });
            }
            // Mirror of deleteReturn: a customer return puts stock back, a
            // supplier return takes it away.
            const sign = rec.kind === "supplier" ? -1 : 1;
            replay(
              rec.items.map((i) => ({
                productId: i.productId,
                shopId: rec.shopId,
                delta: sign * i.qty,
              })),
            );
            break;
          }
          case "transfer": {
            if (taken(transfers)) return false;
            const rec = snap as Transfer;
            setTransfers((prev) => [rec, ...prev]);
            persist("the restored transfer", () => db.upsertTransfer(rec));
            replay(
              rec.items.flatMap((i) => [
                { productId: i.productId, shopId: rec.fromShopId, delta: -i.qty },
                { productId: i.productId, shopId: rec.toShopId, delta: i.qty },
              ]),
            );
            break;
          }
          case "expense": {
            if (taken(expenses)) return false;
            const rec = snap as Expense;
            setExpenses((prev) => [rec, ...prev]);
            persist("the restored expense", () => db.upsertExpense(rec));
            break;
          }
          case "day-session": {
            if (taken(daySessions)) return false;
            const rec = snap as DaySession;
            setDaySessions((prev) => [rec, ...prev]);
            persist("the restored trading day", () => db.upsertDaySession(rec));
            break;
          }
          case "customer-payment": {
            if (taken(customerPayments)) return false;
            const rec = snap as CustomerPayment;
            setCustomerPayments((prev) => [rec, ...prev]);
            persist("the restored payment", () => db.upsertCustomerPayment(rec));
            break;
          }
          case "supplier-payment": {
            if (taken(supplierPayments)) return false;
            const rec = snap as SupplierPayment;
            setSupplierPayments((prev) => [rec, ...prev]);
            persist("the restored payment", () => db.upsertSupplierPayment(rec));
            break;
          }
          case "set-off": {
            if (taken(setOffs)) return false;
            const rec = snap as SetOff;
            setSetOffs((prev) => [rec, ...prev]);
            persist("the restored set-off", () => db.upsertSetOff(rec));
            break;
          }
          case "adjustment": {
            if (taken(adjustments)) return false;
            const rec = snap as Adjustment;
            setAdjustments((prev) => [rec, ...prev]);
            persist("the restored adjustment", () => db.upsertAdjustment(rec));
            break;
          }
          default:
            return false;
        }

        // Stamped rather than removed: the log is the record that something was
        // deleted at all, and that stays true even after it is put back.
        const done: Activity = {
          ...entry,
          restoredAt: new Date().toISOString(),
          restoredBy: user?.name ?? "Unknown",
        };
        setActivity((prev) => prev.map((a) => (a.id === done.id ? done : a)));
        persist("the activity log", () => db.upsertActivity(done));
        return true;
      },

      /* -------------------------------------------------------- messages */

      sendMessage: ({ shopId, body }) => {
        const text = body.trim();
        if (!user || !shopId || !text) return null;
        const message: Message = {
          // Two people can send in the same millisecond, so the clock alone is
          // not enough to keep ids apart.
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          shopId,
          fromRole: user.role,
          fromUserId: user.id,
          fromName: user.name,
          body: text,
          createdAt: new Date().toISOString(),
          // You have obviously seen what you just typed.
          readByAdmin: user.role === "admin",
          readByShop: user.role === "shop",
        };
        // Shown immediately rather than waiting for the round trip: a chat that
        // pauses after every send feels broken, and the realtime echo is matched
        // by id so it replaces this rather than duplicating it.
        setMessages((prev) => [...prev, message]);
        persist("the message", () => db.upsertMessage(message));
        return message;
      },

      markThreadRead: (shopId) => {
        if (!user) return;
        const role = user.role;
        let changed = false;
        setMessages((prev) => {
          const next = prev.map((m) => {
            if (m.shopId !== shopId || m.fromRole === role) return m;
            if (role === "admin" ? m.readByAdmin : m.readByShop) return m;
            changed = true;
            return role === "admin" ? { ...m, readByAdmin: true } : { ...m, readByShop: true };
          });
          // Returning `prev` untouched when nothing was unread keeps this safe to
          // call from an effect — a new array every time would re-run it forever.
          return changed ? next : prev;
        });
        if (changed) persist("the read receipt", () => db.markThreadRead(shopId, role));
      },

      deleteMessage: (id) => {
        setMessages((prev) => prev.filter((m) => m.id !== id));
        persist("the deletion", () => db.deleteMessage(id));
      },

      /**
       * Clears a whole conversation, for both sides.
       *
       * A thread belongs to the shop rather than to either person in it, so
       * there is no "delete for me only" that would leave the two screens
       * telling different stories about what was said.
       */
      clearThread: (shopId) => {
        const count = messages.filter((m) => m.shopId === shopId).length;
        if (count === 0) return 0;
        setMessages((prev) => prev.filter((m) => m.shopId !== shopId));
        persist("the deletion", () => db.deleteThread(shopId));
        return count;
      },
    }),
    [
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
      supplierPayments,
      setOffs,
      adjustments,
      activity,
      messages,
      settings,
      discounts,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
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
