import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { useStore, formatRs, todayISO, type ReturnRec, type Shop, type Purchase, type Product, type Sale } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Confirm } from "@/components/Confirm";
import { Undo2, Download, PackageMinus, Info } from "lucide-react";
import { downloadCsv } from "@/lib/export";
import { toast } from "sonner";

export const Route = createFileRoute("/app/returns")({ component: ReturnsPage });

// NOTE: these components live at module level on purpose. Defining them inside
// ReturnsPage would create a new component type on every render, remounting the
// filter inputs (losing focus mid-typing) and closing any open dialog.

type Filters = { q: string; shopFilter: string; from: string; to: string };

function FilterBar({
  filters, setFilters, shops, isAdmin, onExport,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  shops: Shop[];
  isAdmin: boolean;
  onExport: () => void;
}) {
  const { q, shopFilter, from, to } = filters;
  const dirty = q || from || to || shopFilter !== "all";
  return (
    <Card className="p-4 mb-4 flex flex-wrap gap-3 items-end">
      <div className="space-y-1.5">
        <Label className="text-xs">Search</Label>
        <Input
          placeholder="Return no, invoice, item, reason…"
          value={q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          className="w-full sm:w-64"
        />
      </div>
      {isAdmin && (
        <div className="space-y-1.5">
          <Label className="text-xs">Shop</Label>
          <Select value={shopFilter} onValueChange={(v) => setFilters({ ...filters, shopFilter: v })}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All shops</SelectItem>
              {shops.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-1.5">
        <Label className="text-xs">From</Label>
        <Input type="date" value={from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} className="w-40" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">To</Label>
        <Input type="date" value={to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} className="w-40" />
      </div>
      {dirty && (
        <Button variant="ghost" size="sm" onClick={() => setFilters({ q: "", shopFilter: "all", from: "", to: "" })}>
          Clear
        </Button>
      )}
      <Button variant="outline" className="ml-auto" onClick={onExport}>
        <Download className="h-4 w-4 mr-1.5" />Export CSV
      </Button>
    </Card>
  );
}

/** Shop-side flow: pick one of your own invoices and refund it. */
function NewCustomerReturn({ sales, shopId }: { sales: Sale[]; shopId?: string }) {
  const { addReturn } = useStore();
  const [open, setOpen] = useState(false);
  const [invoiceId, setInvoiceId] = useState("");
  const [reason, setReason] = useState("Customer return");
  const [refund, setRefund] = useState(0);

  const eligible = sales.filter((s) => s.shopId === shopId && s.status !== "Returned");
  const selectedSale = sales.find((s) => s.id === invoiceId);

  const save = () => {
    if (!selectedSale) { toast.error("Select an invoice"); return; }
    addReturn({
      kind: "customer",
      date: todayISO(),
      shopId: selectedSale.shopId,
      invoice: selectedSale.invoice,
      items: selectedSale.lines.map((l) => ({ productId: l.productId, name: l.name, qty: l.qty })),
      refund: refund || selectedSale.total,
      reason: reason || "Customer return",
    });
    toast.success(`Return recorded for ${selectedSale.invoice}`);
    setOpen(false);
    setInvoiceId("");
    setReason("Customer return");
    setRefund(0);
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}><Undo2 className="h-4 w-4 mr-1.5" />New return</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New customer return</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Original invoice</Label>
              <Select
                value={invoiceId}
                onValueChange={(id) => { setInvoiceId(id); setRefund(sales.find((s) => s.id === id)?.total ?? 0); }}
              >
                <SelectTrigger><SelectValue placeholder="Select an invoice…" /></SelectTrigger>
                <SelectContent>
                  {eligible.slice(0, 50).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.invoice} · {s.customer} · {formatRs(s.total)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Refund amount</Label>
              <Input type="number" min={0} value={refund} onChange={(e) => setRefund(Math.max(0, Number(e.target.value)))} />
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
                  A refund of <strong>{formatRs(refund || selectedSale?.total || 0)}</strong> will be recorded, the items
                  go back into stock, and <strong>{selectedSale?.invoice ?? "the invoice"}</strong> is marked as returned.
                  This can't be undone.
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
    </>
  );
}

/** Admin flow: send stock back to the wholesaler. Inventory goes down. */
function NewSupplierReturn({
  purchases, products, shops, stockAt,
}: {
  purchases: Purchase[];
  products: Product[];
  shops: Shop[];
  stockAt: (productId: string, shopId: string) => number;
}) {
  const { addReturn } = useStore();
  const [open, setOpen] = useState(false);
  const [purchaseId, setPurchaseId] = useState("");
  const [shopId, setShopId] = useState("");
  const [reason, setReason] = useState("Damaged on arrival");
  const [credit, setCredit] = useState(0);
  const [qtys, setQtys] = useState<Record<string, number>>({});

  const purchase = purchases.find((p) => p.id === purchaseId);
  // Only lines that went to the selected shop can be sent back from it.
  const candidateLines = (purchase?.lines ?? []).filter((l) => (shopId ? l.shopId === shopId : true));
  const stockHere = (productId: string) => stockAt(productId, shopId);

  const pick = (id: string) => {
    const p = purchases.find((x) => x.id === id);
    setPurchaseId(id);
    setShopId(p?.lines[0]?.shopId ?? "");
    setQtys({});
    setCredit(0);
  };

  const chosen = candidateLines
    .map((l) => ({ line: l, product: products.find((p) => p.id === l.productId), qty: qtys[l.productId] ?? 0 }))
    .filter((x) => x.qty > 0 && x.product);

  const suggestedCredit = chosen.reduce((a, x) => a + x.qty * x.line.rate, 0);

  const save = () => {
    if (!purchase) { toast.error("Select a purchase bill"); return; }
    if (!shopId) { toast.error("Select the shop the stock leaves from"); return; }
    if (chosen.length === 0) { toast.error("Enter a quantity for at least one item"); return; }
    // Never let a return drive a shop's stock negative.
    const overdrawn = chosen.find((x) => x.qty > stockHere(x.product!.id));
    if (overdrawn) {
      toast.error(`Only ${stockHere(overdrawn.product!.id)} of ${overdrawn.product!.name} in stock at this shop`);
      return;
    }
    addReturn({
      kind: "supplier",
      date: todayISO(),
      shopId,
      invoice: purchase.billNo,
      supplier: purchase.supplier,
      items: chosen.map((x) => ({ productId: x.product!.id, name: x.product!.name, qty: x.qty })),
      refund: credit || suggestedCredit,
      reason: reason || "Returned to supplier",
    });
    toast.success(`Returned to ${purchase.supplier}`);
    setOpen(false);
    setPurchaseId(""); setShopId(""); setQtys({}); setCredit(0); setReason("Damaged on arrival");
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}><PackageMinus className="h-4 w-4 mr-1.5" />Return to supplier</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Return stock to supplier</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Purchase bill</Label>
                <Select value={purchaseId} onValueChange={pick}>
                  <SelectTrigger><SelectValue placeholder="Select a bill…" /></SelectTrigger>
                  <SelectContent>
                    {purchases.slice(0, 50).map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.billNo} · {p.supplier} · {p.date}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Return from shop</Label>
                <Select value={shopId} onValueChange={(v) => { setShopId(v); setQtys({}); }} disabled={!purchase}>
                  <SelectTrigger><SelectValue placeholder="Select a shop…" /></SelectTrigger>
                  <SelectContent>
                    {Array.from(new Set((purchase?.lines ?? []).map((l) => l.shopId))).map((sid) => (
                      <SelectItem key={sid} value={sid}>{shops.find((s) => s.id === sid)?.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {purchase && shopId && (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Item</th>
                      <th className="px-3 py-2 text-left font-medium">Barcode</th>
                      <th className="px-3 py-2 text-right font-medium">Bought</th>
                      <th className="px-3 py-2 text-right font-medium">In stock</th>
                      <th className="px-3 py-2 text-right font-medium w-28">Return qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidateLines.map((l) => {
                      const p = products.find((x) => x.id === l.productId);
                      if (!p) return null;
                      return (
                        <tr key={l.productId} className="border-t">
                          <td className="px-3 py-2">{p.name}</td>
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{p.barcode || "—"}</td>
                          <td className="px-3 py-2 text-right text-muted-foreground">{l.qty}</td>
                          <td className="px-3 py-2 text-right">{stockHere(p.id)}</td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              min={0}
                              max={Math.min(l.qty, stockHere(p.id))}
                              value={qtys[l.productId] ?? 0}
                              onChange={(e) => setQtys((prev) => ({ ...prev, [l.productId]: Math.max(0, Number(e.target.value) || 0) }))}
                              className="h-8 text-right"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Credit from supplier</Label>
                <Input type="number" min={0} value={credit || suggestedCredit} onChange={(e) => setCredit(Math.max(0, Number(e.target.value)))} />
                <p className="text-xs text-muted-foreground">Suggested from purchase rates: {formatRs(suggestedCredit)}</p>
              </div>
              <div className="space-y-1.5">
                <Label>Reason</Label>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Damaged, expired, unsold" />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Confirm
              title="Send this stock back?"
              description={
                <>
                  {chosen.reduce((a, x) => a + x.qty, 0)} unit(s) will be removed from{" "}
                  <strong>{shops.find((s) => s.id === shopId)?.name}</strong> and a credit of{" "}
                  <strong>{formatRs(credit || suggestedCredit)}</strong> recorded against{" "}
                  <strong>{purchase?.supplier}</strong>. This can't be undone.
                </>
              }
              confirmLabel="Return to supplier"
              destructive
              disabled={chosen.length === 0}
              onConfirm={save}
              trigger={<Button disabled={chosen.length === 0}>Save return</Button>}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EmptyState({ icon, title, hint }: { icon: ReactNode; title: string; hint: string }) {
  return (
    <div className="text-center py-20 text-sm text-muted-foreground">
      <div className="inline-flex h-12 w-12 rounded-full bg-muted items-center justify-center mb-3">{icon}</div>
      <div>{title}</div>
      <div className="text-xs mt-1">{hint}</div>
    </div>
  );
}

function ReturnsPage() {
  const { user, returns, sales, purchases, products, shops, inventory } = useStore();
  const isAdmin = user?.role === "admin";
  const [filters, setFilters] = useState<Filters>({ q: "", shopFilter: "all", from: "", to: "" });

  const stockAt = (productId: string, shopId: string) =>
    inventory.find((r) => r.productId === productId && r.shopId === shopId)?.qty ?? 0;

  const visible = useMemo(
    () => returns.filter((r) => (isAdmin ? true : r.shopId === user?.shopId)),
    [returns, isAdmin, user?.shopId],
  );

  const applyFilters = (list: ReturnRec[]) =>
    list
      .filter((r) => (filters.shopFilter === "all" ? true : r.shopId === filters.shopFilter))
      .filter((r) => (filters.from ? r.date >= filters.from : true))
      .filter((r) => (filters.to ? r.date <= filters.to : true))
      .filter((r) => {
        const term = filters.q.trim().toLowerCase();
        if (!term) return true;
        return (
          r.returnNo.toLowerCase().includes(term) ||
          r.invoice.toLowerCase().includes(term) ||
          r.reason.toLowerCase().includes(term) ||
          (r.supplier ?? "").toLowerCase().includes(term) ||
          r.items.some((i) => i.name.toLowerCase().includes(term))
        );
      });

  const customerRows = applyFilters(visible.filter((r) => r.kind === "customer"));
  const supplierRows = applyFilters(visible.filter((r) => r.kind === "supplier"));

  const exportRows = (rows: ReturnRec[], kind: "customer" | "supplier") => {
    if (rows.length === 0) { toast.error("Nothing to export"); return; }
    downloadCsv(
      `${kind}-returns-${todayISO()}.csv`,
      [
        kind === "customer" ? "Return no" : "Supplier return no",
        "Date", "Shop",
        kind === "customer" ? "Invoice" : "Bill no",
        ...(kind === "supplier" ? ["Supplier"] : []),
        "Items", "Units",
        kind === "customer" ? "Refund" : "Credit",
        "Reason",
      ],
      rows.map((r) => [
        r.returnNo, r.date, shops.find((s) => s.id === r.shopId)?.name ?? "", r.invoice,
        ...(kind === "supplier" ? [r.supplier ?? ""] : []),
        r.items.map((i) => `${i.qty} × ${i.name}`).join("; "),
        r.items.reduce((a, i) => a + i.qty, 0),
        r.refund, r.reason,
      ]),
    );
    toast.success(`Exported ${rows.length} returns`);
  };

  return (
    <div>
      <PageHeader
        title="Returns"
        subtitle={
          isAdmin
            ? "Goods coming back from customers, and goods you send back to suppliers."
            : "Your shop's customer returns."
        }
      />

      <Tabs defaultValue="customer">
        <TabsList>
          <TabsTrigger value="customer">Customer returns ({customerRows.length})</TabsTrigger>
          {isAdmin && <TabsTrigger value="supplier">Supplier returns ({supplierRows.length})</TabsTrigger>}
        </TabsList>

        {/* ---------------- Customer returns ---------------- */}
        <TabsContent value="customer" className="mt-4">
          {isAdmin ? (
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 border rounded-md p-2.5 mb-4">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                View only. Customer returns are recorded by the shop that handled the sale — from Sales, open the
                invoice and choose Return.
              </span>
            </div>
          ) : (
            <div className="flex justify-end mb-4">
              <NewCustomerReturn sales={sales} shopId={user?.shopId} />
            </div>
          )}

          <FilterBar
            filters={filters}
            setFilters={setFilters}
            shops={shops}
            isAdmin={isAdmin}
            onExport={() => exportRows(customerRows, "customer")}
          />

          <Card className="overflow-hidden">
            {customerRows.length === 0 ? (
              <EmptyState icon={<Undo2 className="h-5 w-5" />} title="No customer returns." hint="Open a sale invoice and choose Return to record one." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0 z-10"><tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Return no</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Shop</th>
                    <th className="px-4 py-3 font-medium">Invoice</th>
                    <th className="px-4 py-3 font-medium">Items</th>
                    <th className="px-4 py-3 font-medium text-right">Refund</th>
                    <th className="px-4 py-3 font-medium">Reason</th>
                  </tr></thead>
                  <tbody>
                    {customerRows.map((r) => (
                      <tr key={r.id} className="border-t hover:bg-muted/40">
                        <td className="px-4 py-3 font-mono text-xs">{r.returnNo}</td>
                        <td className="px-4 py-3">{r.date}</td>
                        <td className="px-4 py-3">{shops.find((s) => s.id === r.shopId)?.name}</td>
                        <td className="px-4 py-3 font-mono text-xs">{r.invoice}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{r.items.map((i) => `${i.qty} × ${i.name}`).join(", ")}</td>
                        <td className="px-4 py-3 text-right font-medium">{formatRs(r.refund)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{r.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ---------------- Supplier returns ---------------- */}
        {isAdmin && (
          <TabsContent value="supplier" className="mt-4">
            <div className="flex justify-end mb-4">
              <NewSupplierReturn purchases={purchases} products={products} shops={shops} stockAt={stockAt} />
            </div>

            <FilterBar
              filters={filters}
              setFilters={setFilters}
              shops={shops}
              isAdmin={isAdmin}
              onExport={() => exportRows(supplierRows, "supplier")}
            />

            <Card className="overflow-hidden">
              {supplierRows.length === 0 ? (
                <EmptyState icon={<PackageMinus className="h-5 w-5" />} title="No supplier returns." hint="Use “Return to supplier” to send faulty or unsold stock back." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 sticky top-0 z-10"><tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-3 font-medium">Return no</th>
                      <th className="px-4 py-3 font-medium">Date</th>
                      <th className="px-4 py-3 font-medium">Supplier</th>
                      <th className="px-4 py-3 font-medium">Bill no</th>
                      <th className="px-4 py-3 font-medium">From shop</th>
                      <th className="px-4 py-3 font-medium">Items</th>
                      <th className="px-4 py-3 font-medium text-right">Credit</th>
                      <th className="px-4 py-3 font-medium">Reason</th>
                    </tr></thead>
                    <tbody>
                      {supplierRows.map((r) => (
                        <tr key={r.id} className="border-t hover:bg-muted/40">
                          <td className="px-4 py-3 font-mono text-xs">{r.returnNo}</td>
                          <td className="px-4 py-3">{r.date}</td>
                          <td className="px-4 py-3">{r.supplier}</td>
                          <td className="px-4 py-3 font-mono text-xs">{r.invoice}</td>
                          <td className="px-4 py-3">{shops.find((s) => s.id === r.shopId)?.name}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{r.items.map((i) => `${i.qty} × ${i.name}`).join(", ")}</td>
                          <td className="px-4 py-3 text-right font-medium">{formatRs(r.refund)}</td>
                          <td className="px-4 py-3 text-muted-foreground">{r.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
