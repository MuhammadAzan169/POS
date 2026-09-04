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
  /**
   * The profit the owner wants on each unit sold at RETAIL, in whole rupees.
   *
   * Set it and the retail price stops being a number you maintain by hand: it
   * becomes cost + this. The point is what happens when the cost moves — a new
   * bill at a higher rate used to quietly eat the margin, because the price
   * stayed put. With a target set, the PRICE follows the cost and the profit
   * stays exactly where it was put.
   *
   * Undefined means the old behaviour: the price is whatever was typed, and the
   * profit is whatever is left over.
   */
  profitTarget?: number;
  /** The same for the wholesale counter, which sells at its own price. */
  wholesaleProfitTarget?: number;
  lowAlert: number;
  active: boolean;
}

/**
 * The selling price that yields a given profit per unit.
 *
 * Rounded to whole rupees, and never below the cost — a negative target would
 * mean deliberately selling at a loss, which is a decision to make on the price
 * field directly rather than something to arrive at by arithmetic.
 */
export function priceForProfit(cost: number, profit: number) {
  return Math.max(0, Math.round(cost + Math.max(0, profit)));
}

/** What a product actually earns per unit at each counter, as things stand. */
export function unitProfit(p: Pick<Product, "cost" | "price" | "wholesalePrice">) {
  const wholesale = p.wholesalePrice && p.wholesalePrice > 0 ? p.wholesalePrice : p.price;
  return { retail: Math.round(p.price - p.cost), wholesale: Math.round(wholesale - p.cost) };
}

/**
 * Re-prices a product against a new cost, honouring whichever profit targets
 * are set and leaving the rest alone.
 *
 * Used when a purchase bill changes the cost. A product with no target keeps
 * its price exactly as it was, so this can be applied to everything without
 * having to ask which products opted in.
 */
export function repriceForCost(product: Product, cost: number): Product {
  const next: Product = { ...product, cost };
  if (product.profitTarget !== undefined) {
    next.price = priceForProfit(cost, product.profitTarget);
  }
  if (product.wholesaleProfitTarget !== undefined) {
    next.wholesalePrice = priceForProfit(cost, product.wholesaleProfitTarget);
  }
  return next;
}

/**
 * The product a scanned or typed code refers to, or nothing.
 *
 * Every screen with a scanner box had its own version of this, and they were
 * all the same two lines: exact barcode, else "name contains the term". That
 * second step is what made a scan look like it had found the wrong item —
 * typing `500` matched "Face Powder 500g", and a code that simply isn't in the
 * catalogue silently landed on whatever product happened to contain those
 * digits. A digit-only term is a barcode, full stop: if no barcode matches, the
 * answer is "not found", not a guess.
 *
 * Barcodes are compared with whitespace stripped, because a scanner that emits
 * a trailing space, or a code typed with a gap, is the same code.
 */
