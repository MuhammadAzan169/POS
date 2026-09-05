import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  useStore,
  formatRs,
  businessDayOf,
  paymentMix,
  totalOutstanding,
  totalPayable,
  summarizeSession,
  shortDay,
  daysInRange,
  clampRangeToData,
  dayOf,
  allocateSale,
} from "@/lib/store";
import { useScope, inRange } from "@/lib/scope";
import { PageHeader } from "@/components/AppLayout";
import { ScopeBar } from "@/components/ScopeBar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Download,
  Printer,
  Banknote,
  CreditCard,
  Smartphone,
  Wallet,
  HandCoins,
  ArrowRight,
} from "lucide-react";
import { downloadCsv } from "@/lib/export";
import { toast } from "sonner";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Legend,
} from "recharts";

export const Route = createFileRoute("/app/reports")({ component: ReportsPage });

function ReportsPage() {
  const {
    user,
    sales,
    expenses,
    shops,
    products,
    inventory,
    daySessions,
    returns,
    customers,
    customerPayments,
    purchases,
    supplierPayments,
    suppliers,
    setOffs,
    adjustments,
    settings,
  } = useStore();
  const { range, rangeLabel, shopScope } = useScope();
  const isAdmin = user?.role === "admin";
  const currency = settings.currency;

  const scopedShops = useMemo(
    () => (shopScope === "all" ? shops : shops.filter((s) => s.id === shopScope)),
    [shops, shopScope],
  );
  const inScope = useMemo(() => new Set(scopedShops.map((s) => s.id)), [scopedShops]);

  /** Sales in the chosen period, bucketed by trading day rather than timestamp. */
  const periodSales = useMemo(
    () =>
      sales.filter(
        (s) => inScope.has(s.shopId) && inRange(businessDayOf(s), range) && s.status !== "Returned",
      ),
    [sales, inScope, range],
  );
  const periodExpenses = useMemo(
    () => expenses.filter((e) => inScope.has(e.shopId) && inRange(dayOf(e.date), range)),
    [expenses, inScope, range],
  );

  // Clamped to days that actually hold sales, so the "All time" preset reports
  // the real trading history instead of every day back to the year 2000.
  const days = useMemo(() => {
    const bounds = clampRangeToData(range, periodSales.map(businessDayOf));
    return daysInRange(bounds.from, bounds.to);
  }, [range, periodSales]);

  const dailyData = useMemo(() => {
    const map = new Map<string, { date: string; sales: number; profit: number }>();
    periodSales.forEach((s) => {
      const d = businessDayOf(s);
      const cur = map.get(d) ?? { date: d, sales: 0, profit: 0 };
      cur.sales += s.total;
      cur.profit += s.profit;
      map.set(d, cur);
    });
    // Zero-fill so a closed day is a visible zero, not a gap the line jumps.
    return days.map((d) => map.get(d) ?? { date: d, sales: 0, profit: 0 });
  }, [periodSales, days]);

  /**
   * The grid the owner actually wants: one row per trading day, one column per
   * shop, with row and column totals. This is the "how much did each shop sell
   * each day" question answered directly.
   */
  const matrix = useMemo(() => {
    const cell = new Map<string, { sales: number; profit: number; invoices: number }>();
    const key = (day: string, shopId: string) => `${day}|${shopId}`;
    periodSales.forEach((s) => {
      const k = key(businessDayOf(s), s.shopId);
      const cur = cell.get(k) ?? { sales: 0, profit: 0, invoices: 0 };
      cur.sales += s.total;
      cur.profit += s.profit;
      cur.invoices += 1;
      cell.set(k, cur);
    });

    // Newest day first — the owner reads today's row before last week's.
    const rows = [...days].reverse().map((day) => {
      const perShop = scopedShops.map(
        (s) => cell.get(key(day, s.id)) ?? { sales: 0, profit: 0, invoices: 0 },
      );
      return {
        day,
        perShop,
        total: perShop.reduce((a, c) => a + c.sales, 0),
        profit: perShop.reduce((a, c) => a + c.profit, 0),
        invoices: perShop.reduce((a, c) => a + c.invoices, 0),
      };
    });

    const columnTotals = scopedShops.map((s, i) => ({
      shop: s,
      sales: rows.reduce((a, r) => a + r.perShop[i].sales, 0),
      profit: rows.reduce((a, r) => a + r.perShop[i].profit, 0),
      invoices: rows.reduce((a, r) => a + r.perShop[i].invoices, 0),
    }));

    return {
      rows,
      columnTotals,
      grand: rows.reduce((a, r) => a + r.total, 0),
      grandProfit: rows.reduce((a, r) => a + r.profit, 0),
      grandInvoices: rows.reduce((a, r) => a + r.invoices, 0),
    };
  }, [periodSales, days, scopedShops]);

  const perShop = scopedShops.map((s) => {
    const ss = periodSales.filter((x) => x.shopId === s.id);
    const ee = periodExpenses.filter((x) => x.shopId === s.id);
    return {
      name: s.name,
      sales: ss.reduce((a, x) => a + x.total, 0),
      profit: ss.reduce((a, x) => a + x.profit, 0),
      expenses: ee.reduce((a, x) => a + x.amount, 0),
      net: ss.reduce((a, x) => a + x.profit, 0) - ee.reduce((a, x) => a + x.amount, 0),
    };
  });

  const mix = useMemo(() => paymentMix(periodSales), [periodSales]);
  const owedToYou = useMemo(
    () => totalOutstanding(customers, { sales, customerPayments }),
    [customers, sales, customerPayments],
  );
  /**
   * The other direction. Reports stated what customers owed and stopped there,
   * which reads as a healthier position than the business is actually in — the
   * bills waiting to be paid are a claim on the same money.
   */
  const youOwe = useMemo(
    () =>
      totalPayable(suppliers, {
        sales,
        customerPayments,
        purchases,
        supplierPayments,
        returns,
        setOffs,
        adjustments,
      }),
    [
      suppliers,
      sales,
      customerPayments,
      purchases,
      supplierPayments,
      returns,
      setOffs,
      adjustments,
    ],
  );

  /** Closed days in the period, with the cash actually handed over. */
  const cashDays = useMemo(
    () =>
      daySessions
        .filter(
          (s) => inScope.has(s.shopId) && s.status === "closed" && inRange(s.businessDate, range),
        )
        .sort((a, b) => b.businessDate.localeCompare(a.businessDate))
        .map((s) => ({
          session: s,
          shop: shops.find((x) => x.id === s.shopId),
          cash: summarizeSession(s, {
            sales,
            expenses,
            returns,
            customerPayments,
            supplierPayments,
            purchases,
          }),
        })),
    [daySessions, inScope, range, shops, sales, expenses, returns, customerPayments],
  );

  const cashTotals = useMemo(
    () => ({
      taken: cashDays.reduce((a, d) => a + d.cash.cashTakenByOwner, 0),
      left: cashDays.reduce((a, d) => a + d.cash.cashLeftInShop, 0),
      variance: cashDays.reduce((a, d) => a + (d.cash.variance ?? 0), 0),
      expenses: cashDays.reduce((a, d) => a + d.cash.drawerExpenses, 0),
    }),
    [cashDays],
  );

  const topItems = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number; profit: number }>();
    // Discounts were ignored here entirely, so this list reported what each
    // item would have earned at full price — and ranked "top sellers" by
    // revenue the business never actually took.
    periodSales.forEach((s) =>
      allocateSale(s).forEach(({ line: l, revenue, profit }) => {
        const cur = map.get(l.productId) ?? { name: l.name, qty: 0, revenue: 0, profit: 0 };
        cur.qty += l.qty;
        cur.revenue += revenue;
        cur.profit += profit;
        map.set(l.productId, cur);
      }),
    );
    return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  }, [periodSales]);

  const inventoryValue = inventory
    .filter((r) => inScope.has(r.shopId))
    .reduce((a, r) => {
      const p = products.find((pp) => pp.id === r.productId);
      return a + (p?.cost ?? 0) * r.qty;
    }, 0);

  const exportReport = () => {
    downloadCsv(
      `report-pl-by-shop-${range.from}_to_${range.to}.csv`,
      ["Shop", "Sales", "Sales profit", "Expenses", "Net profit"],
      [
        ...perShop.map((s) => [s.name, s.sales, s.profit, s.expenses, s.net]),
        [
          "TOTAL",
          perShop.reduce((a, s) => a + s.sales, 0),
          perShop.reduce((a, s) => a + s.profit, 0),
          perShop.reduce((a, s) => a + s.expenses, 0),
          perShop.reduce((a, s) => a + s.net, 0),
        ],
      ],
    );
    toast.success("Report exported");
  };

  /** The day x shop grid, exported exactly as it appears on screen. */
  const exportMatrix = () => {
    if (matrix.rows.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    downloadCsv(
      `daily-sales-by-shop-${range.from}_to_${range.to}.csv`,
      ["Trading day", ...scopedShops.map((s) => s.name), "Day total", "Invoices"],
      [
        ...matrix.rows.map((r) => [r.day, ...r.perShop.map((c) => c.sales), r.total, r.invoices]),
        ["TOTAL", ...matrix.columnTotals.map((c) => c.sales), matrix.grand, matrix.grandInvoices],
      ],
    );
    toast.success("Daily sales exported");
  };

  const exportCash = () => {
    if (cashDays.length === 0) {
      toast.error("No closed days in this period");
      return;
    }
    downloadCsv(
      `cash-handover-${range.from}_to_${range.to}.csv`,
      [
        "Trading day",
        "Shop",
        "Opening float",
        "Cash sales",
        "Card",
        "Online",
        "Refunds",
        "Till expenses",
        "Expected cash",
        "Counted cash",
        "Over/short",
        "Owner took",
        "Left in shop",
      ],
      cashDays.map(({ session: s, shop, cash: c }) => [
        s.businessDate,
        shop?.name ?? "",
        c.openingCash,
        c.cashSales,
        c.cardSales,
        c.onlineSales,
        c.refunds,
        c.drawerExpenses,
        c.expectedCash,
        c.countedCash ?? "",
        c.variance ?? "",
        c.cashTakenByOwner,
        c.cashLeftInShop,
      ]),
    );
    toast.success("Cash handover exported");
  };

  // Gate after every hook has run, so signing out of this page doesn't change the hook count.
  if (!isAdmin)
    return (
      <div className="text-center py-20 text-muted-foreground">
        Reports with profit are admin-only.
      </div>
    );

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle={`Owner analytics · ${rangeLabel}`}
        actions={
          <>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-1.5" />
              Print
            </Button>
            <Button variant="outline" onClick={exportReport}>
              <Download className="h-4 w-4 mr-1.5" />
              Export
            </Button>
          </>
        }
      />

      <ScopeBar />

      <div data-print="show" className="hidden mb-4 pb-3 border-b">
        <div className="text-lg font-bold">{settings.businessName}</div>
        <div className="text-xs">
          {[settings.address, settings.phone].filter(Boolean).join(" · ")}
          {settings.taxNumber ? ` · NTN ${settings.taxNumber}` : ""}
        </div>
        <div className="text-xs mt-1">
          Business report · {rangeLabel} ({range.from} to {range.to}) · generated{" "}
          {new Date().toLocaleString()}
        </div>
      </div>

      <Tabs defaultValue="daily">
        {/* Only the open tab's content is meaningful on paper. */}
        {/* The tab strip scrolls sideways on a phone rather than wrapping. */}
        <TabsList
          data-print="hide"
          className="max-w-full overflow-x-auto no-scrollbar justify-start"
        >
          <TabsTrigger value="daily">Daily by shop</TabsTrigger>
          <TabsTrigger value="cash">Cash & payments</TabsTrigger>
          <TabsTrigger value="sales">Trend</TabsTrigger>
          <TabsTrigger value="pl">Profit &amp; Loss</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="top">Top items</TabsTrigger>
        </TabsList>

        {/* ------------------------------------------ day x shop matrix */}
        <TabsContent value="daily" className="mt-4">
          <Card className="p-3 sm:p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <span className="font-semibold">{formatRs(matrix.grand, currency)}</span>
              <span className="text-muted-foreground">
                {" "}
                across {matrix.rows.length} days · {matrix.grandInvoices} invoices
              </span>
            </div>
            <Button variant="outline" size="sm" data-print="hide" onClick={exportMatrix}>
              <Download className="h-4 w-4 mr-1.5" />
              Export grid
            </Button>
          </Card>

          <Card className="overflow-hidden">
            {/*
              Wide by nature — one column per shop — so it scrolls inside the
              card rather than pushing the page sideways.

              The minimum width grows with the number of shops. Fixed at 560px
              it was sized for the three the demo happened to have; at ten, every
              column was squeezed to a few characters and the figures wrapped
              mid-number.
            */}
            <div className="overflow-x-auto">
              <table
                className="w-full text-sm"
                style={{ minWidth: `${260 + scopedShops.length * 110}px` }}
              >
                <thead className="bg-muted/50 sticky top-0 z-10">
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 font-medium sticky left-0 bg-muted/50">Trading day</th>
                    {scopedShops.map((s) => (
                      <th key={s.id} className="px-4 py-3 font-medium text-right whitespace-nowrap">
                        {s.name}
                      </th>
                    ))}
                    <th className="px-4 py-3 font-medium text-right">Day total</th>
                    <th className="px-4 py-3 font-medium text-right">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {matrix.rows.map((r) => (
                    <tr
                      key={r.day}
                      className={`border-t hover:bg-muted/40 ${r.total === 0 ? "text-muted-foreground" : ""}`}
                    >
                      <td className="px-4 py-3 font-medium whitespace-nowrap sticky left-0 bg-card">
                        {shortDay(r.day)}
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          {r.invoices || ""}
                        </span>
                      </td>
                      {r.perShop.map((c, i) => (
                        <td key={scopedShops[i].id} className="px-4 py-3 text-right">
                          {c.sales === 0 ? "No sales" : formatRs(c.sales, currency)}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right font-semibold">
                        {formatRs(r.total, currency)}
                      </td>
                      <td className="px-4 py-3 text-right text-success-strong">
                        {formatRs(r.profit, currency)}
                      </td>
                    </tr>
                  ))}
                  {matrix.rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={scopedShops.length + 3}
                        className="px-4 py-12 text-center text-sm text-muted-foreground"
                      >
                        No trading days in this period.
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 bg-muted/30 font-semibold">
                    <td className="px-4 py-3 sticky left-0 bg-muted/30">Total</td>
                    {matrix.columnTotals.map((c) => (
                      <td key={c.shop.id} className="px-4 py-3 text-right">
                        {formatRs(c.sales, currency)}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right">{formatRs(matrix.grand, currency)}</td>
                    <td className="px-4 py-3 text-right text-success-strong">
                      {formatRs(matrix.grandProfit, currency)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* --------------------------------------- cash & payment methods */}
        <TabsContent value="cash" className="mt-4">
          <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 mb-4">
            <MoneyTile
              icon={<Banknote className="h-5 w-5" />}
              label="Cash sales"
              value={mix.cash}
              sub={`${mix.pct(mix.cash)}% · ${mix.counts.Cash} sales`}
              currency={currency}
              tone="success"
            />
            <MoneyTile
              icon={<CreditCard className="h-5 w-5" />}
              label="Card sales"
              value={mix.card}
              sub={`${mix.pct(mix.card)}% · ${mix.counts.Card} sales`}
              currency={currency}
              tone="primary"
            />
            <MoneyTile
              icon={<Smartphone className="h-5 w-5" />}
              label="Online sales"
              value={mix.online}
              sub={`${mix.pct(mix.online)}% · ${mix.counts.Online} sales`}
              currency={currency}
              tone="accent"
            />
            <MoneyTile
              icon={<HandCoins className="h-5 w-5" />}
              label="Sold on credit"
              value={mix.credit}
              sub={`${mix.pct(mix.credit)}% · ${mix.counts.Credit} sales`}
              currency={currency}
              tone="warning"
            />
            <MoneyTile
              icon={<Wallet className="h-5 w-5" />}
              label="Owner collected"
              value={cashTotals.taken}
              sub={`${formatRs(cashTotals.left, currency)} left in shops`}
              currency={currency}
              tone="warning"
            />
          </div>

          {/* Standing debt, not period figures — kept visually separate so it is
              never mistaken for money taken during the selected range. */}
          {/*
            Both directions, side by side. Each opens the list of who is behind
            the figure — a standing balance is only useful once you can get from
            it to the names it is made of.
          */}
          <div className="grid gap-3 sm:grid-cols-2 mb-4">
            <Link to="/app/ledger" className="block rounded-xl">
              <Card className="p-4 h-full flex flex-wrap items-center justify-between gap-3 border-warning/40 bg-warning/5 transition-colors hover:bg-warning/10">
                <div>
                  <h3 className="font-semibold text-sm inline-flex items-center gap-1.5">
                    <HandCoins className="h-4 w-4 text-warning-strong" />
                    Total receivables
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Owed by customers right now, across all time — not limited to{" "}
                    {rangeLabel.toLowerCase()}.
                  </p>
                  <span className="text-xs text-primary mt-1 inline-flex items-center gap-0.5">
                    Who owes it <ArrowRight className="h-3 w-3" />
                  </span>
                </div>
                <div className="font-display text-2xl font-bold text-warning-strong tabular-nums">
                  {formatRs(owedToYou, currency)}
                </div>
              </Card>
            </Link>

            <Link to="/app/ledger" className="block rounded-xl">
              <Card className="p-4 h-full flex flex-wrap items-center justify-between gap-3 border-destructive/30 bg-destructive/5 transition-colors hover:bg-destructive/10">
                <div>
                  <h3 className="font-semibold text-sm inline-flex items-center gap-1.5">
                    <Wallet className="h-4 w-4 text-destructive" />
                    Total payables
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Still owed to suppliers on delivered stock — also all time, not{" "}
                    {rangeLabel.toLowerCase()}.
                  </p>
                  <span className="text-xs text-primary mt-1 inline-flex items-center gap-0.5">
                    Who to pay <ArrowRight className="h-3 w-3" />
                  </span>
                </div>
                <div className="font-display text-2xl font-bold text-destructive tabular-nums">
                  {formatRs(youOwe, currency)}
                </div>
              </Card>
            </Link>
          </div>

          <Card className="overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">Cash handed over, day by day</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  What each shop counted at close, what you took, and what stayed as the next day's
                  float.
                </p>
              </div>
              <Button variant="outline" size="sm" data-print="hide" onClick={exportCash}>
                <Download className="h-4 w-4 mr-1.5" />
                Export
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead className="bg-muted/50">
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Day</th>
                    <th className="px-4 py-3 font-medium">Shop</th>
                    <th className="px-4 py-3 font-medium text-right">Opening</th>
                    <th className="px-4 py-3 font-medium text-right">Cash sales</th>
                    <th className="px-4 py-3 font-medium text-right">Paid out</th>
                    <th className="px-4 py-3 font-medium text-right">Expected</th>
                    <th className="px-4 py-3 font-medium text-right">Counted</th>
                    <th className="px-4 py-3 font-medium text-right">Over / short</th>
                    <th className="px-4 py-3 font-medium text-right">Owner took</th>
                    <th className="px-4 py-3 font-medium text-right">Left behind</th>
                  </tr>
                </thead>
                <tbody>
                  {cashDays.map(({ session: s, shop, cash: c }) => (
                    <tr key={s.id} className="border-t hover:bg-muted/40">
                      <td className="px-4 py-3 whitespace-nowrap font-medium">
                        {shortDay(s.businessDate)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {shop?.name ?? "Unknown shop"}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {formatRs(c.openingCash, currency)}
                      </td>
                      <td className="px-4 py-3 text-right">{formatRs(c.cashSales, currency)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {formatRs(c.refunds + c.drawerExpenses, currency)}
                      </td>
                      <td className="px-4 py-3 text-right">{formatRs(c.expectedCash, currency)}</td>
                      <td className="px-4 py-3 text-right font-medium">
                        {c.countedCash === null ? "Not counted" : formatRs(c.countedCash, currency)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right ${!c.variance ? "text-muted-foreground" : c.variance < 0 ? "text-destructive" : "text-warning-strong"}`}
                      >
                        {!c.variance
                          ? "Balanced"
                          : `${c.variance > 0 ? "+" : "−"}${formatRs(Math.abs(c.variance), currency)}`}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {formatRs(c.cashTakenByOwner, currency)}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {formatRs(c.cashLeftInShop, currency)}
                      </td>
                    </tr>
                  ))}
                  {cashDays.length === 0 && (
                    <tr>
                      <td
                        colSpan={10}
                        className="px-4 py-12 text-center text-sm text-muted-foreground"
                      >
                        No days have been closed in this period.
                      </td>
                    </tr>
                  )}
                </tbody>
                {cashDays.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 bg-muted/30 font-semibold">
                      <td className="px-4 py-3" colSpan={8}>
                        Total collected by owner
                      </td>
                      <td className="px-4 py-3 text-right">
                        {formatRs(cashTotals.taken, currency)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {formatRs(cashTotals.left, currency)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="sales" className="mt-4">
          <Card className="p-4 sm:p-5">
            <h3 className="font-semibold mb-4">Sales &amp; profit by trading day · {rangeLabel}</h3>
            <div className="h-72">
              <ResponsiveContainer>
                <LineChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  {/* Raw ISO dates ("2026-08-10") crowded the axis into overlap. */}
                  <XAxis
                    dataKey="date"
                    stroke="var(--color-muted-foreground)"
                    fontSize={11}
                    tickFormatter={(d: string) =>
                      new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short" })
                    }
                    minTickGap={16}
                  />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-popover)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                    }}
                    formatter={(v: number) => formatRs(v)}
                    labelFormatter={(d: string) =>
                      new Date(d).toLocaleDateString(undefined, { dateStyle: "medium" })
                    }
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    name="Sales"
                    dataKey="sales"
                    stroke="var(--color-chart-1)"
                    strokeWidth={2.5}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    name="Profit"
                    dataKey="profit"
                    stroke="var(--color-chart-2)"
                    strokeWidth={2.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="pl" className="mt-4">
          <Card className="p-4 sm:p-5">
            <h3 className="font-semibold mb-4">Profit & Loss by shop</h3>
            <div className="h-72">
              <ResponsiveContainer>
                <BarChart data={perShop}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-popover)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                    }}
                    formatter={(v: number) => formatRs(v)}
                  />
                  <Legend />
                  <Bar
                    dataKey="profit"
                    name="Sales profit"
                    fill="var(--color-chart-2)"
                    radius={[6, 6, 0, 0]}
                  />
                  <Bar
                    dataKey="expenses"
                    name="Expenses"
                    fill="var(--color-chart-4)"
                    radius={[6, 6, 0, 0]}
                  />
                  <Bar
                    dataKey="net"
                    name="Net profit"
                    fill="var(--color-chart-1)"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mt-6">
              {perShop.map((s) => (
                <div key={s.name} className="border rounded-lg p-4">
                  <div className="text-xs text-muted-foreground">{s.name}</div>
                  <div className="font-semibold text-lg mt-1">{formatRs(s.net)}</div>
                  <div className="text-xs text-muted-foreground">net profit</div>
                </div>
              ))}
              <div className="border-2 border-primary rounded-lg p-4 bg-primary/5">
                <div className="text-xs text-primary font-medium">Business total</div>
                <div className="font-bold text-lg mt-1">
                  {formatRs(perShop.reduce((a, s) => a + s.net, 0))}
                </div>
                <div className="text-xs text-muted-foreground">consolidated net</div>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="inventory" className="mt-4">
          <Card className="p-4 sm:p-5">
            <h3 className="font-semibold mb-4">Inventory value (at cost)</h3>
            <div className="text-3xl font-bold mb-6">{formatRs(inventoryValue)}</div>
            <div className="grid md:grid-cols-3 gap-3">
              {scopedShops.map((s) => {
                const v = inventory
                  .filter((r) => r.shopId === s.id)
                  .reduce((a, r) => {
                    const p = products.find((pp) => pp.id === r.productId);
                    return a + (p?.cost ?? 0) * r.qty;
                  }, 0);
                return (
                  <div key={s.id} className="border rounded-lg p-4">
                    <div className="text-xs text-muted-foreground">{s.name}</div>
                    <div className="font-semibold text-lg mt-1">{formatRs(v)}</div>
                  </div>
                );
              })}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="top" className="mt-4">
          <Card className="p-4 sm:p-5">
            <h3 className="font-semibold mb-4">Top selling items</h3>
            {/* Four numeric columns don't fit a phone; on mobile each item
                becomes a stacked block instead of a squeezed row. */}
            <ul className="divide-y sm:hidden">
              {topItems.map((t) => (
                <li key={t.name} className="py-3 first:pt-0">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-sm font-medium min-w-0 break-words">{t.name}</span>
                    <span className="text-sm font-semibold shrink-0">{formatRs(t.revenue)}</span>
                  </div>
                  <div className="mt-1 flex gap-4 text-xs text-muted-foreground">
                    <span>{t.qty} sold</span>
                    <span className="text-success-strong font-medium">
                      {formatRs(t.profit)} profit
                    </span>
                  </div>
                </li>
              ))}
              {topItems.length === 0 && (
                <li className="py-6 text-center text-sm text-muted-foreground">
                  No sales in this period.
                </li>
              )}
            </ul>
            <table className="w-full text-sm hidden sm:table">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
                  <th className="py-2 font-medium">Item</th>
                  <th className="py-2 font-medium text-right">Qty</th>
                  <th className="py-2 font-medium text-right">Revenue</th>
                  <th className="py-2 font-medium text-right">Profit</th>
                </tr>
              </thead>
              <tbody>
                {topItems.map((t) => (
                  <tr key={t.name} className="border-b last:border-0">
                    <td className="py-3">{t.name}</td>
                    <td className="py-3 text-right">{t.qty}</td>
                    <td className="py-3 text-right font-medium">{formatRs(t.revenue)}</td>
                    <td className="py-3 text-right text-success-strong font-medium">
                      {formatRs(t.profit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** A headline money figure with an icon, used across the cash tab. */
function MoneyTile({
  icon,
  label,
  value,
  sub,
  currency,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub: string;
  currency: string;
  tone: "success" | "primary" | "accent" | "warning";
}) {
  const tones = {
    success: "bg-success/15 text-success-strong",
    primary: "bg-primary/10 text-primary",
    accent: "bg-accent/20 text-accent-strong",
    warning: "bg-warning/20 text-warning-strong",
  };
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <div className="min-w-0">
          <div className="text-[11px] sm:text-xs uppercase tracking-wider text-muted-foreground font-medium">
            {label}
          </div>
          <div className="font-display text-xl sm:text-2xl font-bold mt-1.5 break-words">
            {formatRs(value, currency)}
          </div>
          <div className="text-xs text-muted-foreground mt-1.5">{sub}</div>
        </div>
        <div
          className={`h-9 w-9 sm:h-10 sm:w-10 rounded-lg flex items-center justify-center shrink-0 ${tones[tone]}`}
        >
          {icon}
        </div>
      </div>
    </Card>
  );
}
