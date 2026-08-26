import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  useStore, formatRs, todayISO, supplierBalance, openSessionFor,
  type SettledMethod, type Supplier, type SupplierPayment,
} from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { PaymentPicker } from "@/components/PaymentPicker";

/**
 * Paying a supplier — the mirror image of receiving a customer payment.
 *
 * Deliberately paid against the ACCOUNT rather than against one bill, because
 * that is how it is actually settled: a lump sum at the end of the month that
 * covers whatever is outstanding. Which bills it clears is arithmetic the
 * statement does; the shopkeeper handing over cash does not allocate it.
 *
 * Paying more than is owed is allowed on purpose — that is an advance placed
 * ahead of the next delivery, and refusing it would send the user off to invent
 * a fake bill to record it against.
 */
export function SupplierPaymentDialog({
  supplier,
  editing,
  onClose,
}: {
  supplier: Supplier | null;
  /** A receipt being corrected, rather than a new one. */
  editing?: SupplierPayment | null;
  onClose: () => void;
}) {
  const {
    user, shops, purchases, supplierPayments, returns, setOffs, adjustments, sales, customerPayments,
    daySessions, settings, addSupplierPayment, updateSupplierPayment,
  } = useStore();

  const isAdmin = user?.role === "admin";
  const money = (n: number) => formatRs(n, settings.currency);

  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<SettledMethod>("Cash");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  /**
   * Which till the money comes out of. Empty is "head office" — the owner
   * paying by transfer with no drawer behind it, which is how most bills are
   * settled. A shopkeeper never gets the choice: it is their own till or
   * nothing.
   */
  const [shopId, setShopId] = useState(user?.shopId ?? "");

  const balance = supplier
    ? supplierBalance(supplier, { sales, customerPayments, purchases, supplierPayments, returns, setOffs, adjustments })
    : null;

  // Re-seeded whenever the dialog is pointed at a different supplier or
  // receipt, so it never opens showing the last one's figures.
  useEffect(() => {
    if (!supplier) return;
    if (editing) {
      setAmount(editing.amount);
      setMethod(editing.method);
      setDate(editing.date);
      setNote(editing.note);
      setShopId(editing.shopId);
      return;
    }
    // Pre-filled with the whole balance, which is what is usually handed over.
    setAmount(balance?.outstanding ?? 0);
    setMethod("Cash");
    setDate(todayISO());
    setNote("");
    setShopId(user?.shopId ?? "");
    // `balance` is recomputed every render; keying off the supplier id is what
    // actually decides whether this is a different form.

  }, [supplier?.id, editing?.id]);

  if (!supplier) return null;

  const outstanding = balance?.outstanding ?? 0;
  const advanceAfter = Math.max(0, amount - outstanding);
  const session = shopId ? openSessionFor(daySessions, shopId) : undefined;

  const save = () => {
    if (amount <= 0) { toast.error("Enter an amount"); return; }

    if (editing) {
      updateSupplierPayment({ ...editing, amount, method, date, note, shopId });
      toast.success(`Payment to ${supplier.name} corrected`);
    } else {
      addSupplierPayment({
        supplierId: supplier.id,
        date,
        amount,
        method,
        shopId,
        note,
        paidBy: user?.name ?? "Unknown",
      });
      toast.success(
        advanceAfter > 0
          ? `${money(amount)} paid — ${money(advanceAfter)} of it sits with them as an advance`
          : `${money(amount)} paid to ${supplier.name}`,
      );
    }
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Correct payment" : `Pay ${supplier.name}`}</DialogTitle>
          <DialogDescription>
            {outstanding > 0
              ? `${money(outstanding)} outstanding across ${balance?.unpaidBills ?? 0} bill${
                  balance?.unpaidBills === 1 ? "" : "s"
                }.`
              : "Nothing is outstanding — anything paid now sits with them as an advance against the next delivery."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Amount</Label>
            <Input
              type="number"
              min={0}
              autoFocus
              value={amount || ""}
              onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))}
            />
            {outstanding > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Button size="sm" variant="outline" onClick={() => setAmount(outstanding)}>
                  Pay all — {money(outstanding)}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setAmount(Math.round(outstanding / 2))}>
                  Half
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Paid by</Label>
            <PaymentPicker value={method} onChange={(m) => setMethod(m as SettledMethod)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Paid from</Label>
              {isAdmin ? (
                <Select value={shopId || "__ho__"} onValueChange={(v) => setShopId(v === "__ho__" ? "" : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__ho__">Head office</SelectItem>
                    {shops.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name} till</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={shops.find((s) => s.id === shopId)?.name ?? "Your till"} disabled />
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Note</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Settled September bills"
            />
          </div>

          {/* Says out loud what this does to tonight's count, because that is
              the part people are surprised by. */}
          {method === "Cash" && shopId && (
            <p className="text-xs text-warning-strong">
              Cash out of the {shops.find((s) => s.id === shopId)?.name ?? "shop"} till
              {session ? ` — tonight's count will expect ${money(amount)} less.` : " — no trading day is open there, so it lands on the day's date."}
            </p>
          )}
          {method === "Cash" && !shopId && (
            <p className="text-xs text-muted-foreground">
              Paid from head office, so no shop's drawer is affected.
            </p>
          )}
          {advanceAfter > 0 && (
            <p className="text-xs text-muted-foreground">
              {money(advanceAfter)} more than is owed — it will show as an advance you have placed with them.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>{editing ? "Save correction" : "Record payment"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
