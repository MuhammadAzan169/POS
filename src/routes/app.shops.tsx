import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useStore, shopKind, formatRs, type Shop, type ShopKind } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { StatusPill } from "@/components/Stat";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Store, Warehouse } from "lucide-react";
import { Confirm } from "@/components/Confirm";
import { toast } from "sonner";

export const Route = createFileRoute("/app/shops")({ component: ShopsPage });

const EMPTY = { name: "", kind: "retail" as ShopKind, address: "", phone: "" };

/** What each shop type actually does differently, shown while you pick one. */
const KIND_BLURB: Record<ShopKind, string> = {
  retail: "Sells to walk-in customers at the shelf price. Runs a day book: the shopkeeper starts and ends each trading day and hands over the cash.",
  wholesale: "Sells in bulk to outside buyers — other shopkeepers, or anyone buying in quantity — at the wholesale rate instead of the shelf price. Runs a day book like any other outlet.",
};

function ShopsPage() {
  const { user, shops, users, sales, inventory, products, addShop, updateShop, settings } = useStore();
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
  const openEdit = (s: Shop) => {
    setEditing(s);
    setForm({ name: s.name, kind: shopKind(s), address: s.address, phone: s.phone });
    setOpen(true);
  };

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
      <PageHeader
        title="Shops"
        subtitle="Retail branches and wholesale counters. The type decides how a shop prices and sells."
        actions={<Button onClick={openAdd}><Plus className="h-4 w-4 mr-1.5" />Add shop</Button>}
      />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {shops.map((s) => {
          const linked = users.find((u) => u.shopId === s.id);
          const kind = shopKind(s);
          const wholesale = kind === "wholesale";
          const takings = sales.filter((x) => x.shopId === s.id && x.status !== "Returned").reduce((a, x) => a + x.total, 0);
          const stockValue = inventory
            .filter((r) => r.shopId === s.id)
            .reduce((a, r) => a + (products.find((p) => p.id === r.productId)?.cost ?? 0) * r.qty, 0);
          return (
            <Card key={s.id} className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                  wholesale ? "bg-accent/20 text-accent-strong" : "bg-primary/10 text-primary"
                }`}>
                  {wholesale ? <Warehouse className="h-5 w-5" /> : <Store className="h-5 w-5" />}
                </div>
                <div className="flex flex-wrap justify-end gap-1.5">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                    wholesale
                      ? "bg-accent/15 text-accent-strong border-accent/30"
                      : "bg-muted text-muted-foreground border-border"
                  }`}>
                    {wholesale ? "Wholesale" : "Retail"}
                  </span>
                  <StatusPill status={s.active ? "Active" : "Disabled"} />
                </div>
              </div>
              <h3 className="font-semibold mt-4">{s.name}</h3>
              <div className="text-sm text-muted-foreground mt-1">{s.address}</div>
              <div className="text-sm text-muted-foreground">{s.phone}</div>
              <dl className="mt-4 pt-4 border-t grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">Takings</dt>
                  <dd className="font-medium mt-0.5">{formatRs(takings, settings.currency)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">Stock at cost</dt>
                  <dd className="font-medium mt-0.5">{formatRs(stockValue, settings.currency)}</dd>
                </div>
              </dl>
              <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
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
            <div className="space-y-1.5">
              <Label>Shop type</Label>
              <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as ShopKind })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="retail">Retail branch</SelectItem>
                  <SelectItem value="wholesale">Wholesale counter</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{KIND_BLURB[form.kind]}</p>
            </div>
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
