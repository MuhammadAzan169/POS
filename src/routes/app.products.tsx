import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useStore, formatRs } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";

/** Guards the divide-by-zero that rendered "NaN%"/"Infinity%" for zero-priced items. */
function margin(price: number, cost: number) {
  if (!price) return "—";
  return `${Math.round(((price - cost) / price) * 100)}%`;
}

export const Route = createFileRoute("/app/products")({
  // Optional, so plain <Link to="/app/products"> keeps working without a search prop.
  validateSearch: (search: Record<string, unknown>): { q?: string } =>
    typeof search.q === "string" && search.q ? { q: search.q } : {},
  component: ProductsPage,
});

function ProductsPage() {
  const { user, products, inventory, addProduct } = useStore();
  const { q: searchParam } = Route.useSearch();
  const isAdmin = user?.role === "admin";
  const [q, setQ] = useState(searchParam ?? "");

  // Keep the filter in step with the header search that navigated here.
  // The ?? "" keeps the <Input> controlled when the param is absent.
  useEffect(() => { setQ(searchParam ?? ""); }, [searchParam]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ barcode: "", name: "", category: "Cosmetics", brand: "", cost: 0, price: 0, lowAlert: 5 });

  const rows = useMemo(() => {
    return products
      .filter((p) => (q ? p.name.toLowerCase().includes(q.toLowerCase()) || p.barcode.includes(q) : true))
      .map((p) => ({ ...p, totalStock: inventory.filter((r) => r.productId === p.id).reduce((a, r) => a + r.qty, 0) }));
  }, [products, inventory, q]);

  const save = () => {
    if (!form.name.trim()) { toast.error("Name required"); return; }
    if (form.price <= 0) { toast.error("Sell price must be greater than 0"); return; }
    if (form.cost < 0 || form.lowAlert < 0) { toast.error("Cost and low-stock alert can't be negative"); return; }
    if (form.barcode.trim() && products.some((p) => p.barcode === form.barcode.trim())) {
      toast.error(`Barcode ${form.barcode.trim()} is already used`);
      return;
    }
    addProduct({ ...form, name: form.name.trim(), barcode: form.barcode.trim(), active: true, size: "", color: "" });
    toast.success("Product added");
    setOpen(false);
    setForm({ barcode: "", name: "", category: "Cosmetics", brand: "", cost: 0, price: 0, lowAlert: 5 });
  };

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle={isAdmin ? "Master catalogue shared by all shops." : "Catalogue (read-only)."}
        actions={
          isAdmin && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1.5" />Add product</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>New product</DialogTitle></DialogHeader>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5 col-span-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Barcode</Label><Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Brand</Label><Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Low-stock alert</Label><Input type="number" value={form.lowAlert} onChange={(e) => setForm({ ...form, lowAlert: Number(e.target.value) })} /></div>
                  <div className="space-y-1.5"><Label>Cost (Rs)</Label><Input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })} /></div>
                  <div className="space-y-1.5"><Label>Sell price (Rs)</Label><Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} /></div>
                  {form.cost > 0 && form.price > 0 && (
                    <div className={`col-span-2 text-sm rounded-md p-2 ${form.price >= form.cost ? "text-success bg-success/10" : "text-destructive bg-destructive/10"}`}>
                      Margin: {formatRs(form.price - form.cost)} ({margin(form.price, form.cost)})
                      {form.price < form.cost && " — selling below cost"}
                    </div>
                  )}
                </div>
                <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save}>Save</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          )
        }
      />

      <Card className="p-3 mb-4">
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search name or barcode…" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0 z-10"><tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3 font-medium">Barcode</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Brand</th>
              {isAdmin && <th className="px-4 py-3 font-medium text-right">Cost</th>}
              <th className="px-4 py-3 font-medium text-right">Price</th>
              {isAdmin && <th className="px-4 py-3 font-medium text-right">Margin</th>}
              <th className="px-4 py-3 font-medium text-right">Stock</th>
            </tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-t hover:bg-muted/40">
                  <td className="px-4 py-3 font-mono text-xs">{p.barcode}</td>
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3">{p.category}</td>
                  <td className="px-4 py-3">{p.brand}</td>
                  {isAdmin && <td className="px-4 py-3 text-right">{formatRs(p.cost)}</td>}
                  <td className="px-4 py-3 text-right font-medium">{formatRs(p.price)}</td>
                  {isAdmin && <td className={`px-4 py-3 text-right ${p.price >= p.cost ? "text-success" : "text-destructive"}`}>{margin(p.price, p.cost)}</td>}
                  <td className="px-4 py-3 text-right">{p.totalStock}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={isAdmin ? 8 : 6} className="px-4 py-12 text-center text-sm text-muted-foreground">No products match “{q}”.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}