import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useStore, formatRs } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { StatusPill } from "@/components/Stat";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Download, Printer, Undo2 } from "lucide-react";

export const Route = createFileRoute("/app/sales")({ component: SalesPage });

function SalesPage() {
  const { user, sales, shops } = useStore();
  const isAdmin = user?.role === "admin";
  const [shopFilter, setShopFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo(() => {
    return sales
      .filter((s) => (isAdmin ? true : s.shopId === user?.shopId))
      .filter((s) => (shopFilter === "all" ? true : s.shopId === shopFilter))
      .filter((s) =>
        q
          ? s.invoice.toLowerCase().includes(q.toLowerCase()) ||
            s.customer.toLowerCase().includes(q.toLowerCase())
          : true,
      );
  }, [sales, isAdmin, user?.shopId, shopFilter, q]);

  const selected = open ? sales.find((s) => s.id === open) : null;

  return (
    <div>
      <PageHeader
        title="Sales"
        subtitle={isAdmin ? "Every invoice across every shop." : "Your shop's invoices."}
        actions={
          <Button variant="outline"><Download className="h-4 w-4 mr-1.5" />Export CSV</Button>
        }
      />

      <Card className="p-4 mb-4 flex flex-wrap gap-3 items-center">
        <Input placeholder="Search invoice or customer…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        {isAdmin && (
          <Select value={shopFilter} onValueChange={setShopFilter}>
            <SelectTrigger className="w-48"><SelectValue placeholder="All shops" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All shops</SelectItem>
              {shops.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <div className="text-xs text-muted-foreground ml-auto">{rows.length} invoices</div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-medium">Invoice</th>
                <th className="px-4 py-3 font-medium">Date</th>
                {isAdmin && <th className="px-4 py-3 font-medium">Shop</th>}
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium text-right">Items</th>
                <th className="px-4 py-3 font-medium text-right">Total</th>
                {isAdmin && <th className="px-4 py-3 font-medium text-right">Profit</th>}
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Sync</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-t hover:bg-muted/40 cursor-pointer" onClick={() => setOpen(s.id)}>
                  <td className="px-4 py-3 font-mono text-xs">{s.invoice}</td>
                  <td className="px-4 py-3">{new Date(s.date).toLocaleDateString()}</td>
                  {isAdmin && <td className="px-4 py-3">{shops.find((sh) => sh.id === s.shopId)?.name}</td>}
                  <td className="px-4 py-3">{s.customer}</td>
                  <td className="px-4 py-3 text-right">{s.lines.reduce((a, l) => a + l.qty, 0)}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatRs(s.total)}</td>
                  {isAdmin && <td className="px-4 py-3 text-right text-success font-medium">{formatRs(s.profit)}</td>}
                  <td className="px-4 py-3"><StatusPill status={s.status} /></td>
                  <td className="px-4 py-3"><StatusPill status={s.synced ? "Synced" : "Pending"} /></td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-sm text-muted-foreground">No sales match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="font-mono text-base">{selected.invoice}</SheetTitle>
                <SheetDescription>
                  {new Date(selected.date).toLocaleString()} · {shops.find((s) => s.id === selected.shopId)?.name}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><div className="text-muted-foreground text-xs">Customer</div><div className="font-medium">{selected.customer}</div></div>
                  <div><div className="text-muted-foreground text-xs">Cashier</div><div className="font-medium">{selected.cashier}</div></div>
                  <div><div className="text-muted-foreground text-xs">Payment</div><div className="font-medium">{selected.payment}</div></div>
                  <div><div className="text-muted-foreground text-xs">Status</div><StatusPill status={selected.status} /></div>
                </div>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs uppercase">
                      <tr><th className="px-3 py-2 text-left font-medium">Item</th><th className="px-3 py-2 text-right font-medium">Qty</th><th className="px-3 py-2 text-right font-medium">Price</th>{isAdmin && <th className="px-3 py-2 text-right font-medium">Profit</th>}</tr>
                    </thead>
                    <tbody>
                      {selected.lines.map((l, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-3 py-2">{l.name}</td>
                          <td className="px-3 py-2 text-right">{l.qty}</td>
                          <td className="px-3 py-2 text-right">{formatRs(l.price)}</td>
                          {isAdmin && <td className="px-3 py-2 text-right text-success">{formatRs(l.qty * (l.price - l.cost))}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatRs(selected.subtotal)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>− {formatRs(selected.discount)}</span></div>
                  <div className="flex justify-between font-semibold text-base pt-2 border-t"><span>Total</span><span>{formatRs(selected.total)}</span></div>
                  {isAdmin && <div className="flex justify-between text-success"><span>Profit</span><span>{formatRs(selected.profit)}</span></div>}
                </div>
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" className="flex-1"><Printer className="h-4 w-4 mr-1.5" />Print</Button>
                  <Button variant="outline" className="flex-1"><Undo2 className="h-4 w-4 mr-1.5" />Return</Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}