export function matchProduct(products: Product[], term: string): Product | undefined {
  const code = term.trim();
  if (!code) return undefined;
  const squash = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  const target = squash(code);

  const byBarcode = products.find((p) => p.barcode && squash(p.barcode) === target);
  if (byBarcode) return byBarcode;

  // No letters means it was a barcode, and it isn't one of ours.
  if (!/[a-z]/i.test(code)) return undefined;

  const lower = code.toLowerCase();
  return (
    products.find((p) => p.name.toLowerCase() === lower) ??
    products.find((p) => p.name.toLowerCase().includes(lower))
  );
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
  /**
   * The customer's name as printed on the invoice.
   *
   * Always set, and never blank — a shopper who gives no name is recorded as
   * `WALK_IN` rather than as an empty string, so the sale is a complete record
   * of an anonymous purchase instead of a row that looks like it lost its data.
   * Read it through `customerNameOf()`, which repairs older or hand-edited rows.
   */
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

/**
 * The two discounts on a sale, separated.
 *
 * `Sale.discount` is the total taken off the slip and `SaleLine.discount` is the
 * part attributable to each item, so whatever is left over was taken off the
 * bill as a whole — the "give him a hundred off" a shopkeeper does at the
 * counter. Deriving it rather than storing a third number means the two can
 * never disagree, and no column has to be added to a table that already holds
 * live sales.
 */
export function discountSplitOf(sale: Pick<Sale, "discount" | "lines">) {
  const items = sale.lines.reduce((a, l) => a + (l.discount || 0), 0);
  // Never negative: a hand-edited row where the lines add up to more than the
  // slip total should read as "all of it was itemised", not as a bill surcharge.
  const bill = Math.max(0, Math.round(sale.discount - items));
  return { items, bill, total: items + bill };
}

/** One sale line with both discounts already accounted for. */
export interface AllocatedLine {
  line: SaleLine;
  /** After the line's own discount and its share of the bill discount. */
  revenue: number;
  /** The same, less what the goods cost. */
  profit: number;
}

/**
 * Splits a sale into per-line revenue and profit.
 *
 * A discount taken off the whole bill belongs to no single line, but any
 * per-product rollup has to account for it somewhere — the Sales tab's
 * "Products sold", the Reports top-sellers list and the AI brief all did their
 * own version of this, and the ones that skipped it reported what an item would
 * have earned at full price rather than what the business took.
 *
 * The bill discount is shared in proportion to what each line is worth after
 * its own discount, so a big line carries more of it than a small one. Rounding
 * each share independently leaves a rupee or two unallocated, which is enough
 * to make a rollup disagree with the invoice it came from, so the remainder is
 * given to the largest line and the parts always add back exactly.
 */
export function allocateSale(sale: Pick<Sale, "discount" | "lines">): AllocatedLine[] {
  const nets = sale.lines.map((l) => l.qty * l.price - (l.discount || 0));
  const netTotal = nets.reduce((a, b) => a + b, 0);

  // Never take off more than the lines are actually worth. The till caps this
  // already, but a row edited straight in the database can carry a slip
  // discount larger than the goods on it, and an uncapped share would report
  // NEGATIVE revenue for a product — a rollup reading "−50 earned" is worse
  // than one that simply stops discounting once there is nothing left to
  // discount. Same reasoning as the clamp in `discountSplitOf`.
  const bill = Math.min(discountSplitOf(sale).bill, Math.max(0, netTotal));

  const shares = nets.map((n) => (bill > 0 && netTotal > 0 ? Math.round((bill * n) / netTotal) : 0));
  const residue = bill - shares.reduce((a, b) => a + b, 0);
  if (residue !== 0 && shares.length > 0) {
    let biggest = 0;
    nets.forEach((n, i) => { if (n > nets[biggest]) biggest = i; });
    shares[biggest] += residue;
  }

  return sale.lines.map((l, i) => ({
    line: l,
    revenue: nets[i] - shares[i],
    profit: l.qty * (l.price - l.cost) - (l.discount || 0) - shares[i],
  }));
}

/** Settled on the spot, or put on the buyer's account. */
export type PaymentMethod = "Cash" | "Card" | "Online" | "Credit";

/** The ways money can actually arrive. Credit is a promise, not a payment. */
export type SettledMethod = Exclude<PaymentMethod, "Credit">;

export const PAYMENT_METHODS: PaymentMethod[] = ["Cash", "Card", "Online", "Credit"];
export const SETTLED_METHODS: SettledMethod[] = ["Cash", "Card", "Online"];

/**
 * What an unnamed shopper is called, everywhere, in one place.
 *
 * A retail till takes most of its money from people who never give a name, so
 * "no customer" is the normal case, not a missing field. Naming it once means
 * the sales list, the receipt, the day book and every export agree — and that a
 * blank can be told apart from a shopper actually called something.
 */
export const WALK_IN = "Walk-in";

/**
 * The name to show for a sale, with blanks repaired.
 *
 * Rows can arrive without one: a sale edited to clear the field, a null column
 * in Postgres, an import. Rendering those as an empty cell reads as a broken
 * record rather than an anonymous sale, so they all resolve to `WALK_IN`.
 */
export function customerNameOf(sale: Pick<Sale, "customer">): string {
  return sale.customer?.trim() || WALK_IN;
}

/** True when the sale was rung up without a named buyer. */
export function isWalkIn(sale: Pick<Sale, "customer" | "customerId">): boolean {
  return !sale.customerId && customerNameOf(sale) === WALK_IN;
}

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
  /**
   * The supplier record for the SAME business, when you both buy from and sell
   * to them.
   *
   * This is common in trade: Bilal Traders takes stock from you on account, and
   * you take stock from them on account. Without the link the two balances sit
   * in different tabs and nobody notices they cancel out. With it, the app can
   * offer a set-off — "he owes me 50,000, I owe him 30,000, settle 30,000 and
   * he still owes 20,000" — which is exactly how it gets done at the counter.
   */
  linkedSupplierId?: string;
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
  /** Total ever paid back, advances included. */
  paid: number;
  /** Settled against what you owe THEM, rather than with money. */
  setOff: number;
  /** Hand-made changes: written off, carried forward, or corrected. Signed. */
  adjusted: number;
  /** Still owed to you. Never negative — money in hand shows as `advance`. */
  outstanding: number;
  /**
   * Money of theirs you are holding: they have paid in more than they have
   * taken out.
   *
   * The month-start payer does exactly this — hands over 100,000 on the 1st and
   * draws goods against it all month. Each of those sales is booked on account,
   * and the advance is what pays for them, so the balance walks down to zero
   * instead of the shop having to remember an informal "he's in credit".
   */
  advance: number;
  /** outstanding − advance: positive is owed to you, negative is held for them. */
  net: number;
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
  /**
   * Legacy settlement flag, kept so bills raised before part-payment existed
   * still read correctly. Never read it directly — `purchaseSettlement()` folds
   * it into the same shape as a modern bill.
   */
  paid?: boolean;
  /**
   * How the bill was settled at the moment it was raised.
   *
   * "Credit" is the one that matters: the stock arrived, the money did not, and
   * the supplier is owed until somebody pays them. Cash/Card/Online mean it was
   * settled there and then — and if it was cash out of a shop's own till, the
   * evening count has to expect that money to be gone.
   */
  payment?: PaymentMethod;
  /**
   * Paid against this bill up front. Less than `total` is a part payment — "I
   * gave him twenty thousand now, the rest at the end of the month" — which is
   * far more common than either extreme.
   */
  amountPaid?: number;
  /** When the balance falls due, for the overdue list. */
  dueDate?: string;
  /** The till the up-front cash came out of, so the day's count reconciles. */
  sessionId?: string;
}

