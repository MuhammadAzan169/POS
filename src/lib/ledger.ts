/**
 * Party ledgers: who owes what, to whom, and how they got there.
 *
 * The app already knew what a CUSTOMER owed, because credit sales and receipts
 * were both recorded. The other half was missing: a bill from a supplier was a
 * boolean "paid", so "we still owe Ravi Distributors 84,000 across four bills"
 * was not a number the app could produce. Worse, plenty of trade partners sit on
 * BOTH sides — you sell them stock and you buy stock from them — and the two
 * balances lived in different tabs with nothing connecting them.
 *
 * Everything here is derived from the underlying records, never stored. A kept
 * balance drifts the first time a bill is edited or a payment is deleted, and
 * then quietly disagrees with the documents it claims to summarise.
 */
import { dayOf, parseDay } from "./dates";
import { customerBalance } from "./day-book";
import { purchaseSettlement } from "./store-types";
import type {
  Adjustment,
  Customer,
  CustomerPayment,
  Purchase,
  ReturnRec,
  Sale,
  SetOff,
  Supplier,
  SupplierBalance,
  SupplierPayment,
} from "./store-types";

/** Everything the ledger functions read. Pass the whole store; they filter. */
export interface LedgerData {
  sales: Sale[];
  customerPayments: CustomerPayment[];
  purchases: Purchase[];
  supplierPayments: SupplierPayment[];
  returns: ReturnRec[];
  setOffs: SetOff[];
  /** Hand-made corrections and write-offs. Optional so older callers still compile. */
  adjustments?: Adjustment[];
}

/* --------------------------------------------------------------- suppliers */

/**
 * What you owe one supplier.
 *
 * Two things reduce it besides paying them: goods you sent back (a supplier
 * return is credit in your favour) and a set-off against what they owe you.
 * Both are real reductions in the cheque you eventually write, so leaving
 * either out overstates the payable.
 */
export function supplierBalance(supplier: Pick<Supplier, "id">, data: LedgerData): SupplierBalance {
  const bills = data.purchases.filter((p) => p.supplierId === supplier.id);
  const settlements = bills.map(purchaseSettlement);

  const billed = bills.reduce((a, b) => a + b.total, 0);
  const paidOnBills = settlements.reduce((a, s) => a + s.paid, 0);

  const payments = data.supplierPayments.filter((p) => p.supplierId === supplier.id);
  const paidLater = payments.reduce((a, p) => a + p.amount, 0);

  const setOff = data.setOffs
    .filter((x) => x.supplierId === supplier.id)
    .reduce((a, x) => a + x.amount, 0);

  const returnCredit = data.returns
    .filter((r) => r.kind === "supplier" && r.supplierId === supplier.id)
    .reduce((a, r) => a + r.refund, 0);

  // Signed in the direction of what is owed to THEM: positive raises the
  // payable, negative writes part of it off.
  const adjusted = (data.adjustments ?? [])
    .filter((x) => x.supplierId === supplier.id)
    .reduce((a, x) => a + x.amount, 0);

  const net = billed - paidOnBills - paidLater - setOff - returnCredit + adjusted;

  const latest = (xs: { date: string }[]) =>
    xs.length === 0 ? undefined : xs.reduce((a, x) => (x.date > a ? x.date : a), xs[0].date);

  return {
    billed,
    paidOnBills,
    paidLater,
    setOff,
    returnCredit,
    adjusted,
    outstanding: Math.max(0, net),
    advance: Math.max(0, -net),
    net,
    bills: bills.length,
    unpaidBills: settlements.filter((s) => s.balance > 0).length,
    lastPurchase: latest(bills),
    lastPayment: latest(payments),
  };
}

/** Total owed to every supplier — the business's payables. */
export function totalPayable(suppliers: Supplier[], data: LedgerData) {
  return suppliers.reduce((a, s) => a + supplierBalance(s, data).outstanding, 0);
}

/** Money sitting with suppliers ahead of any bill. */
export function totalSupplierAdvances(suppliers: Supplier[], data: LedgerData) {
  return suppliers.reduce((a, s) => a + supplierBalance(s, data).advance, 0);
}

/* ----------------------------------------------------------------- entries */

export type LedgerKind =
  | "sale"
  | "receipt"
  | "bill"
  | "bill-payment"
  | "payment"
  | "set-off"
  | "supplier-return"
  | "adjustment";

/**
 * One line of a statement.
 *
 * `debit` and `credit` are always read from the same direction as the ledger
 * they belong to — on a customer statement a debit is what he took on account,
 * on a supplier statement it is what you were billed — so a reader never has to
 * work out whose side a number is on.
 */
export interface LedgerEntry {
  id: string;
  date: string;
  kind: LedgerKind;
  /** The document: an invoice number, a bill number, "Cash receipt". */
  ref: string;
  note: string;
  debit: number;
  credit: number;
  /** Balance after this line, oldest-first. */
  balance: number;
}

