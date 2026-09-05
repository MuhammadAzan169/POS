/**
 * Turns the live dataset into a compact brief for the AI.
 *
 * The numbers are computed here, in code, and the model only interprets them.
 * Sending raw rows would blow past free-model context limits and invite the
 * model to do arithmetic — which is exactly what language models get wrong.
 */
// Helpers live in store.tsx; the plain types come from store-types.ts.
import { dayOf, daysAgoISO, todayISO } from "./dates";
import { discountPctFor, allocateSale, purchaseSettlement } from "./store-types";
import { customerBalance, paymentMix, summarizeSession } from "./day-book";
import { supplierBalance, partyPositions, openBills } from "./ledger";
import {
  type Activity,
  type Adjustment,
  type Customer,
  type CustomerPayment,
  type DaySession,
  type DiscountRules,
  type Expense,
  type InventoryRow,
  type Product,
  type Purchase,
  type ReturnRec,
  type Sale,
  type SetOff,
  type Settings,
  type Shop,
  type Supplier,
  type SupplierPayment,
  type Transfer,
} from "./store-types";

export interface InsightInput {
  shops: Shop[];
  products: Product[];
  inventory: InventoryRow[];
  sales: Sale[];
  purchases: Purchase[];
  suppliers: Supplier[];
  expenses: Expense[];
  returns: ReturnRec[];
  settings: Settings;
  discounts: DiscountRules;
  /*
    Everything below arrived with credit, the day book and the activity log.

    Optional because the brief long predates them and an older caller should
    still compile — but leaving any of them out is what made the assistant
    answer "how much do I owe my suppliers?" with a shrug. `computeInsights`
    treats a missing list as an empty one, which is honest: no data means no
    figure, not a guessed figure.
  */
  customers?: Customer[];
  customerPayments?: CustomerPayment[];
  supplierPayments?: SupplierPayment[];
  setOffs?: SetOff[];
  adjustments?: Adjustment[];
  daySessions?: DaySession[];
  transfers?: Transfer[];
  activity?: Activity[];
}

