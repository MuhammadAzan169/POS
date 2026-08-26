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
import { Scale, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

/** The three things an owner actually does to a balance by hand. */
type Mode = "reduce" | "increase" | "writeOff";

/**
 * Moving what a party owes by hand.
 *
 * The balances everywhere else in this app are derived from documents — an
 * invoice, a bill, a receipt — and that is what makes them trustworthy. This is
 * the one place the owner overrules them, so it is deliberately explicit: it
 * asks which direction, how much, and why, and it writes a dated row that shows
 * up on the statement rather than quietly changing a total.
 *
 * Owner-only. Writing off a debt is not a decision anyone standing at a till
 * should be able to make, and the amounts involved are exactly the ones worth
 * stealing.
 */
export function AdjustBalanceDialog({
  customer,
  supplier,
  onClose,
}: {
  /** Adjust the customer side. Exactly one of these two is passed. */
  customer?: Customer | null;
  /** Adjust the supplier side. */
  supplier?: Supplier | null;
  onClose: () => void;
}) {
  const {
    user, sales, customerPayments, purchases, supplierPayments, returns, setOffs, adjustments,
    settings, addAdjustment,
  } = useStore();

  const money = (n: number) => formatRs(n, settings.currency);
  const data = { sales, customerPayments, purchases, supplierPayments, returns, setOffs, adjustments };

  const party = customer ?? supplier ?? null;
  const isCustomer = Boolean(customer);

  const balance = customer
    ? customerBalance(customer, data)
    : supplier
      ? supplierBalance(supplier, data)
      : null;

  const outstanding = balance?.outstanding ?? 0;

  const [mode, setMode] = useState<Mode>("reduce");
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(todayISO());
  const [reason, setReason] = useState("");

  // Re-seeded per party, so it never opens showing the last one's figures.
  useEffect(() => {
    setMode("reduce");
    setAmount(0);
    setDate(todayISO());
    setReason("");

  }, [customer?.id, supplier?.id]);

  if (!party || !balance) return null;

  // A write-off always clears the whole remaining balance; the other two take
  // whatever was typed. Kept as one derived figure so the preview below and the
  // row that gets written can never disagree.
  const magnitude = mode === "writeOff" ? outstanding : Math.max(0, Math.round(amount));
  const signed = mode === "increase" ? magnitude : -magnitude;
  const after = Math.max(0, outstanding + signed);

  const whoOwes = isCustomer ? `${party.name} owes you` : `You owe ${party.name}`;

  const save = () => {
    if (magnitude <= 0) {
      toast.error(mode === "writeOff" ? "There is nothing left to write off" : "Enter an amount");
      return;
    }
    if (!reason.trim()) {
      // An unexplained write-off is indistinguishable from a mistake six months
      // later, which is precisely when somebody goes looking.
      toast.error("Say why — this is the only figure in the app with no document behind it");
      return;
    }

    const rec = addAdjustment({
      date,
      customerId: customer?.id,
      supplierId: supplier?.id,
      amount: signed,
      reason: reason.trim(),
      createdBy: user?.name ?? "Unknown",
    });

    if (!rec) {
      toast.error("That adjustment could not be recorded");
      return;
    }

    toast.success(
      mode === "writeOff"
        ? `${money(magnitude)} written off — ${party.name} is now clear`
        : mode === "increase"
          ? `${whoOwes} ${money(after)}, up by ${money(magnitude)}`
          : `${whoOwes} ${money(after)}, down by ${money(magnitude)}`,
    );
    onClose();
  };

  const modes: { key: Mode; label: string; hint: string }[] = [
    { key: "reduce", label: "Reduce", hint: "Take some of it off" },
    { key: "increase", label: "Increase", hint: "Add to what is owed" },
    { key: "writeOff", label: "Write off all", hint: "Clear the whole balance" },
  ];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-4 w-4" /> Adjust {party.name}
          </DialogTitle>
          <DialogDescription>
            {outstanding > 0
              ? `${whoOwes} ${money(outstanding)} right now.`
              : `${whoOwes} nothing right now.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>What are you doing?</Label>
            <div className="grid grid-cols-3 gap-2">
              {modes.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMode(m.key)}
                  disabled={m.key === "writeOff" && outstanding <= 0}
                  className={cn(
                    "rounded-md border px-2 py-2 text-sm transition-colors",
                    mode === m.key
                      ? m.key === "writeOff"
                        ? "bg-destructive text-white border-destructive"
                        : "bg-primary text-primary-foreground border-primary"
                      : "hover:bg-muted",
                    m.key === "writeOff" && outstanding <= 0 && "opacity-40 cursor-not-allowed hover:bg-transparent",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{modes.find((m) => m.key === mode)?.hint}</p>
          </div>

          {mode !== "writeOff" && (
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input
                type="number"
                min={0}
                autoFocus
                value={amount || ""}
                onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))}
              />
              {mode === "reduce" && outstanding > 0 && (
                <Button size="sm" variant="outline" onClick={() => setAmount(outstanding)}>
                  All of it — {money(outstanding)}
                </Button>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Why</Label>
            <Input
              autoFocus={mode === "writeOff"}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                mode === "writeOff"
                  ? "e.g. Shop closed down, not recoverable"
                  : mode === "increase"
                    ? "e.g. Balance carried over from the old register"
                    : "e.g. Agreed discount on the September account"
              }
            />
            <p className="text-xs text-muted-foreground">
              Shown on their statement. It is the only record of why this figure moved.
            </p>
          </div>

          {/* What the balance becomes, stated before it happens — this is the
              one screen where the number does not come from a document. */}
          <div className="rounded-lg bg-muted/40 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{whoOwes} now</span>
              <span>{money(outstanding)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">This adjustment</span>
              <span className={signed < 0 ? "text-success-strong" : "text-warning-strong"}>
                {signed < 0 ? "−" : "+"} {money(magnitude)}
              </span>
            </div>
            <div className="mt-1 flex justify-between border-t pt-2 font-semibold">
              <span>Afterwards</span>
              <span>{after === 0 ? "Nothing owed" : money(after)}</span>
            </div>
          </div>

          {mode === "writeOff" && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
              <div>
                <div className="font-medium text-destructive">This says the money is never coming.</div>
                <p className="mt-1 text-muted-foreground">
                  The invoices stay exactly as they are — they are the record of goods that really left
                  the shop. Only the balance is cleared, and it can be undone from the Ledgers tab.
                </p>
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            No money changes hands, so this never reaches a till or a day&apos;s cash count.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant={mode === "writeOff" ? "destructive" : "default"} onClick={save}>
            {mode === "writeOff" ? `Write off ${money(magnitude)}` : "Record adjustment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