const byDate = (a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date);

/** Fills in the running balance on an already-sorted list. */
function withRunning(rows: Omit<LedgerEntry, "balance">[]): LedgerEntry[] {
  let running = 0;
  return rows.map((r) => {
    running += r.debit - r.credit;
    return { ...r, balance: running };
  });
}

/**
 * A customer's statement, oldest first.
 *
 * Only credit sales appear: a sale settled in cash at the counter is not part
 * of an account, and listing it would make the running balance meaningless.
 */
export function customerLedger(customer: Pick<Customer, "id">, data: LedgerData): LedgerEntry[] {
  const rows: Omit<LedgerEntry, "balance">[] = [];

  data.sales
    .filter(
      (s) => s.customerId === customer.id && s.payment === "Credit" && s.status !== "Returned",
    )
    .forEach((s) =>
      rows.push({
        id: s.id,
        date: dayOf(s.date),
        kind: "sale",
        ref: s.invoice,
        note: `${s.lines.length} item${s.lines.length === 1 ? "" : "s"} on account`,
        debit: s.total,
        credit: 0,
      }),
    );

  data.customerPayments
    .filter((p) => p.customerId === customer.id)
    .forEach((p) =>
      rows.push({
        id: p.id,
        date: dayOf(p.date),
        kind: "receipt",
        ref: `${p.method} receipt`,
        note: p.note,
        debit: 0,
        credit: p.amount,
      }),
    );

  data.setOffs
    .filter((x) => x.customerId === customer.id)
    .forEach((x) =>
      rows.push({
        id: x.id,
        date: dayOf(x.date),
        kind: "set-off",
        ref: "Set-off",
        note: x.note || "Cancelled against what you owe them",
        debit: 0,
        credit: x.amount,
      }),
    );

  // A signed adjustment lands on whichever side of the statement it belongs to,
  // so a write-off reads as a credit and an opening balance as a debit.
  (data.adjustments ?? [])
    .filter((x) => x.customerId === customer.id)
    .forEach((x) =>
      rows.push({
        id: x.id,
        date: dayOf(x.date),
        kind: "adjustment",
        ref: x.amount < 0 ? "Written off" : "Balance adjustment",
        note: x.reason,
        debit: x.amount > 0 ? x.amount : 0,
        credit: x.amount < 0 ? -x.amount : 0,
      }),
    );

  return withRunning(rows.sort(byDate));
}

/** A supplier's statement, oldest first. A debit here is what they billed you. */
export function supplierLedger(supplier: Pick<Supplier, "id">, data: LedgerData): LedgerEntry[] {
  const rows: Omit<LedgerEntry, "balance">[] = [];

  data.purchases
    .filter((p) => p.supplierId === supplier.id)
    .forEach((p) => {
      const st = purchaseSettlement(p);
      rows.push({
        id: p.id,
        date: dayOf(p.date),
        kind: "bill",
        ref: p.billNo,
        note: `${p.lines.length} line${p.lines.length === 1 ? "" : "s"}`,
        debit: p.total,
        credit: 0,
      });
      // Shown as its own line rather than netted into the bill, so a part
      // payment is visible as the two events it actually was.
      if (st.paid > 0) {
        rows.push({
          id: `${p.id}-paid`,
          date: dayOf(p.date),
          kind: "bill-payment",
          ref: `${p.billNo} — paid with bill`,
          note: st.method,
          debit: 0,
          credit: st.paid,
        });
      }
    });

  data.supplierPayments
    .filter((p) => p.supplierId === supplier.id)
    .forEach((p) =>
      rows.push({
        id: p.id,
        date: dayOf(p.date),
        kind: "payment",
        ref: `${p.method} payment`,
        note: p.note,
        debit: 0,
        credit: p.amount,
      }),
    );

  data.returns
    .filter((r) => r.kind === "supplier" && r.supplierId === supplier.id)
    .forEach((r) =>
      rows.push({
        id: r.id,
        date: dayOf(r.date),
        kind: "supplier-return",
        ref: r.returnNo,
        note: r.reason || "Goods returned",
        debit: 0,
        credit: r.refund,
      }),
    );

  data.setOffs
    .filter((x) => x.supplierId === supplier.id)
    .forEach((x) =>
      rows.push({
        id: x.id,
        date: dayOf(x.date),
        kind: "set-off",
        ref: "Set-off",
        note: x.note || "Cancelled against what they owe you",
        debit: 0,
        credit: x.amount,
      }),
    );

  (data.adjustments ?? [])
    .filter((x) => x.supplierId === supplier.id)
    .forEach((x) =>
      rows.push({
        id: x.id,
        date: dayOf(x.date),
        kind: "adjustment",
        ref: x.amount < 0 ? "Written off" : "Balance adjustment",
        note: x.reason,
        debit: x.amount > 0 ? x.amount : 0,
        credit: x.amount < 0 ? -x.amount : 0,
      }),
    );

  return withRunning(rows.sort(byDate));
}

