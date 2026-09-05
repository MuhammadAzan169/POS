/**
 * Sanity check for the credit ledgers, run against the demo data.
 *
 *   node scripts/check-ledgers.mjs
 *
 * Two things are worth proving rather than eyeballing: that every seeded day
 * still balances to the penny now that cash can also leave the drawer towards a
 * supplier, and that each party statement's final running balance equals the
 * balance the summary functions report. A statement that disagrees with the
 * total printed above it is the one bug nobody forgives.
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./ts-loader.mjs", pathToFileURL("./scripts/"));

const seed = await import("./fixtures.ts");
const dayBook = await import("../src/lib/day-book.ts");
const ledgerLib = await import("../src/lib/ledger.ts");

const sales = seed.genSales();
const expenses = seed.genExpenses();
const purchases = seed.genPurchases();
const customerPayments = seed.genCustomerPayments();
const supplierPayments = seed.genSupplierPayments();
const setOffs = seed.genSetOffs();
const daySessions = seed.genDaySessions();
const returns = [];

const data = { sales, customerPayments, purchases, supplierPayments, returns, setOffs };

let failures = 0;
const fail = (msg) => { console.error("  FAIL", msg); failures++; };

/* ------------------------------------------------------------ day sessions */

let checked = 0;
daySessions.filter((s) => s.status === "closed").forEach((session) => {
  const cash = dayBook.summarizeSession(session, {
    sales, expenses, returns, customerPayments, supplierPayments, purchases,
  });
  checked++;
  if (cash.variance !== 0) {
    fail(`${session.shopId} ${session.businessDate}: variance ${cash.variance}`);
  }
});
console.log(`day sessions: ${checked} closed days, all balancing to zero variance`);

/* ---------------------------------------------------------------- customers */

seed.CUSTOMERS.forEach((c) => {
  const balance = dayBook.customerBalance(c, data);
  const entries = ledgerLib.customerLedger(c, data);
  const running = entries.length ? entries[entries.length - 1].balance : 0;
  const expected = balance.outstanding - balance.advance;
  if (running !== expected) {
    fail(`customer ${c.name}: statement ends at ${running}, balance says ${expected}`);
  }
  console.log(
    `  ${c.name.padEnd(24)} owes ${String(balance.outstanding).padStart(8)}` +
    `  advance ${String(balance.advance).padStart(8)}  setOff ${String(balance.setOff).padStart(7)}`,
  );
});

/* ---------------------------------------------------------------- suppliers */

seed.SUPPLIERS.forEach((s) => {
  const balance = ledgerLib.supplierBalance(s, data);
  const entries = ledgerLib.supplierLedger(s, data);
  const running = entries.length ? entries[entries.length - 1].balance : 0;
  const expected = balance.outstanding - balance.advance;
  if (running !== expected) {
    fail(`supplier ${s.name}: statement ends at ${running}, balance says ${expected}`);
  }
  console.log(
    `  ${s.name.padEnd(24)} owed ${String(balance.outstanding).padStart(8)}` +
    `  advance ${String(balance.advance).padStart(8)}  open bills ${balance.unpaidBills}`,
  );
});

/* ------------------------------------------------------------------ parties */

const parties = ledgerLib.partyPositions(seed.CUSTOMERS, seed.SUPPLIERS, data);
parties.forEach((p) => {
  if (p.settleable !== Math.min(p.receivable, p.payable)) {
    fail(`party ${p.name}: settleable ${p.settleable} is not the smaller of the two debts`);
  }
  console.log(
    `  ${p.name.padEnd(24)} receivable ${String(p.receivable).padStart(8)}` +
    `  payable ${String(p.payable).padStart(8)}  can cancel ${String(p.settleable).padStart(8)}`,
  );
});

/* ------------------------------------------------------------------- bills */

const open = ledgerLib.openBills(data, seed.todayISO?.() ?? new Date().toISOString().slice(0, 10));
console.log(`open bills: ${open.length}, ${open.filter((b) => b.overdueDays > 0).length} overdue`);
open.forEach((b) => {
  if (b.balance <= 0) fail(`bill ${b.purchase.billNo} has no balance but is listed as open`);
  if (b.paid + b.balance !== b.purchase.total) {
    fail(`bill ${b.purchase.billNo}: paid ${b.paid} + owed ${b.balance} != total ${b.purchase.total}`);
  }
});

console.log(failures === 0 ? "\nAll ledger checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
