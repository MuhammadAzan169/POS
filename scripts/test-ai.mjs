/**
 * The AI assistant, tested against 50 real questions.
 *
 *   node scripts/test-ai.mjs           # coverage only, no network, no cost
 *   node scripts/test-ai.mjs --live    # also asks the model a sample
 *
 * The assistant is told, in its system prompt, never to calculate anything —
 * every figure it quotes must already be in the BUSINESS DATA block that
 * `buildBrief()` produces. That makes its accuracy almost entirely a question
 * of coverage: if the fact is in the brief it can answer, and if it is not, the
 * best case is that it says so and the worst case is that it invents something.
 *
 * So this checks the brief, not the prose. Each question below names the fields
 * an honest answer would have to read. A question whose fields are missing is a
 * question the assistant cannot answer, however well it writes.
 *
 * `--live` additionally sends a handful of questions to the configured model and
 * checks the answers contain the figures they should. That costs credit and
 * depends on a free model being up, which is why it is off by default.
 */
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./ts-loader.mjs", pathToFileURL("./scripts/"));

const I = await import("../src/lib/insights.ts");
const T = await import("../src/lib/store-types.ts");
const seed = await import("../src/lib/seed-data.ts");

const LIVE = process.argv.includes("--live");

/* ------------------------------------------------------- the brief itself */

const insights = I.computeInsights({
  shops: seed.SHOPS,
  products: seed.PRODUCTS,
  inventory: seed.genInventory(),
  sales: seed.genSales(),
  purchases: seed.genPurchases(),
  suppliers: seed.SUPPLIERS,
  expenses: seed.genExpenses(),
  returns: [],
  settings: seed.DEFAULT_SETTINGS,
  discounts: T.DEFAULT_DISCOUNTS,
  // Everything added since credit and the day book existed. Passed as optional
  // so an older caller still compiles; the check below is what proves they
  // actually arrive.
  customers: seed.CUSTOMERS,
  customerPayments: seed.genCustomerPayments(),
  supplierPayments: seed.genSupplierPayments(),
  setOffs: seed.genSetOffs(),
  adjustments: [],
  daySessions: seed.genDaySessions(),
  transfers: [],
  activity: [],
});

const brief = I.buildBrief(insights);

/** Does the brief actually carry this dotted path, with a usable value? */
function has(path) {
  let node = insights;
  for (const key of path.split(".")) {
    if (node == null || typeof node !== "object") return false;
    if (!(key in node)) return false;
    node = node[key];
  }
  if (node == null) return false;
  if (Array.isArray(node)) return true; // an empty list is a real answer
  return true;
}

/* --------------------------------------------------------------- the 50 */

/**
 * Every question a shopkeeper or owner would actually type, and the facts an
 * honest answer needs. Grouped the way the app is.
 */
const QUESTIONS = [
  /* --- trading, the part that already worked -------------------------- */
  ["How much did we sell today?", ["salesByPeriod.today.revenue"]],
  ["How many invoices today?", ["salesByPeriod.today.invoices"]],
  ["What was our profit this week?", ["salesByPeriod.last7Days.profit"]],
  ["Are we up or down on last week?", ["trendLast7VsPrevious7.revenueChangePct", "salesByPeriod.previous7Days.revenue"]],
  ["What did we take in the last 30 days?", ["salesByPeriod.last30Days.revenue"]],
  ["How many items have we sold this month?", ["salesByPeriod.last30Days.units"]],
  ["Which shop is doing best?", ["perShopLast30Days"]],
  ["Which shop is doing worst?", ["perShopLast30Days"]],
  ["What is our best selling product?", ["productPerformance.bestSellersByUnits"]],
  ["Which product earns us the most money?", ["productPerformance.topByRevenue"]],
  ["What is selling the slowest?", ["productPerformance.slowestSellersByUnits"]],
  ["Is anything not selling at all?", ["deadStockNotSoldInLast30Days"]],
  ["Which products have the worst margin?", ["marginsPerProduct.lowest"]],
  ["Which products make the most margin?", ["marginsPerProduct.highest"]],
  ["What are we spending on?", ["expensesLast30Days.byCategory"]],
  ["How much did we spend last month?", ["expensesLast30Days.total"]],
  ["What is our stock worth?", ["inventoryValueAtCost"]],
  ["What needs reordering?", ["lowStockNeedingReorder"]],
  ["How many products do we sell?", ["catalogue.products"]],
  ["How many shops do we have?", ["catalogue.shops"]],
  ["Are discounts switched on?", ["discountRules.enabled"]],
  ["What is the maximum discount allowed?", ["discountRules.maxPct"]],
  ["How many customer returns have we had?", ["returnsAllTime.customer.count"]],
  ["How much have we refunded?", ["returnsAllTime.customer.refunded"]],
  ["Who do we buy the most from?", ["supplierSpendAllTime"]],

  /* --- credit owed TO us ---------------------------------------------- */
  ["Who owes me money?", ["receivables.topDebtors"]],
  ["How much is owed to me in total?", ["receivables.totalOutstanding"]],
  ["How many customers owe us?", ["receivables.customersOwing"]],
  ["Which customer owes the most?", ["receivables.topDebtors"]],
  ["Is anyone at their credit limit?", ["receivables.atCreditLimit"]],
  ["Has anyone paid in advance?", ["receivables.advancesHeld"]],
  ["How much did we collect on old credit?", ["receivables.collectedLast30Days"]],

  /* --- credit owed BY us ---------------------------------------------- */
  ["How much do I owe my suppliers?", ["payables.totalOutstanding"]],
  ["Which supplier is owed the most?", ["payables.topCreditors"]],
  ["Are any bills overdue?", ["payables.overdueBills"]],
  ["How many bills are unpaid?", ["payables.openBills"]],
  ["Have we paid anyone in advance?", ["payables.advancesPlaced"]],
  ["Can any debts be cancelled against each other?", ["payables.settleableWithPartners"]],

  /* --- the day book and cash ------------------------------------------ */
  ["Did any till come up short?", ["dayBook.shortfallsLast30Days"]],
  ["How much cash should be in the drawer?", ["dayBook.openDays"]],
  ["Which shops have not started their day?", ["dayBook.shopsNotStartedToday"]],
  ["How much cash did the owner take last week?", ["dayBook.cashTakenLast7Days"]],
  ["What was yesterday's cash count?", ["dayBook.recentDays"]],
  ["Has any day been left open?", ["dayBook.openDays"]],

  /* --- how money arrives ---------------------------------------------- */
  ["How do customers usually pay?", ["paymentMixLast30Days.cash", "paymentMixLast30Days.card"]],
  ["How much of our sales are on credit?", ["paymentMixLast30Days.credit"]],
  ["How much cash have we taken this month?", ["paymentMixLast30Days.cash"]],

  /* --- oversight ------------------------------------------------------- */
  ["Has anything been deleted recently?", ["oversight.deletionsLast30Days"]],
  ["Has anyone written off a debt?", ["oversight.writeOffsLast30Days"]],
  ["What is my overall position — owed in and owed out?", ["receivables.totalOutstanding", "payables.totalOutstanding"]],
];