/** A bill's settlement, with legacy rows folded into the modern shape. */
export function purchaseSettlement(p: Purchase): {
  method: PaymentMethod;
  paid: number;
  balance: number;
  status: "Paid" | "Part paid" | "Unpaid";
} {
  const total = p.total;
  // A bill from before part-payments carries only `paid`, so it was all or
  // nothing; `paid !== false` keeps the old default of "settled" for rows that
  // never had the flag at all.
  const legacy = p.paid !== false ? total : 0;
  const paid = Math.max(0, Math.min(total, p.amountPaid ?? legacy));
  const balance = Math.max(0, total - paid);
  const method = p.payment ?? (paid >= total && total > 0 ? "Cash" : "Credit");
  return {
    method,
    paid,
    balance,
    status: balance === 0 ? "Paid" : paid > 0 ? "Part paid" : "Unpaid",
  };
}

/**
 * Money paid out to a supplier, against their bills or ahead of them.
 *
 * The mirror image of `CustomerPayment`, and deliberately the same shape: both
 * sides of the business run on the same "goods now, money later" arrangement,
 * so one screen's worth of thinking covers both.
 */
export interface SupplierPayment {
  id: string;
  supplierId: string;
  date: string;
  amount: number;
  method: SettledMethod;
  /**
   * Which till the money came out of. Empty means head office paid it — by
   * bank transfer or from the owner's own cash — so no shop's drawer is short
   * because of it.
   */
  shopId: string;
  /** Set when paid out of an open trading day, so the till reconciles. */
  sessionId?: string;
  note: string;
  paidBy: string;
}

