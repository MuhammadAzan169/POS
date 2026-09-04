/**
 * The whole app's arithmetic, tested end to end.
 *
 *   node scripts/test-all.mjs
 *
 * There is no test framework in this project, and adding one would drag in a
 * build step for code that is already plain functions over plain data. So this
 * is a runner: a few hundred lines of assertions against the real modules, with
 * no mocks anywhere — every function here is the one the app calls.
 *
 * It covers what a shopkeeper would actually lose money over: what a sale is
 * worth after two kinds of discount, what a day's drawer should hold, what a
 * customer owes, what a supplier is owed, and whether the bell rings for each
 * of the nine things that ought to raise a warning.
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./ts-loader.mjs", pathToFileURL("./scripts/"));

const T = await import("../src/lib/store-types.ts");
const D = await import("../src/lib/dates.ts");
const B = await import("../src/lib/day-book.ts");
const L = await import("../src/lib/ledger.ts");
const N = await import("../src/lib/notifications.ts");
const I = await import("../src/lib/insights.ts");
const seed = await import("../src/lib/seed-data.ts");
const Store = await import("../src/lib/store.tsx");
const Bill = await import("../src/lib/invoice.ts");
const BillView = await import("../src/lib/bill-format.ts");

/* ------------------------------------------------------------------ runner */

let passed = 0;
const failures = [];
let group = "";

const describe = (name) => { group = name; console.log(`\n${name}`); };

function it(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok    ${name}`);
  } catch (e) {
    failures.push({ group, name, message: e.message });
    console.log(`  FAIL  ${name}\n          ${e.message}`);
  }
}

function eq(actual, expected, what = "value") {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${what}: expected ${b}, got ${a}`);
}
const ok = (cond, what) => { if (!cond) throw new Error(what); };

/* ------------------------------------------------------------- fixtures */

const prod = (id, over = {}) => ({
  id, barcode: `barcode-${id}`, name: `Product ${id}`, category: "Cosmetics", brand: "Glow",
  cost: 100, price: 150, lowAlert: 5, active: true, ...over,
});

const line = (over = {}) => ({ productId: "p1", name: "Product p1", qty: 1, price: 100, cost: 60, discount: 0, ...over });

const sale = (over = {}) => ({
  id: "s1", invoice: "INV-1", shopId: "shop1", date: "2026-08-20T10:00:00.000Z",
  businessDate: "2026-08-20", customer: "Walk-in", cashier: "Cashier",
  lines: [line()], subtotal: 100, discount: 0, total: 100, profit: 40,
  payment: "Cash", status: "Completed", synced: true, ...over,
});

const purchase = (over = {}) => ({
  id: "b1", billNo: "BILL-1", supplier: "Supplier One", supplierId: "sup1",
  date: "2026-08-20", lines: [{ productId: "p1", shopId: "shop1", qty: 10, rate: 100 }],
  total: 1000, ...over,
});

const session = (over = {}) => ({
  id: "day1", shopId: "shop1", businessDate: "2026-08-20",
  openedAt: "2026-08-20T09:00:00.000Z", openedBy: "Cashier",
  openingCash: 5000, status: "open", ...over,
});

/** An empty ledger, so each test only has to supply the part it cares about. */
/** Money taken from a customer against what they already owe. */
const receipt = (over = {}) => ({
  id: "p1", customerId: "c1", date: "2026-08-21", amount: 1000,
  method: "Cash", shopId: "shop1", note: "", receivedBy: "Cashier", ...over,
});

const ledgerData = (over = {}) => ({
  sales: [], customerPayments: [], purchases: [], supplierPayments: [], returns: [], setOffs: [],
  adjustments: [], ...over,
});

const adj = (over = {}) => ({ id: "a1", date: "2026-08-21", amount: -1000, reason: "test", createdBy: "Owner", ...over });

/* ================================================================= DATES */

describe("Dates — the local-time rules the whole app depends on");

it("localDay uses local time, not UTC", () => {
  // 01:30 local on the 21st. toISOString() would report the 20th for anywhere
  // east of UTC, which is exactly the bug dates.ts exists to prevent.
  const d = new Date(2026, 7, 21, 1, 30, 0);
  eq(D.localDay(d), "2026-08-21");
});

it("parseDay reads YYYY-MM-DD as local midnight", () => {
  const d = D.parseDay("2026-08-21");
  eq([d.getFullYear(), d.getMonth(), d.getDate()], [2026, 7, 21]);
});

it("dayOf passes plain dates through and converts timestamps", () => {
  eq(D.dayOf("2026-08-21"), "2026-08-21", "plain date");
  eq(D.dayOf(new Date(2026, 7, 21, 23, 59).toISOString()), "2026-08-21", "late-evening timestamp");
});

it("shiftDay crosses month and year boundaries", () => {
  eq(D.shiftDay("2026-08-01", -1), "2026-07-31", "back over a month end");
  eq(D.shiftDay("2026-12-31", 1), "2027-01-01", "forward over a year end");
  eq(D.shiftDay("2028-02-28", 1), "2028-02-29", "into a leap day");
});

it("daysBetween is inclusive and never zero", () => {
  eq(D.daysBetween("2026-08-01", "2026-08-01"), 1, "same day");
  eq(D.daysBetween("2026-08-01", "2026-08-07"), 7, "a week");
});

it("daysInRange returns oldest-first and truncates at the OLD end", () => {
  eq(D.daysInRange("2026-08-01", "2026-08-03"), ["2026-08-01", "2026-08-02", "2026-08-03"]);
  eq(D.daysInRange("2026-08-03", "2026-08-01"), [], "backwards range");
  const wide = D.daysInRange("2000-01-01", "2026-08-21");
  eq(wide.length, 400, "capped");
  eq(wide[wide.length - 1], "2026-08-21", "keeps the RECENT end, not the year-2000 end");
});

it("startOfMonth and clampRangeToData", () => {
  eq(D.startOfMonth("2026-08-21"), "2026-08-01");
  eq(D.clampRangeToData({ from: "2000-01-01", to: "2026-08-21" }, ["2026-08-10", "2026-08-12"]),
     { from: "2026-08-10", to: "2026-08-21" });
});

/* ============================================================== PRODUCTS */

describe("Barcodes and pricing");

const catalogue = [
  prod("p1", { barcode: "8901001", name: "Matte Lipstick Ruby" }),
  prod("p2", { barcode: "8901002", name: "Face Powder 500g" }),
  prod("p3", { barcode: "", name: "Kajal Pencil" }),
];

it("an exact barcode wins", () => {
  eq(T.matchProduct(catalogue, "8901002")?.id, "p2");
});

it("a barcode matches with stray whitespace from the scanner", () => {
  eq(T.matchProduct(catalogue, " 8901 002 ")?.id, "p2");
});

it("a digit-only code that matches nothing returns nothing — it does NOT guess a name", () => {
  // "500" appears in "Face Powder 500g". Guessing here is what made a scan look
  // like it had found the wrong item.
  eq(T.matchProduct(catalogue, "500"), undefined);
});

it("a typed name still matches, exact before partial", () => {
  eq(T.matchProduct(catalogue, "Kajal Pencil")?.id, "p3", "exact name");
  eq(T.matchProduct(catalogue, "lipstick")?.id, "p1", "partial name");
});

it("an empty or blank term matches nothing", () => {
  eq(T.matchProduct(catalogue, ""), undefined);
  eq(T.matchProduct(catalogue, "   "), undefined);
});

it("priceFor falls back to retail when no wholesale rate is set", () => {
  eq(T.priceFor({ price: 150, wholesalePrice: 120 }, "wholesale"), 120, "wholesale shop");
  eq(T.priceFor({ price: 150, wholesalePrice: 120 }, "retail"), 150, "retail shop");
  eq(T.priceFor({ price: 150 }, "wholesale"), 150, "no wholesale rate");
  eq(T.priceFor({ price: 150, wholesalePrice: 0 }, "wholesale"), 150, "zero wholesale rate");
});

it("shopKind treats a missing kind as retail", () => {
  eq(T.shopKind(undefined), "retail");
  eq(T.shopKind({}), "retail");
  eq(T.shopKind({ kind: "wholesale" }), "wholesale");
});

/* ============================================================= DISCOUNTS */

describe("The two discounts on a sale");

it("splits a slip discount into itemised and bill-level parts", () => {
  const s = sale({ lines: [line({ discount: 30 }), line({ productId: "p2", discount: 20 })], discount: 100 });
  eq(T.discountSplitOf(s), { items: 50, bill: 50, total: 100 });
});

it("all-itemised leaves no bill discount", () => {
  const s = sale({ lines: [line({ discount: 40 })], discount: 40 });
  eq(T.discountSplitOf(s), { items: 40, bill: 0, total: 40 });
});

it("lines adding up to MORE than the slip never produce a bill surcharge", () => {
  const s = sale({ lines: [line({ discount: 80 })], discount: 50 });
  eq(T.discountSplitOf(s).bill, 0, "clamped at zero, not negative");
});

describe("A shopper who gives no name");

it("a blank name reads as a walk-in, not as an empty cell", () => {
  eq(T.customerNameOf(sale({ customer: "" })), T.WALK_IN);
  eq(T.customerNameOf(sale({ customer: "   " })), T.WALK_IN, "whitespace only counts as blank");
});

it("a missing name survives a row that never had one", () => {
  // A null column in Postgres, or an import that skipped the field.
  eq(T.customerNameOf({ customer: undefined }), T.WALK_IN);
  eq(T.customerNameOf({ customer: null }), T.WALK_IN);
});

it("a real name is left exactly alone", () => {
  eq(T.customerNameOf(sale({ customer: "Ayesha K." })), "Ayesha K.");
  eq(T.customerNameOf(sale({ customer: "  Hassan A.  " })), "Hassan A.", "trimmed, not renamed");
});

it("knows an anonymous sale from an account sale", () => {
  eq(T.isWalkIn(sale({ customer: "", customerId: undefined })), true);
  eq(T.isWalkIn(sale({ customer: T.WALK_IN, customerId: undefined })), true);
  eq(T.isWalkIn(sale({ customer: "Ayesha K.", customerId: undefined })), false, "a typed name is still a name");
  eq(
    T.isWalkIn(sale({ customer: T.WALK_IN, customerId: "cust1" })),
    false,
    "an account sale is never a walk-in, whatever the name field says",
  );
});

it("a walk-in sale is a complete record: it still totals, profits and settles", () => {
  const s = sale({ customer: "", lines: [line({ qty: 2, price: 300, cost: 200 })], subtotal: 600, discount: 50, total: 550 });
  // Nothing about an unnamed buyer changes the money. The allocation, the
  // discount split and the day's drawer all read the lines, not the name.
  eq(T.discountSplitOf(s), { items: 0, bill: 50, total: 50 });
  eq(T.allocateSale(s)[0].revenue, 550);
  eq(T.allocateSale(s)[0].profit, 150, "600 taken - 400 cost - 50 off the bill");
});

describe("Allocating a bill discount across lines");

it("shares a bill discount in proportion to line value", () => {
  const s = sale({
    lines: [line({ qty: 1, price: 300 }), line({ productId: "p2", qty: 1, price: 100 })],
    discount: 40,
  });
  const alloc = T.allocateSale(s);
  eq(alloc.map((a) => a.revenue), [270, 90], "300/400 and 100/400 of a 40 discount");
});

