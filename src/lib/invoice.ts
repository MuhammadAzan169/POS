/**
 * Turning a recorded sale into the bill that goes out with it.
 *
 * Kept out of the components so the sales list, the till and the Settings
 * preview all build a bill the same way — the account block in particular is
 * easy to get subtly wrong, and there should be exactly one place that decides
 * what "previous balance" means.
 */
import type { InvoiceData } from "@/components/Invoice";
import { customerBalance } from "./day-book";
import type { Adjustment, Customer, CustomerPayment, Sale, SetOff, Shop } from "./store-types";
import { customerNameOf, isWalkIn } from "./store-types";

export interface LedgerSource {
  sales: Sale[];
  customerPayments: CustomerPayment[];
  setOffs?: SetOff[];
  adjustments?: Adjustment[];
}

/**
 * Builds the bill for one sale.
 *
 * The account block is filled in only for a sale to a named customer: a walk-in
 * has no running balance, and printing "previous balance 0" on their slip
 * invites the question of whose account it is.
 *
 * "Previous balance" is what the customer owed with THIS bill taken back out of
 * the ledger — the figure the shopkeeper would have quoted a minute before the
 * goods were loaded. Deriving it that way rather than storing it means a bill
 * reprinted after a later payment still shows the account as it stands now,
 * which is what a trade buyer chasing a total actually wants.
 */
export function buildInvoice(
  sale: Sale,
  data: LedgerSource,
  opts: { customer?: Customer | null; shop?: Shop | null } = {},
): InvoiceData {
  const customer = opts.customer ?? null;

  const lines = sale.lines.map((l) => ({
    name: l.name,
    qty: l.qty,
    // The rate written on a bill is what the buyer was actually charged, so any
    // per-item discount is folded into it rather than shown as a separate
    // column the customer has to reconcile.
    rate: l.qty > 0 ? Math.round(l.price - (l.discount || 0) / l.qty) : l.price,
  }));

  const invoice: InvoiceData = {
    invoice: sale.invoice,
    at: new Date(sale.date),
    shopName: opts.shop?.name,
    cashier: sale.cashier,
    customer: customerNameOf(sale),
    customerPhone: customer?.phone,
    payment: sale.payment,
    status: sale.status,
    lines,
    subtotal: sale.subtotal,
    discount: sale.discount,
    total: sale.total,
  };

  if (customer && !isWalkIn(sale)) {
    // Dates on payments, set-offs and adjustments are plain days; a sale
    // carries a full timestamp. Compared on the day so a payment taken the
    // same morning still counts as having come in against this bill.
    const day = sale.date.slice(0, 10);
    const upto = <T extends { date: string }>(rows: T[] | undefined) =>
      (rows ?? []).filter((r) => r.date.slice(0, 10) < day);

    /*
     * What the account stood at BEFORE this bill — the figure the shopkeeper
     * would have quoted as the goods were being loaded.
     *
     * This has to be filtered by date, not merely have this one sale removed.
     * Taking the sale out of today's ledger and calling the remainder
     * "previous" silently folded in every payment made SINCE, so the balance
     * carried forward always came out equal to the closing balance and the
     * "Cash received" line could never appear at all — the arithmetic was
     * `prev + total - (prev + total)`, which is zero by construction.
     */
    const before = signedBalance(customer, {
      sales: data.sales.filter((s) => s.id !== sale.id && s.date < sale.date),
      customerPayments: upto(data.customerPayments),
      setOffs: upto(data.setOffs),
      adjustments: upto(data.adjustments),
    });

    // Where it stands now, this bill and everything after it included.
    const closingBalance = signedBalance(customer, data);

    /*
     * Only a credit sale joins the account. Goods paid for at the counter are
     * settled the moment they leave, so adding their total to the running
     * balance would bill the customer twice — once in cash and once on paper.
     * A returned sale is cancelled outright and adds nothing either.
     */
    const onAccount = sale.payment === "Credit" && sale.status !== "Returned" ? sale.total : 0;

    // Whatever brought the balance down between the two: payments, set-offs and
    // write-offs all read as money received on a bill. Derived rather than
    // summed so the four printed figures always reconcile exactly.
    const received = Math.max(0, before + onAccount - closingBalance);

    invoice.account = { previousBalance: before, onAccount, received, closingBalance };
  }

  return invoice;
}

/**
 * The balance in one signed number: positive is owed to you, negative is an
 * advance being held for them.
 *
 * `customerBalance` splits those into two never-negative fields, which is right
 * for a screen — "they owe 0 and you hold 5,000" reads better than "-5,000" —
 * but a bill has to subtract one line from the next, and clamping at zero
 * midway through breaks the running total.
 */
function signedBalance(customer: Customer, data: LedgerSource) {
  const b = customerBalance(customer, data);
  return b.outstanding - b.advance;
}

/**
 * Sends the bill to a printer.
 *
 * Downloading is a separate path — `downloadInvoicePdf` writes a real file
 * rather than routing through this dialog — so this is only for the case where
 * paper is what is actually wanted.
 *
 * The bill on screen must be marked `data-print="only"`; the print stylesheet
 * hides everything else on the page when it finds one.
 */
export function printInvoice(afterPrint?: () => void) {
  if (typeof window === "undefined") return;
  if (afterPrint) window.addEventListener("afterprint", afterPrint, { once: true });
  window.print();
}

/** `Bill-INV-1042-Bilal-Traders.pdf` — a name that survives a downloads folder. */
export function invoiceFileName(data: InvoiceData) {
  const who = data.customer.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "");
  return `Bill-${data.invoice}${who ? `-${who}` : ""}`;
}
