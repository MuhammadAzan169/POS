import { useEffect, useState } from "react";
import { useStore, formatRs, type Product } from "@/lib/store";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

/**
 * Editing a product lived nowhere — `updateProduct` existed in the store but no
 * screen called it. Shared by Products and Discounts so both edit the same way.
 */
export function ProductEditDialog({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const { products, updateProduct, settings } = useStore();
  const [form, setForm] = useState<Product | null>(product);

  // Re-seed whenever a different row is opened.
  useEffect(() => setForm(product), [product]);

  if (!form) return null;

  const margin = form.price > 0 ? Math.round(((form.price - form.cost) / form.price) * 100) : null;

  const save = () => {
    if (!form.name.trim()) { toast.error("Name required"); return; }
    if (form.price <= 0) { toast.error("Sell price must be greater than 0"); return; }
    if (form.cost < 0 || form.lowAlert < 0) { toast.error("Cost and low-stock alert can't be negative"); return; }
    const code = form.barcode.trim();
    if (code && products.some((p) => p.barcode === code && p.id !== form.id)) {
      toast.error(`Barcode ${code} is already used by another product`);
      return;
    }
    updateProduct({ ...form, name: form.name.trim(), barcode: code });
    toast.success("Product updated");
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit product</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5 col-span-2">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Barcode</Label>
            <Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Brand</Label>
            <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Low-stock alert</Label>
            <Input type="number" min={0} value={form.lowAlert} onChange={(e) => setForm({ ...form, lowAlert: Math.max(0, Number(e.target.value) || 0) })} />
          </div>
          <div className="space-y-1.5">
            <Label>Size</Label>
            <Input value={form.size ?? ""} onChange={(e) => setForm({ ...form, size: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Colour</Label>
            <Input value={form.color ?? ""} onChange={(e) => setForm({ ...form, color: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Cost ({settings.currency})</Label>
            <Input type="number" min={0} value={form.cost} onChange={(e) => setForm({ ...form, cost: Math.max(0, Number(e.target.value) || 0) })} />
          </div>
          <div className="space-y-1.5">
            <Label>Sell price ({settings.currency})</Label>
            <Input type="number" min={0} value={form.price} onChange={(e) => setForm({ ...form, price: Math.max(0, Number(e.target.value) || 0) })} />
          </div>

          {margin !== null && (
            <div className={`col-span-2 text-sm rounded-md p-2 ${form.price >= form.cost ? "text-success-strong bg-success/10" : "text-destructive bg-destructive/10"}`}>
              Margin: {formatRs(form.price - form.cost, settings.currency)} ({margin}%)
              {form.price < form.cost && " — selling below cost"}
            </div>
          )}

          <div className="col-span-2 flex items-center justify-between p-3 border rounded-lg">
            <div>
              <div className="font-medium text-sm">Active</div>
              <div className="text-xs text-muted-foreground">Inactive products stay in reports but shouldn't be sold.</div>
            </div>
            <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
