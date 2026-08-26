/**
 * The day book: opening and closing a shop's trading day, and the cash count
 * that settles it.
 *
 * The problem this solves: a shop that stays open until 2am produces sales
 * timestamped on the NEXT calendar date, so "yesterday's takings" silently split
 * across two days and never matched the cash the shopkeeper handed over. So the
 * trading day is declared, not inferred — the shopkeeper starts the day when
 * they open the door and ends it when they lock up, and every sale in between is
 * stamped with that session's `businessDate` regardless of the clock.
 *
 * Everything here is pure: it derives from records the store already holds, so
 * a session's figures can never drift out of step with its sales.
 */
import { dayOf, todayISO } from "./dates";
import type {
  Adjustment,
  Customer,
  CustomerBalance,
  CustomerPayment,
  DaySession,
  Expense,
  Purchase,
  ReturnRec,
  Sale,
  SessionCash,
  SetOff,
  SupplierPayment,
} from "./store-types";
import { purchaseSettlement } from "./store-types";

/** The open session for a shop, if it has one. At most one is ever open. */
export function openSessionFor(sessions: DaySession[], shopId: string | undefined) {
  if (!shopId) return undefined;
  return sessions.find((s) => s.shopId === shopId && s.status === "open");
}

/** Every session for a shop, newest trading day first. */
export function sessionsFor(sessions: DaySession[], shopId: string) {
  return sessions
    .filter((s) => s.shopId === shopId)
    .sort((a, b) => b.businessDate.localeCompare(a.businessDate) || b.openedAt.localeCompare(a.openedAt));
}

/**
 * The trading day a sale belongs to.
 *
 * Sales recorded before day sessions existed have no `businessDate`, so they
 * fall back to their calendar date. Every grouping in the app goes through this
 * rather than reading either field directly.
 */
export function businessDayOf(sale: Pick<Sale, "businessDate" | "date">) {
  return sale.businessDate ?? dayOf(sale.date);
}

/**
 * What the next session at this shop should open with in the drawer: whatever
 * the last closed session left behind. That carry-forward is the whole point of
 * "some money the owner takes, some stays for the next day".
 */
export function carryForwardCash(sessions: DaySession[], shopId: string) {
  const lastClosed = sessions
    .filter((s) => s.shopId === shopId && s.status === "closed")
    .sort((a, b) => (b.closedAt ?? "").localeCompare(a.closedAt ?? ""))[0];
  return lastClosed?.cashLeftInShop ?? 0;
}

/**
 * The trading day to stamp on a new record at this shop.
 * Falls back to the calendar date when no day has been started.
 */
export function currentBusinessDate(sessions: DaySession[], shopId: string | undefined) {
  return openSessionFor(sessions, shopId)?.businessDate ?? todayISO();
}

/** Records belonging to one session — by id, with a date fallback for pre-session rows. */
function belongsTo(session: DaySession, rec: { sessionId?: string; date: string }, shopMatches: boolean) {
  if (rec.sessionId) return rec.sessionId === session.id;
  return shopMatches && dayOf(rec.date) === session.businessDate;
}

/**
 * Full cash and sales position for one session.
 *
 * `expectedCash` is what the drawer should hold right now; comparing it with the
 * counted figure at close is what catches a short till the same evening rather
 * than at the end of the month.
 */