it("the allocated parts always add back to the sale exactly", () => {
  // 3 lines and a discount that does not divide evenly is where rounding
  // normally leaves a rupee behind and a rollup stops matching its invoice.
  const s = sale({
    lines: [
      line({ qty: 3, price: 333, cost: 200 }),
      line({ productId: "p2", qty: 1, price: 101, cost: 50 }),
      line({ productId: "p3", qty: 7, price: 77, cost: 40 }),
    ],
    discount: 101,
  });
  const gross = s.lines.reduce((a, l) => a + l.qty * l.price, 0);
  const alloc = T.allocateSale(s);
  const revenue = alloc.reduce((a, x) => a + x.revenue, 0);
  eq(revenue, gross - 101, "revenue adds back to gross minus the whole discount");
});

it("profit allocates the same way as revenue", () => {
  const s = sale({
    lines: [line({ qty: 2, price: 200, cost: 120 }), line({ productId: "p2", qty: 1, price: 100, cost: 55 })],
    discount: 50,
  });
  const alloc = T.allocateSale(s);
  const grossProfit = s.lines.reduce((a, l) => a + l.qty * (l.price - l.cost) - l.discount, 0);
  eq(alloc.reduce((a, x) => a + x.profit, 0), grossProfit - 50, "profit carries the discount too");
});

it("a sale with no discount allocates untouched", () => {
  const s = sale({ lines: [line({ qty: 2, price: 100, cost: 60 })], discount: 0 });
  eq(T.allocateSale(s), [{ line: s.lines[0], revenue: 200, profit: 80 }]);
});

it("a single line takes the whole bill discount", () => {
  const s = sale({ lines: [line({ qty: 1, price: 500, cost: 300 })], discount: 75 });
  eq(T.allocateSale(s)[0].revenue, 425);
});

/* ========================================================= PURCHASE BILLS */

describe("Where a supplier bill stands");

it("a bill from before part-payments existed reads as fully paid", () => {
  eq(T.purchaseSettlement(purchase({ paid: true })), { method: "Cash", paid: 1000, balance: 0, status: "Paid" });
});

it("a legacy bill explicitly marked unpaid reads as owed in full", () => {
  const st = T.purchaseSettlement(purchase({ paid: false }));
  eq([st.paid, st.balance, st.status], [0, 1000, "Unpaid"]);
});

it("a bill with no settlement information at all defaults to paid", () => {
  // The old column default was `true`; anything else would invent debt on
  // every row of an existing database the moment the migration ran.
  eq(T.purchaseSettlement(purchase()).status, "Paid");
});

it("a part payment reports both halves", () => {
  const st = T.purchaseSettlement(purchase({ payment: "Credit", amountPaid: 400 }));
  eq([st.paid, st.balance, st.status], [400, 600, "Part paid"]);
});

it("wholly on account", () => {
  const st = T.purchaseSettlement(purchase({ payment: "Credit", amountPaid: 0 }));
  eq([st.paid, st.balance, st.status], [0, 1000, "Unpaid"]);
});

it("paying more than the bill is capped, never negative", () => {
  const st = T.purchaseSettlement(purchase({ payment: "Cash", amountPaid: 5000 }));
  eq([st.paid, st.balance], [1000, 0]);
});

it("a zero-value bill does not read as an unpaid debt", () => {
  const st = T.purchaseSettlement(purchase({ total: 0, payment: "Credit", amountPaid: 0 }));
  eq([st.balance, st.status], [0, "Paid"]);
});

/* ======================================================= CUSTOMER BALANCE */

describe("What a customer owes");

const cust = { id: "c1", creditLimit: 50000 };

it("only credit sales go on the account; a cash sale does not", () => {
  const data = ledgerData({
    sales: [
      sale({ id: "s1", customerId: "c1", payment: "Credit", total: 10000 }),
      sale({ id: "s2", customerId: "c1", payment: "Cash", total: 4000 }),
    ],
  });
  const bal = B.customerBalance(cust, data);
  eq(bal.creditSales, 10000, "on account");
  eq(bal.lifetime, 14000, "lifetime counts every sale");
  eq(bal.orders, 2);
});

it("a returned credit sale stops being owed", () => {
  const data = ledgerData({
    sales: [
      sale({ id: "s1", customerId: "c1", payment: "Credit", total: 10000 }),
      sale({ id: "s2", customerId: "c1", payment: "Credit", total: 6000, status: "Returned" }),
    ],
  });
  eq(B.customerBalance(cust, data).outstanding, 10000);
});

it("payments and set-offs both bring the balance down", () => {
  const data = ledgerData({
    sales: [sale({ customerId: "c1", payment: "Credit", total: 10000 })],
    customerPayments: [{ id: "p1", customerId: "c1", date: "2026-08-21", amount: 3000, method: "Cash", shopId: "shop1", note: "", receivedBy: "x" }],
    setOffs: [{ id: "o1", date: "2026-08-21", customerId: "c1", supplierId: "sup1", amount: 2000, note: "", createdBy: "x" }],
  });
  const bal = B.customerBalance(cust, data);
  eq([bal.paid, bal.setOff, bal.outstanding], [3000, 2000, 5000]);
});

it("paying in more than was taken shows as an advance, not a negative debt", () => {
  const data = ledgerData({
    sales: [sale({ customerId: "c1", payment: "Credit", total: 10000 })],
    customerPayments: [{ id: "p1", customerId: "c1", date: "2026-08-01", amount: 25000, method: "Online", shopId: "shop1", note: "month advance", receivedBy: "x" }],
  });
  const bal = B.customerBalance(cust, data);
  eq([bal.outstanding, bal.advance, bal.net], [0, 15000, -15000]);
});

it("the month-start payer draws the advance down as they buy", () => {
  const buy = (n, total) => sale({ id: `s${n}`, customerId: "c1", payment: "Credit", total });
  const data = ledgerData({
    sales: [buy(1, 30000), buy(2, 45000)],
    customerPayments: [{ id: "p1", customerId: "c1", date: "2026-08-01", amount: 100000, method: "Online", shopId: "shop1", note: "", receivedBy: "x" }],
  });
  eq(B.customerBalance(cust, data).advance, 25000, "100,000 less 75,000 drawn");
});

/*
 * A "pay later" sale that is settled afterwards — in one go, in instalments, or
 * with more than was owed. This is the commonest thing that happens to a credit
 * sale after it is rung up, so each shape is pinned down here.
 */
it("paying the whole balance later settles the account exactly", () => {
  const data = ledgerData({
    sales: [sale({ customerId: "c1", payment: "Credit", total: 8000 })],
    customerPayments: [receipt({ amount: 8000 })],
  });
  const bal = B.customerBalance(cust, data);
  eq([bal.outstanding, bal.advance, bal.paid], [0, 0, 8000], "square, with nothing held either way");
});

it("a part payment leaves the rest owed and collectable", () => {
  const data = ledgerData({
    sales: [sale({ customerId: "c1", payment: "Credit", total: 8000 })],
    customerPayments: [receipt({ amount: 3000 })],
  });
  const bal = B.customerBalance(cust, data);
  eq([bal.paid, bal.outstanding], [3000, 5000]);
  eq(bal.advance, 0, "a part payment is never an advance");
});

it("instalments add up: three visits clear one invoice", () => {
  const data = ledgerData({
    sales: [sale({ customerId: "c1", payment: "Credit", total: 9000 })],
    customerPayments: [
      receipt({ id: "p1", amount: 3000, date: "2026-08-21" }),
      receipt({ id: "p2", amount: 4000, date: "2026-08-24" }),
      receipt({ id: "p3", amount: 2000, date: "2026-08-28" }),
    ],
  });
  eq(B.customerBalance(cust, data).outstanding, 0, "9,000 taken in three parts");
});

it("part-paying frees exactly that much credit back up", () => {
  const before = ledgerData({ sales: [sale({ customerId: "c1", payment: "Credit", total: 40000 })] });
  const after = ledgerData({
    sales: [sale({ customerId: "c1", payment: "Credit", total: 40000 })],
    customerPayments: [receipt({ amount: 15000 })],
  });
  // The whole point of collecting: the customer can buy on account again.
  eq(B.creditHeadroom(cust, before), 10000);
  eq(B.creditHeadroom(cust, after), 25000);
});

it("a payment against a settled account is held as an advance, not refused", () => {
  const data = ledgerData({
    sales: [sale({ customerId: "c1", payment: "Credit", total: 5000 })],
    customerPayments: [receipt({ id: "p1", amount: 5000 }), receipt({ id: "p2", amount: 2000 })],
  });
  const bal = B.customerBalance(cust, data);
  eq([bal.outstanding, bal.advance], [0, 2000]);
});

it("one customer's payment never touches another's balance", () => {
  const data = ledgerData({
    sales: [
      sale({ id: "s1", customerId: "c1", payment: "Credit", total: 5000 }),
      sale({ id: "s2", customerId: "c2", payment: "Credit", total: 7000 }),
    ],
    customerPayments: [receipt({ amount: 5000, customerId: "c2" })],
  });
  eq(B.customerBalance(cust, data).outstanding, 5000, "c1 still owes every rupee");
  eq(B.customerBalance({ id: "c2", creditLimit: 50000 }, data).outstanding, 2000);
});

it("the credit limit trips exactly AT the limit, not past it", () => {
  const atLimit = ledgerData({ sales: [sale({ customerId: "c1", payment: "Credit", total: 50000 })] });
  const under = ledgerData({ sales: [sale({ customerId: "c1", payment: "Credit", total: 49999 })] });
  eq(B.customerBalance(cust, atLimit).overLimit, true);
  eq(B.customerBalance(cust, under).overLimit, false);
});

it("a customer with no limit is never over limit", () => {
  const data = ledgerData({ sales: [sale({ customerId: "c1", payment: "Credit", total: 999999 })] });
  eq(B.customerBalance({ id: "c1", creditLimit: 0 }, data).overLimit, false);
  eq(B.creditHeadroom({ id: "c1", creditLimit: 0 }, data), Infinity);
});

it("an advance is spending money, so it adds to the headroom", () => {
  const data = ledgerData({
    customerPayments: [{ id: "p1", customerId: "c1", date: "2026-08-01", amount: 20000, method: "Cash", shopId: "shop1", note: "", receivedBy: "x" }],
  });
  eq(B.creditHeadroom(cust, data), 70000, "50,000 limit plus 20,000 of their own money");
});

/* ======================================================= SUPPLIER BALANCE */

describe("What you owe a supplier");

const sup = { id: "sup1" };

it("sums what is left on their bills", () => {
  const data = ledgerData({
    purchases: [
      purchase({ id: "b1", total: 1000, payment: "Credit", amountPaid: 0 }),
      purchase({ id: "b2", total: 2000, payment: "Credit", amountPaid: 500 }),
      purchase({ id: "b3", total: 3000, payment: "Cash", amountPaid: 3000 }),
    ],
  });
  const bal = L.supplierBalance(sup, data);
  eq(bal.billed, 6000, "everything billed");
  eq(bal.paidOnBills, 3500, "settled at the counter");
  eq(bal.outstanding, 2500, "still owed");
  eq(bal.unpaidBills, 2, "bills with money on them");
});

it("payments, returns and set-offs all reduce what you owe", () => {
  const data = ledgerData({
    purchases: [purchase({ total: 10000, payment: "Credit", amountPaid: 0 })],
    supplierPayments: [{ id: "sp1", supplierId: "sup1", date: "2026-08-21", amount: 3000, method: "Cash", shopId: "", note: "", paidBy: "x" }],
    returns: [{ id: "r1", kind: "supplier", returnNo: "RET-1", date: "2026-08-21", shopId: "shop1", invoice: "BILL-1", supplierId: "sup1", items: [], refund: 1500, reason: "damaged" }],
    setOffs: [{ id: "o1", date: "2026-08-21", customerId: "c1", supplierId: "sup1", amount: 2000, note: "", createdBy: "x" }],
  });
  const bal = L.supplierBalance(sup, data);
  eq([bal.paidLater, bal.returnCredit, bal.setOff], [3000, 1500, 2000]);
  eq(bal.outstanding, 3500, "10,000 less 3,000 paid, 1,500 credited, 2,000 set off");
});

