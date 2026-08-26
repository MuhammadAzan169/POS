import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  useStore, formatRs, todayISO, customerBalance, supplierBalance,
  type Customer, type Supplier,
} from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ArrowLeftRight } from "lucide-react";

/**
 * Cancelling what a partner owes you against what you owe them.
 *
 * The situation this exists for: a shopkeeper buys stock from you on account,
 * and you buy stock from him on account. Rather than two payments crossing in
 * opposite directions, you agree the smaller debt is wiped and only the
 * difference actually moves. Everyone in trade does this; the app previously
 * had no way to record it, so the two balances stayed inflated for ever or
 * someone invented a fake payment on each side.
 *
 * No money changes hands, which is why this never touches a till or a day's
 * cash count. It is purely two balances coming down together.
 */
export function SetOffDialog({
  customer,
  supplier,
  onClose,
}: {
  customer: Customer | null;
  supplier: Supplier | null;
  onClose: () => void;
}) {
  const {
    user, sales, customerPayments, purchases, supplierPayments, returns, setOffs,
    settings, addSetOff,
  } = useStore();

  const money = (n: number) => formatRs(n, settings.currency);
  const data = { sales, customerPayments, purchases, supplierPayments, returns, setOffs };

  const receivable = customer ? customerBalance(customer, data).outstanding : 0;
  const payable = supplier ? supplierBalance(supplier, data).outstanding : 0;
  const available = Math.min(receivable, payable);

  const [amount, setAmount] = useState(available);
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");

  useEffect(() => {
    setAmount(available);
    setDate(todayISO());
    setNote("");

  }, [customer?.id, supplier?.id]);

  if (!customer || !supplier) return null;

  const capped = Math.max(0, Math.min(amount, available));
  const afterReceivable = receivable - capped;
  const afterPayable = payable - capped;

  const save = () => {
    if (capped <= 0) {
      toast.error("There is nothing to set off — one of the two sides is already clear");
      return;
    }
    const rec = addSetOff({
      date,
      customerId: customer.id,
      supplierId: supplier.id,
      amount: capped,
      note,
      createdBy: user?.name ?? "Unknown",
    });
    if (!rec) {
      toast.error("Nothing could be set off — the balances have changed");
      return;
    }
    toast.success(`${money(rec.amount)} set off against ${customer.name}`);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4" /> Set off with {customer.name}
          </DialogTitle>
          <DialogDescription>
            No money moves. Both balances come down by the same amount, and only the difference is
            left to settle.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">They owe you</div>
              <div className="mt-0.5 font-semibold">{money(receivable)}</div>
              <div className="mt-1 text-xs text-muted-foreground">as {customer.name}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">You owe them</div>
              <div className="mt-0.5 font-semibold">{money(payable)}</div>
              <div className="mt-1 text-xs text-muted-foreground">as {supplier.name}</div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Amount to cancel</Label>
            <Input
              type="number"
              min={0}
              max={available}
              autoFocus
              value={amount || ""}
              onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))}
            />
            <p className="text-xs text-muted-foreground">
              At most {money(available)} — you cannot cancel more than the shorter of the two debts.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Note</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Agreed against his last delivery"
            />
          </div>

          {/* The whole reason someone opens this dialog is to find out what is
              left afterwards, so it is spelled out rather than implied. */}
          <div className="rounded-lg bg-muted/40 p-3 text-sm">
            <div className="font-medium">After this set-off</div>
            <div className="mt-1 text-muted-foreground">
              {afterReceivable > 0 && <>They still owe you {money(afterReceivable)}.</>}
              {afterPayable > 0 && <>You still owe them {money(afterPayable)}.</>}
              {afterReceivable === 0 && afterPayable === 0 && <>Both sides are square.</>}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={available <= 0}>Record set-off</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