export function summarizeSession(
  session: DaySession,
  data: {
    sales: Sale[];
    expenses: Expense[];
    returns: ReturnRec[];
    customerPayments?: CustomerPayment[];
    supplierPayments?: SupplierPayment[];
    purchases?: Purchase[];
  },
): SessionCash {
  const sales = data.sales.filter(
    (s) => s.shopId === session.shopId && belongsTo(session, s, true) && s.status !== "Returned",
  );

  const byPayment = (p: Sale["payment"]) =>
    sales.filter((s) => s.payment === p).reduce((a, s) => a + s.total, 0);

  const cashSales = byPayment("Cash");
  const cardSales = byPayment("Card");
  const onlineSales = byPayment("Online");
  // Sold on account: a genuine sale, but the drawer never saw the money.
  const creditSales = byPayment("Credit");

  // Money collected TODAY against credit given on some earlier day. It is not a
  // sale now — the sale was booked when the goods left — but the cash is real
  // and has to be in the drawer at close, or the till reads short.
  const collections = (data.customerPayments ?? []).filter(
    (p) => p.shopId === session.shopId && belongsTo(session, p, true),
  );
  const creditCollected = collections.filter((p) => p.method === "Cash").reduce((a, p) => a + p.amount, 0);
  const creditCollectedOther = collections.filter((p) => p.method !== "Cash").reduce((a, p) => a + p.amount, 0);

  // Refunds are paid out of the drawer in cash, so they reduce what's in it.
  const refunds = data.returns
    .filter((r) => r.kind === "customer" && r.shopId === session.shopId && dayOf(r.date) === session.businessDate)
    .reduce((a, r) => a + r.refund, 0);

  const drawerExpenses = data.expenses
    .filter((e) => e.shopId === session.shopId && belongsTo(session, e, true))
    .reduce((a, e) => a + e.amount, 0);

  // Money handed to suppliers from this till. Head-office payments carry no
  // shopId and so never reach a shop's count.
  const supplierCashPaid = (data.supplierPayments ?? [])
    .filter((p) => p.method === "Cash" && p.shopId === session.shopId && belongsTo(session, p, true))
    .reduce((a, p) => a + p.amount, 0);

  // A bill the shopkeeper raised and settled in cash on the spot. Matched on
  // the shop that RAISED it, not the shop the stock landed at: a bill entered
  // at head office is paid from head office however the goods are distributed.
  const shopBills = (data.purchases ?? []).filter(
    (b) => b.createdByShopId === session.shopId && belongsTo(session, b, true),
  );
  const billCashPaid = shopBills
    .filter((b) => purchaseSettlement(b).method === "Cash")
    .reduce((a, b) => a + purchaseSettlement(b).paid, 0);
  const creditPurchases = shopBills.reduce((a, b) => a + purchaseSettlement(b).balance, 0);

  const expectedCash =
    session.openingCash + cashSales + creditCollected - refunds - drawerExpenses - supplierCashPaid - billCashPaid;
  const countedCash = session.status === "closed" ? session.countedCash ?? 0 : null;

  return {
    openingCash: session.openingCash,
    cashSales,
    cardSales,
    onlineSales,
    creditSales,
    creditCollected,
    creditCollectedOther,
    totalSales: cashSales + cardSales + onlineSales + creditSales,
    invoices: sales.length,
    itemsSold: sales.reduce((a, s) => a + s.lines.reduce((b, l) => b + l.qty, 0), 0),
    profit: sales.reduce((a, s) => a + s.profit, 0),
    refunds,
    drawerExpenses,
    supplierCashPaid,
    billCashPaid,
    creditPurchases,
    expectedCash,
    countedCash,
    variance: countedCash === null ? null : countedCash - expectedCash,
    cashTakenByOwner: session.cashTakenByOwner ?? 0,
    cashLeftInShop: session.cashLeftInShop ?? 0,
  };
}

/**
 * The CLOSED trading day a record belongs to, if it belongs to one.
 *
 * Changing a record from a settled day is not the same as changing today's: the
 * cash was counted that evening, the owner took it away, and the variance was
 * signed off. Editing it afterwards makes a day that balanced stop balancing,
 * and nobody finds out until somebody re-reads an old sheet.
 *
 * This does not forbid the edit — corrections are exactly why the app allows
 * them — it just gives the screen something concrete to warn with.
 */
export function closedSessionFor(
  sessions: DaySession[],
  rec: { sessionId?: string; shopId?: string; date?: string; businessDate?: string },
): DaySession | undefined {
  if (rec.sessionId) {
    const byId = sessions.find((s) => s.id === rec.sessionId);
    return byId?.status === "closed" ? byId : undefined;
  }
  // Records from before day sessions existed carry no id, so fall back to the
  // day they landed on at that shop.
  const day = rec.businessDate ?? (rec.date ? dayOf(rec.date) : undefined);
  if (!day || !rec.shopId) return undefined;
  const byDay = sessions.find((s) => s.shopId === rec.shopId && s.businessDate === day);
  return byDay?.status === "closed" ? byDay : undefined;
}

