/**
 * Shared domain types.
 *
 * Split out of store.tsx so seed-data.ts (and the SQL generator that reads it)
 * can import them without a circular dependency back into the provider.
 * store.tsx re-exports everything here, so `from "@/lib/store"` keeps working.
 */

export type Role = "admin" | "shop";

/**
 * Both kinds are selling outlets; the difference is WHO they sell to and at
 * which price.
 *
 * Retail sells to walk-in shoppers at `Product.price`.
 * Wholesale sells in bulk to outside trade buyers — other shopkeepers, or
 * anyone buying in quantity — at `Product.wholesalePrice`.
 *
 * This is a sales channel, not an internal supply chain. Moving stock to your
 * own branches is a separate owner-controlled job (purchases and transfers) and
 * has nothing to do with a shop being wholesale.
 */
export type ShopKind = "retail" | "wholesale";

export interface Shop {
  id: string;
  name: string;
  /** Older rows predate this field; treat a missing kind as "retail". */
  kind?: ShopKind;
  address: string;
  phone: string;
  active: boolean;
}

/** Never trust `shop.kind` directly — rows created before shop types existed have none. */
export function shopKind(shop: Pick<Shop, "kind"> | undefined | null): ShopKind {
  return shop?.kind === "wholesale" ? "wholesale" : "retail";
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
  /** Retail sell price. */
  price: number;
  /**
   * Trade price used when the selling shop is a wholesale outlet.
   * Undefined falls back to `price`, so existing products keep working.
   */
  wholesalePrice?: number;
  lowAlert: number;
  active: boolean;
}

/** The price a given kind of shop sells at. */
export function priceFor(product: Pick<Product, "price" | "wholesalePrice">, kind: ShopKind) {
  if (kind !== "wholesale") return product.price;
  return product.wholesalePrice && product.wholesalePrice > 0 ? product.wholesalePrice : product.price;
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
  /** The exact wall-clock moment of the sale. */
  date: string;
  /**
   * The TRADING day this sale belongs to (YYYY-MM-DD), taken from the day
   * session that was open when it was rung up. A shop that stays open past
   * midnight keeps booking into the day it opened, so 01:30 takings still land
   * on last night's sheet. Absent on sales recorded before day sessions existed
   * — always read it through `businessDayOf()`.
   */
  businessDate?: string;
  /** The day session this sale was rung up in, when there was one. */
  sessionId?: string;
  /** The customer's name as printed on the invoice. Always set. */
  customer: string;
  /** Set when the buyer was picked from the customer list rather than typed. */
  customerId?: string;
  cashier: string;
  lines: SaleLine[];
  subtotal: number;
  discount: number;
  total: number;
  profit: number;
  /**
   * "Credit" means the goods left but the money didn't — the buyer owes it.
   * Credit sales are real sales and count towards takings and profit, but they
   * put nothing in the drawer, so the day's cash count must ignore them.
   */
  payment: PaymentMethod;
  status: "Completed" | "Returned" | "Partial";
  synced: boolean;
}

/** Settled on the spot, or put on the buyer's account. */
export type PaymentMethod = "Cash" | "Card" | "Online" | "Credit";

/** The ways money can actually arrive. Credit is a promise, not a payment. */
export type SettledMethod = Exclude<PaymentMethod, "Credit">;

export const PAYMENT_METHODS: PaymentMethod[] = ["Cash", "Card", "Online", "Credit"];
export const SETTLED_METHODS: SettledMethod[] = ["Cash", "Card", "Online"];

/* ----------------------------------------------------------------- customers */

/**
 * Someone who buys from you by name rather than as an anonymous walk-in.
 *
 * Mostly trade buyers at a wholesale counter — other shopkeepers who come back
 * every week, take stock on account, and settle up later. Saving them once means
 * their history and their balance are attached to a record rather than to
 * however their name happened to be spelled on each invoice.
 */
export interface Customer {
  id: string;
  /** The business name you'd say out loud: "Bilal Traders". */
  name: string;
  /** The person you actually deal with there. */
  contact: string;
  phone: string;
  address: string;
  notes: string;
  /** Trade buyers are the ones you'd normally sell to at wholesale rates. */
  kind: "retail" | "wholesale";
  /** Most they may owe at once. 0 means no limit is enforced. */
  creditLimit: number;
  active: boolean;
}

/** Money received against what a customer already owes. */
export interface CustomerPayment {
  id: string;
  customerId: string;
  date: string;
  amount: number;
  method: SettledMethod;
  /** Which shop took the money — it lands in that shop's drawer. */
  shopId: string;
  /** Set when collected during an open trading day, so the till reconciles. */
  sessionId?: string;
  note: string;
  receivedBy: string;
}

/** What a customer owes right now, and how they got there. */
export interface CustomerBalance {
  /** Total ever put on account. */
  creditSales: number;
  /** Total ever paid back. */
  paid: number;
  /** Still owed: creditSales − paid. */
  outstanding: number;
  /** Every sale, on account or not. */
  orders: number;
  /** Lifetime value across all payment methods. */
  lifetime: number;
  lastPurchase?: string;
  lastPayment?: string;
  /** True when `outstanding` has reached the customer's limit. */
  overLimit: boolean;
}