// Local-time dates, matching dayOf() — see the note in store.tsx.
const daysAgo = (n: number) => daysAgoISO(n);

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Headline figures the UI shows as cards and the AI receives as facts. */
export function computeInsights(d: InsightInput) {
  const today = daysAgo(0);
  const live = d.sales.filter((s) => s.status !== "Returned");

  const inWindow = (from: string, to = today) =>
    live.filter((s) => dayOf(s.date) >= from && dayOf(s.date) <= to);

  const window = (label: string, from: string, to?: string) => {
    const rows = inWindow(from, to);
    return {
      label,
      invoices: rows.length,
      revenue: Math.round(sum(rows.map((s) => s.total))),
      profit: Math.round(sum(rows.map((s) => s.profit))),
      units: sum(rows.map((s) => sum(s.lines.map((l) => l.qty)))),
    };
  };

  const todayW = window("today", today);
  const last7 = window("last 7 days", daysAgo(6));
  const prev7 = window("previous 7 days", daysAgo(13), daysAgo(7));
  const last30 = window("last 30 days", daysAgo(29));

  // Per-product performance over the last 30 days.
  const perProduct = new Map<
    string,
    { name: string; qty: number; revenue: number; profit: number }
  >();
  // Net of both discounts, matching the Sales and Reports screens. Feeding the
  // model full-price figures had it recommending products whose margin the
  // discounts had already eaten.
  inWindow(daysAgo(29)).forEach((s) =>
    allocateSale(s).forEach(({ line: l, revenue, profit }) => {
      const cur = perProduct.get(l.productId) ?? { name: l.name, qty: 0, revenue: 0, profit: 0 };
      cur.qty += l.qty;
      cur.revenue += revenue;
      cur.profit += profit;
      perProduct.set(l.productId, cur);
    }),
  );
  const ranked = [...perProduct.entries()].map(([id, v]) => ({ id, ...v }));
  const byUnits = [...ranked].sort((a, b) => b.qty - a.qty);
  const bestSellers = byUnits.slice(0, 6);
  const topRevenue = [...ranked].sort((a, b) => b.revenue - a.revenue).slice(0, 6);
  // Without this the model answered "lowest selling" from the bottom of the
  // best-sellers list, which is the 6th BEST seller — not the worst.
  const slowestSellers = [...byUnits].reverse().slice(0, 6);

  // Products that sold nothing in 30 days but are sitting in stock.
  const stockOf = (productId: string) =>
    sum(d.inventory.filter((r) => r.productId === productId).map((r) => r.qty));
  const deadStock = d.products
    .filter((p) => !perProduct.has(p.id) && stockOf(p.id) > 0)
    .map((p) => ({ name: p.name, units: stockOf(p.id), tiedUp: stockOf(p.id) * p.cost }))
    .sort((a, b) => b.tiedUp - a.tiedUp)
    .slice(0, 8);

  // Anything at or below its alert level, worst first.
  const lowStock = d.inventory
    .map((r) => ({
      row: r,
      product: d.products.find((p) => p.id === r.productId),
      shop: d.shops.find((s) => s.id === r.shopId),
    }))
    .filter((x) => x.product && x.shop && x.row.qty <= x.product.lowAlert)
    .map((x) => ({
      product: x.product!.name,
      shop: x.shop!.name,
      inStock: x.row.qty,
      alertAt: x.product!.lowAlert,
      suggestedOrder: Math.max(1, x.product!.lowAlert * 2 - x.row.qty),
      reorderCost: Math.max(1, x.product!.lowAlert * 2 - x.row.qty) * x.product!.cost,
    }))
    .sort((a, b) => a.inStock - b.inStock);

  const perShop = d.shops.map((shop) => {
    const rows = inWindow(daysAgo(29)).filter((s) => s.shopId === shop.id);
    const exp = d.expenses.filter((e) => e.shopId === shop.id && e.date >= daysAgo(29));
    const revenue = Math.round(sum(rows.map((s) => s.total)));
    const profit = Math.round(sum(rows.map((s) => s.profit)));
    const expenses = Math.round(sum(exp.map((e) => e.amount)));
    return {
      shop: shop.name,
      invoices: rows.length,
      revenue,
      profit,
      expenses,
      net: profit - expenses,
      stockValue: Math.round(
        sum(
          d.inventory
            .filter((r) => r.shopId === shop.id)
            .map((r) => r.qty * (d.products.find((p) => p.id === r.productId)?.cost ?? 0)),
        ),
      ),
    };
  });

  // Margin outliers are where pricing mistakes hide.
  const margins = d.products
    .filter((p) => p.price > 0)
    .map((p) => ({
      name: p.name,
      price: p.price,
      cost: p.cost,
      marginPct: Math.round(((p.price - p.cost) / p.price) * 100),
      discountPct: discountPctFor(p.id, d.discounts),
    }))
    .sort((a, b) => a.marginPct - b.marginPct);

  const expensesByCategory = Object.entries(
    d.expenses
      .filter((e) => e.date >= daysAgo(29))
      .reduce<Record<string, number>>((acc, e) => {
        acc[e.category] = (acc[e.category] ?? 0) + e.amount;
        return acc;
      }, {}),
  )
    .map(([category, amount]) => ({ category, amount: Math.round(amount) }))
    .sort((a, b) => b.amount - a.amount);

  const supplierSpend = d.suppliers
    .map((s) => {
      const bills = d.purchases.filter((p) =>
        p.supplierId ? p.supplierId === s.id : p.supplier === s.name,
      );
      return {
        supplier: s.name,
        bills: bills.length,
        spend: Math.round(sum(bills.map((b) => b.total))),
        lastPurchase:
          bills
            .map((b) => b.date)
            .sort()
            .at(-1) ?? "never",
      };
    })
    .sort((a, b) => b.spend - a.spend);

  const customerReturns = d.returns.filter((r) => r.kind === "customer");
  const supplierReturns = d.returns.filter((r) => r.kind === "supplier");

  const pct = (now: number, before: number) =>
    before === 0 ? (now > 0 ? 100 : 0) : Math.round(((now - before) / before) * 100);

  /* ------------------------------------------------- credit owed TO us */

  const customers = d.customers ?? [];
  const ledgerData = {
    sales: d.sales,
    customerPayments: d.customerPayments ?? [],
    purchases: d.purchases,
    supplierPayments: d.supplierPayments ?? [],
    returns: d.returns,
    setOffs: d.setOffs ?? [],
    adjustments: d.adjustments ?? [],
  };

  const customerBalances = customers.map((c) => ({
    customer: c,
    balance: customerBalance(c, ledgerData),
  }));

  const receivables = {
    note: "What customers owe the business right now. Not date-scoped — a balance is a standing figure, not a period total.",
    totalOutstanding: Math.round(sum(customerBalances.map((x) => x.balance.outstanding))),
    customersOwing: customerBalances.filter((x) => x.balance.outstanding > 0).length,
    // Money the business is holding that belongs to somebody else until they
    // collect the goods. It flatters the cash position if you forget it.
    advancesHeld: Math.round(sum(customerBalances.map((x) => x.balance.advance))),
    atCreditLimit: customerBalances
      .filter((x) => x.balance.overLimit)
      .map((x) => ({
        name: x.customer.name,
        owes: Math.round(x.balance.outstanding),
        limit: x.customer.creditLimit,
      })),
    topDebtors: customerBalances
      .filter((x) => x.balance.outstanding > 0)
      .sort((a, b) => b.balance.outstanding - a.balance.outstanding)
      .slice(0, 8)
      .map((x) => ({
        name: x.customer.name,
        owes: Math.round(x.balance.outstanding),
        creditLimit: x.customer.creditLimit || "none",
        lastPurchase: x.balance.lastPurchase ? dayOf(x.balance.lastPurchase) : "never",
        lastPayment: x.balance.lastPayment ? dayOf(x.balance.lastPayment) : "never",
      })),
    collectedLast30Days: Math.round(
      sum(
        (d.customerPayments ?? []).filter((p) => dayOf(p.date) >= daysAgo(29)).map((p) => p.amount),
      ),
    ),
  };

  /* ------------------------------------------------- credit owed BY us */

  const supplierBalances = d.suppliers.map((sp) => ({
    supplier: sp,
    balance: supplierBalance(sp, ledgerData),
  }));
  const bills = openBills(ledgerData, today);
  const overdue = bills.filter((b) => b.overdueDays > 0);
  const parties = partyPositions(customers, d.suppliers, ledgerData);

  const payables = {
    note: "What the business owes suppliers right now, from their bills less what has been paid, returned or set off.",
    totalOutstanding: Math.round(sum(supplierBalances.map((x) => x.balance.outstanding))),
    suppliersOwed: supplierBalances.filter((x) => x.balance.outstanding > 0).length,
    advancesPlaced: Math.round(sum(supplierBalances.map((x) => x.balance.advance))),
    openBills: bills.length,
    overdueBills: overdue.map((b) => ({
      billNo: b.purchase.billNo,
      supplier: b.purchase.supplier,
      owed: Math.round(b.balance),
      daysOverdue: b.overdueDays,
    })),
    topCreditors: supplierBalances
      .filter((x) => x.balance.outstanding > 0)
      .sort((a, b) => b.balance.outstanding - a.balance.outstanding)
      .slice(0, 8)
      .map((x) => ({
        name: x.supplier.name,
        owed: Math.round(x.balance.outstanding),
        openBills: x.balance.unpaidBills,
      })),
    // Debts that cancel: a partner who both buys from and sells to the business
    // needs no cheque for the overlapping part.
    settleableWithPartners: parties
      .filter((x) => x.settleable > 0)
      .map((x) => ({
        name: x.name,
        theyOweUs: Math.round(x.receivable),
        weOweThem: Math.round(x.payable),
        canBeCancelled: Math.round(x.settleable),
      })),
  };

  /* ------------------------------------------------------- how money arrives */

  const mixSource = paymentMix(live.filter((x) => dayOf(x.date) >= daysAgo(29)));
  const mix = {
    period: "last 30 days",
    cash: Math.round(mixSource.cash),
    card: Math.round(mixSource.card),
    online: Math.round(mixSource.online),
    credit: Math.round(mixSource.credit),
    total: Math.round(mixSource.total),
    note: "credit is sold on account — a real sale, but no money arrived. cash/card/online were settled at the counter.",
  };

  /* --------------------------------------------------- the trading day */

  const sessions = d.daySessions ?? [];
  const sessionData = {
    sales: d.sales,
    expenses: d.expenses,
    returns: d.returns,
    customerPayments: d.customerPayments ?? [],
    supplierPayments: d.supplierPayments ?? [],
    purchases: d.purchases,
  };
  const closedRecently = sessions
    .filter((x) => x.status === "closed" && x.businessDate >= daysAgo(29))
    .map((x) => ({ session: x, cash: summarizeSession(x, sessionData) }));

  const shopName = (id: string) => d.shops.find((x) => x.id === id)?.name ?? id;

  const dayBook = {
    note: "A trading day is declared by the shopkeeper, not inferred from the clock, so a sale at 01:30 still belongs to the day the shop opened.",
    openDays: sessions
      .filter((x) => x.status === "open")
      .map((x) => ({
        shop: shopName(x.shopId),
        businessDate: x.businessDate,
        openingCash: Math.round(x.openingCash),
        expectedCashNow: Math.round(summarizeSession(x, sessionData).expectedCash),
      })),
    shopsNotStartedToday: d.shops
      .filter(
        (sh) => sh.active && !sessions.some((x) => x.shopId === sh.id && x.businessDate === today),
      )
      .map((sh) => sh.name),
    // A short till is the one figure worth chasing the same week.
    shortfallsLast30Days: closedRecently
      .filter(({ cash }) => cash.variance !== null && cash.variance < 0)
      .map(({ session: x, cash }) => ({
        shop: shopName(x.shopId),
        businessDate: x.businessDate,
        short: Math.round(Math.abs(cash.variance ?? 0)),
      })),
    cashTakenLast7Days: Math.round(
      sum(
        sessions
          .filter((x) => x.status === "closed" && x.businessDate >= daysAgo(6))
          .map((x) => x.cashTakenByOwner ?? 0),
      ),
    ),
    recentDays: closedRecently
      .sort((a, b) => b.session.businessDate.localeCompare(a.session.businessDate))
      .slice(0, 10)
      .map(({ session: x, cash }) => ({
        shop: shopName(x.shopId),
        businessDate: x.businessDate,
        counted: cash.countedCash,
        expected: Math.round(cash.expectedCash),
        variance: cash.variance,
        takenByOwner: Math.round(x.cashTakenByOwner ?? 0),
        leftInShop: Math.round(x.cashLeftInShop ?? 0),
      })),
  };

  /* ----------------------------------------------------------- oversight */

  const activity = d.activity ?? [];
  const recentDeletions = activity.filter(
    (a) => a.action === "deleted" && dayOf(a.at) >= daysAgo(29),
  );
  const writeOffs = (d.adjustments ?? []).filter(
    (a) => a.amount < 0 && dayOf(a.date) >= daysAgo(29),
  );

  const oversight = {
    note: "Records removed or balances changed by hand. Deleted records are recoverable from the Activity page.",
    deletionsLast30Days: recentDeletions.map((a) => ({
      what: a.entity,
      reference: a.label,
      value: Math.round(a.amount),
      by: a.byName,
      role: a.byRole,
      on: dayOf(a.at),
      putBack: Boolean(a.restoredAt),
    })),
    deletionsByShopStaff: recentDeletions.filter((a) => a.byRole === "shop").length,
    writeOffsLast30Days: writeOffs.map((a) => ({
      amount: Math.round(Math.abs(a.amount)),
      reason: a.reason,
      by: a.createdBy,
      on: dayOf(a.date),
    })),
    transfersLast30Days: (d.transfers ?? []).filter((t) => dayOf(t.date) >= daysAgo(29)).length,
  };

  return {
    currency: d.settings.currency,
    generatedAt: new Date().toISOString(),
    todayDate: today,
    // Every figure below states the period it covers. The model previously
    // reported 30-day totals as "today" because the periods were unlabelled.
    salesByPeriod: {
      today: todayW,
      last7Days: last7,
      previous7Days: prev7,
      last30Days: last30,
    },
    trendLast7VsPrevious7: {
      revenueChangePct: pct(last7.revenue, prev7.revenue),
      profitChangePct: pct(last7.profit, prev7.profit),
      invoiceChangePct: pct(last7.invoices, prev7.invoices),
    },
    perShopLast30Days: perShop,
    productPerformance: {
      period: "last 30 days",
      bestSellersByUnits: bestSellers,
      topByRevenue: topRevenue,
      slowestSellersByUnits: slowestSellers,
      note: "slowestSellersByUnits are the worst performers among products that sold at least once; products that sold nothing are in deadStockNotSoldInLast30Days.",
    },
    deadStockNotSoldInLast30Days: deadStock,
    lowStockNeedingReorder: lowStock,
    marginsPerProduct: { lowest: margins.slice(0, 5), highest: margins.slice(-5).reverse() },
    expensesLast30Days: {
      total: Math.round(sum(d.expenses.filter((e) => e.date >= daysAgo(29)).map((e) => e.amount))),
      byCategory: expensesByCategory,
    },
    inventoryValueAtCost: Math.round(
      sum(
        d.inventory.map((r) => r.qty * (d.products.find((p) => p.id === r.productId)?.cost ?? 0)),
      ),
    ),
    returnsAllTime: {
      customer: {
        count: customerReturns.length,
        refunded: Math.round(sum(customerReturns.map((r) => r.refund))),
      },
      supplier: {
        count: supplierReturns.length,
        credited: Math.round(sum(supplierReturns.map((r) => r.refund))),
      },
    },
    supplierSpendAllTime: supplierSpend,
    discountRules: {
      enabled: d.discounts.enabled,
      overallPct: d.discounts.overallPct,
      maxPct: d.discounts.maxPct,
      itemsWithOwnRate: Object.keys(d.discounts.perProduct).length,
    },
    catalogue: {
      products: d.products.length,
      shops: d.shops.length,
      suppliers: d.suppliers.length,
    },

    /*
      Money owed in both directions, the trading day, and who changed what.

      Half the questions an owner actually types are about these — "who owes
      me", "how much do I owe", "did the till come up short" — and until they
      were in the brief the assistant had nothing to answer from.
    */
    receivables,
    payables,
    paymentMixLast30Days: mix,
    dayBook,
    oversight,
  };
}

export type Insights = ReturnType<typeof computeInsights>;

/** The exact text handed to the model. JSON keeps it unambiguous and compact. */
export function buildBrief(insights: Insights): string {
  return JSON.stringify(insights, null, 1);
}