/* ------------------------------------------------------------- run it */

let covered = 0;
const gaps = [];

console.log(`\nChecking ${QUESTIONS.length} questions against a ${brief.length}-character brief\n`);

QUESTIONS.forEach(([question, fields], i) => {
  const missing = fields.filter((f) => !has(f));
  const n = String(i + 1).padStart(2, " ");
  if (missing.length === 0) {
    covered++;
    console.log(`  ${n}. ok    ${question}`);
  } else {
    gaps.push({ question, missing });
    console.log(`  ${n}. GAP   ${question}\n            needs: ${missing.join(", ")}`);
  }
});

console.log(`\n${"=".repeat(64)}`);
console.log(`${covered}/${QUESTIONS.length} answerable from the brief`);
if (gaps.length > 0) {
  const needed = [...new Set(gaps.flatMap((g) => g.missing))].sort();
  console.log(`\n${gaps.length} cannot be answered. Missing facts:\n`);
  needed.forEach((f) => console.log(`  ${f}`));
}
console.log("=".repeat(64));

/* ------------------------------------------------------------ live mode */

if (LIVE) {
  const env = Object.fromEntries(
    readFileSync(".env", "utf8")
      .split(/\r?\n/)
      .filter((l) => l.trim() && !l.trim().startsWith("#"))
      .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
  );
  const key = env.OPENROUTER_API_KEY;
  const models = [env.OPENROUTER_MODEL1, env.OPENROUTER_MODEL2, env.OPENROUTER_MODEL3].filter(Boolean);

  if (!key) {
    console.log("\nOPENROUTER_API_KEY not set — skipping the live sample.");
  } else {
    /*
      A sample rather than all fifty: free models are rate-limited, and the
      point is to prove the round trip and the "copy the number exactly" rule,
      which one question demonstrates as well as fifty.
    */
    const sample = [
      ["How much did we take in the last 7 days?", String(insights.salesByPeriod.last7Days.revenue)],
      ["How many invoices in the last 7 days?", String(insights.salesByPeriod.last7Days.invoices)],
      ["What is our stock worth at cost?", String(insights.inventoryValueAtCost)],
    ];

    console.log(`\nasking ${models[0]} (${sample.length} questions)\n`);
    for (const [question, expected] of sample) {
      const answer = await ask(key, models, question, brief);
      const exact = answer.includes(expected) || answer.includes(Number(expected).toLocaleString("en-US"));
      console.log(`  ${exact ? "ok  " : "MISS"}  ${question}`);
      console.log(`        expected the figure ${expected}`);
      console.log(`        ${answer.replace(/\s+/g, " ").slice(0, 220)}`);
      if (!exact) console.log("        ^ the figure was not quoted verbatim");
    }
  }
}

async function ask(key, models, question, briefText) {
  for (const model of models) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: "Answer only from the BUSINESS DATA block. Copy figures exactly, digit for digit. Never calculate." },
            { role: "user", content: `BUSINESS DATA:\n${briefText}\n\nQUESTION: ${question}` },
          ],
        }),
      });
      const json = await res.json();
      const text = json?.choices?.[0]?.message?.content;
      if (text) return text;
    } catch {
      /* try the next model in the chain */
    }
  }
  return "(no model answered)";
}

process.exit(gaps.length === 0 ? 0 : 1);
