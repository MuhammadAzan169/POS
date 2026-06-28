import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useStore, formatRs, todayISO } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { toast } from "sonner";

const CATS = ["Rent", "Salary", "Bills", "Transport", "Misc"];

export const Route = createFileRoute("/app/expenses")({ component: ExpensesPage });

function ExpensesPage() {
  const { user, expenses, shops, addExpense } = useStore();
  const isAdmin = user?.role === "admin";
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    date: todayISO(),
    shopId: user?.shopId ?? shops[0]?.id ?? "",
    category: "Misc",
    description: "",
    amount: 0,
  });

  const rows = expenses.filter((e) => (isAdmin ? true : e.shopId === user?.shopId));

  const save = () => {
    if (!form.description || form.amount <= 0) { toast.error("Description and amount required"); return; }
    addExpense({ ...form, addedBy: user?.name ?? "Unknown" });
    toast.success("Expense recorded");
    setOpen(false);
    setForm({ ...form, description: "", amount: 0 });
  };

  return (
    <div>
      <PageHeader title="Expenses" subtitle={isAdmin ? "Operating costs across the business." : "Your shop's expenses."} actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1.5" />Add expense</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New expense</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
              {isAdmin && (
                <div className="space-y-1.5"><Label>Shop</Label>
                  <Select value={form.shopId} onValueChange={(v) => setForm({ ...form, shopId: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{shops.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5"><Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Amount (Rs)</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></div>
              <div className="space-y-1.5 col-span-2"><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      } />
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50"><tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-3 font-medium">Date</th>
            {isAdmin && <th className="px-4 py-3 font-medium">Shop</th>}
            <th className="px-4 py-3 font-medium">Category</th>
            <th className="px-4 py-3 font-medium">Description</th>
            <th className="px-4 py-3 font-medium">Added by</th>
            <th className="px-4 py-3 font-medium text-right">Amount</th>
          </tr></thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className="border-t hover:bg-muted/40">
                <td className="px-4 py-3">{e.date}</td>
                {isAdmin && <td className="px-4 py-3">{shops.find((s) => s.id === e.shopId)?.name}</td>}
                <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 bg-muted rounded-full">{e.category}</span></td>
                <td className="px-4 py-3">{e.description}</td>
                <td className="px-4 py-3 text-muted-foreground">{e.addedBy}</td>
                <td className="px-4 py-3 text-right font-medium">{formatRs(e.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}