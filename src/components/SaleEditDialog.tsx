import { useEffect, useState } from "react";
import { useStore, formatRs, discountAmountFor, type Sale } from "@/lib/store";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Confirm } from "@/components/Confirm";
import { PaymentPicker } from "@/components/PaymentPicker";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Edit a completed sale: customer, payment method and line quantities.
 *
 * Totals and profit are recomputed from the edited lines, and the store moves
 * stock by the difference against the original — reducing a line by 1 puts one
 * unit back on the shelf.
 */
export function SaleEditDialog({ sale, onClose }: { sale: Sale | null; onClose: () => void }) {
  const { updateSale, inventory, discounts, settings } = useStore();
  const [draft, setDraft] = useState<Sale | null>(sale);

  useEffect(() => setDraft(sale), [sale]);

  if (!draft || !sale) return null;

  const money = (n: number) => formatRs(n, settings.currency);
  const stockFor = (productId: string) =>
    inventory.find((r) => r.productId === productId && r.shopId === draft.shopId)?.qty ?? 0;

  /** What this line can grow to: what's on the shelf plus what this sale already took. */
  const maxQtyFor = (productId: string) => {
    const original = sale.lines.find((l) => l.productId === productId)?.qty ?? 0;
    return stockFor(productId) + original;
  };

  const setQty = (productId: string, qty: number) => {
    setDraft((d) =>
      d ? { ...d, lines: d.lines.map((l) => (l.productId === productId ? { ...l, qty: Math.max(0, qty) } : l)) } : d,
    );
  };

  const removeLine = (productId: string) =>
    setDraft((d) => (d ? { ...d, lines: d.lines.filter((l) => l.productId !== productId) } : d));

  const subtotal = draft.lines.reduce((a, l) => a + l.qty * l.price, 0);
  const discount = draft.lines.reduce((a, l) => a + discountAmountFor(l.productId, l.price, l.qty, discounts), 0);
  const total = Math.max(0, subtotal - discount);
  const profit = draft.lines.reduce((a, l) => a + l.qty * (l.price - l.cost), 0) - discount;

  const save = () => {
    if (draft.lines.length === 0) { toast.error("A sale needs at least one item — delete it instead"); return; }
    if (draft.lines.some((l) => l.qty <= 0)) { toast.error("Every line needs a quantity of at least 1"); return; }
    const over = draft.lines.find((l) => l.qty > maxQtyFor(l.productId));
    if (over) { toast.error(`Only ${maxQtyFor(over.productId)} of ${over.name} available`); return; }

    updateSale({
      ...draft,
      lines: draft.lines.map((l) => ({ ...l, discount: discountAmountFor(l.productId, l.price, l.qty, discounts) })),
      subtotal,
      discount,
      total,
      profit,
    });
    toast.success(`${draft.invoice} updated`);
    onClose();
  };

  const changed =
    JSON.stringify(sale.lines.map((l) => [l.productId, l.qty])) !==
      JSON.stringify(draft.lines.map((l) => [l.productId, l.qty])) ||
    sale.customer !== draft.customer ||
    sale.payment !== draft.payment;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-mono text-base">Edit {draft.invoice}</DialogTitle></DialogHeader>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Customer</Label>
            <Input value={draft.customer} onChange={(e) => setDraft({ ...draft, customer: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Payment</Label>
            <PaymentPicker value={draft.payment} onChange={(p) => setDraft({ ...draft, payment: p })} />
          </div>
        </div>

        {/*
          Six columns (item, price, max, qty input, line total, delete) is far
          more than a phone can hold. Below sm each line becomes a stacked block
          with the qty stepper on its own row.
        */}
        <div className="space-y-2 sm:hidden">
          {draft.lines.map((l) => (
            <div key={l.productId} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium break-words">{l.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {money(l.price)} each · max {maxQtyFor(l.productId)}
                  </div>
                </div>
                <button
                  onClick={() => removeLine(l.productId)}
                  disabled={draft.lines.length === 1}
                  title={draft.lines.length === 1 ? "A sale needs at least one item" : "Remove item"}
                  aria-label={`Remove ${l.name}`}
                  className="h-9 w-9 -mr-1 -mt-1 shrink-0 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={maxQtyFor(l.productId)}
                  aria-label={`Quantity for ${l.name}`}
                  value={l.qty}
                  onChange={(e) => setQty(l.productId, Number(e.target.value) || 0)}
                  className="w-24 text-right"
                />
                <div className="ml-auto font-medium">{money(l.qty * l.price)}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="border rounded-lg overflow-hidden hidden sm:block">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Item</th>
                <th className="px-3 py-2 text-right font-medium">Price</th>
                <th className="px-3 py-2 text-right font-medium">Max</th>
                <th className="px-3 py-2 text-right font-medium w-24">Qty</th>
                <th className="px-3 py-2 text-right font-medium">Line</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {draft.lines.map((l) => (
                <tr key={l.productId} className="border-t">
                  <td className="px-3 py-2">{l.name}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{money(l.price)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{maxQtyFor(l.productId)}</td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min={1}
                      max={maxQtyFor(l.productId)}
                      value={l.qty}
                      onChange={(e) => setQty(l.productId, Number(e.target.value) || 0)}
                      className="h-8 text-right"
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-medium">{money(l.qty * l.price)}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => removeLine(l.productId)}
                      disabled={draft.lines.length === 1}
                      title={draft.lines.length === 1 ? "A sale needs at least one item" : "Remove item"}
                      className="text-muted-foreground hover:text-destructive disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{money(subtotal)}</span></div>
          {discount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>− {money(discount)}</span></div>}
          <div className="flex justify-between font-semibold text-base pt-2 border-t"><span>Total</span><span>{money(total)}</span></div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Confirm
            title="Save these changes?"
            description="Totals are recalculated and stock is adjusted by the difference in quantities. This can't be undone."
            confirmLabel="Save changes"
            disabled={!changed}
            onConfirm={save}
            trigger={<Button disabled={!changed}>Save changes</Button>}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
