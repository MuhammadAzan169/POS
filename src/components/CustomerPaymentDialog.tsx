import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  useStore,
  formatRs,
  todayISO,
  customerBalance,
  openSessionFor,
  shortDay,
  type Customer,
  type CustomerPayment,
  type SettledMethod,
} from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { PaymentPicker } from "@/components/PaymentPicker";
import { HandCoins } from "lucide-react";

/**
 * Money coming back in against what a customer already owes — the other end of
 * a "pay later" sale.
 *
 * Lifted out of the Customers page so it can be opened from wherever the debt
 * is being looked at. The shopkeeper who let the goods go remembers the SALE,
 * not the account: making them leave the invoice, find the name on another
 * screen and search for it again was a detour through three pages to record
 * money already in their hand.
 *
 * Taken against the ACCOUNT, never against one invoice. That is how it is
 * actually paid — a customer hands over what they can, and it comes off what
 * they owe. Allocating it to particular invoices would be an accounting fiction
 * the shop never performed, and would make every later correction wrong.
 *
 * Part payments and overpayments are both first-class: paying less leaves a
 * balance, paying more is an advance drawn against next time. Neither is an
 * error, and the dialog says which one is about to happen before the money is
 * taken — the shopkeeper has to tell the customer where they stand.
 */
export function CustomerPaymentDialog({
  customer,
  editing,
  onClose,
}: {
  customer: Customer | null;
  /** A receipt being corrected, rather than a new one. */
  editing?: CustomerPayment | null;
  onClose: () => void;
}) {
  const {
    user,
    shops,
    sales,
    customerPayments,
    setOffs,
    adjustments,
    daySessions,
    settings,
    addCustomerPayment,
    updateCustomerPayment,
  } = useStore();

  const isAdmin = user?.role === "admin";
  const money = (n: number) => formatRs(n, settings.currency);

  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<SettledMethod>("Cash");
  const [note, setNote] = useState("");
  const [shopId, setShopId] = useState(user?.shopId ?? "");

  const balance = customer
    ? customerBalance(customer, { sales, customerPayments, setOffs, adjustments })
    : null;

  // Re-seeded whenever the dialog is pointed at a different customer or
  // receipt, so it never opens showing the last one's figures.
  useEffect(() => {
    if (!customer) return;
    if (editing) {
      setAmount(editing.amount);
      setMethod(editing.method);
      setNote(editing.note);
      setShopId(editing.shopId);
      return;
    }
    const owed = balance?.outstanding ?? 0;
    // Pre-filled with the whole balance, which is what is usually handed over.
    // With nothing owed it opens blank, because an advance has no obvious size.
    setAmount(owed);
    setMethod("Cash");
    setNote(owed > 0 ? "" : "Advance against future purchases");
    setShopId(user?.shopId ?? shops[0]?.id ?? "");
    // `balance` is recomputed every render; keying off the customer id is what
    // actually decides whether this is a different form.
  }, [customer?.id, editing?.id]);

  if (!customer) return null;

  const outstanding = balance?.outstanding ?? 0;
  /**
   * Correcting a receipt has to add back what it already contributes before the
   * remainder means anything — otherwise editing a payment from 500 to 400
   * would read as if 400 were being paid against a balance that already counts
   * the 500.
   */
  const ceiling = outstanding + (editing?.amount ?? 0);
  const advanceAfter = Math.max(0, amount - ceiling);
  const owedAfter = Math.max(0, ceiling - amount);
  const session = shopId ? openSessionFor(daySessions, shopId) : undefined;

  const save = () => {
    if (amount <= 0) {
      toast.error("Enter an amount");
      return;
    }
    if (!shopId) {
      toast.error("Pick which shop received the money");
      return;
    }

    if (editing) {
      updateCustomerPayment({ ...editing, amount, method, shopId, note: note.trim() });
      toast.success("Payment corrected");
    } else {
      addCustomerPayment({
        customerId: customer.id,
        date: todayISO(),
        amount,
        method,
        shopId,
        note: note.trim(),
        receivedBy: user?.name ?? "Unknown",
      });
      toast.success(
        advanceAfter > 0
          ? `${money(amount)} received — ${money(advanceAfter)} held as an advance`
          : owedAfter > 0
            ? `${money(amount)} received — ${money(owedAfter)} still owed`
            : `${money(amount)} received — ${customer.name}'s account is settled`,
      );
    }
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Correct payment" : `Receive from ${customer.name}`}</DialogTitle>
          <DialogDescription>
            {outstanding > 0
              ? `${customer.name} owes ${money(outstanding)}.`
              : `${customer.name} owes nothing — anything taken now is an advance they can draw stock against.`}
            {editing && ` Taken ${shortDay(editing.date)} by ${editing.receivedBy || "staff"}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Amount ({settings.currency})</Label>
            <Input
              type="number"
              min={0}
              autoFocus
              inputMode="decimal"
              className="text-lg font-semibold tabular-nums h-11"
              value={amount || ""}
              onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))}
            />
            {/* A customer paying off a debt hands over all of it or a round part
                of it. Both are one tap rather than mental arithmetic at the
                counter with someone waiting. */}
            {ceiling > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Button size="sm" variant="outline" onClick={() => setAmount(ceiling)}>
                  Pay all — {money(ceiling)}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAmount(Math.round(ceiling / 2))}
                >
                  Half
                </Button>
              </div>
            )}
          </div>

          {/*
            Where this leaves them, stated before the money is taken. A part
            payment is the normal case and the shopkeeper has to be able to say
            "that leaves two thousand" without working it out themselves.
          */}
          {amount > 0 && (
            <div
              className={
                advanceAfter > 0
                  ? "rounded-lg border border-accent/40 bg-accent/5 px-3 py-2 text-sm"
                  : owedAfter > 0
                    ? "rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
                    : "rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm"
              }
            >
              {advanceAfter > 0 ? (
                <>
                  <span className="font-medium text-accent-strong">
                    {money(advanceAfter)} more than is owed
                  </span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Held as an advance and taken off their next purchases on account.
                  </p>
                </>
              ) : owedAfter > 0 ? (
                <>
                  <span className="font-medium text-warning-strong">
                    Part payment — {money(owedAfter)} still owed after this
                  </span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    The rest stays on their account and can be collected any time.
                  </p>
                </>
              ) : (
                <span className="font-medium text-success-strong">
                  Settles the account in full — nothing left owing.
                </span>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Paid by</Label>
            {/* Settled methods only: "Credit" here would mean paying a debt
                with another debt, which is not a payment. */}
            <PaymentPicker value={method} onChange={(m) => setMethod(m as SettledMethod)} />
          </div>

          <div className="space-y-1.5">
            <Label>Received at</Label>
            {isAdmin ? (
              <Select value={shopId} onValueChange={setShopId}>
                <SelectTrigger>
                  <SelectValue placeholder="Which shop took the money?" />
                </SelectTrigger>
                <SelectContent>
                  {shops.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input value={shops.find((s) => s.id === shopId)?.name ?? "Your shop"} disabled />
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Note (optional)</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Part payment against last week's bill"
            />
          </div>

          {/* Says out loud what this does to tonight's count, because that is
              the part people are surprised by. */}
          {method === "Cash" && (
            <p className="text-xs text-muted-foreground">
              Cash into the {shops.find((s) => s.id === shopId)?.name ?? "shop"} drawer
              {session
                ? ` — tonight's count will expect ${money(amount)} more.`
                : " — no trading day is open there, so it lands on the day's date."}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>
            <HandCoins className="h-4 w-4 mr-1.5" />
            {editing ? "Save correction" : "Record payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
