import { useEffect, useState } from "react";
import { useStore, formatRs, discountAmountFor, discountSplitOf, type Sale } from "@/lib/store";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Confirm } from "@/components/Confirm";
import { PaymentPicker } from "@/components/PaymentPicker";
import { Trash2, Percent, RotateCcw } from "lucide-react";
import { toast } from "sonner";

/**
 * Edit a completed sale: customer, payment, line quantities and — for the
 * owner — the discounts.
 *
 * Totals and profit are recomputed from the edited lines, and the store moves
 * stock by the difference against the original: reducing a line by 1 puts one
 * unit back on the shelf.
 *
 * Discounts used to be recomputed from the Discounts tab on every save, which
 * quietly overwrote whatever the slip actually carried — a bill discount given
 * at the counter disappeared the moment anyone corrected a quantity. They are
 * now carried through as recorded, and only change when someone changes them.
 */
export function SaleEditDialog({ sale, onClose }: { sale: Sale | null; onClose: () => void }) {
  const { user, updateSale, inventory, discounts, settings } = useStore();
  const [draft, setDraft] = useState<Sale | null>(sale);
  /** Taken off the slip as a whole, on top of the per-item discounts. */
  const [billDiscount, setBillDiscount] = useState(0);

  useEffect(() => {
    setDraft(sale);
    setBillDiscount(sale ? discountSplitOf(sale).bill : 0);
  }, [sale]);

  if (!draft || !sale) return null;

  // Discounts are money out of the owner's pocket, so a cashier can fix a
  // quantity or a name but cannot decide after the fact that the sale was 20%
  // off. The fields are simply not rendered for them.
  const canEditDiscounts = user?.role === "admin";

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
      d
        ? {
            ...d,
            lines: d.lines.map((l) =>
              l.productId === productId
                ? // The discount is an amount in rupees, not a rate, so cutting
                  // the quantity must not leave more off the line than the line
                  // is now worth.
                  { ...l, qty: Math.max(0, qty), discount: Math.min(l.discount, Math.max(0, qty) * l.price) }
                : l,
            ),
          }
        : d,
    );
  };

  const setLineDiscount = (productId: string, value: number) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            lines: d.lines.map((l) =>
              l.productId === productId
                ? { ...l, discount: Math.max(0, Math.min(value, l.qty * l.price)) }
                : l,
            ),
          }
        : d,
    );

  const removeLine = (productId: string) =>
    setDraft((d) => (d ? { ...d, lines: d.lines.filter((l) => l.productId !== productId) } : d));

  /** Puts every line back on the rate the Discounts tab says it should have. */
  const applyRules = () => {
    setDraft((d) =>
      d
        ? {
            ...d,
            lines: d.lines.map((l) => ({
              ...l,
              discount: discountAmountFor(l.productId, l.price, l.qty, discounts),
            })),
          }
        : d,
    );
    toast.success("Item discounts reset to the rates in the Discounts tab");
  };

  const subtotal = draft.lines.reduce((a, l) => a + l.qty * l.price, 0);
  const itemDiscount = draft.lines.reduce((a, l) => a + (l.discount || 0), 0);
  // A slip can't be discounted below zero, so the bill part is capped by what
  // is left after the itemised discounts.
  const billRoom = Math.max(0, subtotal - itemDiscount);
  const bill = Math.min(billDiscount, billRoom);
  const discount = itemDiscount + bill;
  const total = Math.max(0, subtotal - discount);
  const profit = draft.lines.reduce((a, l) => a + l.qty * (l.price - l.cost), 0) - discount;
  const discountPct = subtotal > 0 ? Math.round((discount / subtotal) * 100) : 0;

  const save = () => {
    if (draft.lines.length === 0) { toast.error("A sale needs at least one item — delete it instead"); return; }
    if (draft.lines.some((l) => l.qty <= 0)) { toast.error("Every line needs a quantity of at least 1"); return; }
    const over = draft.lines.find((l) => l.qty > maxQtyFor(l.productId));
    if (over) { toast.error(`Only ${maxQtyFor(over.productId)} of ${over.name} available`); return; }

    updateSale({ ...draft, subtotal, discount, total, profit });
    toast.success(`${draft.invoice} updated`);
    onClose();
  };

  const changed =
    JSON.stringify(sale.lines.map((l) => [l.productId, l.qty, l.discount])) !==
      JSON.stringify(draft.lines.map((l) => [l.productId, l.qty, l.discount])) ||
    sale.customer !== draft.customer ||
    sale.payment !== draft.payment ||
    discountSplitOf(sale).bill !== bill;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono text-base">Edit {draft.invoice}</DialogTitle>
          <DialogDescription>
            {canEditDiscounts
              ? "Quantities, discounts and payment. Stock moves by the difference against the original."
              : "Quantities and payment. Discounts are set by the owner and are carried through unchanged."}
          </DialogDescription>
        </DialogHeader>

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
          Seven columns (item, price, max, qty, discount, line total, delete) is
          far more than a phone can hold. Below sm each line becomes a stacked
          block with the quantity and discount on their own row.
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
              <div className="flex items-end gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Qty</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={maxQtyFor(l.productId)}
                    aria-label={`Quantity for ${l.name}`}
                    value={l.qty}
                    onChange={(e) => setQty(l.productId, Number(e.target.value) || 0)}
                    className="w-20 text-right"
                  />
                </div>
                {canEditDiscounts && (
                  <div className="space-y-1">
                    <Label className="text-xs">Discount</Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={l.qty * l.price}
                      aria-label={`Discount for ${l.name}`}
                      value={l.discount || ""}
                      placeholder="0"
                      onChange={(e) => setLineDiscount(l.productId, Number(e.target.value) || 0)}
                      className="w-24 text-right"
                    />
                  </div>
                )}
                <div className="ml-auto text-right">
                  <div className="font-medium">{money(l.qty * l.price - (l.discount || 0))}</div>
                  {l.discount > 0 && (
                    <div className="text-xs text-success-strong">− {money(l.discount)}</div>
                  )}
                </div>
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
                <th className="px-3 py-2 text-right font-medium w-20">Qty</th>
                <th className="px-3 py-2 text-right font-medium w-28">Discount</th>
                <th className="px-3 py-2 text-right font-medium">Line</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {draft.lines.map((l) => (
                <tr key={l.productId} className="border-t">
                  <td className="px-3 py-2">{l.name}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">{money(l.price)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">{maxQtyFor(l.productId)}</td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min={1}
                      max={maxQtyFor(l.productId)}
                      aria-label={`Quantity for ${l.name}`}
                      value={l.qty}
                      onChange={(e) => setQty(l.productId, Number(e.target.value) || 0)}
                      className="h-8 text-right"
                    />
                  </td>
                  <td className="px-3 py-2">
                    {canEditDiscounts ? (
                      <Input
                        type="number"
                        min={0}
                        max={l.qty * l.price}
                        aria-label={`Discount for ${l.name}`}
                        value={l.discount || ""}
                        placeholder="0"
                        onChange={(e) => setLineDiscount(l.productId, Number(e.target.value) || 0)}
                        className="h-8 text-right"
                      />
                    ) : (
                      <div className="text-right tabular-nums text-muted-foreground">
                        {l.discount > 0 ? `− ${money(l.discount)}` : "—"}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">
                    {money(l.qty * l.price - (l.discount || 0))}
                  </td>
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

        {/* The whole-slip discount: "give him 200 off the bill", which no per-item
            rate can express. Owner-only, like the per-item fields above. */}
        {canEditDiscounts && (
          <div className="rounded-lg border p-3 space-y-2 bg-muted/20">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="bill-discount" className="flex items-center gap-1.5">
                <Percent className="h-3.5 w-3.5 text-muted-foreground" />
                Discount on the whole bill
              </Label>
              <Button variant="ghost" size="sm" onClick={applyRules} className="h-8 text-xs">
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Reset items to rules
              </Button>
            </div>
            <Input
              id="bill-discount"
              type="number"
              inputMode="decimal"
              min={0}
              max={billRoom}
              value={billDiscount || ""}
              placeholder="0"
              onChange={(e) => setBillDiscount(Math.max(0, Number(e.target.value) || 0))}
              className="h-10 text-right tabular-nums"
            />
            <p className="text-xs text-muted-foreground">
              On top of the item discounts above. At most {money(billRoom)} — a slip can't go below zero.
              {billDiscount > billRoom && " Capped to that."}
            </p>
          </div>
        )}

        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums">{money(subtotal)}</span>
          </div>
          {itemDiscount > 0 && (
            <div className="flex justify-between text-success-strong">
              <span>Item discounts</span>
              <span className="tabular-nums">− {money(itemDiscount)}</span>
            </div>
          )}
          {bill > 0 && (
            <div className="flex justify-between text-success-strong">
              <span>Bill discount</span>
              <span className="tabular-nums">− {money(bill)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold text-base pt-2 border-t">
            <span>Total</span>
            <span className="tabular-nums">{money(total)}</span>
          </div>
          {canEditDiscounts && discount > 0 && (
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{discountPct}% off · profit after discount</span>
              <span className={`tabular-nums ${profit < 0 ? "text-destructive font-medium" : ""}`}>
                {money(profit)}
              </span>
            </div>
          )}
          {profit < 0 && (
            <p className="text-xs text-destructive">
              This discount sells the goods below what they cost you.
            </p>
          )}
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
