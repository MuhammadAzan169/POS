import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useStore, formatRs, todayISO, daysAgoISO, dayOf, type Sale } from "@/lib/store";
import { SaleEditDialog } from "@/components/SaleEditDialog";
import { PageHeader } from "@/components/AppLayout";
import { StatusPill } from "@/components/Stat";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Download, Printer, Undo2, Pencil, Trash2, RotateCcw } from "lucide-react";
import { downloadCsv } from "@/lib/export";
import { Confirm } from "@/components/Confirm";
import { toast } from "sonner";

/** Quick day/range shortcuts for the sales date filter. */
const DATE_PRESETS = [
  { label: "Today", range: () => ({ from: todayISO(), to: todayISO() }) },
  { label: "Yesterday", range: () => ({ from: daysAgoISO(1), to: daysAgoISO(1) }) },
  { label: "Last 7 days", range: () => ({ from: daysAgoISO(6), to: todayISO() }) },
  { label: "Last 30 days", range: () => ({ from: daysAgoISO(29), to: todayISO() }) },
  { label: "This month", range: () => { const d = new Date(); return { from: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`, to: todayISO() }; } },
];

export const Route = createFileRoute("/app/sales")({
  // Optional, so plain <Link to="/app/sales"> keeps working without a search prop.
  validateSearch: (search: Record<string, unknown>): { q?: string } =>
    typeof search.q === "string" && search.q ? { q: search.q } : {},
  component: SalesPage,
});

function SalesPage() {
  const { user, sales, shops, addReturn, deleteSale, settings } = useStore();
  const navigate = useNavigate();
  const { q: searchParam } = Route.useSearch();
  const isAdmin = user?.role === "admin";
  const [shopFilter, setShopFilter] = useState<string>("all");
  const [q, setQ] = useState(searchParam ?? "");
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<Sale | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // Arriving from the header search (or a second search while already here)
  // should refill the filter box.
  // The ?? "" keeps the <Input> controlled when the param is absent.
  useEffect(() => { setQ(searchParam ?? ""); }, [searchParam]);

  const rows = useMemo(() => {
    return sales
      .filter((s) => (isAdmin ? true : s.shopId === user?.shopId))
      .filter((s) => (shopFilter === "all" ? true : s.shopId === shopFilter))
      // Date filters compare on the YYYY-MM-DD part, so a single day works by
      // setting from and to the same date.
      .filter((s) => (from ? dayOf(s.date) >= from : true))
      .filter((s) => (to ? dayOf(s.date) <= to : true))
      .filter((s) =>
        q
          ? s.invoice.toLowerCase().includes(q.toLowerCase()) ||
            s.customer.toLowerCase().includes(q.toLowerCase())
          : true,
      );
  }, [sales, isAdmin, user?.shopId, shopFilter, q, from, to]);

  const selected = open ? sales.find((s) => s.id === open) : null;

  const exportCsv = () => {
    if (rows.length === 0) { toast.error("Nothing to export"); return; }
    downloadCsv(
      `sales-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Invoice", "Date", "Shop", "Customer", "Items", "Total", ...(isAdmin ? ["Profit"] : []), "Status", "Sync"],
      rows.map((s) => [
        s.invoice,
        new Date(s.date).toLocaleDateString(),
        shops.find((sh) => sh.id === s.shopId)?.name ?? "",
        s.customer,
        s.lines.reduce((a, l) => a + l.qty, 0),
        s.total,
        ...(isAdmin ? [s.profit] : []),
        s.status,
        s.synced ? "Synced" : "Pending",
      ]),
    );
    toast.success(`Exported ${rows.length} invoices`);
  };

  const processReturn = (sale: Sale) => {
    addReturn({
      kind: "customer",
      date: todayISO(),
      shopId: sale.shopId,
      invoice: sale.invoice,
      items: sale.lines.map((l) => ({ productId: l.productId, name: l.name, qty: l.qty })),
      refund: sale.total,
      reason: "Customer return",
    });
    toast.success(`Return created for ${sale.invoice}`);
    setOpen(null);
    navigate({ to: "/app/returns" });
  };

  return (
    <div>
      <PageHeader
        title="Sales"
        subtitle={isAdmin ? "Every invoice across every shop." : "Your shop's invoices."}
        actions={
          <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-1.5" />Export CSV</Button>
        }
      />

      <Card className="p-4 mb-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1.5">
            <Label className="text-xs">Search</Label>
            <Input placeholder="Invoice or customer…" value={q} onChange={(e) => setQ(e.target.value)} className="w-full sm:w-56" />
          </div>
          {isAdmin && (
            <div className="space-y-1.5">
              <Label className="text-xs">Shop</Label>
              <Select value={shopFilter} onValueChange={setShopFilter}>
                <SelectTrigger className="w-44"><SelectValue placeholder="All shops" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All shops</SelectItem>
                  {shops.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </div>
          {(q || from || to || shopFilter !== "all") && (
            <Button variant="ghost" size="sm" onClick={() => { setQ(""); setFrom(""); setTo(""); setShopFilter("all"); }}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />Clear
            </Button>
          )}
          <div className="text-xs text-muted-foreground ml-auto">
            {rows.length} invoices · {formatRs(rows.reduce((a, s) => a + s.total, 0), settings.currency)}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {DATE_PRESETS.map((p) => {
            const range = p.range();
            const active = from === range.from && to === range.to;
            return (
              <button
                key={p.label}
                onClick={() => { setFrom(range.from); setTo(range.to); }}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  active ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0 z-10">
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
                <th className="px-4 py-3 font-medium text-right">Actions</th>
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
                  {isAdmin && <td className="px-4 py-3 text-right text-success-strong font-medium">{formatRs(s.profit)}</td>}
                  <td className="px-4 py-3"><StatusPill status={s.status} /></td>
                  <td className="px-4 py-3"><StatusPill status={s.synced ? "Synced" : "Pending"} /></td>
                  {/* stopPropagation so acting on a row doesn't also open the detail sheet. */}
                  <td className="px-4 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(s)} disabled={s.status === "Returned"}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Confirm
                      title={`Delete ${s.invoice}?`}
                      description={
                        <>
                          The invoice is removed from all sales figures{s.status === "Returned" ? "" : " and its items go back into stock"}.
                          This can't be undone.
                        </>
                      }
                      confirmLabel="Delete sale"
                      destructive
                      onConfirm={() => { deleteSale(s.id); toast.success(`${s.invoice} deleted`); }}
                      trigger={
                        <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      }
                    />
                  </td>
                </tr>
              ))}
              {/* Shop users see 7 columns, not 9 — a fixed colSpan left the empty
                  row overhanging the table and breaking the bottom border. */}
              {rows.length === 0 && (
                <tr><td colSpan={isAdmin ? 10 : 8} className="px-4 py-12 text-center text-sm text-muted-foreground">No sales match these filters.</td></tr>
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
                          {isAdmin && <td className="px-3 py-2 text-right text-success-strong">{formatRs(l.qty * (l.price - l.cost))}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatRs(selected.subtotal)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>− {formatRs(selected.discount)}</span></div>
                  <div className="flex justify-between font-semibold text-base pt-2 border-t"><span>Total</span><span>{formatRs(selected.total)}</span></div>
                  {isAdmin && <div className="flex justify-between text-success-strong"><span>Profit</span><span>{formatRs(selected.profit)}</span></div>}
                </div>
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" className="flex-1" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1.5" />Print</Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    disabled={selected.status === "Returned"}
                    onClick={() => { setEditing(selected); setOpen(null); }}
                  >
                    <Pencil className="h-4 w-4 mr-1.5" />Edit
                  </Button>
                  <Confirm
                    title={`Return ${selected.invoice}?`}
                    description={
                      <>
                        This refunds <strong>{formatRs(selected.total)}</strong>, puts{" "}
                        {selected.lines.reduce((a, l) => a + l.qty, 0)} item(s) back into stock, and marks the
                        invoice as returned. This can't be undone.
                      </>
                    }
                    confirmLabel="Process return"
                    destructive
                    disabled={selected.status === "Returned"}
                    onConfirm={() => processReturn(selected)}
                    trigger={
                      <Button variant="outline" className="flex-1" disabled={selected.status === "Returned"}>
                        <Undo2 className="h-4 w-4 mr-1.5" />
                        {selected.status === "Returned" ? "Returned" : "Return"}
                      </Button>
                    }
                  />
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <SaleEditDialog sale={editing} onClose={() => setEditing(null)} />
    </div>
  );
}