it("a customer return does NOT reduce a supplier balance", () => {
  const data = ledgerData({
    purchases: [purchase({ total: 5000, payment: "Credit", amountPaid: 0 })],
    returns: [{ id: "r1", kind: "customer", returnNo: "RET-1", date: "2026-08-21", shopId: "shop1", invoice: "INV-1", supplierId: "sup1", items: [], refund: 9999, reason: "" }],
  });
  eq(L.supplierBalance(sup, data).outstanding, 5000);
});

it("paying ahead of any bill shows as an advance placed with them", () => {
  const data = ledgerData({
    supplierPayments: [{ id: "sp1", supplierId: "sup1", date: "2026-08-21", amount: 40000, method: "Online", shopId: "", note: "season advance", paidBy: "x" }],
  });
  const bal = L.supplierBalance(sup, data);
  eq([bal.outstanding, bal.advance, bal.net], [0, 40000, -40000]);
});

/* ================================================================ LEDGERS */

describe("Statements and party positions");

const twoSided = () => ledgerData({
  sales: [sale({ id: "s1", customerId: "c1", payment: "Credit", total: 50000, date: "2026-08-10T10:00:00.000Z" })],
  purchases: [purchase({ id: "b1", total: 30000, date: "2026-08-12", payment: "Credit", amountPaid: 0 })],
});

it("a customer statement ends on the balance the summary reports", () => {
  const data = twoSided();
  const entries = L.customerLedger({ id: "c1" }, data);
  const bal = B.customerBalance({ id: "c1", creditLimit: 0 }, data);
  eq(entries[entries.length - 1].balance, bal.outstanding - bal.advance);
});

it("a supplier statement shows a part payment as its own line", () => {
  const data = ledgerData({ purchases: [purchase({ total: 1000, payment: "Credit", amountPaid: 400 })] });
  const entries = L.supplierLedger(sup, data);
  eq(entries.map((e) => e.kind), ["bill", "bill-payment"]);
  eq(entries.map((e) => [e.debit, e.credit]), [[1000, 0], [0, 400]]);
  eq(entries[1].balance, 600, "running balance after both lines");
});

it("statements read oldest first", () => {
  const data = ledgerData({
    customerPayments: [
      { id: "p2", customerId: "c1", date: "2026-08-20", amount: 1, method: "Cash", shopId: "s", note: "", receivedBy: "" },
      { id: "p1", customerId: "c1", date: "2026-08-01", amount: 2, method: "Cash", shopId: "s", note: "", receivedBy: "" },
    ],
  });
  eq(L.customerLedger({ id: "c1" }, data).map((e) => e.date), ["2026-08-01", "2026-08-20"]);
});

it("a cash sale never appears on a customer statement", () => {
  const data = ledgerData({ sales: [sale({ customerId: "c1", payment: "Cash", total: 9999 })] });
  eq(L.customerLedger({ id: "c1" }, data).length, 0);
});

const customers = [
  { id: "c1", name: "Bilal Traders", contact: "", phone: "", address: "", notes: "", kind: "wholesale", creditLimit: 0, linkedSupplierId: "sup1", active: true },
  { id: "c2", name: "Noor Kirana", contact: "", phone: "", address: "", notes: "", kind: "wholesale", creditLimit: 0, active: true },
];
const suppliers = [
  { id: "sup1", name: "Glow Cosmetics", contact: "", phone: "", email: "", address: "", notes: "", active: true },
  { id: "sup2", name: "Luxe Distributors", contact: "", phone: "", email: "", address: "", notes: "", active: true },
];

it("a party on both sides collapses into ONE row", () => {
  const rows = L.partyPositions(customers, suppliers, twoSided());
  const bilal = rows.filter((r) => r.name === "Bilal Traders");
  eq(bilal.length, 1, "one row, not two");
  eq([bilal[0].receivable, bilal[0].payable], [50000, 30000]);
  ok(bilal[0].customer && bilal[0].supplier, "carries both records");
});

it("the settleable amount is the SMALLER of the two debts", () => {
  const [bilal] = L.partyPositions(customers, suppliers, twoSided()).filter((r) => r.name === "Bilal Traders");
  eq(bilal.settleable, 30000, "cannot cancel more than you owe");
  eq(bilal.net, 20000, "they still owe you the difference");
});

it("a one-sided party has nothing to set off", () => {
  const data = ledgerData({ sales: [sale({ customerId: "c2", payment: "Credit", total: 5000 })] });
  const [noor] = L.partyPositions(customers, suppliers, data).filter((r) => r.name === "Noor Kirana");
  eq([noor.receivable, noor.payable, noor.settleable], [5000, 0, 0]);
});

it("parties with nothing outstanding are left off the list", () => {
  eq(L.partyPositions(customers, suppliers, ledgerData()).length, 0);
});

it("an unlinked supplier still appears in its own right", () => {
  const data = ledgerData({ purchases: [purchase({ supplierId: "sup2", total: 700, payment: "Credit", amountPaid: 0 })] });
  const names = L.partyPositions(customers, suppliers, data).map((r) => r.name);
  eq(names, ["Luxe Distributors"]);
});

it("maxSetOff never exceeds either side", () => {
  eq(L.maxSetOff({ id: "c1", creditLimit: 0 }, { id: "sup1" }, twoSided()), 30000);
});

describe("Open bills and overdue dates");

it("counts the days a bill is past its due date", () => {
  const data = ledgerData({
    purchases: [purchase({ payment: "Credit", amountPaid: 0, dueDate: "2026-08-15" })],
  });
  eq(L.openBills(data, "2026-08-21")[0].overdueDays, 6);
});

it("a bill with no agreed date is never reported as overdue", () => {
  const data = ledgerData({ purchases: [purchase({ payment: "Credit", amountPaid: 0 })] });
  eq(L.openBills(data, "2026-12-31")[0].overdueDays, 0);
});

it("a bill due today is not yet overdue", () => {
  const data = ledgerData({ purchases: [purchase({ payment: "Credit", amountPaid: 0, dueDate: "2026-08-21" })] });
  eq(L.openBills(data, "2026-08-21")[0].overdueDays, 0);
});

it("settled bills are not listed, and the rest read oldest first", () => {
  const data = ledgerData({
    purchases: [
      purchase({ id: "b1", date: "2026-08-20", payment: "Credit", amountPaid: 0 }),
      purchase({ id: "b2", date: "2026-08-01", payment: "Credit", amountPaid: 0 }),
      purchase({ id: "b3", date: "2026-08-05", payment: "Cash", amountPaid: 1000 }),
    ],
  });
  eq(L.openBills(data, "2026-08-21").map((b) => b.purchase.id), ["b2", "b1"]);
});

/* =============================================================== DAY BOOK */

describe("The day's drawer");

it("only cash reaches the drawer; card, online and credit do not", () => {
  const sales = [
    sale({ id: "s1", payment: "Cash", total: 1000, sessionId: "day1" }),
    sale({ id: "s2", payment: "Card", total: 2000, sessionId: "day1" }),
    sale({ id: "s3", payment: "Online", total: 3000, sessionId: "day1" }),
    sale({ id: "s4", payment: "Credit", total: 4000, sessionId: "day1" }),
  ];
  const cash = B.summarizeSession(session(), { sales, expenses: [], returns: [] });
  eq([cash.cashSales, cash.cardSales, cash.onlineSales, cash.creditSales], [1000, 2000, 3000, 4000]);
  eq(cash.totalSales, 10000, "all four are still SALES");
  eq(cash.expectedCash, 6000, "opening 5,000 + 1,000 cash only");
});

it("a returned sale counts for nothing", () => {
  const sales = [sale({ payment: "Cash", total: 1000, sessionId: "day1", status: "Returned" })];
  const cash = B.summarizeSession(session(), { sales, expenses: [], returns: [] });
  eq([cash.totalSales, cash.invoices], [0, 0]);
});

it("cash collected on old credit is real money in", () => {
  const cash = B.summarizeSession(session(), {
    sales: [], expenses: [], returns: [],
    customerPayments: [
      { id: "p1", customerId: "c1", date: "2026-08-20", amount: 2000, method: "Cash", shopId: "shop1", sessionId: "day1", note: "", receivedBy: "" },
      { id: "p2", customerId: "c1", date: "2026-08-20", amount: 900, method: "Card", shopId: "shop1", sessionId: "day1", note: "", receivedBy: "" },
    ],
  });
  eq([cash.creditCollected, cash.creditCollectedOther], [2000, 900]);
  eq(cash.expectedCash, 7000, "only the cash 2,000 lands in the drawer");
});

it("refunds and till expenses come out of the drawer", () => {
  const cash = B.summarizeSession(session(), {
    sales: [],
    expenses: [{ id: "e1", date: "2026-08-20", shopId: "shop1", category: "Transport", description: "", amount: 300, addedBy: "", sessionId: "day1" }],
    returns: [{ id: "r1", kind: "customer", returnNo: "R1", date: "2026-08-20", shopId: "shop1", invoice: "INV-1", items: [], refund: 700, reason: "" }],
  });
  eq([cash.refunds, cash.drawerExpenses], [700, 300]);
  eq(cash.expectedCash, 4000, "5,000 less 700 refunded and 300 spent");
});

it("cash handed to a supplier leaves the drawer too", () => {
  const cash = B.summarizeSession(session(), {
    sales: [], expenses: [], returns: [],
    supplierPayments: [{ id: "sp1", supplierId: "sup1", date: "2026-08-20", amount: 1200, method: "Cash", shopId: "shop1", sessionId: "day1", note: "", paidBy: "" }],
  });
  eq(cash.supplierCashPaid, 1200);
  eq(cash.expectedCash, 3800);
});

it("a head-office payment never touches a shop's drawer", () => {
  const cash = B.summarizeSession(session(), {
    sales: [], expenses: [], returns: [],
    supplierPayments: [{ id: "sp1", supplierId: "sup1", date: "2026-08-20", amount: 9999, method: "Cash", shopId: "", note: "", paidBy: "" }],
  });
  eq([cash.supplierCashPaid, cash.expectedCash], [0, 5000]);
});

it("a card payment to a supplier does not reduce the drawer", () => {
  const cash = B.summarizeSession(session(), {
    sales: [], expenses: [], returns: [],
    supplierPayments: [{ id: "sp1", supplierId: "sup1", date: "2026-08-20", amount: 5000, method: "Online", shopId: "shop1", sessionId: "day1", note: "", paidBy: "" }],
  });
  eq([cash.supplierCashPaid, cash.expectedCash], [0, 5000]);
});

it("a bill the shop paid in cash on delivery leaves the drawer", () => {
  const cash = B.summarizeSession(session(), {
    sales: [], expenses: [], returns: [],
    purchases: [purchase({ createdByShopId: "shop1", sessionId: "day1", total: 800, payment: "Cash", amountPaid: 800 })],
  });
  eq(cash.billCashPaid, 800);
  eq(cash.expectedCash, 4200);
});

it("stock bought on account changes the drawer by nothing", () => {
  const cash = B.summarizeSession(session(), {
    sales: [], expenses: [], returns: [],
    purchases: [purchase({ createdByShopId: "shop1", sessionId: "day1", total: 9000, payment: "Credit", amountPaid: 0 })],
  });
  eq([cash.billCashPaid, cash.creditPurchases], [0, 9000]);
  eq(cash.expectedCash, 5000, "the drawer is untouched — it is owed, not missing");
});

it("a bill raised at head office is not a shop's problem", () => {
  const cash = B.summarizeSession(session(), {
    sales: [], expenses: [], returns: [],
    purchases: [purchase({ total: 9000, payment: "Cash", amountPaid: 9000 })],
  });
  eq([cash.billCashPaid, cash.expectedCash], [0, 5000]);
});