/** Payment split across any set of sales — how the takings were settled. */
export function paymentMix(sales: Sale[]) {
  const live = sales.filter((s) => s.status !== "Returned");
  const sum = (p: Sale["payment"]) => live.filter((s) => s.payment === p).reduce((a, s) => a + s.total, 0);
  const count = (p: Sale["payment"]) => live.filter((s) => s.payment === p).length;
  const cash = sum("Cash");
  const card = sum("Card");
  const online = sum("Online");
  const credit = sum("Credit");
  const total = cash + card + online + credit;
  return {
    cash,
    card,
    online,
    credit,
    total,
    counts: { Cash: count("Cash"), Card: count("Card"), Online: count("Online"), Credit: count("Credit") },
    pct: (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0),
  };
}

/* ------------------------------------------------------------ customer credit */

/**
 * What one customer owes, and what they're worth.
 *
 * Derived from the sales and payments themselves rather than kept as a running
 * total on the customer row — a stored balance drifts the first time a sale is
 * edited, deleted or returned, and then quietly disagrees with the invoices it
 * was supposed to summarise.
 */
export function customerBalance(
  customer: Pick<Customer, "id" | "creditLimit">,
  data: {
    sales: Sale[];
    customerPayments: CustomerPayment[];
    setOffs?: SetOff[];
    adjustments?: Adjustment[];
  },
): CustomerBalance {
  const mine = data.sales.filter((s) => s.customerId === customer.id && s.status !== "Returned");
  // A returned credit sale is cancelled, so it stops being owed — which is why
  // `mine` excludes returns before this sum rather than after it.
  const creditSales = mine.filter((s) => s.payment === "Credit").reduce((a, s) => a + s.total, 0);
  const payments = data.customerPayments.filter((p) => p.customerId === customer.id);
  const paid = payments.reduce((a, p) => a + p.amount, 0);
  const setOff = (data.setOffs ?? [])
    .filter((x) => x.customerId === customer.id)
    .reduce((a, x) => a + x.amount, 0);

  // Signed, in the direction of what is owed: a write-off is negative and so
  // brings the balance down, an opening balance is positive and raises it.
  const adjusted = (data.adjustments ?? [])
    .filter((x) => x.customerId === customer.id)
    .reduce((a, x) => a + x.amount, 0);

  // Signed first, then split. Paying in more than you have taken out is not an
  // error to be clamped away — it is the month-start advance, and the shop has
  // to be able to see it sitting there.
  const net = creditSales - paid - setOff + adjusted;
  const outstanding = Math.max(0, net);
  const advance = Math.max(0, -net);

  const latest = (xs: { date: string }[]) =>
    xs.length === 0 ? undefined : xs.reduce((a, x) => (x.date > a ? x.date : a), xs[0].date);

  return {
    creditSales,
    paid,
    setOff,
    adjusted,
    outstanding,
    advance,
    net,
    orders: mine.length,
    lifetime: mine.reduce((a, s) => a + s.total, 0),
    lastPurchase: latest(mine),
    lastPayment: latest(payments),
    overLimit: customer.creditLimit > 0 && outstanding >= customer.creditLimit,
  };
}

/** Total owed to the business across every customer. */
export function totalOutstanding(
  customers: Customer[],
  data: { sales: Sale[]; customerPayments: CustomerPayment[]; setOffs?: SetOff[]; adjustments?: Adjustment[] },
) {
  return customers.reduce((a, c) => a + customerBalance(c, data).outstanding, 0);
}

/** Advances held across every customer — money in the drawer that isn't yours. */
export function totalAdvances(
  customers: Customer[],
  data: { sales: Sale[]; customerPayments: CustomerPayment[]; setOffs?: SetOff[]; adjustments?: Adjustment[] },
) {
  return customers.reduce((a, c) => a + customerBalance(c, data).advance, 0);
}

/**
 * How much more this customer may take on account before hitting their limit.
 * `Infinity` when no limit is set, so callers can compare without special-casing.
 */
export function creditHeadroom(
  customer: Pick<Customer, "id" | "creditLimit">,
  data: { sales: Sale[]; customerPayments: CustomerPayment[]; setOffs?: SetOff[]; adjustments?: Adjustment[] },
) {
  const bal = customerBalance(customer, data);
  // An advance is spending money, not borrowing it, so it is always available
  // however low the limit is set.
  if (customer.creditLimit <= 0) return Infinity;
  return Math.max(0, customer.creditLimit - bal.outstanding) + bal.advance;
}
