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
import { Plus } from "lucide-react";
import { toast } from "sonner";

const BASE_CATS = ["Rent", "Salary", "Bills", "Transport", "Misc"];
/** Sentinel for the "type my own" entry in the category dropdown. */
const CUSTOM = "__custom__";

export const Route = createFileRoute("/app/expenses")({ component: ExpensesPage });

function ExpensesPage() {
  const { user, expenses, shops, addExpense } = useStore();
  const isAdmin = user?.role === "admin";
  const [open, setOpen] = useState(false);
  const [isCustom, setIsCustom] = useState(false);
  const [customCat, setCustomCat] = useState("");
  const [form, setForm] = useState({
    date: todayISO(),
    shopId: user?.shopId ?? shops[0]?.id ?? "",
    category: "Misc",
    description: "",
    amount: 0,
  });

  const rows = expenses.filter((e) => (isAdmin ? true : e.shopId === user?.shopId));

  // Categories already used in recorded expenses join the list, so a custom one
  // typed today is reusable tomorrow instead of being typed again.
  const categories = useMemo(
    () => Array.from(new Set([...BASE_CATS, ...expenses.map((e) => e.category)])).sort(),
    [expenses],
  );

  const save = () => {
    const category = isCustom ? customCat.trim() : form.category;
    if (!category) { toast.error("Category required"); return; }
    if (!form.description.trim() || form.amount <= 0) { toast.error("Description and amount required"); return; }
    addExpense({ ...form, category, description: form.description.trim(), addedBy: user?.name ?? "Unknown" });
    toast.success("Expense recorded");
    setOpen(false);
    setForm({ ...form, category, description: "", amount: 0 });
    setIsCustom(false);
    setCustomCat("");
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
                <Select
                  value={isCustom ? CUSTOM : form.category}
                  onValueChange={(v) => {
                    if (v === CUSTOM) { setIsCustom(true); return; }
                    setIsCustom(false);
                    setForm({ ...form, category: v });
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    <SelectItem value={CUSTOM}>+ Add custom category…</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {isCustom && (
                <div className="space-y-1.5 col-span-2">
                  <Label>New category name</Label>
                  <Input
                    autoFocus
                    value={customCat}
                    onChange={(e) => setCustomCat(e.target.value)}
                    placeholder="e.g. Marketing, Repairs, Packaging"
                  />
                  <p className="text-xs text-muted-foreground">Saved with this expense and offered in the list from then on.</p>
                </div>
              )}
              <div className="space-y-1.5"><Label>Amount (Rs)</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></div>
              <div className="space-y-1.5 col-span-2"><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      } />
      <Card className="overflow-hidden">
        {/* Was missing the scroll wrapper every other table has — it overflowed the card on mobile. */}
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 sticky top-0 z-10"><tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
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
            {rows.length === 0 && (
              <tr><td colSpan={isAdmin ? 6 : 5} className="px-4 py-12 text-center text-sm text-muted-foreground">No expenses recorded yet.</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </Card>
    </div>
  );
}