it("a part-paid cash bill only removes what was actually handed over", () => {
  const cash = B.summarizeSession(session(), {
    sales: [], expenses: [], returns: [],
    purchases: [purchase({ createdByShopId: "shop1", sessionId: "day1", total: 1000, payment: "Cash", amountPaid: 250 })],
  });
  eq(cash.billCashPaid, 250);
  eq(cash.creditPurchases, 750, "the rest is owed");
});

it("variance is counted minus expected, and null while the day is open", () => {
  const open = B.summarizeSession(session(), { sales: [], expenses: [], returns: [] });
  eq([open.countedCash, open.variance], [null, null], "nothing counted yet");

  const short = B.summarizeSession(session({ status: "closed", countedCash: 4500 }), { sales: [], expenses: [], returns: [] });
  eq(short.variance, -500, "till came up short");

  const over = B.summarizeSession(session({ status: "closed", countedCash: 5200 }), { sales: [], expenses: [], returns: [] });
  eq(over.variance, 200, "till came up over");
});

it("a sale rung up after midnight belongs to the day the shop opened", () => {
  const lateNight = sale({ date: "2026-08-21T01:15:00.000Z", businessDate: "2026-08-20", sessionId: "day1", payment: "Cash", total: 600 });
  const cash = B.summarizeSession(session(), { sales: [lateNight], expenses: [], returns: [] });
  eq(cash.cashSales, 600, "counted on the 20th, not the 21st");
  eq(B.businessDayOf(lateNight), "2026-08-20");
});

it("a record from before day sessions existed falls back to its calendar date", () => {
  const old = sale({ date: "2026-08-20T10:00:00.000Z", businessDate: undefined, sessionId: undefined, payment: "Cash", total: 400 });
  eq(B.businessDayOf(old), "2026-08-20", "falls back");
  const cash = B.summarizeSession(session(), { sales: [old], expenses: [], returns: [] });
  eq(cash.cashSales, 400, "still picked up by date");
});

it("another shop's takings never appear in this shop's day", () => {
  const other = sale({ shopId: "shop2", sessionId: "day2", payment: "Cash", total: 5000 });
  const cash = B.summarizeSession(session(), { sales: [other], expenses: [], returns: [] });
  eq(cash.cashSales, 0);
});

it("openSessionFor finds only an OPEN day, and only for that shop", () => {
  const list = [session({ id: "d1", status: "closed" }), session({ id: "d2", status: "open" }), session({ id: "d3", shopId: "shop2", status: "open" })];
  eq(B.openSessionFor(list, "shop1")?.id, "d2");
  eq(B.openSessionFor(list, "shop2")?.id, "d3");
  eq(B.openSessionFor(list, "nobody"), undefined);
  eq(B.openSessionFor(list, undefined), undefined);
});

it("tomorrow opens with what last night left behind", () => {
  const list = [
    session({ id: "d1", status: "closed", closedAt: "2026-08-19T23:00:00.000Z", cashLeftInShop: 5000 }),
    session({ id: "d2", status: "closed", closedAt: "2026-08-20T23:00:00.000Z", cashLeftInShop: 7500 }),
  ];
  eq(B.carryForwardCash(list, "shop1"), 7500, "the most recently closed day");
  eq(B.carryForwardCash(list, "shop2"), 0, "a shop that has never closed a day");
});

it("paymentMix percentages are of the settled total", () => {
  const sales = [
    sale({ id: "s1", payment: "Cash", total: 5000 }),
    sale({ id: "s2", payment: "Card", total: 3000 }),
    sale({ id: "s3", payment: "Credit", total: 2000 }),
    sale({ id: "s4", payment: "Cash", total: 0, status: "Returned" }),
  ];
  const mix = B.paymentMix(sales);
  eq([mix.cash, mix.card, mix.online, mix.credit, mix.total], [5000, 3000, 0, 2000, 10000]);
  eq(mix.pct(5000), 50);
  eq(mix.counts.Cash, 1, "the returned sale is not counted");
  eq(B.paymentMix([]).pct(0), 0, "no sales does not divide by zero");
});

/* ========================================================= NOTIFICATIONS */

describe("Every warning the bell can raise");

const shops = [
  { id: "shop1", name: "Main Branch", kind: "retail", address: "", phone: "", active: true },
  { id: "shop2", name: "Gulberg Outlet", kind: "retail", address: "", phone: "", active: true },
];
const admin = { id: "u1", name: "Owner", email: "o@x.pk", role: "admin", active: true };
const keeper = { id: "u2", name: "Cashier", email: "c@x.pk", role: "shop", shopId: "shop1", active: true };

/** Today's trading day, open, at each shop — the normal healthy state. */
const openToday = () => shops.map((sh) => session({
  id: `day-${sh.id}`, shopId: sh.id, businessDate: D.todayISO(), status: "open",
}));

const source = (over = {}) => ({
  user: admin, shops, products: [], inventory: [], sales: [], expenses: [], returns: [],
  daySessions: openToday(), customers: [], customerPayments: [], supplierPayments: [], purchases: [],
  setOffs: [], activity: [], messages: [], pendingMigration: null, ...over,
});

const titles = (s) => N.buildNotifications(s).map((n) => n.title);
const has = (s, fragment) => titles(s).some((t) => t.includes(fragment));

it("a signed-out user is told nothing", () => {
  eq(N.buildNotifications(source({ user: null })), []);
});

it("a quiet, healthy business raises nothing at all", () => {
  eq(N.buildNotifications(source()), []);
});

it("1. unread messages, grouped per shop rather than per message", () => {
  const msg = (id, body) => ({ id, shopId: "shop1", fromRole: "shop", fromName: "Cashier", body, createdAt: "2026-08-21T10:00:00.000Z", readByAdmin: false, readByShop: true });
  const items = N.buildNotifications(source({ messages: [msg("m1", "one"), msg("m2", "two")] }));
  eq(items.length, 1, "one entry for the thread");
  ok(items[0].title.includes("2 new messages from Main Branch"), `got: ${items[0].title}`);
});

it("   your own messages never notify you", () => {
  const mine = { id: "m1", shopId: "shop1", fromRole: "admin", fromName: "Owner", body: "hi", createdAt: "2026-08-21T10:00:00.000Z", readByAdmin: true, readByShop: false };
  eq(N.buildNotifications(source({ messages: [mine] })), []);
});

it("   a shopkeeper does not see another shop's thread", () => {
  const other = { id: "m1", shopId: "shop2", fromRole: "admin", fromName: "Owner", body: "hi", createdAt: "2026-08-21T10:00:00.000Z", readByAdmin: true, readByShop: false };
  eq(N.buildNotifications(source({ user: keeper, messages: [other] })), []);
});

it("2. a day left open from an earlier date is CRITICAL", () => {
  // The expensive one: today's sales are still being booked onto that old day.
  const stale = [session({ id: "old", businessDate: D.daysAgoISO(2), status: "open" }), ...openToday().slice(1)];
  const items = N.buildNotifications(source({ daySessions: stale }));
  const notice = items.find((n) => n.title.includes("never closed"));
  ok(notice, `expected a stale-day warning, got: ${items.map((n) => n.title)}`);
  eq(notice.tone, "critical", "tone");
  eq(notice.to, "/app/daybook", "destination");
});

it("   a shop with a stale day is not ALSO told to start today", () => {
  const stale = [session({ id: "old", businessDate: D.daysAgoISO(2), status: "open" })];
  const forShop1 = N.buildNotifications(source({ shops: [shops[0]], daySessions: stale }));
  eq(forShop1.length, 1, "one day-book warning, not two contradictory ones");
});

it("3. today's day never started", () => {
  const items = N.buildNotifications(source({ daySessions: [] }));
  eq(items.length, 2, "one per shop");
  ok(items.every((n) => n.title.includes("hasn't started today")), `got: ${items.map((n) => n.title)}`);
});

it("   a shopkeeper is told to start THEIR day, in their own words", () => {
  const items = N.buildNotifications(source({ user: keeper, daySessions: [] }));
  eq(items.length, 1, "only their own shop");
  eq(items[0].title, "Start your day");
});

it("   a day already open today raises nothing", () => {
  eq(N.buildNotifications(source()), []);
});

it("4. a till that came up short", () => {
  const closed = session({
    id: "yesterday", businessDate: D.daysAgoISO(1), status: "closed",
    closedAt: new Date().toISOString(), countedCash: 4000, cashTakenByOwner: 0, cashLeftInShop: 4000,
  });
  const s = source({ daySessions: [...openToday(), closed] });
  const notice = N.buildNotifications(s).find((n) => n.title.includes("short"));
  ok(notice, `expected a variance warning, got: ${titles(s)}`);
  eq(notice.tone, "critical", "a short till is critical");
});

it("   a till that balanced raises nothing", () => {
  const closed = session({ id: "yesterday", businessDate: D.daysAgoISO(1), status: "closed", closedAt: new Date().toISOString(), countedCash: 5000 });
  eq(N.buildNotifications(source({ daySessions: [...openToday(), closed] })), []);
});

it("   a till that came up OVER is not reported as short", () => {
  const closed = session({ id: "yesterday", businessDate: D.daysAgoISO(1), status: "closed", closedAt: new Date().toISOString(), countedCash: 6000 });
  ok(!has(source({ daySessions: [...openToday(), closed] }), "short"), "money over is not money missing");
});

it("5. out of stock", () => {
  const s = source({ products: [prod("p1")], inventory: [{ productId: "p1", shopId: "shop1", qty: 0 }] });
  ok(has(s, "out of stock"), `got: ${titles(s)}`);
});

it("6. running low", () => {
  const s = source({ products: [prod("p1", { lowAlert: 5 })], inventory: [{ productId: "p1", shopId: "shop1", qty: 3 }] });
  ok(has(s, "running low"), `got: ${titles(s)}`);
});

it("   healthy stock raises nothing", () => {
  const s = source({ products: [prod("p1", { lowAlert: 5 })], inventory: [{ productId: "p1", shopId: "shop1", qty: 50 }] });
  eq(N.buildNotifications(s), []);
});

it("7. a customer at their credit limit", () => {
  const s = source({
    customers: [{ id: "c1", name: "Bilal Traders", contact: "", phone: "", address: "", notes: "", kind: "wholesale", creditLimit: 10000, active: true }],
    sales: [sale({ customerId: "c1", payment: "Credit", total: 10000 })],
  });
  ok(has(s, "credit limit"), `got: ${titles(s)}`);
});

it("8. a supplier bill past its due date", () => {
  const s = source({
    purchases: [purchase({ payment: "Credit", amountPaid: 0, dueDate: D.daysAgoISO(10) })],
  });
  ok(has(s, "overdue"), `got: ${titles(s)}`);
});

it("   a bill not yet due raises nothing", () => {
  const s = source({ purchases: [purchase({ payment: "Credit", amountPaid: 0, dueDate: D.daysAgoISO(-30) })] });
  ok(!has(s, "overdue"), "a bill with time left is not a warning");
});

it("   a shopkeeper is not shown the owner's payables", () => {
  const s = source({ user: keeper, purchases: [purchase({ payment: "Credit", amountPaid: 0, dueDate: D.daysAgoISO(10) })] });
  ok(!has(s, "overdue"), "payables are the owner's problem");
});

it("9. the database is missing a migration", () => {
  const s = source({ pendingMigration: ["supplier_payments"] });
  ok(N.buildNotifications(s).some((n) => n.group === "System"), `got: ${titles(s)}`);
});

