import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useStore, type Shop } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { StatusPill } from "@/components/Stat";
import { Plus, Store } from "lucide-react";
import { Confirm } from "@/components/Confirm";
import { toast } from "sonner";

export const Route = createFileRoute("/app/shops")({ component: ShopsPage });

const EMPTY = { name: "", address: "", phone: "" };

function ShopsPage() {
  const { user, shops, users, addShop, updateShop } = useStore();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Shop | null>(null);
  const [form, setForm] = useState(EMPTY);

  if (user?.role !== "admin") {
    return (
      <div>
        <PageHeader title="Shops" subtitle="Manage outlet locations." />
        <Card className="p-10 text-center text-sm text-muted-foreground">Admins only.</Card>
      </div>
    );
  }

  const openAdd = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (s: Shop) => { setEditing(s); setForm({ name: s.name, address: s.address, phone: s.phone }); setOpen(true); };

  const save = () => {
    if (!form.name.trim()) { toast.error("Shop name required"); return; }
    if (editing) {
      updateShop({ ...editing, ...form });
      toast.success("Shop updated");
    } else {
      addShop({ ...form, active: true });
      toast.success("Shop added");
    }
    setOpen(false);
  };

  const toggleActive = (s: Shop) => {
    updateShop({ ...s, active: !s.active });
    toast.success(s.active ? `${s.name} deactivated` : `${s.name} activated`);
  };

  return (
    <div>
      <PageHeader title="Shops" subtitle="Manage outlet locations." actions={<Button onClick={openAdd}><Plus className="h-4 w-4 mr-1.5" />Add shop</Button>} />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {shops.map((s) => {
          const linked = users.find((u) => u.shopId === s.id);
          return (
            <Card key={s.id} className="p-5">
              <div className="flex items-start justify-between">
                <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><Store className="h-5 w-5" /></div>
                <StatusPill status={s.active ? "Active" : "Disabled"} />
              </div>
              <h3 className="font-semibold mt-4">{s.name}</h3>
              <div className="text-sm text-muted-foreground mt-1">{s.address}</div>
              <div className="text-sm text-muted-foreground">{s.phone}</div>
              <div className="mt-4 pt-4 border-t text-xs text-muted-foreground">
                Linked login: <span className="text-foreground font-medium">{linked?.email ?? "—"}</span>
              </div>
              <div className="flex gap-2 mt-4">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(s)}>Edit</Button>
                {s.active ? (
                  <Confirm
                    title={`Deactivate ${s.name}?`}
                    description="The outlet stops appearing as an active location. Its sales history and stock are kept, and you can reactivate it at any time."
                    confirmLabel="Deactivate"
                    destructive
                    onConfirm={() => toggleActive(s)}
                    trigger={<Button variant="outline" size="sm" className="flex-1">Deactivate</Button>}
                  />
                ) : (
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => toggleActive(s)}>Activate</Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit shop" : "Add shop"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>Shop name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Gulberg Outlet" /></div>
            <div className="space-y-1.5"><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>{editing ? "Save changes" : "Add shop"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
