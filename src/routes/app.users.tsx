import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { StatusPill } from "@/components/Stat";
import { Plus } from "lucide-react";
import { Confirm } from "@/components/Confirm";
import { toast } from "sonner";

export const Route = createFileRoute("/app/users")({ component: UsersPage });

function UsersPage() {
  const { user, users, shops, addUser } = useStore();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", shopId: shops[0]?.id ?? "" });

  if (user?.role !== "admin") {
    return (
      <div>
        <PageHeader title="Users" subtitle="Manage owner & shop logins." />
        <Card className="p-10 text-center text-sm text-muted-foreground">Admins only.</Card>
      </div>
    );
  }

  const save = () => {
    if (!form.name.trim() || !form.email.trim()) { toast.error("Name and email required"); return; }
    if (users.some((u) => u.email.toLowerCase() === form.email.toLowerCase())) { toast.error("That email already exists"); return; }
    addUser({ name: form.name, email: form.email, role: "shop", shopId: form.shopId, active: true });
    toast.success("Shop login created");
    setOpen(false);
    setForm({ name: "", email: "", shopId: shops[0]?.id ?? "" });
  };

  return (
    <div>
      <PageHeader title="Users" subtitle="Manage owner & shop logins." actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1.5" />Add shop login</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New shop login</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Shop 4 Cashier" /></div>
              <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="shop4@apos.pk" /></div>
              <div className="space-y-1.5"><Label>Shop</Label>
                <Select value={form.shopId} onValueChange={(v) => setForm({ ...form, shopId: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{shops.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save}>Create login</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      } />
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50"><tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Shop</th>
              <th className="px-4 py-3 font-medium">Last login</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3"></th>
            </tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t hover:bg-muted/40">
                  <td className="px-4 py-3 font-medium">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">{u.name.charAt(0)}</div>
                      {u.name}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${u.role === "admin" ? "bg-primary/15 text-primary" : "bg-accent/20 text-accent-strong"}`}>{u.role}</span></td>
                  <td className="px-4 py-3">{u.shopId ? shops.find((s) => s.id === u.shopId)?.name : "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{u.lastLogin ?? "—"}</td>
                  {/* Was "OK"/"OUT" — stock-level wording on a user account. */}
                  <td className="px-4 py-3"><StatusPill status={u.active ? "Active" : "Disabled"} /></td>
                  <td className="px-4 py-3 text-right">
                    <Confirm
                      title="Send a password reset?"
                      description={<>A reset link will be emailed to <strong>{u.email}</strong> and their current password will stop working.</>}
                      confirmLabel="Send reset link"
                      onConfirm={() => toast.success(`Password reset link sent to ${u.email}`)}
                      trigger={<Button variant="ghost" size="sm">Reset password</Button>}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