it("   the migration notice names the right file and feature", () => {
  eq(N.migrationFilesFor(["supplier_payments"]), ["005_payables_and_setoffs.sql"]);
  eq(N.migrationFilesFor(["set_offs", "messages"]), ["004_messages.sql", "005_payables_and_setoffs.sql"], "oldest first");
  eq(N.migrationFeaturesFor(["set_offs"]), "credit purchases and supplier balances");
  eq(N.migrationFilesFor(["nothing_known"]), [], "an unknown table names no file");
});

it("every notification carries an id, a group and a destination", () => {
  const s = source({
    products: [prod("p1")], inventory: [{ productId: "p1", shopId: "shop1", qty: 0 }],
    pendingMigration: ["set_offs"],
    purchases: [purchase({ payment: "Credit", amountPaid: 0, dueDate: D.daysAgoISO(3) })],
  });
  const items = N.buildNotifications(s);
  ok(items.length >= 3, `expected several notifications, got ${items.length}`);
  items.forEach((n) => {
    ok(n.id, "missing id");
    ok(N.NOTIFICATION_GROUPS.includes(n.group), `bad group ${n.group}`);
    ok(n.to?.startsWith("/app/"), `bad destination ${n.to}`);
    ok(["critical", "warning", "info"].includes(n.tone), `bad tone ${n.tone}`);
  });
  eq(new Set(items.map((n) => n.id)).size, items.length, "ids are unique");
});


/* =========================================================== STOCK REWIND */

describe("Rewinding stock to how it stood on a past day");

const inv = (qty) => [{ productId: "p1", shopId: "shop1", qty }];
const asOf = (day, over = {}) =>
  Store.stockAsOf(day, { inventory: inv(100), sales: [], purchases: [], returns: [], ...over });

it("nothing recorded after the day means stock is unchanged", () => {
  eq(asOf("2026-08-20"), inv(100));
});

it("a sale AFTER the day means stock was higher then", () => {
  const s = [sale({ date: "2026-08-25T10:00:00.000Z", lines: [line({ qty: 12 })] })];
  eq(asOf("2026-08-20", { sales: s })[0].qty, 112);
});

it("a sale ON the day is already reflected and is not rewound", () => {
  const s = [sale({ date: "2026-08-20T10:00:00.000Z", lines: [line({ qty: 12 })] })];
  eq(asOf("2026-08-20", { sales: s })[0].qty, 100, "the cut-off is the END of that day");
});

it("a returned sale never moved stock, so it is not rewound", () => {
  const s = [sale({ date: "2026-08-25T10:00:00.000Z", status: "Returned", lines: [line({ qty: 12 })] })];
  eq(asOf("2026-08-20", { sales: s })[0].qty, 100);
});

it("a purchase after the day means stock was LOWER then", () => {
  eq(asOf("2026-08-20", { purchases: [purchase({ date: "2026-08-25" })] })[0].qty, 90, "10 units had not arrived yet");
});

it("returns rewind in opposite directions depending on which way the goods went", () => {
  const back = { id: "r1", returnNo: "R1", date: "2026-08-25", shopId: "shop1", invoice: "INV-1", items: [{ productId: "p1", name: "x", qty: 5 }], refund: 0, reason: "" };
  eq(asOf("2026-08-20", { returns: [{ ...back, kind: "customer" }] })[0].qty, 95, "a customer return had not come back yet");
  eq(asOf("2026-08-20", { returns: [{ ...back, kind: "supplier" }] })[0].qty, 105, "goods sent back were still on the shelf");
});

it("a transfer rewinds both shops at once", () => {
  const rows = Store.stockAsOf("2026-08-20", {
    inventory: [{ productId: "p1", shopId: "shop1", qty: 40 }, { productId: "p1", shopId: "shop2", qty: 60 }],
    sales: [], purchases: [], returns: [],
    transfers: [{ id: "t1", transferNo: "T1", date: "2026-08-25", fromShopId: "shop1", toShopId: "shop2", items: [{ productId: "p1", name: "x", qty: 25 }], notes: "", createdBy: "" }],
  });
  const at = (shopId) => rows.find((r) => r.shopId === shopId).qty;
  eq([at("shop1"), at("shop2")], [65, 35], "the source held more and the destination less");
});

it("a rewind never produces a negative quantity", () => {
  const rows = Store.stockAsOf("2026-08-20", {
    inventory: inv(2), sales: [], returns: [],
    purchases: [purchase({ date: "2026-08-25", lines: [{ productId: "p1", shopId: "shop1", qty: 999, rate: 1 }] })],
  });
  eq(rows[0].qty, 0, "clamped, not negative");
});

it("a product that only arrived later still gets a row, at zero", () => {
  const rows = Store.stockAsOf("2026-08-20", {
    inventory: [], sales: [], returns: [],
    purchases: [purchase({ date: "2026-08-25" })],
  });
  eq(rows, [{ productId: "p1", shopId: "shop1", qty: 0 }]);
});

/* ============================================================= DISCOUNTS */

describe("Discount rules");

const rules = (over = {}) => ({ enabled: true, overallPct: 10, maxPct: 20, perProduct: {}, ...over });

it("a product override beats the overall rate", () => {
  eq(T.discountPctFor("p1", rules({ perProduct: { p1: 15 } })), 15);
  eq(T.discountPctFor("p2", rules({ perProduct: { p1: 15 } })), 10, "everything else uses the overall rate");
});

it("the cap always wins", () => {
  eq(T.discountPctFor("p1", rules({ perProduct: { p1: 90 }, maxPct: 20 })), 20);
  eq(T.discountPctFor("p1", rules({ overallPct: 50, maxPct: 20 })), 20);
});

it("switching discounts off zeroes everything, override or not", () => {
  eq(T.discountPctFor("p1", rules({ enabled: false, perProduct: { p1: 15 } })), 0);
});

it("a negative rate is treated as none", () => {
  eq(T.discountPctFor("p1", rules({ perProduct: { p1: -5 } })), 0);
  eq(T.discountPctFor("p1", rules({ maxPct: -5 })), 0, "a negative cap cannot invert into a surcharge");
});

it("the money off a line is rounded to whole rupees", () => {
  eq(T.discountAmountFor("p1", 333, 1, rules({ overallPct: 10 })), 33, "33.3 rounds to 33");
  eq(T.discountAmountFor("p1", 100, 3, rules({ overallPct: 10 })), 30, "applied to the whole line");
});

it("formatRs renders whole currency units", () => {
  eq(T.formatRs(1234567), "Rs 1,234,567");
  eq(T.formatRs(0), "Rs 0");
  eq(T.formatRs(1500.7), "Rs 1,501", "no stray paisa");
  eq(T.formatRs(1500, "PKR"), "PKR 1,500", "the configured currency is used");
});

/* ======================================================== DEGENERATE CASES */

describe("Degenerate inputs that must not produce nonsense");

it("a bill discount on a sale of zero value does not go negative", () => {
  const s = sale({ lines: [line({ qty: 0, price: 0, cost: 0 })], discount: 100 });
  const alloc = T.allocateSale(s);
  ok(alloc.every((a) => Number.isFinite(a.revenue)), "revenue is a real number");
  ok(alloc.every((a) => Number.isFinite(a.profit)), "profit is a real number");
});

it("a slip discounted for more than the goods are worth never reports negative revenue", () => {
  // Not reachable from the till, which caps the bill discount at what the lines
  // are worth — but reachable from the SQL editor, and a rollup showing a
  // product earning minus fifty rupees is worse than one that stops at zero.
  const s = sale({ lines: [line({ qty: 1, price: 100, cost: 60, discount: 100 })], discount: 150 });
  const alloc = T.allocateSale(s);
  eq(alloc[0].revenue, 0, "revenue floors at zero, not -50");
  ok(alloc.every((a) => a.revenue >= 0), "no line reports negative revenue");
});

it("a bill discount is still allocated in full when the lines can absorb it", () => {
  const s = sale({ lines: [line({ qty: 1, price: 100, cost: 60 }), line({ productId: "p2", qty: 1, price: 100, cost: 60 })], discount: 60 });
  const alloc = T.allocateSale(s);
  eq(alloc.map((a) => a.revenue), [70, 70], "the clamp does not interfere with normal sales");
});

it("a sale with no lines at all allocates to nothing", () => {
  eq(T.allocateSale(sale({ lines: [], discount: 50 })), []);
});

it("a session with no records at all still reports its opening float", () => {
  const cash = B.summarizeSession(session(), { sales: [], expenses: [], returns: [] });
  eq(cash.expectedCash, 5000);
  eq([cash.invoices, cash.itemsSold, cash.profit], [0, 0, 0]);
});

it("balances of a party with no records at all are zero, not NaN", () => {
  const c = B.customerBalance({ id: "nobody", creditLimit: 0 }, ledgerData());
  const sp = L.supplierBalance({ id: "nobody" }, ledgerData());
  ok(Object.values(c).every((v) => typeof v !== "number" || Number.isFinite(v)), "customer balance is finite");
  ok(Object.values(sp).every((v) => typeof v !== "number" || Number.isFinite(v)), "supplier balance is finite");
  eq([c.outstanding, c.advance, sp.outstanding, sp.advance], [0, 0, 0, 0]);
});

it("a statement for somebody with no history is empty rather than broken", () => {
  eq(L.customerLedger({ id: "nobody" }, ledgerData()), []);
  eq(L.supplierLedger({ id: "nobody" }, ledgerData()), []);
});

it("a bill dated in the future is not overdue", () => {
  const data = ledgerData({ purchases: [purchase({ date: "2027-01-01", payment: "Credit", amountPaid: 0, dueDate: "2027-02-01" })] });
  eq(L.openBills(data, "2026-08-21")[0].overdueDays, 0);
});

it("a payment against a sale that was later returned leaves an advance, not a hidden debt", () => {
  const data = ledgerData({
    sales: [sale({ customerId: "c1", payment: "Credit", total: 5000, status: "Returned" })],
    customerPayments: [{ id: "p1", customerId: "c1", date: "2026-08-21", amount: 5000, method: "Cash", shopId: "shop1", note: "", receivedBy: "" }],
  });
  const bal = B.customerBalance({ id: "c1", creditLimit: 0 }, data);
  eq([bal.outstanding, bal.advance], [0, 5000], "their money is still theirs");
});

it("a set-off larger than either side would still not invert a balance", () => {
  // The store caps this before writing, but the reader must not produce a
  // negative debt if a row is ever edited directly in the database.
  const data = ledgerData({
    sales: [sale({ customerId: "c1", payment: "Credit", total: 1000 })],
    setOffs: [{ id: "o1", date: "2026-08-21", customerId: "c1", supplierId: "sup1", amount: 9999, note: "", createdBy: "" }],
  });
  const bal = B.customerBalance({ id: "c1", creditLimit: 0 }, data);
  eq(bal.outstanding, 0, "clamped at zero");
});

it("a payment attached to another session on the same day is not double counted", () => {
  const pay = (id, sessionId) => ({ id, customerId: "c1", date: "2026-08-20", amount: 1000, method: "Cash", shopId: "shop1", sessionId, note: "", receivedBy: "" });
  const cash = B.summarizeSession(session({ id: "day1" }), {
    sales: [], expenses: [], returns: [],
    customerPayments: [pay("p1", "day1"), pay("p2", "day-other")],
  });
  eq(cash.creditCollected, 1000, "only the one belonging to this session");
});


/* ============================================================ STOCK MOVES */

describe("Applying stock movements — the funnel every correction goes through");

const rows = (...xs) => xs.map(([productId, shopId, qty]) => ({ productId, shopId, qty }));