/* ------------------------------------------------------------------ messages */

/**
 * One message in the conversation between the owner and a shop.
 *
 * Threads belong to a SHOP, not to a person: a shop is a place with a till, and
 * whoever is standing behind it today needs to see what was said yesterday.
 * `fromName` is stored on the row so an old message still reads correctly after
 * the person who sent it is renamed or removed.
 */
export interface Message {
  id: string;
  shopId: string;
  fromRole: Role;
  fromUserId?: string;
  fromName: string;
  body: string;
  createdAt: string;
  /** Seen by the owner. Set when they open that shop's thread. */
  readByAdmin: boolean;
  /** Seen by whoever is on the till at that shop. */
  readByShop: boolean;
}

/** Whether a message counts as unread for the person looking at it. */
export function isUnreadFor(m: Message, role: Role) {
  // Your own messages are never unread to you — you just sent them.
  if (m.fromRole === role) return false;
  return role === "admin" ? !m.readByAdmin : !m.readByShop;
}

/** A wholesaler / vendor you buy stock from. */
export interface Supplier {
  id: string;
  name: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  active: boolean;
}

export interface Purchase {
  id: string;
  billNo: string;
  /** Kept alongside supplierId so older bills still read correctly. */
  supplier: string;
  supplierId?: string;
  date: string;
  lines: { productId: string; shopId: string; qty: number; rate: number }[];
  total: number;
  /** Who entered the bill — the owner, or the shopkeeper who bought stock in. */
  createdBy?: string;
  /**
   * Set when a shopkeeper raised the bill themselves, so the owner can tell
   * head-office buying apart from a shop restocking on its own account.
   */
  createdByShopId?: string;
  /** How the bill was settled. Unpaid bills are what the shop still owes. */
  paid?: boolean;
}

export interface Expense {
  id: string;
  date: string;
  shopId: string;
  category: string;
  description: string;
  amount: number;
  addedBy: string;
  /** Set when the money came out of the till during an open day. */
  sessionId?: string;
}

/* ------------------------------------------------------- day sessions (day book) */

/**
 * One trading day at one shop: opened when the shopkeeper unlocks the door,
 * closed when they lock it — which may well be after midnight.
 *
 * This is what makes "today's sales" mean something. Every sale rung up while a
 * session is open is stamped with its `businessDate`, so a 01:15 sale belongs to
 * the day the shop opened rather than to the new calendar date.
 *
 * Closing also settles the cash: what was counted, what the owner took away, and
 * what stayed in the drawer as tomorrow's float.
 */
export interface DaySession {
  id: string;
  shopId: string;
  /** Trading day label (YYYY-MM-DD) — the local date the session was opened on. */
  businessDate: string;
  openedAt: string;
  openedBy: string;
  /** Cash physically in the drawer at open, normally carried over from last night. */
  openingCash: number;
  status: "open" | "closed";

  /* Everything below is filled in at close. */
  closedAt?: string;
  closedBy?: string;
  /** Cash actually counted in the drawer. */
  countedCash?: number;
  /** Of the counted cash, what the owner took away. */
  cashTakenByOwner?: number;
  /** Of the counted cash, what stayed behind as tomorrow's opening float. */
  cashLeftInShop?: number;
  notes?: string;
}

/** Cash movement for one session, derived from its sales, refunds and expenses. */
export interface SessionCash {
  openingCash: number;
  cashSales: number;
  cardSales: number;
  onlineSales: number;
  /** Sold on account. Counts as a sale; contributes nothing to the drawer. */
  creditSales: number;
  /** Cash taken today against OLD credit. Real money in, but not a sale today. */
  creditCollected: number;
  /** Card/online settlements of old credit — money in, but not into the drawer. */
  creditCollectedOther: number;
  totalSales: number;
  invoices: number;
  itemsSold: number;
  profit: number;
  refunds: number;
  drawerExpenses: number;
  /**
   * What SHOULD be in the drawer:
   *   opening + cash sales + cash collected on old credit − refunds − expenses.
   * Credit SALES are deliberately absent — no money changed hands.
   */
  expectedCash: number;
  /** What was counted, once the session is closed. */
  countedCash: number | null;
  /** counted − expected. Negative is short, positive is over. */
  variance: number | null;
  cashTakenByOwner: number;
  cashLeftInShop: number;
}

/* ------------------------------------------------------------- stock transfers */

/**
 * Stock moving between two of your own shops — typically the wholesale outlet
 * distributing stock the owner has bought in. Recorded as a single event so both
 * sides of the movement stay in step and `stockAsOf` can rewind through it.
 *
 * Unrelated to wholesale SELLING: this is your own stock moving between your own
 * locations, not goods leaving the business.
 */
export interface Transfer {
  id: string;
  transferNo: string;
  date: string;
  fromShopId: string;
  toShopId: string;
  items: { productId: string; name: string; qty: number }[];
  notes: string;
  createdBy: string;
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
  supplierId?: string;
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
