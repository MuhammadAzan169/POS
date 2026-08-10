import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useStore, formatRs } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
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
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/app/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { user, sales, expenses, shops, products, inventory } = useStore();
  // No early return before the hooks below — signing out flips `user` to null and
  // a conditional return here would change the hook count mid-render.
  const isAdmin = user?.role === "admin";

  const filteredSales = useMemo(
    () => (isAdmin ? sales : sales.filter((s) => s.shopId === user?.shopId)),
    [sales, isAdmin, user?.shopId],
  );
  const filteredExp = useMemo(
    () => (isAdmin ? expenses : expenses.filter((e) => e.shopId === user?.shopId)),
    [expenses, isAdmin, user?.shopId],
  );

  const totals = useMemo(() => {
    const sumSales = filteredSales.reduce((a, s) => a + s.total, 0);
    const sumProfit = filteredSales.reduce((a, s) => a + s.profit, 0);
    const sumExp = filteredExp.reduce((a, e) => a + e.amount, 0);
    const items = filteredSales.reduce((a, s) => a + s.lines.reduce((b, l) => b + l.qty, 0), 0);
    return { sumSales, sumProfit, sumExp, items, invoices: filteredSales.length };
  }, [filteredSales, filteredExp]);

  const perShop = useMemo(() => {
    return shops.map((s) => {
      const ss = sales.filter((x) => x.shopId === s.id);
      return {
        name: s.name,
        sales: ss.reduce((a, x) => a + x.total, 0),
        profit: ss.reduce((a, x) => a + x.profit, 0),
        invoices: ss.length,
      };
    });
  }, [shops, sales]);

  const lowStock = useMemo(() => {
    const rows = inventory
      .filter((row) => {
        if (!isAdmin && row.shopId !== user?.shopId) return false;
        const p = products.find((pp) => pp.id === row.productId);
        return p && row.qty <= p.lowAlert;
      })
      .slice(0, 6);
    return rows
      .map((row) => ({
        ...row,
        product: products.find((p) => p.id === row.productId),
        shop: shops.find((s) => s.id === row.shopId),
      }))
      .filter((row): row is typeof row & { product: NonNullable<typeof row.product>; shop: NonNullable<typeof row.shop> } =>
        Boolean(row.product && row.shop),
      );
  }, [inventory, products, shops, isAdmin, user?.shopId]);

  const recent = filteredSales.slice(0, 5);

  if (!user) return null;

  return (
    <div>
      <PageHeader
        title={isAdmin ? "Owner dashboard" : "My dashboard"}
        subtitle={isAdmin ? "Live snapshot across all shops." : `Today at ${shops.find((s) => s.id === user.shopId)?.name ?? "your shop"}.`}
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

      {/* Shop users only get 2 of these 5 cards — a fixed 5-column grid left them
          squeezed into a third of the row with dead space beside them. */}
      <div className={isAdmin ? "grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4 xl:grid-cols-5" : "grid gap-3 sm:gap-4 grid-cols-2"}>
        <StatCard label="Total sales" value={formatRs(totals.sumSales)} sub={`${totals.invoices} invoices`} icon={<ShoppingBag className="h-5 w-5" />} tone="primary" />
        {isAdmin && (
          <StatCard label="Total profit" value={formatRs(totals.sumProfit)} sub="across all shops" icon={<TrendingUp className="h-5 w-5" />} tone="success" />
        )}
        <StatCard label="Items sold" value={totals.items.toLocaleString()} icon={<Receipt className="h-5 w-5" />} />
        {isAdmin && (
          <StatCard label="Expenses" value={formatRs(totals.sumExp)} icon={<Wallet className="h-5 w-5" />} tone="warning" />
        )}
        {isAdmin && (
          <StatCard label="Net profit" value={formatRs(totals.sumProfit - totals.sumExp)} sub="sales profit − expenses" icon={<Wallet2 className="h-5 w-5" />} tone="accent" />
        )}
      </div>

      <div className="grid gap-4 mt-6 lg:grid-cols-3">
        {isAdmin && (
          <Card className="p-5 lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Per-shop performance</h3>
              <span className="text-xs text-muted-foreground">Last 14 days</span>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={perShop} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                  <Tooltip
                    contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8 }}
                    formatter={(v: number) => formatRs(v)}
                  />
                  <Bar dataKey="sales" name="Sales" fill="var(--color-chart-1)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="profit" name="Profit" fill="var(--color-chart-2)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        <Card className={isAdmin ? "p-5" : "p-5 lg:col-span-3"}>
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

      <Card className="mt-6 p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Recent activity</h3>
          <Link to="/app/sales" className="text-xs text-primary hover:underline">All sales →</Link>
        </div>
        {/* -mx-4 lets the cards run to the card's own edges, matching the table. */}
        <div className="-mx-4 -mb-4 border-t md:hidden">
          <MobileCards
            items={recent}
            keyOf={(s) => s.id}
            empty="No sales recorded yet."
            render={(s) => (
              <ListCard
                title={<span className="font-mono">{s.invoice}</span>}
                subtitle={shops.find((sh) => sh.id === s.shopId)?.name}
                right={formatRs(s.total)}
                rightSub={isAdmin ? <span className="text-success-strong">{formatRs(s.profit)} profit</span> : undefined}
                badges={<StatusPill status={s.status} />}
                fields={[{ label: "Customer", value: s.customer }]}
              />
            )}
          />
        </div>
        <TableWrap className="-mx-5 px-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
                <th className="px-5 py-2 font-medium">Invoice</th>
                <th className="px-5 py-2 font-medium">Shop</th>
                <th className="px-5 py-2 font-medium">Customer</th>
                <th className="px-5 py-2 font-medium text-right">Total</th>
                {isAdmin && <th className="px-5 py-2 font-medium text-right">Profit</th>}
                <th className="px-5 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((s) => (
                <tr key={s.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-5 py-3 font-mono text-xs">{s.invoice}</td>
                  <td className="px-5 py-3">{shops.find((sh) => sh.id === s.shopId)?.name}</td>
                  <td className="px-5 py-3">{s.customer}</td>
                  <td className="px-5 py-3 text-right font-medium">{formatRs(s.total)}</td>
                  {isAdmin && <td className="px-5 py-3 text-right text-success-strong font-medium">{formatRs(s.profit)}</td>}
                  <td className="px-5 py-3"><StatusPill status={s.status} /></td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr><td colSpan={isAdmin ? 6 : 5} className="px-5 py-10 text-center text-sm text-muted-foreground">No sales recorded yet.</td></tr>
              )}
            </tbody>
          </table>
        </TableWrap>
      </Card>
    </div>
  );
}