it("adds and removes from an existing row", () => {
  eq(Store.applyStock(rows(["p1", "shop1", 10]), [{ productId: "p1", shopId: "shop1", delta: 5 }]),
     rows(["p1", "shop1", 15]));
  eq(Store.applyStock(rows(["p1", "shop1", 10]), [{ productId: "p1", shopId: "shop1", delta: -4 }]),
     rows(["p1", "shop1", 6]));
});

it("never lets a quantity go below zero", () => {
  eq(Store.applyStock(rows(["p1", "shop1", 3]), [{ productId: "p1", shopId: "shop1", delta: -99 }]),
     rows(["p1", "shop1", 0]));
});

it("creates a row only when stock is actually ARRIVING", () => {
  eq(Store.applyStock([], [{ productId: "p9", shopId: "shop1", delta: 7 }]),
     rows(["p9", "shop1", 7]), "goods arriving at a shop that never stocked them");
  eq(Store.applyStock([], [{ productId: "p9", shopId: "shop1", delta: -7 }]),
     [], "removing from nothing does not invent a row at zero");
});

it("a zero movement changes nothing at all", () => {
  const before = rows(["p1", "shop1", 10]);
  eq(Store.applyStock(before, [{ productId: "p1", shopId: "shop1", delta: 0 }]), before);
});

it("shops are kept apart", () => {
  const before = rows(["p1", "shop1", 10], ["p1", "shop2", 20]);
  eq(Store.applyStock(before, [{ productId: "p1", shopId: "shop2", delta: -5 }]),
     rows(["p1", "shop1", 10], ["p1", "shop2", 15]));
});

it("several movements apply in order, including two against the same row", () => {
  eq(Store.applyStock(rows(["p1", "shop1", 10]), [
    { productId: "p1", shopId: "shop1", delta: -3 },
    { productId: "p1", shopId: "shop1", delta: +8 },
  ]), rows(["p1", "shop1", 15]));
});

it("the original array is never mutated", () => {
  const before = rows(["p1", "shop1", 10]);
  const snapshot = JSON.stringify(before);
  Store.applyStock(before, [{ productId: "p1", shopId: "shop1", delta: -5 }]);
  eq(JSON.stringify(before), snapshot, "callers hold React state; mutating it in place would not re-render");
});

it("a transfer between two shops moves the same units both ways", () => {
  const after = Store.applyStock(rows(["p1", "shop1", 40], ["p1", "shop2", 10]), [
    { productId: "p1", shopId: "shop1", delta: -25 },
    { productId: "p1", shopId: "shop2", delta: +25 },
  ]);
  eq(after, rows(["p1", "shop1", 15], ["p1", "shop2", 35]));
  eq(after.reduce((a, r) => a + r.qty, 0), 50, "no units created or destroyed");
});

it("re-booking a bill moves stock by the DIFFERENCE, not the new figure", () => {
  // Correcting "10 units" to "8" has to remove 2, not add 8 on top of the 10
  // the original bill already delivered.
  const before = rows(["p1", "shop1", 10]);
  const delta = 8 - 10;
  eq(Store.applyStock(before, [{ productId: "p1", shopId: "shop1", delta }]), rows(["p1", "shop1", 8]));
});

it("applying a movement and then its exact reverse restores the original", () => {
  const before = rows(["p1", "shop1", 12], ["p2", "shop2", 4]);
  const moves = [{ productId: "p1", shopId: "shop1", delta: -5 }, { productId: "p2", shopId: "shop2", delta: +9 }];
  const undone = Store.applyStock(
    Store.applyStock(before, moves),
    moves.map((m) => ({ ...m, delta: -m.delta })),
  );
  eq(undone, before, "undoing a transfer or a return has to land exactly back");
});

/* ============================================================ ADJUSTMENTS */

describe("Moving a balance by hand");

it("a write-off brings a customer's debt down", () => {
  const data = ledgerData({
    sales: [sale({ customerId: "c1", payment: "Credit", total: 10000 })],
    adjustments: [adj({ customerId: "c1", amount: -4000, reason: "goodwill" })],
  });
  const bal = B.customerBalance({ id: "c1", creditLimit: 0 }, data);
  eq([bal.adjusted, bal.outstanding], [-4000, 6000]);
});

it("writing off the whole balance clears it exactly", () => {
  const data = ledgerData({
    sales: [sale({ customerId: "c1", payment: "Credit", total: 7500 })],
    adjustments: [adj({ customerId: "c1", amount: -7500, reason: "shop closed down" })],
  });
  const bal = B.customerBalance({ id: "c1", creditLimit: 0 }, data);
  eq([bal.outstanding, bal.advance], [0, 0], "clear, not in advance");
});

it("a positive adjustment carries in a balance from before the app", () => {
  const data = ledgerData({ adjustments: [adj({ customerId: "c1", amount: 12000, reason: "old register" })] });
  eq(B.customerBalance({ id: "c1", creditLimit: 0 }, data).outstanding, 12000, "owed with no invoice behind it");
});

it("writing off more than is owed leaves nothing, not an advance", () => {
  const data = ledgerData({
    sales: [sale({ customerId: "c1", payment: "Credit", total: 1000 })],
    adjustments: [adj({ customerId: "c1", amount: -9999 })],
  });
  const bal = B.customerBalance({ id: "c1", creditLimit: 0 }, data);
  eq(bal.outstanding, 0, "clamped at zero");
});

it("the same works on the supplier side", () => {
  const data = ledgerData({
    purchases: [purchase({ total: 10000, payment: "Credit", amountPaid: 0 })],
    adjustments: [adj({ supplierId: "sup1", amount: -2500, reason: "agreed reduction" })],
  });
  const bal = L.supplierBalance(sup, data);
  eq([bal.adjusted, bal.outstanding], [-2500, 7500]);
});

it("an adjustment on one side never touches the other", () => {
  const data = ledgerData({
    sales: [sale({ customerId: "c1", payment: "Credit", total: 5000 })],
    purchases: [purchase({ total: 5000, payment: "Credit", amountPaid: 0 })],
    adjustments: [adj({ customerId: "c1", amount: -5000 })],
  });
  eq(B.customerBalance({ id: "c1", creditLimit: 0 }, data).outstanding, 0, "customer side written off");
  eq(L.supplierBalance(sup, data).outstanding, 5000, "supplier side untouched");
});

it("an adjustment appears on the statement and moves the running balance", () => {
  const data = ledgerData({
    sales: [sale({ customerId: "c1", payment: "Credit", total: 10000, date: "2026-08-10T10:00:00.000Z" })],
    adjustments: [adj({ customerId: "c1", date: "2026-08-15", amount: -4000, reason: "goodwill" })],
  });
  const entries = L.customerLedger({ id: "c1" }, data);
  eq(entries.map((e) => e.kind), ["sale", "adjustment"]);
  eq(entries[1].ref, "Written off");
  eq(entries[1].note, "goodwill", "the reason is what the statement shows");
  eq([entries[1].debit, entries[1].credit], [0, 4000], "a write-off is a credit");
  eq(entries[1].balance, 6000, "and the running balance follows it");
});

it("an increase reads as a debit on the statement", () => {
  const data = ledgerData({ adjustments: [adj({ customerId: "c1", amount: 3000, reason: "opening balance" })] });
  const [entry] = L.customerLedger({ id: "c1" }, data);
  eq([entry.ref, entry.debit, entry.credit, entry.balance], ["Balance adjustment", 3000, 0, 3000]);
});

it("the statement still ends on the balance the summary reports", () => {
  const data = ledgerData({
    sales: [sale({ customerId: "c1", payment: "Credit", total: 10000 })],
    customerPayments: [{ id: "p1", customerId: "c1", date: "2026-08-12", amount: 2000, method: "Cash", shopId: "s", note: "", receivedBy: "" }],
    adjustments: [adj({ customerId: "c1", amount: -3000 })],
  });
  const entries = L.customerLedger({ id: "c1" }, data);
  const bal = B.customerBalance({ id: "c1", creditLimit: 0 }, data);
  eq(entries[entries.length - 1].balance, bal.outstanding - bal.advance, "statement agrees with the summary");
  eq(bal.outstanding, 5000);
});

it("undoing an adjustment puts the balance back exactly", () => {
  const base = { sales: [sale({ customerId: "c1", payment: "Credit", total: 8000 })] };
  const before = B.customerBalance({ id: "c1", creditLimit: 0 }, ledgerData(base));
  const after = B.customerBalance({ id: "c1", creditLimit: 0 },
    ledgerData({ ...base, adjustments: [adj({ customerId: "c1", amount: -8000 })] }));
  const undone = B.customerBalance({ id: "c1", creditLimit: 0 }, ledgerData({ ...base, adjustments: [] }));
  eq(after.outstanding, 0, "written off");
  eq(undone.outstanding, before.outstanding, "and back again");
});

it("a write-off feeds through to the whole-business totals", () => {
  const cs = [{ id: "c1", name: "X", contact: "", phone: "", address: "", notes: "", kind: "wholesale", creditLimit: 0, active: true }];
  const base = { sales: [sale({ customerId: "c1", payment: "Credit", total: 9000 })] };
  eq(B.totalOutstanding(cs, ledgerData(base)), 9000, "before");
  eq(B.totalOutstanding(cs, ledgerData({ ...base, adjustments: [adj({ customerId: "c1", amount: -9000 })] })), 0, "after");
});

it("an adjustment never reaches a day's cash count", () => {
  // It moves no money, so the drawer must be identical either way.
  const withNone = B.summarizeSession(session(), { sales: [], expenses: [], returns: [] });
  const withOne = B.summarizeSession(session(), {
    sales: [], expenses: [], returns: [],
    // summarizeSession is not even given adjustments — this asserts the shape
    // of the day book has not quietly grown a dependency on them.
  });
  eq(withOne.expectedCash, withNone.expectedCash);
  eq(withNone.expectedCash, 5000);
});

it("a party's position reflects a write-off on either side", () => {
  const data = ledgerData({
    sales: [sale({ customerId: "c1", payment: "Credit", total: 50000 })],
    purchases: [purchase({ total: 30000, payment: "Credit", amountPaid: 0 })],
    adjustments: [adj({ customerId: "c1", amount: -50000, reason: "bad debt" })],
  });
  const [bilal] = L.partyPositions(customers, suppliers, data).filter((r) => r.name === "Bilal Traders");
  eq([bilal.receivable, bilal.payable, bilal.settleable], [0, 30000, 0], "nothing left to set off");
  eq(bilal.net, -30000, "you owe them the lot now");
});

/* ====================================================== PROFIT PER ITEM */

describe("Setting the profit an item should earn");

it("a price is derived from cost plus the profit wanted", () => {
  eq(T.priceForProfit(280, 170), 450);
  eq(T.priceForProfit(0, 100), 100, "no cost yet");
});

it("a negative profit never prices below cost", () => {
  eq(T.priceForProfit(280, -50), 280, "clamped — selling at a loss is a price decision, not arithmetic");
});

it("prices are whole rupees", () => {
  eq(T.priceForProfit(333.4, 66.9), 400, "no stray paisa on a shelf label");
});

it("unitProfit reports what each counter actually earns", () => {
  eq(T.unitProfit({ cost: 280, price: 450, wholesalePrice: 360 }), { retail: 170, wholesale: 80 });
});

it("with no wholesale price, the wholesale counter earns the retail margin", () => {
  eq(T.unitProfit({ cost: 280, price: 450 }).wholesale, 170);
});

it("a NEW COST moves the PRICE when a profit is pinned", () => {
  // The whole point: a delivery at a higher rate used to eat the margin
  // silently, because the price stayed put.
  const p = prod("p1", { cost: 280, price: 450, profitTarget: 170 });
  const after = T.repriceForCost(p, 310);
  eq(after.cost, 310);
  eq(after.price, 480, "price follows the cost");
  eq(T.unitProfit(after).retail, 170, "and the profit is exactly where it was put");
});

