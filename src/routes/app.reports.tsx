import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useStore, formatRs } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Download, Printer } from "lucide-react";
import { downloadCsv } from "@/lib/export";
import { toast } from "sonner";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Legend } from "recharts";

export const Route = createFileRoute("/app/reports")({ component: ReportsPage });

function ReportsPage() {
  const { user, sales, expenses, shops, products, inventory } = useStore();
  const isAdmin = user?.role === "admin";

  const dailyData = useMemo(() => {
    const map = new Map<string, { date: string; sales: number; profit: number }>();
    sales.forEach((s) => {
      const d = s.date.slice(0, 10);
      const cur = map.get(d) ?? { date: d, sales: 0, profit: 0 };
      cur.sales += s.total;
      cur.profit += s.profit;
      map.set(d, cur);
    });
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [sales]);

  const perShop = shops.map((s) => {
    const ss = sales.filter((x) => x.shopId === s.id);
    const ee = expenses.filter((x) => x.shopId === s.id);
    return {
      name: s.name,
      sales: ss.reduce((a, x) => a + x.total, 0),
      profit: ss.reduce((a, x) => a + x.profit, 0),
      expenses: ee.reduce((a, x) => a + x.amount, 0),
      net: ss.reduce((a, x) => a + x.profit, 0) - ee.reduce((a, x) => a + x.amount, 0),
    };
  });

  const topItems = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number; profit: number }>();
    sales.forEach((s) => s.lines.forEach((l) => {
      const cur = map.get(l.productId) ?? { name: l.name, qty: 0, revenue: 0, profit: 0 };
      cur.qty += l.qty;
      cur.revenue += l.qty * l.price;
      cur.profit += l.qty * (l.price - l.cost);
      map.set(l.productId, cur);
    }));
    return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 7);
  }, [sales]);

  const inventoryValue = inventory.reduce((a, r) => {
    const p = products.find((pp) => pp.id === r.productId);
    return a + (p?.cost ?? 0) * r.qty;
  }, 0);

  const exportReport = () => {
    downloadCsv(
      `report-pl-by-shop-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Shop", "Sales", "Sales profit", "Expenses", "Net profit"],
      [
        ...perShop.map((s) => [s.name, s.sales, s.profit, s.expenses, s.net]),
        ["TOTAL",
          perShop.reduce((a, s) => a + s.sales, 0),
          perShop.reduce((a, s) => a + s.profit, 0),
          perShop.reduce((a, s) => a + s.expenses, 0),
          perShop.reduce((a, s) => a + s.net, 0)],
      ],
    );
    toast.success("Report exported");
  };

  // Gate after every hook has run, so signing out of this page doesn't change the hook count.
  if (!isAdmin) return <div className="text-center py-20 text-muted-foreground">Reports with profit are admin-only.</div>;

  return (
    <div>
      <PageHeader title="Reports" subtitle="Owner analytics with profit, expenses, and inventory value." actions={
        <>
          <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1.5" />Print</Button>
          <Button variant="outline" onClick={exportReport}><Download className="h-4 w-4 mr-1.5" />Export</Button>
        </>
      } />

      <Tabs defaultValue="sales">
        <TabsList>
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="pl">Profit & Loss</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="top">Top items</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="mt-4">
          <Card className="p-5">
            <h3 className="font-semibold mb-4">Daily sales & profit (last 14 days)</h3>
            <div className="h-72">
              <ResponsiveContainer>
                <LineChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  {/* Raw ISO dates ("2026-08-10") crowded the axis into overlap. */}
                  <XAxis
                    dataKey="date"
                    stroke="var(--color-muted-foreground)"
                    fontSize={11}
                    tickFormatter={(d: string) => new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                    minTickGap={16}
                  />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={11} />
                  <Tooltip
                    contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8 }}
                    formatter={(v: number) => formatRs(v)}
                    labelFormatter={(d: string) => new Date(d).toLocaleDateString(undefined, { dateStyle: "medium" })}
                  />
                  <Legend />
                  <Line type="monotone" name="Sales" dataKey="sales" stroke="var(--color-chart-1)" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" name="Profit" dataKey="profit" stroke="var(--color-chart-2)" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="pl" className="mt-4">
          <Card className="p-5">
            <h3 className="font-semibold mb-4">Profit & Loss by shop</h3>
            <div className="h-72">
              <ResponsiveContainer>
                <BarChart data={perShop}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                  <Tooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8 }} formatter={(v: number) => formatRs(v)} />
                  <Legend />
                  <Bar dataKey="profit" name="Sales profit" fill="var(--color-chart-2)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="expenses" name="Expenses" fill="var(--color-chart-4)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="net" name="Net profit" fill="var(--color-chart-1)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
              {perShop.map((s) => (
                <div key={s.name} className="border rounded-lg p-4">
                  <div className="text-xs text-muted-foreground">{s.name}</div>
                  <div className="font-semibold text-lg mt-1">{formatRs(s.net)}</div>
                  <div className="text-xs text-muted-foreground">net profit</div>
                </div>
              ))}
              <div className="border-2 border-primary rounded-lg p-4 bg-primary/5">
                <div className="text-xs text-primary font-medium">Business total</div>
                <div className="font-bold text-lg mt-1">{formatRs(perShop.reduce((a, s) => a + s.net, 0))}</div>
                <div className="text-xs text-muted-foreground">consolidated net</div>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="inventory" className="mt-4">
          <Card className="p-5">
            <h3 className="font-semibold mb-4">Inventory value (at cost)</h3>
            <div className="text-3xl font-bold mb-6">{formatRs(inventoryValue)}</div>
            <div className="grid md:grid-cols-3 gap-3">
              {shops.map((s) => {
                const v = inventory.filter((r) => r.shopId === s.id).reduce((a, r) => {
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
          <Card className="p-5">
            <h3 className="font-semibold mb-4">Top selling items</h3>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b"><th className="py-2 font-medium">Item</th><th className="py-2 font-medium text-right">Qty</th><th className="py-2 font-medium text-right">Revenue</th><th className="py-2 font-medium text-right">Profit</th></tr></thead>
              <tbody>
                {topItems.map((t) => (
                  <tr key={t.name} className="border-b last:border-0">
                    <td className="py-3">{t.name}</td>
                    <td className="py-3 text-right">{t.qty}</td>
                    <td className="py-3 text-right font-medium">{formatRs(t.revenue)}</td>
                    <td className="py-3 text-right text-success font-medium">{formatRs(t.profit)}</td>
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