/**
 * A set-off: two debts between the same business cancelled against each other.
 *
 * No money moves. He owed you 50,000 for stock you sold him; you owed him
 * 30,000 for stock you bought from him; you agree to call 30,000 of it square
 * and he pays the remaining 20,000. Recording it as its own row rather than as
 * a fake payment on each side means the statement says what actually happened,
 * and undoing it puts both balances back exactly.
 */
export interface SetOff {
  id: string;
  date: string;
  customerId: string;
  supplierId: string;
  /** Cancelled off BOTH balances. Never more than the smaller of the two. */
  amount: number;
  note: string;
  createdBy: string;
}

/**
 * A hand-made change to what a party owes, or is owed.
 *
 * Three things need this and nothing else provides them:
 *
 *  - **Writing off a bad debt.** A customer who is never going to pay leaves a
 *    receivable on the books for ever, quietly overstating what the business is
 *    worth. The owner needs to say "that money is gone" without deleting the
 *    invoices, which are the record of goods that genuinely left the shop.
 *  - **An opening balance.** Somebody already owed you when you started using
 *    the app. There is no invoice to point at, but the debt is real.
 *  - **An agreed correction.** Rounding a long-running account off, a goodwill
 *    reduction, a late fee — the small movements every khata has.
 *
 * Recorded as its own row rather than by editing a sale or a bill, for the same
 * reason a set-off is: the statement should say what actually happened, and
 * undoing it has to put the balance back exactly. Nothing here moves money, so
 * an adjustment never touches a till or a day's cash count.
 */
export interface Adjustment {
  id: string;
  date: string;
  /**
   * Exactly one of these is set — an adjustment belongs to one side of one
   * party. A partner who is both is adjusted on whichever side is wrong.
   */
  customerId?: string;
  supplierId?: string;
  /**
   * Signed, always in the direction of what is OWED.
   *
   * On a customer: positive means they owe you more, negative means less — so a
   * write-off is negative. On a supplier: positive means you owe them more.
   * One signed number rather than a kind plus a magnitude, because the arithmetic
   * then needs no branch and cannot disagree with the label.
   */
  amount: number;
  /** Why. Required in the UI — an unexplained write-off is indistinguishable from a mistake. */
  reason: string;
  createdBy: string;
}

/** Which side of a party an adjustment applies to. */
export type AdjustmentSide = "customer" | "supplier";