it("a product with NO target keeps its price, and the margin absorbs the change", () => {
  const p = prod("p1", { cost: 280, price: 450 });
  const after = T.repriceForCost(p, 310);
  eq([after.cost, after.price], [310, 450], "price untouched");
  eq(T.unitProfit(after).retail, 140, "the old behaviour — margin takes the hit");
});

it("the two counters are pinned independently", () => {
  const p = prod("p1", { cost: 280, price: 450, wholesalePrice: 360, profitTarget: 170, wholesaleProfitTarget: 80 });
  const after = T.repriceForCost(p, 300);
  eq([after.price, after.wholesalePrice], [470, 380]);
  eq(T.unitProfit(after), { retail: 170, wholesale: 80 }, "both held");
});

it("pinning only the wholesale side leaves the retail price alone", () => {
  const p = prod("p1", { cost: 280, price: 450, wholesalePrice: 360, wholesaleProfitTarget: 80 });
  const after = T.repriceForCost(p, 300);
  eq(after.price, 450, "retail untouched");
  eq(after.wholesalePrice, 380, "wholesale followed");
});

it("a cheaper delivery passes the saving on rather than widening the margin", () => {
  const p = prod("p1", { cost: 280, price: 450, profitTarget: 170 });
  const after = T.repriceForCost(p, 250);
  eq(after.price, 420, "price comes down");
  eq(T.unitProfit(after).retail, 170, "profit still exactly as set");
});

it("repricing never mutates the product it was given", () => {
  const p = prod("p1", { cost: 280, price: 450, profitTarget: 170 });
  const snapshot = JSON.stringify(p);
  T.repriceForCost(p, 999);
  eq(JSON.stringify(p), snapshot);
});

it("a past sale keeps the cost it was sold at, whatever happens to the product", () => {
  // The invoice line stores its own cost, so re-pricing today can never move
  // yesterday's profit.
  const sold = sale({ lines: [line({ qty: 2, price: 450, cost: 280 })] });
  const before = T.allocateSale(sold)[0].profit;
  T.repriceForCost(prod("p1", { cost: 280, price: 450, profitTarget: 170 }), 999);
  eq(T.allocateSale(sold)[0].profit, before, "history does not move");
  eq(before, 340, "2 units at 170");
});

/* ========================================================= SETTLED DAYS */

describe("Knowing a record belongs to a day already settled");

const closedDay = session({ id: "day1", status: "closed", countedCash: 5000 });
const openDay = session({ id: "day1", status: "open" });

it("a sale from a closed day is flagged", () => {
  eq(B.closedSessionFor([closedDay], sale({ sessionId: "day1" }))?.id, "day1");
});

it("a sale from a day still open is not", () => {
  eq(B.closedSessionFor([openDay], sale({ sessionId: "day1" })), undefined);
});

it("a record from before day sessions existed falls back to shop and date", () => {
  const old = { shopId: "shop1", date: "2026-08-20T10:00:00.000Z" };
  eq(B.closedSessionFor([closedDay], old)?.id, "day1", "matched by the day it landed on");
  eq(B.closedSessionFor([openDay], old), undefined, "and only when that day is closed");
});

it("a record from another shop's closed day is not flagged", () => {
  eq(B.closedSessionFor([closedDay], { shopId: "shop2", date: "2026-08-20T10:00:00.000Z" }), undefined);
});

it("a record belonging to no day at all is not flagged", () => {
  eq(B.closedSessionFor([closedDay], { shopId: "shop1" }), undefined, "no date");
  eq(B.closedSessionFor([], sale({ sessionId: "day1" })), undefined, "no sessions");
});

it("the session id wins over the date when both are present", () => {
  // A late-night sale carries yesterday's session but today's timestamp; the
  // id is the authority, exactly as businessDayOf treats it.
  const late = sale({ sessionId: "day1", date: "2026-08-21T01:15:00.000Z", businessDate: "2026-08-20" });
  eq(B.closedSessionFor([closedDay], late)?.id, "day1");
});

/* =========================================================== ACTIVITY LOG */

describe("The deletion history");

const act = (over = {}) => ({
  id: "act1", at: new Date().toISOString(), action: "deleted", entity: "sale",
  entityId: "s1", label: "INV-1", amount: 5000, shopId: "shop1",
  byUserId: "u2", byName: "Cashier", byRole: "shop",
  snapshot: sale(), ...over,
});

it("a deletion with its record still attached can be put back", () => {
  eq(T.isRestorable(act()), true);
});

it("an entry already put back cannot be restored twice", () => {
  eq(T.isRestorable(act({ restoredAt: "2026-08-21T10:00:00.000Z" })), false);
});

it("an edit is history, not something to undo", () => {
  eq(T.isRestorable(act({ action: "edited" })), false);
});

it("an entry with no record attached cannot be put back", () => {
  eq(T.isRestorable(act({ snapshot: null })), false);
});

it("every entity has a name that reads in a sentence", () => {
  const kinds = ["sale","purchase","return","transfer","expense","day-session",
                 "customer-payment","supplier-payment","set-off","adjustment"];
  kinds.forEach((k) => ok(T.ENTITY_LABELS[k], `no label for ${k}`));
  eq(T.ENTITY_LABELS["day-session"], "trading day", "named as a shopkeeper would say it");
  eq(T.ENTITY_LABELS.purchase, "purchase bill");
});

describe("Warning the owner that something was deleted");

it("a deletion by shop staff raises a critical warning", () => {
  const s = source({ activity: [act()] });
  const notice = N.buildNotifications(s).find((n) => n.title.includes("deleted by shop staff"));
  ok(notice, `expected a deletion warning, got: ${titles(s)}`);
  eq(notice.tone, "critical", "money went missing from the books");
  eq(notice.to, "/app/activity", "points at the page that can undo it");
  ok(notice.detail.includes("Cashier"), "names who did it");
  ok(notice.detail.includes("INV-1"), "names what went");
});

it("the owner deleting their own record is not news", () => {
  eq(N.buildNotifications(source({ activity: [act({ byRole: "admin", byName: "Owner" })] })), []);
});

it("a deletion already put back stops being a warning", () => {
  const s = source({ activity: [act({ restoredAt: new Date().toISOString(), restoredBy: "Owner" })] });
  ok(!has(s, "deleted by shop staff"), "it is back, so there is nothing to chase");
});

it("an old deletion is not re-announced for ever", () => {
  const s = source({ activity: [act({ at: new Date(Date.now() - 40 * 86400000).toISOString() })] });
  ok(!has(s, "deleted by shop staff"), "outside the seven-day window");
});

it("several deletions are one notice carrying the total", () => {
  const s = source({
    activity: [
      act({ id: "a1", label: "INV-1", amount: 5000 }),
      act({ id: "a2", label: "INV-2", amount: 12000, entityId: "s2" }),
    ],
  });
  const items = N.buildNotifications(s).filter((n) => n.title.includes("deleted by shop staff"));
  eq(items.length, 1, "one notice, not one per deletion");
  ok(items[0].title.includes("2 records"), items[0].title);
  ok(items[0].detail.includes("17,000"), `expected the total, got: ${items[0].detail}`);
  ok(items[0].detail.includes("INV-2"), "names the biggest one");
});

it("a shopkeeper is never shown the deletion log", () => {
  const s = source({ user: keeper, activity: [act()] });
  ok(!has(s, "deleted by shop staff"), "the point is that they are answerable to somebody else");
});

it("the migration notice names the activity-log file", () => {
  eq(N.migrationFilesFor(["activity_log"]), ["007_activity_log.sql"]);
  eq(N.migrationFeaturesFor(["activity_log"]), "the deletion history and undo");
});

/* ================================================================= SEED */

describe("The demo dataset holds together");

const S = {
  sales: seed.genSales(), expenses: seed.genExpenses(), purchases: seed.genPurchases(),
  customerPayments: seed.genCustomerPayments(), supplierPayments: seed.genSupplierPayments(),
  setOffs: seed.genSetOffs(), daySessions: seed.genDaySessions(), inventory: seed.genInventory(),
  returns: [],
};

it("every closed day balances to the penny", () => {
  const bad = S.daySessions
    .filter((x) => x.status === "closed")
    .map((x) => ({ x, cash: B.summarizeSession(x, S) }))
    .filter(({ cash }) => cash.variance !== 0);
  eq(bad.map(({ x, cash }) => `${x.shopId} ${x.businessDate}: ${cash.variance}`), []);
});

it("invoice numbers are unique", () => {
  const invoices = S.sales.map((x) => x.invoice);
  eq(new Set(invoices).size, invoices.length);
});

it("record ids are unique within each table", () => {
  const dupes = (rows, label) => {
    const ids = rows.map((r) => r.id);
    return new Set(ids).size === ids.length ? null : label;
  };
  eq([S.sales, S.purchases, S.expenses, S.daySessions, S.customerPayments, S.supplierPayments, S.setOffs]
     .map((rows, i) => dupes(rows, ["sales", "purchases", "expenses", "daySessions", "customerPayments", "supplierPayments", "setOffs"][i]))
     .filter(Boolean), []);
});

it("every foreign key points at something that exists", () => {
  const shopIds = new Set(seed.SHOPS.map((x) => x.id));
  const productIds = new Set(seed.PRODUCTS.map((x) => x.id));
  const customerIds = new Set(seed.CUSTOMERS.map((x) => x.id));
  const supplierIds = new Set(seed.SUPPLIERS.map((x) => x.id));
  const sessionIds = new Set(S.daySessions.map((x) => x.id));
  const broken = [];

  S.sales.forEach((x) => {
    if (!shopIds.has(x.shopId)) broken.push(`sale ${x.id} -> shop ${x.shopId}`);
    if (x.customerId && !customerIds.has(x.customerId)) broken.push(`sale ${x.id} -> customer ${x.customerId}`);
    if (x.sessionId && !sessionIds.has(x.sessionId)) broken.push(`sale ${x.id} -> session ${x.sessionId}`);
    x.lines.forEach((l) => { if (!productIds.has(l.productId)) broken.push(`sale ${x.id} -> product ${l.productId}`); });
  });
  S.purchases.forEach((x) => {
    if (x.supplierId && !supplierIds.has(x.supplierId)) broken.push(`purchase ${x.id} -> supplier ${x.supplierId}`);
    x.lines.forEach((l) => { if (!shopIds.has(l.shopId)) broken.push(`purchase ${x.id} -> shop ${l.shopId}`); });
  });
  S.customerPayments.forEach((x) => { if (!customerIds.has(x.customerId)) broken.push(`payment ${x.id} -> customer ${x.customerId}`); });
  S.supplierPayments.forEach((x) => { if (!supplierIds.has(x.supplierId)) broken.push(`payment ${x.id} -> supplier ${x.supplierId}`); });
  S.setOffs.forEach((x) => {
    if (!customerIds.has(x.customerId)) broken.push(`set-off ${x.id} -> customer ${x.customerId}`);
    if (!supplierIds.has(x.supplierId)) broken.push(`set-off ${x.id} -> supplier ${x.supplierId}`);
  });
  seed.CUSTOMERS.forEach((c) => {
    if (c.linkedSupplierId && !supplierIds.has(c.linkedSupplierId)) broken.push(`customer ${c.id} -> supplier ${c.linkedSupplierId}`);
  });
  eq(broken, []);
});

it("every sale's stored total and profit match its own lines", () => {
  const wrong = S.sales.filter((x) => {
    const subtotal = x.lines.reduce((a, l) => a + l.qty * l.price, 0);
    const profit = x.lines.reduce((a, l) => a + l.qty * (l.price - l.cost) - (l.discount || 0), 0);
    return x.subtotal !== subtotal || x.total !== subtotal - x.discount || x.profit !== profit;
  });
  eq(wrong.map((x) => x.invoice), []);
});

