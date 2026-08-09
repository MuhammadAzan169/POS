import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useStore, formatRs, todayISO } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Undo2 } from "lucide-react";
import { Confirm } from "@/components/Confirm";
import { toast } from "sonner";

export const Route = createFileRoute("/app/returns")({ component: ReturnsPage });

function ReturnsPage() {
  const { user, returns, sales, shops, addReturn } = useStore();
  const isAdmin = user?.role === "admin";
  const rows = returns.filter((r) => (isAdmin ? true : r.shopId === user?.shopId));

  const eligible = useMemo(
    () => sales.filter((s) => (isAdmin ? true : s.shopId === user?.shopId) && s.status !== "Returned"),
    [sales, isAdmin, user?.shopId],
  );

  const [open, setOpen] = useState(false);
  const [invoiceId, setInvoiceId] = useState("");
  const [reason, setReason] = useState("Customer return");
  const [refund, setRefund] = useState(0);

  const selectedSale = sales.find((s) => s.id === invoiceId);

  const pickInvoice = (id: string) => {
    setInvoiceId(id);
    const sale = sales.find((s) => s.id === id);
    setRefund(sale?.total ?? 0);
  };

  const save = () => {
    const sale = sales.find((s) => s.id === invoiceId);
    if (!sale) { toast.error("Select an invoice"); return; }
    addReturn({
      date: todayISO(),
      shopId: sale.shopId,
      invoice: sale.invoice,
      items: sale.lines.map((l) => ({ productId: l.productId, name: l.name, qty: l.qty })),
      refund: refund || sale.total,
      reason: reason || "Customer return",
    });
    toast.success(`Return recorded for ${sale.invoice}`);
    setOpen(false);
    setInvoiceId("");
    setReason("Customer return");
    setRefund(0);
  };

  return (
    <div>
      <PageHeader
        title="Returns"
        subtitle={isAdmin ? "Refunds across every shop." : "Your shop's returns."}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Undo2 className="h-4 w-4 mr-1.5" />New return</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New return</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Original invoice</Label>
                  <Select value={invoiceId} onValueChange={pickInvoice}>
                    <SelectTrigger><SelectValue placeholder="Select an invoice…" /></SelectTrigger>
                    <SelectContent>
                      {eligible.slice(0, 50).map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.invoice} · {s.customer} · {formatRs(s.total)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Refund amount (Rs)</Label>
                  <Input type="number" value={refund} onChange={(e) => setRefund(Number(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Reason</Label>
                  <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Wrong size, damaged item" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Confirm
                  title="Record this return?"
                  description={
                    <>
                      A refund of <strong>{formatRs(refund || selectedSale?.total || 0)}</strong> will be recorded,
                      the items go back into stock, and{" "}
                      <strong>{selectedSale?.invoice ?? "the invoice"}</strong> is marked as returned. This can't be undone.
                    </>
                  }
                  confirmLabel="Record return"
                  destructive
                  disabled={!invoiceId}
                  onConfirm={save}
                  trigger={<Button disabled={!invoiceId}>Save return</Button>}
                />
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />
      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <div className="text-center py-20 text-sm text-muted-foreground">
            <div className="inline-flex h-12 w-12 rounded-full bg-muted items-center justify-center mb-3"><Undo2 className="h-5 w-5" /></div>
            <div>No returns yet.</div>
            <div className="text-xs mt-1">Use “New return” above, or open any sale invoice and choose Return.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50"><tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-medium">Return no</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Shop</th>
                <th className="px-4 py-3 font-medium">Invoice</th>
                <th className="px-4 py-3 font-medium text-right">Refund</th>
                <th className="px-4 py-3 font-medium">Reason</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-4 py-3 font-mono text-xs">{r.returnNo}</td>
                    <td className="px-4 py-3">{r.date}</td>
                    <td className="px-4 py-3">{shops.find((s) => s.id === r.shopId)?.name}</td>
                    <td className="px-4 py-3 font-mono text-xs">{r.invoice}</td>
                    <td className="px-4 py-3 text-right">{formatRs(r.refund)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
