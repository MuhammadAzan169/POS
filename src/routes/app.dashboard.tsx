import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  useStore,
  formatRs,
  businessDayOf,
  openSessionFor,
  paymentMix,
  totalOutstanding,
  totalPayable,
  customerBalance,
  summarizeSession,
  shopKind,
  shortDay,
  daysInRange,
  clampRangeToData,
  dayOf,
} from "@/lib/store";
import { useScope, inRange } from "@/lib/scope";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/AppLayout";
import { ScopeBar, DeltaBadge } from "@/components/ScopeBar";
import { StatCard, StatusPill } from "@/components/Stat";
import { MobileCards, ListCard, TableWrap } from "@/components/DataList";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ShoppingBag,
  TrendingUp,
  Receipt,
  Wallet,
  Wallet2,
  AlertTriangle,
  Plus,
  BarChart3,
  Banknote,
  CreditCard,
  Smartphone,
  Sunrise,
  Moon,
  ArrowRight,
  HandCoins,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
} from "recharts";

export const Route = createFileRoute("/app/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const {
    user, sales, expenses, shops, products, inventory, daySessions, customers, customerPayments,
    suppliers, purchases, supplierPayments, returns, setOffs, settings,
  } = useStore();
  const { range, previous, rangeLabel, shopScope, isAllTime } = useScope();

  // No early return before the hooks below — signing out flips `user` to null and
  // a conditional return here would change the hook count mid-render.
  const isAdmin = user?.role === "admin";
  const currency = settings.currency;

  /**
   * Which shops this dashboard is counting. A shopkeeper is pinned to their own;
   * an owner follows the scope bar.
   */
  const scopedShopIds = useMemo(() => {
    if (!isAdmin) return user?.shopId ? [user.shopId] : [];
    return shopScope === "all" ? shops.map((s) => s.id) : [shopScope];
  }, [isAdmin, user?.shopId, shopScope, shops]);

  const inScope = useMemo(() => new Set(scopedShopIds), [scopedShopIds]);

  /**
   * Sales are bucketed by TRADING day, not by timestamp — so a sale rung up at
   * 01:30 counts towards the day the shop opened, which is what the shopkeeper
   * handed the cash over for.
   */
  const periodSales = useMemo(
    () => sales.filter((s) => inScope.has(s.shopId) && inRange(businessDayOf(s), range)),
    [sales, inScope, range],
  );
  const priorSales = useMemo(
    () => sales.filter((s) => inScope.has(s.shopId) && inRange(businessDayOf(s), previous)),
    [sales, inScope, previous],
  );

  const periodExpenses = useMemo(
    () => expenses.filter((e) => inScope.has(e.shopId) && inRange(dayOf(e.date), range)),
    [expenses, inScope, range],
  );
  const priorExpenses = useMemo(
    () => expenses.filter((e) => inScope.has(e.shopId) && inRange(dayOf(e.date), previous)),
    [expenses, inScope, previous],
  );

  const sum = (rows: { total: number }[]) => rows.reduce((a, s) => a + s.total, 0);
  const sumProfit = (rows: { profit: number }[]) => rows.reduce((a, s) => a + s.profit, 0);
  const sumAmount = (rows: { amount: number }[]) => rows.reduce((a, e) => a + e.amount, 0);

  const totals = useMemo(() => {
    const live = periodSales.filter((s) => s.status !== "Returned");
    return {
      sales: sum(live),
      profit: sumProfit(live),
      expenses: sumAmount(periodExpenses),
      items: live.reduce((a, s) => a + s.lines.reduce((b, l) => b + l.qty, 0), 0),
      invoices: live.length,
    };
  }, [periodSales, periodExpenses]);

  const prior = useMemo(() => {
    const live = priorSales.filter((s) => s.status !== "Returned");
    return {
      sales: sum(live),
      profit: sumProfit(live),
      expenses: sumAmount(priorExpenses),
      items: live.reduce((a, s) => a + s.lines.reduce((b, l) => b + l.qty, 0), 0),
    };
  }, [priorSales, priorExpenses]);

  const mix = useMemo(() => paymentMix(periodSales), [periodSales]);

  /** Standing debt in both directions — deliberately not date-filtered. */
  const ledger = useMemo(
    () => ({ sales, customerPayments, purchases, supplierPayments, returns, setOffs }),
    [sales, customerPayments, purchases, supplierPayments, returns, setOffs],
  );
  const owedToYou = useMemo(() => totalOutstanding(customers, ledger), [customers, ledger]);
  // The other direction, which the dashboard never showed: money owed OUT is
  // just as much a claim on the till as money owed in, and a cash position that
  // counts only one of them reads better than the business actually is.
  const youOwe = useMemo(() => totalPayable(suppliers, ledger), [suppliers, ledger]);
  const owingCustomers = useMemo(
    () => customers.filter((c) => customerBalance(c, ledger).outstanding > 0).length,
    [customers, ledger],
  );

  /** Sales and profit per trading day, for the trend chart. */
  const daily = useMemo(() => {
    // Clamped to the days that hold data, so "All time" charts the real history
    // rather than thousands of empty days back to the year 2000.
    const live = periodSales.filter((s) => s.status !== "Returned");
    const bounds = clampRangeToData(range, live.map(businessDayOf));
    const days = daysInRange(bounds.from, bounds.to);
    const byDay = new Map<string, { sales: number; profit: number }>();
    periodSales
      .filter((s) => s.status !== "Returned")
      .forEach((s) => {
        const d = businessDayOf(s);
        const cur = byDay.get(d) ?? { sales: 0, profit: 0 };
        cur.sales += s.total;
        cur.profit += s.profit;
        byDay.set(d, cur);
      });
    // Every day in the range gets a point, so a closed day reads as a real zero
    // rather than the line simply skipping over it.
    return days.map((d) => ({ day: d, label: shortDay(d), ...(byDay.get(d) ?? { sales: 0, profit: 0 }) }));
  }, [periodSales, range]);

  /** Per-shop totals for the period. Owners only — a shopkeeper has one shop. */
  const perShop = useMemo(
    () =>
      shops
        .filter((s) => inScope.has(s.id))
        .map((s) => {
          const ss = periodSales.filter((x) => x.shopId === s.id && x.status !== "Returned");
          return {
            id: s.id,
            name: s.name,
            kind: shopKind(s),
            sales: sum(ss),
            profit: sumProfit(ss),
            invoices: ss.length,
          };
        })
        .sort((a, b) => b.sales - a.sales),
    [shops, inScope, periodSales],
  );

  /** Which shops are trading right now, and what each has taken today. */
  const dayStatus = useMemo(
    () =>
      shops
        .filter((s) => inScope.has(s.id))
        .map((s) => {
          const session = openSessionFor(daySessions, s.id);
          return {
            shop: s,
            session,
            cash: session
              ? summarizeSession(session, {
                  sales, expenses, returns: [], customerPayments, supplierPayments, purchases,
                })
              : null,
          };
        }),
    [shops, inScope, daySessions, sales, expenses, customerPayments],
  );

  const lowStock = useMemo(() => {
    return inventory
      .filter((row) => {
        if (!inScope.has(row.shopId)) return false;
        const p = products.find((pp) => pp.id === row.productId);
        return p && row.qty <= p.lowAlert;
      })
      .slice(0, 6)
      .map((row) => ({
        ...row,
        product: products.find((p) => p.id === row.productId),
        shop: shops.find((s) => s.id === row.shopId),
      }))
      .filter((row): row is typeof row & { product: NonNullable<typeof row.product>; shop: NonNullable<typeof row.shop> } =>
        Boolean(row.product && row.shop),
      );
  }, [inventory, products, shops, inScope]);

  const recent = useMemo(
    () => [...periodSales].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5),
    [periodSales],
  );

  if (!user) return null;

  // "vs previous 7 days" only means something for a bounded period.
  const vs = isAllTime ? undefined : "vs previous";

  return (
    <div>
      <PageHeader
        title={isAdmin ? "Owner dashboard" : "My dashboard"}
        subtitle={
          isAdmin
            ? `${rangeLabel} · ${shopScope === "all" ? "all shops" : shops.find((s) => s.id === shopScope)?.name ?? "shop"}`
            : `${rangeLabel} at ${shops.find((s) => s.id === user.shopId)?.name ?? "your shop"}`
        }
        actions={
          isAdmin ? (
            <>
              <Button variant="outline" asChild>
                <Link to="/app/reports"><BarChart3 className="h-4 w-4 mr-1.5" />Reports</Link>
              </Button>
              <Button asChild>
                <Link to="/app/purchases"><Plus className="h-4 w-4 mr-1.5" />New purchase</Link>
              </Button>
            </>
          ) : (
            <Button asChild>
              <Link to="/app/pos"><Plus className="h-4 w-4 mr-1.5" />New sale</Link>
            </Button>
          )
        }
      />

      <ScopeBar />

      {/* --------------------------------------------- live trading status */}
      {/*
        Column count follows the number of shops rather than being fixed at 3.
        With four outlets a 3-wide grid dropped the fourth onto a row of its own,
        a third as wide as the card above it with two empty columns beside it.
      */}
      <div
        className={cn(
          "grid gap-3 sm:gap-4 mb-4 sm:grid-cols-2",
          dayStatus.length === 3 && "lg:grid-cols-3",
          dayStatus.length >= 4 && "lg:grid-cols-3 xl:grid-cols-4",
        )}
      >
        {dayStatus.map(({ shop, session, cash }) => (
          <Card
            key={shop.id}
            className={`p-4 ${session ? "border-success/40 bg-success/5" : "border-muted"}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium truncate">
                  {session ? (
                    <Sunrise className="h-4 w-4 shrink-0 text-success-strong" />
                  ) : (
                    <Moon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate">{shop.name}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {session
                    ? `Trading · day of ${shortDay(session.businessDate)}`
                    : "Closed — no day started"}
                </div>
              </div>
              {session && cash && (
                <div className="text-right shrink-0">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Today</div>
                  <div className="font-semibold">{formatRs(cash.totalSales, currency)}</div>
                </div>
              )}
            </div>
            {session && cash && (
              <div className="mt-3 pt-3 border-t flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  Drawer {formatRs(cash.expectedCash, currency)}
                </span>
                <Link to="/app/daybook" className="text-primary hover:underline inline-flex items-center gap-0.5">
                  Day book <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            )}
            {!session && (
              <div className="mt-3 pt-3 border-t text-xs">
                <Link to="/app/daybook" className="text-primary hover:underline inline-flex items-center gap-0.5">
                  Start the day <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* --------------------------------------------------- headline stats */}
      <div className={isAdmin ? "grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4 xl:grid-cols-5" : "grid gap-3 sm:gap-4 grid-cols-2"}>
        <StatCard
          label="Total sales"
          value={formatRs(totals.sales, currency)}
          sub={<span className="inline-flex items-center gap-1.5">{totals.invoices} invoices <DeltaBadge current={totals.sales} prior={prior.sales} label={vs} /></span>}
          icon={<ShoppingBag className="h-5 w-5" />}
          tone="primary"
        />
        {isAdmin && (
          <StatCard
            label="Total profit"
            value={formatRs(totals.profit, currency)}
            sub={<DeltaBadge current={totals.profit} prior={prior.profit} label={vs} />}
            icon={<TrendingUp className="h-5 w-5" />}
            tone="success"
          />
        )}
        <StatCard
          label="Items sold"
          value={totals.items.toLocaleString()}
          sub={<DeltaBadge current={totals.items} prior={prior.items} label={vs} />}
          icon={<Receipt className="h-5 w-5" />}
        />
        {isAdmin && (
          <StatCard
            label="Expenses"
            value={formatRs(totals.expenses, currency)}
            sub={<DeltaBadge current={totals.expenses} prior={prior.expenses} label={vs} />}
            icon={<Wallet className="h-5 w-5" />}
            tone="warning"
          />
        )}
        {isAdmin && (
          <StatCard
            label="Net profit"
            value={formatRs(totals.profit - totals.expenses, currency)}
            sub="sales profit − expenses"
            icon={<Wallet2 className="h-5 w-5" />}
            tone="accent"
          />
        )}
      </div>

      {/* Owed money is not period-scoped: it's a standing balance, so it sits
          apart from the range-filtered figures above rather than inside them. */}
      {isAdmin && owedToYou > 0 && (
        <Card className="mt-4 p-4 flex flex-wrap items-center justify-between gap-3 border-warning/40 bg-warning/5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-warning/20 text-warning-strong flex items-center justify-center shrink-0">
              <HandCoins className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-medium">Owed to you on account</div>
              <div className="text-xs text-muted-foreground">
                {owingCustomers} customer{owingCustomers === 1 ? "" : "s"} · not counted in cash
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="font-display text-2xl font-bold text-warning-strong">
              {formatRs(owedToYou, currency)}
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/app/customers">Collect <ArrowRight className="h-3.5 w-3.5 ml-1" /></Link>
            </Button>
          </div>
        </Card>
      )}

      {/* The mirror image, and the one that used to be invisible: stock taken
          on account is money already spent, it just has not left yet. */}
      {isAdmin && youOwe > 0 && (
        <Card className="mt-4 p-4 flex flex-wrap items-center justify-between gap-3 border-destructive/30 bg-destructive/5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-destructive/15 text-destructive flex items-center justify-center shrink-0">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-medium">Owed by you to suppliers</div>
              <div className="text-xs text-muted-foreground">
                stock already delivered · not yet paid for
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="font-display text-2xl font-bold text-destructive">
              {formatRs(youOwe, currency)}
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/app/ledger">Ledgers <ArrowRight className="h-3.5 w-3.5 ml-1" /></Link>
            </Button>
          </div>
        </Card>
      )}

      {/* ------------------------------------------------ how customers paid */}
      <Card className="mt-4 sm:mt-6 p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">How customers paid</h3>
          <span className="text-xs text-muted-foreground">{rangeLabel}</span>
        </div>
        {mix.total === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">No sales in this period.</div>
        ) : (
          <>
            {/* A single stacked bar reads the split faster than three numbers. */}
            <div className="flex h-3 rounded-full overflow-hidden bg-muted mb-4">
              <div className="bg-[var(--color-chart-1)]" style={{ width: `${mix.pct(mix.cash)}%` }} />
              <div className="bg-[var(--color-chart-2)]" style={{ width: `${mix.pct(mix.card)}%` }} />
              <div className="bg-[var(--color-chart-3)]" style={{ width: `${mix.pct(mix.online)}%` }} />
              <div className="bg-[var(--color-chart-4)]" style={{ width: `${mix.pct(mix.credit)}%` }} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <PayTile icon={<Banknote className="h-4 w-4" />} label="Cash" value={mix.cash} pct={mix.pct(mix.cash)} count={mix.counts.Cash} currency={currency} />
              <PayTile icon={<CreditCard className="h-4 w-4" />} label="Card" value={mix.card} pct={mix.pct(mix.card)} count={mix.counts.Card} currency={currency} />
              <PayTile icon={<Smartphone className="h-4 w-4" />} label="Online" value={mix.online} pct={mix.pct(mix.online)} count={mix.counts.Online} currency={currency} />
              <PayTile icon={<HandCoins className="h-4 w-4" />} label="On credit" value={mix.credit} pct={mix.pct(mix.credit)} count={mix.counts.Credit} currency={currency} />
            </div>
          </>
        )}
      </Card>

      {/* -------------------------------------------------------- charts */}
      <div className="grid gap-4 mt-4 sm:mt-6 lg:grid-cols-3">
        <Card className="p-4 sm:p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Sales by day</h3>
            <span className="text-xs text-muted-foreground">{rangeLabel}</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={daily} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="label" stroke="var(--color-muted-foreground)" fontSize={11} minTickGap={16} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={11} />
                <Tooltip
                  contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8 }}
                  formatter={(v: number) => formatRs(v, currency)}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="sales" name="Sales" stroke="var(--color-chart-1)" strokeWidth={2} dot={false} />
                {isAdmin && <Line type="monotone" dataKey="profit" name="Profit" stroke="var(--color-chart-2)" strokeWidth={2} dot={false} />}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warning-strong" /> Low stock</h3>
            <Link to="/app/inventory" className="text-xs text-primary hover:underline">View all</Link>
          </div>
          {lowStock.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">All stock levels healthy.</div>
          ) : (
            <div className="space-y-3">
              {lowStock.map((row) => (
                <div key={`${row.productId}-${row.shopId}`} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{row.product.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{row.shop.name}</div>
                  </div>
                  <StatusPill status={row.qty === 0 ? "OUT" : "LOW"} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* --------------------------------------------- per-shop comparison */}
      {isAdmin && perShop.length > 1 && (
        <Card className="mt-4 sm:mt-6 p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Per-shop performance</h3>
            <span className="text-xs text-muted-foreground">{rangeLabel}</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={perShop} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={11} />
                <Tooltip
                  contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8 }}
                  formatter={(v: number) => formatRs(v, currency)}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="sales" name="Sales" fill="var(--color-chart-1)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="profit" name="Profit" fill="var(--color-chart-2)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* ------------------------------------------------- recent activity */}
      <Card className="mt-4 sm:mt-6 p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Recent activity</h3>
          <Link to="/app/sales" className="text-xs text-primary hover:underline">All sales →</Link>
        </div>
        {/* -mx-4 lets the cards run to the card's own edges, matching the table. */}
        <div className="-mx-4 -mb-4 border-t md:hidden">
          <MobileCards
            items={recent}
            keyOf={(s) => s.id}
            empty="No sales in this period."
            render={(s) => (
              <ListCard
                title={<span className="font-mono">{s.invoice}</span>}
                subtitle={shops.find((sh) => sh.id === s.shopId)?.name}
                right={formatRs(s.total, currency)}
                rightSub={isAdmin ? <span className="text-success-strong">{formatRs(s.profit, currency)} profit</span> : undefined}
                badges={<StatusPill status={s.status} />}
                fields={[
                  { label: "Customer", value: s.customer },
                  { label: "Payment", value: s.payment },
                  { label: "Trading day", value: shortDay(businessDayOf(s)) },
                ]}
              />
            )}
          />
        </div>
        <TableWrap className="-mx-5 px-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
                <th className="px-5 py-2 font-medium">Invoice</th>
                <th className="px-5 py-2 font-medium">Trading day</th>
                <th className="px-5 py-2 font-medium">Shop</th>
                <th className="px-5 py-2 font-medium">Customer</th>
                <th className="px-5 py-2 font-medium">Paid by</th>
                <th className="px-5 py-2 font-medium text-right">Total</th>
                {isAdmin && <th className="px-5 py-2 font-medium text-right">Profit</th>}
                <th className="px-5 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((s) => (
                <tr key={s.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-5 py-3 font-mono text-xs">{s.invoice}</td>
                  <td className="px-5 py-3 whitespace-nowrap">{shortDay(businessDayOf(s))}</td>
                  <td className="px-5 py-3">{shops.find((sh) => sh.id === s.shopId)?.name}</td>
                  <td className="px-5 py-3">{s.customer}</td>
                  <td className="px-5 py-3">{s.payment}</td>
                  <td className="px-5 py-3 text-right font-medium">{formatRs(s.total, currency)}</td>
                  {isAdmin && <td className="px-5 py-3 text-right text-success-strong font-medium">{formatRs(s.profit, currency)}</td>}
                  <td className="px-5 py-3"><StatusPill status={s.status} /></td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr><td colSpan={isAdmin ? 8 : 7} className="px-5 py-10 text-center text-sm text-muted-foreground">No sales in this period.</td></tr>
              )}
            </tbody>
          </table>
        </TableWrap>
      </Card>
    </div>
  );
}

/** One payment method in the mix breakdown. */
function PayTile({
  icon,
  label,
  value,
  pct,
  count,
  currency,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  pct: number;
  count: number;
  currency: string;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="font-semibold mt-1 break-words">{formatRs(value, currency)}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{pct}% · {count} sale{count === 1 ? "" : "s"}</div>
    </div>
  );
}