/* ------------------------------------------------------------------ parties */

/**
 * A trade partner seen from both sides at once.
 *
 * `receivable` is what they owe you, `payable` what you owe them, and
 * `settleable` is how much of the two can be cancelled against each other —
 * the smaller of the pair, because you cannot set off more than the shorter
 * debt. `net` is what would still change hands afterwards: positive means they
 * pay you the difference, negative means you pay them.
 */
export interface PartyPosition {
  name: string;
  customer?: Customer;
  supplier?: Supplier;
  receivable: number;
  payable: number;
  /** Advance you are holding for them. */
  advanceHeld: number;
  /** Advance you have placed with them. */
  advancePlaced: number;
  settleable: number;
  net: number;
}

/** The supplier record a customer is linked to, if any. */
export function linkedSupplier(customer: Customer, suppliers: Supplier[]) {
  return customer.linkedSupplierId
    ? suppliers.find((s) => s.id === customer.linkedSupplierId)
    : undefined;
}

/** The customer record linked to a supplier, if any. Derived from the customer side. */
export function linkedCustomer(supplier: Pick<Supplier, "id">, customers: Customer[]) {
  return customers.find((c) => c.linkedSupplierId === supplier.id);
}

export function partyPosition(
  party: { customer?: Customer; supplier?: Supplier },
  data: LedgerData,
): PartyPosition {
  const cb = party.customer ? customerBalance(party.customer, data) : null;
  const sb = party.supplier ? supplierBalance(party.supplier, data) : null;
  const receivable = cb?.outstanding ?? 0;
  const payable = sb?.outstanding ?? 0;
  return {
    name: party.customer?.name ?? party.supplier?.name ?? "",
    customer: party.customer,
    supplier: party.supplier,
    receivable,
    payable,
    advanceHeld: cb?.advance ?? 0,
    advancePlaced: sb?.advance ?? 0,
    settleable: Math.min(receivable, payable),
    net: receivable - payable,
  };
}

/**
 * Every trade partner with anything outstanding on either side, biggest first.
 *
 * Customers and suppliers that are linked collapse into a single row, which is
 * the whole point: the owner needs to see "Bilal Traders — owes 50,000, owed
 * 30,000, settle 30,000" as one line, not as two rows in two different tabs
 * that nobody thinks to compare.
 */
export function partyPositions(
  customers: Customer[],
  suppliers: Supplier[],
  data: LedgerData,
): PartyPosition[] {
  const used = new Set<string>();
  const out: PartyPosition[] = [];

  customers.forEach((c) => {
    const sup = linkedSupplier(c, suppliers);
    if (sup) used.add(sup.id);
    out.push(partyPosition({ customer: c, supplier: sup }, data));
  });

  suppliers
    .filter((s) => !used.has(s.id))
    .forEach((s) => out.push(partyPosition({ supplier: s }, data)));

  return out
    .filter((p) => p.receivable > 0 || p.payable > 0 || p.advanceHeld > 0 || p.advancePlaced > 0)
    .sort((a, b) => Math.max(b.receivable, b.payable) - Math.max(a.receivable, a.payable));
}

/** A bill with money still on it, and how late that money is. */
export interface OpenBill {
  purchase: Purchase;
  paid: number;
  balance: number;
  status: "Paid" | "Part paid" | "Unpaid";
  /** 0 unless a due date was set and has passed. */
  overdueDays: number;
}

/**
 * Bills with money still on them, oldest first.
 *
 * `dueDate` is optional — plenty of bills are agreed on a handshake — so a bill
 * without one is never reported as overdue rather than being treated as due the
 * day it was raised.
 */
export function openBills(data: LedgerData, today: string): OpenBill[] {
  return data.purchases
    .map((p) => {
      const st = purchaseSettlement(p);
      const due = p.dueDate;
      const overdueDays =
        due && due < today
          ? Math.max(
              0,
              Math.round((parseDay(today).getTime() - parseDay(due).getTime()) / 86_400_000),
            )
          : 0;
      return { purchase: p, paid: st.paid, balance: st.balance, status: st.status, overdueDays };
    })
    .filter((b) => b.balance > 0)
    .sort((a, b) => a.purchase.date.localeCompare(b.purchase.date));
}

/** The largest set-off actually available between two linked records. */
export function maxSetOff(
  customer: Pick<Customer, "id" | "creditLimit">,
  supplier: Pick<Supplier, "id">,
  data: LedgerData,
) {
  return Math.min(
    customerBalance(customer, data).outstanding,
    supplierBalance(supplier, data).outstanding,
  );
}
