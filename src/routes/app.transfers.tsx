import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useStore, formatRs, todayISO, shopKind, type Shop } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { MobileCards, ListCard, TableWrap } from "@/components/DataList";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ArrowRight, Plus, Trash2, Download, ScanLine, Warehouse } from "lucide-react";
import { downloadCsv } from "@/lib/export";
import { toast } from "sonner";

export const Route = createFileRoute("/app/transfers")({ component: TransfersPage });

type Line = { productId: string; qty: number };

function TransfersPage() {
  const { user, shops, products, inventory, transfers, addTransfer, settings } = useStore();
  const isAdmin = user?.role === "admin";

  const defaultFrom = shops[0]?.id ?? "";
  const [open, setOpen] = useState(false);
  const [fromShop, setFromShop] = useState(defaultFrom);
  const [toShop, setToShop] = useState("");
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [scan, setScan] = useState("");
  const [filter, setFilter] = useState("all");

  const stockAt = (productId: string, shopId: string) =>
    inventory.find((r) => r.productId === productId && r.shopId === shopId)?.qty ?? 0;

  const rows = useMemo(
    () =>
      transfers
        .filter((t) => (isAdmin ? true : t.fromShopId === user?.shopId || t.toShopId === user?.shopId))
        .filter((t) => (filter === "all" ? true : t.fromShopId === filter || t.toShopId === filter))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [transfers, filter, isAdmin, user?.shopId],
  );

  const shopName = (id: string) => shops.find((s) => s.id === id)?.name ?? "—";

  const openDialog = () => {
    setFromShop(defaultFrom);
    setToShop(shops.find((s) => s.id !== defaultFrom)?.id ?? "");
    setDate(todayISO());
    setNotes("");
    setLines([]);
    setScan("");
    setOpen(true);
  };

  const addLine = (productId: string) => {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.productId === productId);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], qty: next[i].qty + 1 };
        return next;
      }
      return [...prev, { productId, qty: 1 }];
    });
  };

  const scanIn = () => {
    const code = scan.trim();
    if (!code) return;
    const p =
      products.find((x) => x.barcode === code) ??
      products.find((x) => x.name.toLowerCase().includes(code.toLowerCase()));
    if (!p) { toast.error(`No product matches “${code}”`); return; }
    addLine(p.id);
    setScan("");
  };

  const totalUnits = lines.reduce((a, l) => a + l.qty, 0);
  const totalValue = lines.reduce((a, l) => {
    const p = products.find((x) => x.id === l.productId);
    return a + (p?.cost ?? 0) * l.qty;
  }, 0);

  const save = () => {
    if (!fromShop || !toShop) { toast.error("Pick both a source and a destination"); return; }
    if (fromShop === toShop) { toast.error("Source and destination must be different shops"); return; }
    if (lines.length === 0) { toast.error("Add at least one product"); return; }
    if (lines.some((l) => l.qty <= 0)) { toast.error("Every line needs a quantity of at least 1"); return; }

    // Moving more than the source holds would leave it with negative stock, so
    // the transfer is rejected rather than silently clamped to what's there.
    const short = lines.find((l) => l.qty > stockAt(l.productId, fromShop));
    if (short) {
      const p = products.find((x) => x.id === short.productId);
      toast.error(`${shopName(fromShop)} only has ${stockAt(short.productId, fromShop)} × ${p?.name ?? "that item"}`);
      return;
    }

    addTransfer({
      date,
      fromShopId: fromShop,
      toShopId: toShop,
      items: lines.map((l) => ({
        productId: l.productId,
        name: products.find((p) => p.id === l.productId)?.name ?? l.productId,
        qty: l.qty,
      })),
      notes: notes.trim(),
      createdBy: user?.name ?? "Unknown",
    });
    toast.success(`${totalUnits} units moved to ${shopName(toShop)}`);
    setOpen(false);
  };

  const exportCsv = () => {
    if (rows.length === 0) { toast.error("Nothing to export"); return; }
    downloadCsv(
      `transfers-${todayISO()}.csv`,
      ["Transfer no", "Date", "From", "To", "Product", "Qty", "By", "Notes"],
      rows.flatMap((t) =>
        t.items.map((i) => [t.transferNo, t.date, shopName(t.fromShopId), shopName(t.toShopId), i.name, i.qty, t.createdBy, t.notes]),
      ),
    );
    toast.success("Transfers exported");
  };

  const shopLabel = (s: Shop) => `${s.name}${shopKind(s) === "wholesale" ? " (wholesale)" : ""}`;

  return (
    <div>
      <PageHeader
        title="Stock transfers"
        subtitle="Move your own stock between your own locations. This is internal distribution — nothing here is a sale."
        actions={
          <>
            <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-1.5" />Export</Button>
            <Button onClick={openDialog}><Plus className="h-4 w-4 mr-1.5" />New transfer</Button>
          </>
        }
      />

      {isAdmin && (
        <Card className="p-3 sm:p-4 mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="space-y-1.5">
            <Label className="text-xs">Shop</Label>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All shops</SelectItem>
                {shops.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground sm:ml-auto">Shows transfers in or out of the chosen shop.</p>
        </Card>
      )}

      <Card className="overflow-hidden">
        <MobileCards
          items={rows}
          keyOf={(t) => t.id}
          empty="No stock has been transferred yet."
          render={(t) => (
            <ListCard
              title={<span className="font-mono">{t.transferNo}</span>}
              subtitle={`${shopName(t.fromShopId)} → ${shopName(t.toShopId)}`}
              right={t.items.reduce((a, i) => a + i.qty, 0)}
              rightSub="units"
              fields={[
                { label: "Date", value: t.date },
                { label: "Items", value: t.items.length },
                { label: "By", value: t.createdBy },
              ]}
            />
          )}
        />
        <TableWrap>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0 z-10">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-medium">Transfer no</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Movement</th>
                <th className="px-4 py-3 font-medium">Items</th>
                <th className="px-4 py-3 font-medium text-right">Units</th>
                <th className="px-4 py-3 font-medium">Recorded by</th>
                <th className="px-4 py-3 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="border-t hover:bg-muted/40 align-top">
                  <td className="px-4 py-3 font-mono text-xs">{t.transferNo}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{t.date}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      {shopName(t.fromShopId)}
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium">{shopName(t.toShopId)}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {t.items.map((i) => (
                        <span key={i.productId} className="text-xs px-2 py-0.5 bg-muted rounded-full">
                          {i.name} × {i.qty}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{t.items.reduce((a, i) => a + i.qty, 0)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{t.createdBy}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{t.notes || "—"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No stock has been transferred yet.
                </td></tr>
              )}
            </tbody>
          </table>
        </TableWrap>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New stock transfer</DialogTitle>
            <DialogDescription>
              Stock leaves the source shop and arrives at the destination immediately.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>From</Label>
              <Select value={fromShop} onValueChange={setFromShop}>
                <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
                <SelectContent>
                  {shops.map((s) => <SelectItem key={s.id} value={s.id}>{shopLabel(s)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>To</Label>
              <Select value={toShop} onValueChange={setToShop}>
                <SelectTrigger><SelectValue placeholder="Destination" /></SelectTrigger>
                <SelectContent>
                  {/* Excluding the source removes the only invalid choice up front. */}
                  {shops.filter((s) => s.id !== fromShop).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{shopLabel(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Add by barcode</Label>
            <div className="relative">
              <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={scan}
                onChange={(e) => setScan(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); scanIn(); } }}
                placeholder="Scan or type a barcode, then press Enter…"
                className="pl-9"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Items</Label>
              <Select value="" onValueChange={addLine}>
                <SelectTrigger className="w-56 h-9"><SelectValue placeholder="+ Add a product…" /></SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} · {stockAt(p.id, fromShop)} in stock
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {lines.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                <Warehouse className="h-5 w-5 mx-auto mb-2 opacity-60" />
                Scan a barcode or pick a product to start the transfer.
              </div>
            ) : (
              <div className="space-y-2">
                {lines.map((l, i) => {
                  const p = products.find((x) => x.id === l.productId);
                  const available = stockAt(l.productId, fromShop);
                  const tooMany = l.qty > available;
                  return (
                    <div key={l.productId} className="grid grid-cols-2 gap-2 items-end rounded-lg border p-3 sm:grid-cols-12 sm:border-0 sm:p-0">
                      <div className="col-span-2 sm:col-span-6 min-w-0">
                        <div className="text-sm font-medium truncate">{p?.name ?? l.productId}</div>
                        <div className="text-xs text-muted-foreground">
                          {available} at {shopName(fromShop)} · {stockAt(l.productId, toShop)} at {shopName(toShop) === "—" ? "destination" : shopName(toShop)}
                        </div>
                      </div>
                      <div className="sm:col-span-3">
                        <Label className="text-xs sm:hidden">Qty</Label>
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={available}
                          value={l.qty}
                          onChange={(e) =>
                            setLines((prev) => prev.map((x, j) => (j === i ? { ...x, qty: Math.max(0, Number(e.target.value) || 0) } : x)))
                          }
                          className={tooMany ? "border-destructive" : undefined}
                        />
                      </div>
                      <div className="col-span-2 flex items-center justify-between gap-2 sm:col-span-3 sm:justify-end">
                        <span className="text-xs text-muted-foreground">{formatRs((p?.cost ?? 0) * l.qty, settings.currency)}</span>
                        <button
                          onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}
                          aria-label="Remove item"
                          className="h-9 w-9 shrink-0 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      {tooMany && (
                        <div className="col-span-2 sm:col-span-12 text-xs text-destructive">
                          Only {available} available at {shopName(fromShop)}.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Moving slow stock to DHA" />
          </div>

          <DialogFooter className="border-t pt-4 flex-col gap-3 !justify-between sm:flex-row sm:items-center">
            <div className="text-sm">
              <span className="font-semibold">{totalUnits} units</span>
              <span className="text-muted-foreground"> · {formatRs(totalValue, settings.currency)} at cost</span>
            </div>
            <div className="flex gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save}>Transfer stock</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