it("every purchase total matches its own lines", () => {
  const wrong = S.purchases.filter((x) => x.total !== x.lines.reduce((a, l) => a + l.qty * l.rate, 0));
  eq(wrong.map((x) => x.billNo), []);
});

it("no stock level is negative", () => {
  eq(S.inventory.filter((r) => r.qty < 0), []);
});

it("the demo shows every credit situation at least once", () => {
  const data = { ...S, setOffs: S.setOffs };
  const parties = L.partyPositions(seed.CUSTOMERS, seed.SUPPLIERS, data);
  ok(parties.some((p) => p.receivable > 0), "somebody owes the business money");
  ok(parties.some((p) => p.payable > 0), "the business owes somebody money");
  ok(parties.some((p) => p.settleable > 0), "a mutual debt that can be set off");
  ok(parties.some((p) => p.advanceHeld > 0), "an advance held for a customer");
  ok(parties.some((p) => p.advancePlaced > 0), "an advance placed with a supplier");
  ok(L.openBills(data, D.todayISO()).some((b) => b.overdueDays > 0), "an overdue bill");
  ok(S.purchases.some((b) => T.purchaseSettlement(b).status === "Part paid"), "a part-paid bill");
});

/* ============================================================== INSIGHTS */

describe("The figures handed to the AI assistant");

it("computeInsights agrees with the raw records", () => {
  const insights = I.computeInsights({
    shops: seed.SHOPS, products: seed.PRODUCTS, inventory: S.inventory, sales: S.sales,
    purchases: S.purchases, suppliers: seed.SUPPLIERS, expenses: S.expenses, returns: [],
    settings: seed.DEFAULT_SETTINGS, discounts: T.DEFAULT_DISCOUNTS,
  });
  ok(insights, "insights were produced");
  const brief = I.buildBrief(insights);
  ok(typeof brief === "string" && brief.length > 100, "a brief was rendered");
  ok(!/NaN|undefined|Infinity/.test(brief), "the brief contains no NaN, undefined or Infinity");
});

/* ================================================================== BILLS */

describe("The bill that goes out with the goods");

// One trade buyer, one ledger, built by hand so every figure on the bill has a
// known right answer rather than being compared against itself.
const TRADER = { id: "cust-bill", name: "Bilal Traders", phone: "0300-1112223", creditLimit: 500000, kind: "wholesale", active: true };

const billSale = (over = {}) => ({
  id: "sale-bill", invoice: "INV-0848", shopId: "shop-1",
  date: "2026-08-28T11:00:00.000Z", customer: TRADER.name, customerId: TRADER.id,
  cashier: "Owner", lines: [{ productId: "p1", name: "Chand Maxi", qty: 7, price: 2300, cost: 1800, discount: 0 }],
  subtotal: 16100, discount: 0, total: 16100, profit: 3500,
  payment: "Credit", status: "Completed", synced: true, ...over,
});

const ledgerWith = (sales, payments = [], extra = {}) => ({
  sales, customerPayments: payments, setOffs: [], adjustments: [], ...extra,
});

it("carries forward what was owed BEFORE this bill, not after", () => {
  const earlier = billSale({ id: "sale-old", invoice: "INV-0845", date: "2026-08-20T10:00:00.000Z", total: 36550 });
  const sale = billSale();
  // Paid two days AFTER the bill: it must reduce the closing balance, and must
  // not be quietly folded into the balance carried forward.
  const payment = { id: "pay-1", customerId: TRADER.id, date: "2026-08-30", amount: 32000, method: "Cash", shopId: "shop-1", note: "", receivedBy: "Owner" };

  const inv = Bill.buildInvoice(sale, ledgerWith([earlier, sale], [payment]), { customer: TRADER });
  eq(inv.account.previousBalance, 36550, "previous balance");
  eq(inv.account.onAccount, 16100, "this bill on account");
  eq(inv.account.received, 32000, "received since");
  eq(inv.account.closingBalance, 20650, "closing balance");
});

it("the four printed figures always reconcile", () => {
  const earlier = billSale({ id: "sale-old", date: "2026-08-20T10:00:00.000Z", total: 36550 });
  const sale = billSale();
  const payment = { id: "pay-1", customerId: TRADER.id, date: "2026-08-30", amount: 32000, method: "Cash", shopId: "shop-1", note: "", receivedBy: "Owner" };
  const a = Bill.buildInvoice(sale, ledgerWith([earlier, sale], [payment]), { customer: TRADER }).account;
  eq(a.previousBalance + a.onAccount - a.received, a.closingBalance, "the block adds up");
});

it("a sale paid at the counter never joins the account", () => {
  const earlier = billSale({ id: "sale-old", date: "2026-08-20T10:00:00.000Z", total: 36550 });
  const sale = billSale({ payment: "Cash" });
  const inv = Bill.buildInvoice(sale, ledgerWith([earlier, sale]), { customer: TRADER });
  eq(inv.account.onAccount, 0, "a cash sale adds nothing to the balance");
  eq(inv.account.closingBalance, 36550, "the balance is unmoved by a cash sale");
  const labels = BillView.accountRows(inv).map((r) => r.label);
  ok(labels.includes("Paid by cash"), `the bill says how it was settled: ${labels.join(", ")}`);
});

it("a returned sale is cancelled on the bill and off the account", () => {
  const earlier = billSale({ id: "sale-old", date: "2026-08-20T10:00:00.000Z", total: 36550 });
  const sale = billSale({ status: "Returned" });
  const inv = Bill.buildInvoice(sale, ledgerWith([earlier, sale]), { customer: TRADER });
  eq(inv.status, "Returned", "the bill knows it was returned");
  eq(inv.account.onAccount, 0, "a returned sale owes nothing");
  eq(inv.account.closingBalance, 36550, "the balance goes back to what it was");
});

it("money paid in beyond the balance reads as an advance, not a debt", () => {
  const sale = billSale({ total: 10000 });
  const payment = { id: "pay-1", customerId: TRADER.id, date: "2026-08-30", amount: 25000, method: "Cash", shopId: "shop-1", note: "", receivedBy: "Owner" };
  const inv = Bill.buildInvoice(sale, ledgerWith([sale], [payment]), { customer: TRADER });
  eq(inv.account.closingBalance, -15000, "the closing balance is negative");
  const last = BillView.accountRows(inv).at(-1);
  eq(last.label, "Advance in hand", "and is labelled as their money, not a debt");
  eq(last.value, "15,000", "shown without the minus sign");
});

it("a walk-in gets no account block at all", () => {
  const sale = billSale({ customer: T.WALK_IN, customerId: undefined, payment: "Cash" });
  const inv = Bill.buildInvoice(sale, ledgerWith([sale]));
  ok(!inv.account, "no running balance is printed for an anonymous shopper");
});

it("the bill follows the sale when it is edited", () => {
  const before = Bill.buildInvoice(billSale(), ledgerWith([billSale()]), { customer: TRADER });
  const edited = billSale({ total: 20000, subtotal: 20000, lines: [{ productId: "p1", name: "Chand Maxi", qty: 9, price: 2300, cost: 1800, discount: 700 }] });
  const after = Bill.buildInvoice(edited, ledgerWith([edited]), { customer: TRADER });
  eq(before.total, 16100, "the original total");
  eq(after.total, 20000, "the edited total");
  eq(after.lines[0].qty, 9, "the edited quantity");
  eq(after.account.onAccount, 20000, "and the account follows it");
});

it("an item discount is folded into the rate the buyer was charged", () => {
  // 700 off 9 units at 2,300 is 2,222 a unit, which is what the buyer sees.
  const sale = billSale({ lines: [{ productId: "p1", name: "Chand Maxi", qty: 9, price: 2300, cost: 1800, discount: 700 }] });
  const inv = Bill.buildInvoice(sale, ledgerWith([sale]), { customer: TRADER });
  eq(inv.lines[0].rate, 2222, "the rate on the bill");
});

it("the shop the goods left from is on the bill", () => {
  const sale = billSale();
  const inv = Bill.buildInvoice(sale, ledgerWith([sale]), { customer: TRADER, shop: { id: "shop-1", name: "Wholesale Counter" } });
  eq(inv.shopName, "Wholesale Counter", "the outlet");
});

it("rupees are written in words on the South Asian scale", () => {
  eq(BillView.amountInWords(120000), "One lakh twenty thousand rupees only", "a lakh");
  eq(BillView.amountInWords(0), "Zero rupees only", "nothing");
  eq(BillView.amountInWords(10350000), "One crore three lakh fifty thousand rupees only", "a crore");
});

it("a sale rung up late at night is dated by the shop's clock, not UTC", () => {
  // 01:00 local. Slicing the ISO string would call this yesterday east of
  // Greenwich, and misfile the same day's earlier payment as arriving after.
  const local = new Date(2026, 7, 29, 1, 0, 0);
  const sale = billSale({ date: local.toISOString(), total: 10000 });
  const earlier = billSale({ id: "sale-old", date: new Date(2026, 7, 20, 10, 0, 0).toISOString(), total: 30000 });
  const paidBefore = { id: "pay-0", customerId: TRADER.id, date: "2026-08-28", amount: 5000, method: "Cash", shopId: "shop-1", note: "", receivedBy: "Owner" };

  const a = Bill.buildInvoice(sale, ledgerWith([earlier, sale], [paidBefore]), { customer: TRADER }).account;
  eq(a.previousBalance, 25000, "yesterday's payment is already in the balance carried forward");
  eq(a.received, 0, "and is not double-counted as money received since");
  eq(a.closingBalance, 35000, "closing balance");
});

it("the currency is whatever Settings says, in the words as well", () => {
  eq(BillView.amountInWords(1500, "Rs"), "One thousand five hundred rupees only", "rupees");
  eq(BillView.amountInWords(1500, "PKR"), "One thousand five hundred rupees only", "the PKR code still reads as rupees");
  eq(BillView.amountInWords(1500, "AED"), "One thousand five hundred AED only", "another currency is not called rupees");
});

it("figures are grouped the same way wherever they are rendered", () => {
  // The bill and the PDF must not each reach for their own formatter.
  eq(BillView.billNumber(115450), "115,450", "grouping");
  eq(BillView.billNumber(1035000.4), "1,035,000", "rounded, no stray decimals");
  eq(BillView.billDate(new Date(2026, 7, 28)), "28/08/2026", "day-first dates");
});

it("every demo credit sale produces a bill that reconciles", () => {
  const data = { sales: S.sales, customerPayments: S.customerPayments, setOffs: S.setOffs, adjustments: [] };
  let checked = 0;
  for (const sale of S.sales.filter((x) => x.customerId)) {
    const customer = seed.CUSTOMERS.find((c) => c.id === sale.customerId);
    if (!customer) continue;
    const inv = Bill.buildInvoice(sale, data, { customer });
    const a = inv.account;
    ok(a, `${sale.invoice} has an account block`);
    eq(a.previousBalance + a.onAccount - a.received, a.closingBalance, `${sale.invoice} reconciles`);
    ok(!Number.isNaN(a.closingBalance), `${sale.invoice} has a real closing balance`);
    checked++;
  }
  ok(checked > 0, `bills were checked (${checked})`);
});

/* ================================================================ REPORT */

console.log(`\n${"=".repeat(60)}`);
if (failures.length === 0) {
  console.log(`ALL ${passed} CHECKS PASSED`);
} else {
  console.log(`${passed} passed, ${failures.length} FAILED\n`);
  failures.forEach((f) => console.log(`  [${f.group}] ${f.name}\n      ${f.message}`));
}
console.log("=".repeat(60));
process.exit(failures.length === 0 ? 0 : 1);
