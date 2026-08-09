import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useStore, formatRs, todayISO } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/purchases")({ component: PurchasesPage });

function PurchasesPage() {
  const { user, purchases, shops, products, addPurchase } = useStore();
  const isAdmin = user?.role === "admin";
  const [open, setOpen] = useState(false);
  const [supplier, setSupplier] = useState("Glow Cosmetics Pvt");
  const [billNo, setBillNo] = useState("");
  const [date, setDate] = useState(todayISO());
  const [lines, setLines] = useState([{ productId: products[0]?.id ?? "", shopId: shops[0]?.id ?? "", qty: 10, rate: products[0]?.cost ?? 0 }]);

  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="Purchases" subtitle="Record wholesale bills and distribute stock to shops." />
        <Card className="p-10 text-center text-sm text-muted-foreground">Admins only.</Card>
      </div>
    );
  }

  const total = lines.reduce((a, l) => a + l.qty * l.rate, 0);

  const save = () => {
    if (!supplier.trim()) { toast.error("Supplier required"); return; }
    if (!billNo.trim()) { toast.error("Bill number required"); return; }
    // The delete button could strip every line, and qty/rate accepted 0 — both
    // let an empty Rs 0 bill through that still counted as a purchase.
    if (lines.length === 0) { toast.error("Add at least one line item"); return; }
    if (lines.some((l) => !l.productId || !l.shopId)) { toast.error("Every line needs a product and a shop"); return; }
    if (lines.some((l) => l.qty <= 0)) { toast.error("Every line needs a quantity of at least 1"); return; }
    if (purchases.some((p) => p.billNo.toLowerCase() === billNo.trim().toLowerCase())) {
      toast.error(`Bill ${billNo.trim()} already exists`);
      return;
    }
    addPurchase({ supplier, billNo: billNo.trim(), date, lines, total });
    toast.success("Purchase saved and routed to shops");
    setOpen(false);
    setBillNo("");
    setLines([{ productId: products[0]?.id ?? "", shopId: shops[0]?.id ?? "", qty: 10, rate: products[0]?.cost ?? 0 }]);
  };

  return (
    <div>
      <PageHeader
        title="Purchases"
        subtitle="Record wholesale bills and distribute stock to shops."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-1.5" />New purchase</Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader><DialogTitle>New purchase</DialogTitle></DialogHeader>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5"><Label>Supplier</Label><Input value={supplier} onChange={(e) => setSupplier(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Bill no</Label><Input value={billNo} onChange={(e) => setBillNo(e.target.value)} placeholder="BILL-1234" /></div>
                <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
              </div>
              <div className="mt-2">
                <Label className="mb-2 block">Line items</Label>
                <div className="space-y-2">
                  {lines.map((l, i) => {
                    const p = products.find((x) => x.id === l.productId);
                    return (
                      <div key={i} className="grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-4">
                          <Select value={l.productId} onValueChange={(v) => {
                            const prod = products.find((p) => p.id === v);
                            setLines((prev) => prev.map((x, j) => j === i ? { ...x, productId: v, rate: prod?.cost ?? x.rate } : x));
                          }}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-3">
                          <Select value={l.shopId} onValueChange={(v) => setLines((prev) => prev.map((x, j) => j === i ? { ...x, shopId: v } : x))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{shops.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-2">
                          <Input type="number" min={1} value={l.qty} onChange={(e) => setLines((prev) => prev.map((x, j) => j === i ? { ...x, qty: Number(e.target.value) || 0 } : x))} />
                        </div>
                        <div className="col-span-2">
                          <Input type="number" min={0} value={l.rate} onChange={(e) => setLines((prev) => prev.map((x, j) => j === i ? { ...x, rate: Number(e.target.value) || 0 } : x))} />
                        </div>
                        <div className="col-span-1 flex items-center gap-1">
                          <span className="text-xs text-muted-foreground truncate">{formatRs(l.qty * l.rate)}</span>
                          {/* Removing the only line left the form unsubmittable-but-looking-fine. */}
                          <button
                            onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}
                            disabled={lines.length === 1}
                            title={lines.length === 1 ? "A purchase needs at least one line" : "Remove line"}
                            className="text-muted-foreground hover:text-destructive disabled:opacity-40 disabled:hover:text-muted-foreground disabled:cursor-not-allowed"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        {p && l.rate > 0 && l.rate !== p.cost && (
                          <div className="col-span-12 -mt-1 text-xs text-muted-foreground pl-1">
                            Cost for “{p.name}” updates {formatRs(p.cost)} → {formatRs(l.rate)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => setLines((prev) => [...prev, { productId: products[0]?.id ?? "", shopId: shops[0]?.id ?? "", qty: 1, rate: products[0]?.cost ?? 0 }])}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add line
                </Button>
              </div>
              <DialogFooter className="border-t pt-4 flex !justify-between items-center">
                <div className="text-lg font-semibold">Total: {formatRs(total)}</div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button onClick={save}>Save purchase</Button>
                </div>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50"><tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3 font-medium">Bill no</th>
              <th className="px-4 py-3 font-medium">Supplier</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium text-right">Items</th>
              <th className="px-4 py-3 font-medium">Destinations</th>
              <th className="px-4 py-3 font-medium text-right">Total</th>
            </tr></thead>
            <tbody>
              {purchases.map((p) => (
                <tr key={p.id} className="border-t hover:bg-muted/40">
                  <td className="px-4 py-3 font-mono text-xs">{p.billNo}</td>
                  <td className="px-4 py-3">{p.supplier}</td>
                  <td className="px-4 py-3">{p.date}</td>
                  <td className="px-4 py-3 text-right">{p.lines.reduce((a, l) => a + l.qty, 0)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {Array.from(new Set(p.lines.map((l) => l.shopId))).map((sid) => (
                        <span key={sid} className="text-xs px-2 py-0.5 bg-muted rounded-full">{shops.find((s) => s.id === sid)?.name}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{formatRs(p.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}