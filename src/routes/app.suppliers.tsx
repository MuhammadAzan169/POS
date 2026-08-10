import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useStore, formatRs, type Supplier } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { StatusPill } from "@/components/Stat";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Confirm } from "@/components/Confirm";
import { MobileCards, ListCard, TableWrap } from "@/components/DataList";
import { Plus, Download, Search, Pencil, Truck, Phone, Mail, MapPin, PackagePlus } from "lucide-react";
import { downloadCsv } from "@/lib/export";
import { toast } from "sonner";

export const Route = createFileRoute("/app/suppliers")({ component: SuppliersPage });

const EMPTY: Omit<Supplier, "id"> = {
  name: "", contact: "", phone: "", email: "", address: "", notes: "", active: true,
};

/** Add / edit form, shared by both actions. */
function SupplierDialog({
  open, initial, onClose, onSaved,
}: {
  open: boolean;
  initial?: Supplier | null;
  onClose: () => void;
  onSaved?: (s: Supplier) => void;
}) {
  const { suppliers, addSupplier, updateSupplier } = useStore();
  const [form, setForm] = useState<Omit<Supplier, "id">>(initial ?? EMPTY);

  // Re-seed when a different supplier is opened.
  const [seed, setSeed] = useState(initial?.id ?? "new");
  const key = initial?.id ?? "new";
  if (key !== seed) { setSeed(key); setForm(initial ?? EMPTY); }

  const save = () => {
    const name = form.name.trim();
    if (!name) { toast.error("Supplier name required"); return; }
    const clash = suppliers.some((s) => s.name.toLowerCase() === name.toLowerCase() && s.id !== initial?.id);
    if (clash) { toast.error(`“${name}” already exists`); return; }

    if (initial) {
      updateSupplier({ ...initial, ...form, name });
      toast.success("Supplier updated");
      onSaved?.({ ...initial, ...form, name });
    } else {
      const created = addSupplier({ ...form, name });
      toast.success(`${name} added`);
      onSaved?.(created);
    }
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{initial ? "Edit supplier" : "New supplier"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Supplier / vendor name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Glow Cosmetics Pvt" />
          </div>
          <div className="space-y-1.5">
            <Label>Contact person</Label>
            <Input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="Optional" />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Optional" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Optional" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Address</Label>
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Optional" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Notes</Label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Delivery days, credit terms, minimums…" />
          </div>
          <div className="sm:col-span-2 flex items-center justify-between gap-3 p-3 border rounded-lg">
            <div>
              <div className="font-medium text-sm">Active</div>
              <div className="text-xs text-muted-foreground">Inactive suppliers stay in history but aren't offered on new bills.</div>
            </div>
            <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>{initial ? "Save changes" : "Add supplier"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SuppliersPage() {
  const { user, suppliers, purchases, returns, products, shops, settings } = useStore();
  const isAdmin = user?.role === "admin";
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const money = (n: number) => formatRs(n, settings.currency);

  /** Bills belong to a supplier by id, falling back to the name on older records. */
  const billsFor = (s: Supplier) =>
    purchases.filter((p) => (p.supplierId ? p.supplierId === s.id : p.supplier === s.name));
  const returnsFor = (s: Supplier) =>
    returns.filter((r) => r.kind === "supplier" && (r.supplierId ? r.supplierId === s.id : r.supplier === s.name));

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return suppliers
      .map((s) => {
        const bills = billsFor(s);
        const credits = returnsFor(s);
        const units = bills.reduce((a, b) => a + b.lines.reduce((x, l) => x + l.qty, 0), 0);
        const distinctItems = new Set(bills.flatMap((b) => b.lines.map((l) => l.productId))).size;
        const last = bills.map((b) => b.date).sort().at(-1);
        return {
          supplier: s,
          bills: bills.length,
          units,
          distinctItems,
          spent: bills.reduce((a, b) => a + b.total, 0),
          credited: credits.reduce((a, r) => a + r.refund, 0),
          lastPurchase: last,
        };
      })
      .filter((r) =>
        term
          ? r.supplier.name.toLowerCase().includes(term) ||
            r.supplier.contact.toLowerCase().includes(term) ||
            r.supplier.phone.includes(term)
          : true,
      )
      .sort((a, b) => b.spent - a.spent || a.supplier.name.localeCompare(b.supplier.name));
  }, [suppliers, purchases, returns, q]);

  const open = openId ? suppliers.find((s) => s.id === openId) ?? null : null;
  const openBills = open ? billsFor(open).slice().sort((a, b) => b.date.localeCompare(a.date)) : [];
  const openReturns = open ? returnsFor(open) : [];

  /** Everything ever bought from this supplier, rolled up per product. */
  const openItems = useMemo(() => {
    if (!open) return [];
    const map = new Map<string, { name: string; barcode: string; qty: number; spent: number; lastRate: number; lastDate: string }>();
    billsFor(open).forEach((b) =>
      b.lines.forEach((l) => {
        const product = products.find((p) => p.id === l.productId);
        const cur = map.get(l.productId) ?? {
          name: product?.name ?? l.productId, barcode: product?.barcode ?? "", qty: 0, spent: 0, lastRate: l.rate, lastDate: b.date,
        };
        cur.qty += l.qty;
        cur.spent += l.qty * l.rate;
        if (b.date >= cur.lastDate) { cur.lastDate = b.date; cur.lastRate = l.rate; }
        map.set(l.productId, cur);
      }),
    );
    return [...map.entries()].map(([productId, v]) => ({ productId, ...v })).sort((a, b) => b.spent - a.spent);
  }, [open, purchases, products]);

  const exportCsv = () => {
    if (rows.length === 0) { toast.error("Nothing to export"); return; }
    downloadCsv(
      `suppliers-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Supplier", "Contact", "Phone", "Email", "Address", "Bills", "Distinct items", "Units bought", "Total spent", "Credit from returns", "Last purchase", "Status", "Notes"],
      rows.map((r) => [
        r.supplier.name, r.supplier.contact, r.supplier.phone, r.supplier.email, r.supplier.address,
        r.bills, r.distinctItems, r.units, r.spent, r.credited, r.lastPurchase ?? "", r.supplier.active ? "Active" : "Disabled", r.supplier.notes,
      ]),
    );
    toast.success(`Exported ${rows.length} suppliers`);
  };

  const exportItems = () => {
    if (!open || openItems.length === 0) { toast.error("Nothing to export"); return; }
    downloadCsv(
      `${open.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-items.csv`,
      ["Product", "Barcode", "Units bought", "Total spent", "Latest rate", "Last bought"],
      openItems.map((i) => [i.name, i.barcode, i.qty, i.spent, i.lastRate, i.lastDate]),
    );
    toast.success("Item history exported");
  };

  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="Suppliers" subtitle="Vendors and wholesalers you buy stock from." />
        <Card className="p-10 text-center text-sm text-muted-foreground">Admins only.</Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Suppliers"
        subtitle="Vendors you buy stock from. Open one to see everything bought from them."
        actions={
          <>
            <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-1.5" />Export CSV</Button>
            <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4 mr-1.5" />Add supplier</Button>
          </>
        }
      />

      <Card className="p-3 sm:p-4 mb-4 grid gap-3 sm:flex sm:flex-wrap sm:items-end">
        <div className="space-y-1.5">
          <Label className="text-xs">Search</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input placeholder="Name, contact or phone…" className="pl-9 w-full sm:w-64" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <div className="text-xs text-muted-foreground sm:ml-auto">
          {rows.length} suppliers · {money(rows.reduce((a, r) => a + r.spent, 0))} spent
        </div>
      </Card>

      <Card className="overflow-hidden">
        <MobileCards
          items={rows}
          keyOf={(r) => r.supplier.id}
          empty={q ? `No supplier matches “${q}”.` : "No suppliers yet — add your first one."}
          render={(r) => (
            <ListCard
              onClick={() => setOpenId(r.supplier.id)}
              title={r.supplier.name}
              subtitle={[r.supplier.contact, r.supplier.phone].filter(Boolean).join(" · ") || "No contact details"}
              right={money(r.spent)}
              rightSub="total spent"
              badges={<StatusPill status={r.supplier.active ? "Active" : "Disabled"} />}
              fields={[
                { label: "Bills", value: r.bills },
                { label: "Items", value: r.distinctItems },
                { label: "Units", value: r.units },
                { label: "Last purchase", value: r.lastPurchase ?? "Never" },
              ]}
              actions={
                <Button size="sm" variant="outline" onClick={() => setEditing(r.supplier)}>
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />Edit
                </Button>
              }
            />
          )}
        />
        <TableWrap>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0 z-10">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-medium">Supplier</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium text-right">Bills</th>
                <th className="px-4 py-3 font-medium text-right">Items</th>
                <th className="px-4 py-3 font-medium text-right">Units</th>
                <th className="px-4 py-3 font-medium text-right">Total spent</th>
                <th className="px-4 py-3 font-medium">Last purchase</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.supplier.id}
                  className="border-t hover:bg-muted/40 cursor-pointer"
                  onClick={() => setOpenId(r.supplier.id)}
                >
                  <td className="px-4 py-3 font-medium">{r.supplier.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.supplier.contact || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.supplier.phone || "—"}</td>
                  <td className="px-4 py-3 text-right">{r.bills}</td>
                  <td className="px-4 py-3 text-right">{r.distinctItems}</td>
                  <td className="px-4 py-3 text-right">{r.units}</td>
                  <td className="px-4 py-3 text-right font-medium">{money(r.spent)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.lastPurchase ?? "Never"}</td>
                  <td className="px-4 py-3"><StatusPill status={r.supplier.active ? "Active" : "Disabled"} /></td>
                  <td className="px-4 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(r.supplier)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  {q ? `No supplier matches “${q}”.` : "No suppliers yet — add your first one."}
                </td></tr>
              )}
            </tbody>
          </table>
        </TableWrap>
      </Card>

      {/* ---------- Supplier detail ---------- */}
      <Sheet open={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {open && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Truck className="h-4 w-4 text-muted-foreground" />
                  {open.name}
                </SheetTitle>
                <SheetDescription>{open.notes || "No notes recorded."}</SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-5">
                <div className="grid sm:grid-cols-2 gap-3 text-sm">
                  <Info icon={<Pencil className="h-3.5 w-3.5" />} label="Contact" value={open.contact || "—"} />
                  <Info icon={<Phone className="h-3.5 w-3.5" />} label="Phone" value={open.phone || "—"} />
                  <Info icon={<Mail className="h-3.5 w-3.5" />} label="Email" value={open.email || "—"} />
                  <Info icon={<MapPin className="h-3.5 w-3.5" />} label="Address" value={open.address || "—"} />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Stat label="Bills" value={String(openBills.length)} />
                  <Stat label="Units bought" value={String(openBills.reduce((a, b) => a + b.lines.reduce((x, l) => x + l.qty, 0), 0))} />
                  <Stat label="Total spent" value={money(openBills.reduce((a, b) => a + b.total, 0))} />
                  <Stat label="Returned credit" value={money(openReturns.reduce((a, r) => a + r.refund, 0))} />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(open)}>
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />Edit details
                  </Button>
                  <Button size="sm" variant="outline" onClick={exportItems}>
                    <Download className="h-3.5 w-3.5 mr-1.5" />Export items
                  </Button>
                  <Button size="sm" onClick={() => navigate({ to: "/app/purchases", search: {} })}>
                    <PackagePlus className="h-3.5 w-3.5 mr-1.5" />New purchase
                  </Button>
                </div>

                <Separator />

                <section>
                  <h4 className="font-semibold text-sm mb-2">Items bought from this supplier</h4>
                  {openItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4">Nothing bought from them yet.</p>
                  ) : (
                    <div className="border rounded-lg overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium">Item</th>
                            <th className="px-3 py-2 text-left font-medium">Barcode</th>
                            <th className="px-3 py-2 text-right font-medium">Units</th>
                            <th className="px-3 py-2 text-right font-medium">Latest rate</th>
                            <th className="px-3 py-2 text-right font-medium">Total spent</th>
                            <th className="px-3 py-2 text-left font-medium">Last bought</th>
                          </tr>
                        </thead>
                        <tbody>
                          {openItems.map((i) => (
                            <tr key={i.productId} className="border-t">
                              <td className="px-3 py-2">{i.name}</td>
                              <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{i.barcode || "—"}</td>
                              <td className="px-3 py-2 text-right">{i.qty}</td>
                              <td className="px-3 py-2 text-right">{money(i.lastRate)}</td>
                              <td className="px-3 py-2 text-right font-medium">{money(i.spent)}</td>
                              <td className="px-3 py-2 text-muted-foreground">{i.lastDate}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                <section>
                  <h4 className="font-semibold text-sm mb-2">Purchase history</h4>
                  {openBills.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4">No bills recorded.</p>
                  ) : (
                    <div className="space-y-2">
                      {openBills.map((b) => (
                        <div key={b.id} className="border rounded-lg p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-mono text-xs">{b.billNo}</div>
                            <div className="text-xs text-muted-foreground">{b.date}</div>
                            <div className="font-medium">{money(b.total)}</div>
                          </div>
                          <div className="mt-1.5 text-xs text-muted-foreground">
                            {b.lines.map((l) => {
                              const p = products.find((x) => x.id === l.productId);
                              return `${l.qty} × ${p?.name ?? l.productId} → ${shops.find((s) => s.id === l.shopId)?.name ?? ""}`;
                            }).join(" · ")}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {openReturns.length > 0 && (
                  <section>
                    <h4 className="font-semibold text-sm mb-2">Returned to this supplier</h4>
                    <div className="space-y-2">
                      {openReturns.map((r) => (
                        <div key={r.id} className="border rounded-lg p-3 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-mono text-xs">{r.returnNo} · {r.invoice}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {r.items.map((i) => `${i.qty} × ${i.name}`).join(", ")} — {r.reason}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-medium">{money(r.refund)}</div>
                            <div className="text-xs text-muted-foreground">{r.date}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <SupplierDialog open={adding} onClose={() => setAdding(false)} />
      <SupplierDialog open={!!editing} initial={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">{icon}{label}</div>
      <div className="font-medium mt-0.5 break-words">{value}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border rounded-lg p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold mt-0.5">{value}</div>
    </div>
  );
}
