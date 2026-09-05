import { useEffect, useState } from "react";
import { useStore, formatRs, priceForProfit, type Product } from "@/lib/store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

/**
 * Editing a product lived nowhere — `updateProduct` existed in the store but no
 * screen called it. Shared by Products and Discounts so both edit the same way.
 */
export function ProductEditDialog({
  product,
  onClose,
}: {
  product: Product | null;
  onClose: () => void;
}) {
  const { products, updateProduct, settings } = useStore();
  const [form, setForm] = useState<Product | null>(product);

  // Re-seed whenever a different row is opened.
  useEffect(() => setForm(product), [product]);

  if (!form) return null;

  /**
   * Typing a profit sets the price, and typing a price sets the profit.
   *
   * Kept as two writes rather than one derived field because a shopkeeper
   * thinks in both directions — "this sells for 450" and "I make 170 on it" are
   * the same fact, and which one they know first depends on the product.
   *
   * Setting a target is what pins the margin: from then on a delivery at a new
   * rate moves the PRICE, not the profit.
   */
  const setRetailProfit = (profit: number) =>
    setForm({ ...form, profitTarget: profit, price: priceForProfit(form.cost, profit) });

  const setWholesaleProfit = (profit: number) =>
    setForm({
      ...form,
      wholesaleProfitTarget: profit,
      wholesalePrice: priceForProfit(form.cost, profit),
    });

  /** Changing the cost re-prices anything with a pinned profit. */
  const setCost = (cost: number) => {
    const next = { ...form, cost };
    if (form.profitTarget !== undefined) next.price = priceForProfit(cost, form.profitTarget);
    if (form.wholesaleProfitTarget !== undefined)
      next.wholesalePrice = priceForProfit(cost, form.wholesaleProfitTarget);
    setForm(next);
  };

  const margin = form.price > 0 ? Math.round(((form.price - form.cost) / form.price) * 100) : null;
  const wholesaleMargin =
    form.wholesalePrice && form.wholesalePrice > 0
      ? Math.round(((form.wholesalePrice - form.cost) / form.wholesalePrice) * 100)
      : null;

  const save = () => {
    if (!form.name.trim()) {
      toast.error("Name required");
      return;
    }
    if (form.price <= 0) {
      toast.error("Retail price must be greater than 0");
      return;
    }
    if (form.cost < 0 || form.lowAlert < 0) {
      toast.error("Cost and low-stock alert can't be negative");
      return;
    }
    if (form.wholesalePrice !== undefined && form.wholesalePrice < 0) {
      toast.error("Wholesale price can't be negative");
      return;
    }
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
        <DialogHeader>
          <DialogTitle>Edit product</DialogTitle>
        </DialogHeader>
        {/* Single column on phones: two 150px fields side by side wrapped every
            label ("Low-stock alert", "Sell price (Rs)") onto three lines. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Barcode</Label>
            <Input
              value={form.barcode}
              onChange={(e) => setForm({ ...form, barcode: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Brand</Label>
            <Input
              value={form.brand}
              onChange={(e) => setForm({ ...form, brand: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Input
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Low-stock alert</Label>
            <Input
              type="number"
              min={0}
              value={form.lowAlert}
              onChange={(e) =>
                setForm({ ...form, lowAlert: Math.max(0, Number(e.target.value) || 0) })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Size</Label>
            <Input
              value={form.size ?? ""}
              onChange={(e) => setForm({ ...form, size: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Colour</Label>
            <Input
              value={form.color ?? ""}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Cost ({settings.currency})</Label>
            <Input
              type="number"
              min={0}
              value={form.cost}
              onChange={(e) => setCost(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Retail price ({settings.currency})</Label>
            <Input
              type="number"
              min={0}
              value={form.price}
              onChange={(e) => {
                const price = Math.max(0, Number(e.target.value) || 0);
                // Typing a price while a profit is pinned re-pins it to match,
                // rather than leaving the two silently disagreeing.
                setForm({
                  ...form,
                  price,
                  profitTarget:
                    form.profitTarget === undefined ? undefined : Math.max(0, price - form.cost),
                });
              }}
            />
          </div>

          {/*
            Profit per unit — the number an owner actually decides.

            Offered beside the price rather than instead of it: entering either
            one fills in the other, and pinning it is what makes the margin
            survive the next delivery.
          */}
          <div className="space-y-1.5 sm:col-span-2 rounded-lg border p-3 bg-muted/20">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Profit per unit — retail ({settings.currency})</Label>
                <Input
                  type="number"
                  min={0}
                  placeholder={`Currently ${formatRs(form.price - form.cost, settings.currency)}`}
                  value={form.profitTarget ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === "") {
                      setForm({ ...form, profitTarget: undefined });
                      return;
                    }
                    setRetailProfit(Math.max(0, Number(raw) || 0));
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Profit per unit — wholesale ({settings.currency})</Label>
                <Input
                  type="number"
                  min={0}
                  placeholder={`Currently ${formatRs((form.wholesalePrice ?? form.price) - form.cost, settings.currency)}`}
                  value={form.wholesaleProfitTarget ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === "") {
                      setForm({ ...form, wholesaleProfitTarget: undefined });
                      return;
                    }
                    setWholesaleProfit(Math.max(0, Number(raw) || 0));
                  }}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {form.profitTarget === undefined && form.wholesaleProfitTarget === undefined ? (
                <>
                  Leave blank and the price stays as typed — profit is whatever is left over, so a
                  delivery at a higher rate quietly eats into it.
                </>
              ) : (
                <>
                  Pinned. The selling price is now {formatRs(form.cost, settings.currency)} cost
                  plus your profit, and it will follow the cost on the next delivery so this figure
                  does not move.
                </>
              )}
            </p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Wholesale price ({settings.currency})</Label>
            {/* Left blank, the wholesale counter simply charges the retail price,
                which is the sensible default for anything not sold to trade. */}
            <Input
              type="number"
              min={0}
              placeholder={`Leave blank to use the retail price (${formatRs(form.price, settings.currency)})`}
              value={form.wholesalePrice ?? ""}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") {
                  setForm({ ...form, wholesalePrice: undefined, wholesaleProfitTarget: undefined });
                  return;
                }
                const wholesalePrice = Math.max(0, Number(raw) || 0);
                setForm({
                  ...form,
                  wholesalePrice,
                  wholesaleProfitTarget:
                    form.wholesaleProfitTarget === undefined
                      ? undefined
                      : Math.max(0, wholesalePrice - form.cost),
                });
              }}
            />
            <p className="text-xs text-muted-foreground">
              Charged at wholesale shops only. Retail branches always use the retail price.
            </p>
          </div>

          {wholesaleMargin !== null && (
            <div
              className={`sm:col-span-2 text-sm rounded-md p-2 ${
                (form.wholesalePrice ?? 0) >= form.cost
                  ? "text-success-strong bg-success/10"
                  : "text-destructive bg-destructive/10"
              }`}
            >
              Wholesale margin:{" "}
              {formatRs((form.wholesalePrice ?? 0) - form.cost, settings.currency)} (
              {wholesaleMargin}%)
              {(form.wholesalePrice ?? 0) < form.cost && " — selling below cost"}
            </div>
          )}

          {margin !== null && (
            <div
              className={`sm:col-span-2 text-sm rounded-md p-2 ${form.price >= form.cost ? "text-success-strong bg-success/10" : "text-destructive bg-destructive/10"}`}
            >
              Margin: {formatRs(form.price - form.cost, settings.currency)} ({margin}%)
              {form.price < form.cost && " — selling below cost"}
            </div>
          )}

          <div className="sm:col-span-2 flex items-center justify-between gap-3 p-3 border rounded-lg">
            <div>
              <div className="font-medium text-sm">Active</div>
              <div className="text-xs text-muted-foreground">
                Inactive products stay in reports but shouldn't be sold.
              </div>
            </div>
            <Switch
              checked={form.active}
              onCheckedChange={(v) => setForm({ ...form, active: v })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
