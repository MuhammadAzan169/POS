/**
 * Turns the live dataset into a compact brief for the AI.
 *
 * The numbers are computed here, in code, and the model only interprets them.
 * Sending raw rows would blow past free-model context limits and invite the
 * model to do arithmetic — which is exactly what language models get wrong.
 */
// Helpers live in store.tsx; the plain types come from store-types.ts.
import { dayOf, daysAgoISO, discountPctFor, allocateSale } from "./store";
import {
  type DiscountRules,
  type Expense,
  type InventoryRow,
  type Product,
  type Purchase,
  type ReturnRec,
  type Sale,
  type Settings,
  type Shop,
  type Supplier,
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
  const perProduct = new Map<string, { name: string; qty: number; revenue: number; profit: number }>();
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
      const bills = d.purchases.filter((p) => (p.supplierId ? p.supplierId === s.id : p.supplier === s.name));
      return {
        supplier: s.name,
        bills: bills.length,
        spend: Math.round(sum(bills.map((b) => b.total))),
        lastPurchase: bills.map((b) => b.date).sort().at(-1) ?? "never",
      };
    })
    .sort((a, b) => b.spend - a.spend);

  const customerReturns = d.returns.filter((r) => r.kind === "customer");
  const supplierReturns = d.returns.filter((r) => r.kind === "supplier");

  const pct = (now: number, before: number) =>
    before === 0 ? (now > 0 ? 100 : 0) : Math.round(((now - before) / before) * 100);

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
      sum(d.inventory.map((r) => r.qty * (d.products.find((p) => p.id === r.productId)?.cost ?? 0))),
    ),
    returnsAllTime: {
      customer: { count: customerReturns.length, refunded: Math.round(sum(customerReturns.map((r) => r.refund))) },
      supplier: { count: supplierReturns.length, credited: Math.round(sum(supplierReturns.map((r) => r.refund))) },
    },
    supplierSpendAllTime: supplierSpend,
    discountRules: {
      enabled: d.discounts.enabled,
      overallPct: d.discounts.overallPct,
      maxPct: d.discounts.maxPct,
      itemsWithOwnRate: Object.keys(d.discounts.perProduct).length,
    },
    catalogue: { products: d.products.length, shops: d.shops.length, suppliers: d.suppliers.length },
  };
}

export type Insights = ReturnType<typeof computeInsights>;

/** The exact text handed to the model. JSON keeps it unambiguous and compact. */
export function buildBrief(insights: Insights): string {
  return JSON.stringify(insights, null, 1);
}