/** What you owe one supplier, and what you have already put their way. */
export interface SupplierBalance {
  /** Total of every bill from them. */
  billed: number;
  /** Settled at the counter when the bill was raised. */
  paidOnBills: number;
  /** Paid since, against the account. */
  paidLater: number;
  /** Cancelled against what they owe you. */
  setOff: number;
  /** Credit they owe you for goods you sent back. */
  returnCredit: number;
  /** Hand-made changes: written off, carried forward, or corrected. Signed. */
  adjusted: number;
  /** Still owed to them. Never negative — money ahead shows as `advance`. */
  outstanding: number;
  /** Money you have put their way ahead of any bill. */
  advance: number;
  /** outstanding − advance: positive is owed to them, negative is held by them. */
  net: number;
  bills: number;
  /** Bills with anything still on them. */
  unpaidBills: number;
  lastPurchase?: string;
  lastPayment?: string;
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
  /**
   * Cash taken today against a customer's account — settling old credit, or
   * handed over as an advance against goods they have yet to collect. Real
   * money into the drawer either way, but not a sale made today.
   */
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
   * Cash handed to suppliers out of this till today — settling an old bill, or
   * paying one on the spot. The stock arrives at the shop and the money leaves
   * the shop's drawer, so a count that ignores it reads short every time a
   * shopkeeper pays a delivery man in cash.
   */
  supplierCashPaid: number;
  /** Bills paid in cash at the moment they were raised, out of this till. */
  billCashPaid: number;
  /** Bought on account today: stock in, money still owed. */
  creditPurchases: number;
  /**
   * What SHOULD be in the drawer:
   *   opening + cash sales + cash taken on account
   *   − refunds − expenses − cash paid to suppliers.
   * Credit SALES and credit PURCHASES are both deliberately absent — in neither
   * case did money change hands.
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

/* -------------------------------------------------------------- activity log */

/**
 * The kinds of record worth keeping a history of.
 *
 * Everything here is a money document or a stock movement: the things where
 * "who removed this, and can we get it back" is a question somebody will
 * eventually ask. Reference data — a renamed product, a disabled shop — is not
 * logged, because nothing is lost when it changes.
 */
export type ActivityEntity =
  | "sale"
  | "purchase"
  | "return"
  | "transfer"
  | "expense"
  | "day-session"
  | "customer-payment"
  | "supplier-payment"
  | "set-off"
  | "adjustment";

export type ActivityAction = "deleted" | "edited" | "restored";

/**
 * One thing that happened to a record, and enough of the record to undo it.
 *
 * The problem this solves: a shopkeeper could delete an invoice and the owner
 * would never know. The sale simply stopped existing — no gap in the numbering
 * anyone would notice, nothing in the day book, and the takings quietly went
 * down. The only honest fix is to keep the record itself, not just a note that
 * it went.
 *
 * `snapshot` is therefore the WHOLE row as it stood, stored as JSON. That is
 * what makes "restore" real rather than a promise: putting it back re-inserts
 * the original id, invoice number and lines, so nothing is renumbered and the
 * stock movement it caused can be replayed exactly.
 *
 * The log is append-only. A deletion that could itself be deleted would be no
 * record at all.
 */
export interface Activity {
  id: string;
  /** When it happened — a wall-clock moment, not a trading day. */
  at: string;
  action: ActivityAction;
  entity: ActivityEntity;
  /** The id of the record acted on, so a restore can find its way home. */
  entityId: string;
  /** What a person calls it: "INV-S1-000201", "BILL-2003", "Cash receipt". */
  label: string;
  /** The money involved, so the list can be read at a glance. */
  amount: number;
  /** The shop it belonged to, when it belonged to one. */
  shopId?: string;
  byUserId?: string;
  /** Stored on the row so an old entry still reads correctly after a rename. */
  byName: string;
  byRole: Role;
  /**
   * The record as it was. For a deletion this is what gets put back; for an
   * edit it is the BEFORE, so the owner can see what the figure used to say.
   */
  snapshot: unknown;
  /** Set once it has been put back, so nothing can be restored twice. */
  restoredAt?: string;
  restoredBy?: string;
}

/** Whether this entry still has something that can be put back. */
export function isRestorable(a: Activity) {
  // Only deletions removed anything, and only once.
  return a.action === "deleted" && !a.restoredAt && a.snapshot != null;
}

/** The entity name as it should read in a sentence. */
export const ENTITY_LABELS: Record<ActivityEntity, string> = {
  sale: "sale",
  purchase: "purchase bill",
  return: "return",
  transfer: "stock transfer",
  expense: "expense",
  "day-session": "trading day",
  "customer-payment": "customer payment",
  "supplier-payment": "supplier payment",
  "set-off": "set-off",
  adjustment: "balance adjustment",
};

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
 * Which blocks appear on a printed BILL, and how it is laid out.
 *
 * Separate from `ReceiptDesign` because the two documents answer different
 * questions. A receipt is the slip a walk-in leaves with: narrow roll paper, one
 * moment in time, nothing owed. A bill is what goes out with a bulk delivery to
 * a trade buyer — A4, a ruled Qty/Particulars/Rate/Amount table, and, crucially,
 * the running account: what was owed before this delivery, what has been paid
 * against it, and what is left. Folding both into one design would mean every
 * toggle needed a "…but only on A4" caveat.
 */
export interface InvoiceDesign {
  showBusinessName: boolean;
  showAddress: boolean;
  showPhone: boolean;
  showTaxNumber: boolean;
  /** The "INVOICE / BILL" tab across the top of a printed book's slip. */
  showBillTag: boolean;
  showShopName: boolean;
  showInvoiceNo: boolean;
  showDate: boolean;
  showCustomer: boolean;
  showCustomerPhone: boolean;
  showCashier: boolean;
  /** A running line number down the left of the table. */
  showLineNumbers: boolean;
  showUnitRate: boolean;
  /**
   * The account block under the total: previous balance, what was received, and
   * the closing balance. The whole reason a trade buyer keeps the slip.
   */
  showAccountBlock: boolean;
  showSignature: boolean;
  showTerms: boolean;
  /** Empty ruled rows padded under the items, as a printed bill book has. */
  ruledRows: boolean;
  /** How many rows the table is padded out to. 0 leaves it exactly as long as the items. */
  ruledRowCount: number;
  /** The total spelled out underneath — the line that settles phone disputes. */
  showAmountInWords: boolean;
  /** "ORIGINAL" / "OFFICE COPY" stamped in the corner, for a two-part bill book. */
  showCopyLabel: boolean;
  paperSize: "A4" | "A5";
  fontSize: "sm" | "md" | "lg";
  /**
   * How the top of the bill is arranged.
   *
   * `split` puts who is sending it down the left and what the document is on
   * the right, which is what a printed invoice does. `center` is the bill-book
   * look. `left` stacks everything against the left margin with the title tab
   * still centred above it.
   */
  headerAlign: "center" | "left" | "split";
  /** How tall the ruled rows are. Compact fits about a third more on a sheet. */
  density: "compact" | "normal";
  accent: "ink" | "plain";
  /**
   * The colour of the solid headings, in the shop's own ink.
   *
   * A named choice rather than a free colour field: these are the four that
   * print legibly in white type on a mono laser, which is what a bill is
   * actually printed on. A picker would let someone choose yellow.
   */
  accentColor: "navy" | "black" | "green" | "maroon";
}

/** The accent choices, as ink. Shared by the screen and the PDF. */
export const INVOICE_ACCENTS: Record<InvoiceDesign["accentColor"], { hex: string; rgb: [number, number, number]; label: string }> = {
  navy: { hex: "#172554", rgb: [23, 37, 84], label: "Navy" },
  black: { hex: "#111827", rgb: [17, 24, 39], label: "Black" },
  green: { hex: "#14532d", rgb: [20, 83, 45], label: "Green" },
  maroon: { hex: "#7f1d1d", rgb: [127, 29, 29], label: "Maroon" },
};

export const DEFAULT_INVOICE: InvoiceDesign = {
  showBusinessName: true,
  showAddress: true,
  showPhone: true,
  showTaxNumber: true,
  showBillTag: true,
  showShopName: true,
  showInvoiceNo: true,
  showDate: true,
  showCustomer: true,
  showCustomerPhone: true,
  showCashier: false,
  showLineNumbers: false,
  showUnitRate: true,
  showAccountBlock: true,
  showSignature: true,
  showTerms: true,
  ruledRows: true,
  ruledRowCount: 8,
  showAmountInWords: true,
  showCopyLabel: false,
  paperSize: "A4",
  fontSize: "md",
  headerAlign: "split",
  density: "normal",
  accent: "ink",
  accentColor: "navy",
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

/*
  Money formatting and the discount rules live here rather than in store.tsx
  because they are pure functions over plain data, and anything that reaches for
  them should not have to drag in the React provider — and through it Supabase —
  to get at them. store.tsx re-exports this whole file, so every existing
  `from "@/lib/store"` import is unaffected.
*/

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
  /** Printed above the item table on a bill — delivery terms, order reference. */
  invoiceNote: string;
  /** The small print under the totals. */
  invoiceTerms: string;
  /** The words in the tab across the top. Some shops want "DELIVERY CHALLAN". */
  invoiceTitle: string;
  /** What is written under the signature rule. */
  invoiceSignatory: string;
  /** The corner stamp, when it is switched on. */
  invoiceCopyLabel: string;
  invoice: InvoiceDesign;
}
