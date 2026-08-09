import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useStore, formatRs, todayISO } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { StatusPill } from "@/components/Stat";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Trash2, Download, PackagePlus, ScanLine, Truck } from "lucide-react";
import { downloadCsv } from "@/lib/export";
import { toast } from "sonner";

export const Route = createFileRoute("/app/purchases")({
  // Lets Inventory / Stock alerts link straight into a prefilled bill:
  //   /app/purchases?restock=<productId>&shop=<shopId>&qty=<n>
  validateSearch: (search: Record<string, unknown>): { restock?: string; shop?: string; qty?: number } => ({
    restock: typeof search.restock === "string" ? search.restock : undefined,
    shop: typeof search.shop === "string" ? search.shop : undefined,
    qty: Number(search.qty) > 0 ? Number(search.qty) : undefined,
  }),
  component: PurchasesPage,
});

type Line = { productId: string; shopId: string; qty: number; rate: number };

function PurchasesPage() {
  const { user, purchases, shops, products, inventory, suppliers, addPurchase, addSupplier } = useStore();
  const isAdmin = user?.role === "admin";

  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ name: "", contact: "", phone: "" });
  const supplier = suppliers.find((x) => x.id === supplierId);
  const [billNo, setBillNo] = useState("");
  const [date, setDate] = useState(todayISO());
  const emptyLine = (): Line => ({ productId: products[0]?.id ?? "", shopId: shops[0]?.id ?? "", qty: 10, rate: products[0]?.cost ?? 0 });
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [scan, setScan] = useState("");
  const [shopFilter, setShopFilter] = useState("all");
  const [allQ, setAllQ] = useState("");
  const { restock: restockParam, shop: shopParam, qty: qtyParam } = Route.useSearch();
  const navigate = useNavigate();

  // Every shop/product pair at or below its alert level — what actually needs reordering.
  const restockRows = useMemo(() => {
    return inventory
      .map((row) => ({
        row,
        product: products.find((p) => p.id === row.productId),
        shop: shops.find((s) => s.id === row.shopId),
      }))
      .filter((r) => r.product && r.shop && row_needsRestock(r.row.qty, r.product!.lowAlert))
      .filter((r) => (shopFilter === "all" ? true : r.row.shopId === shopFilter))
      .sort((a, b) => a.row.qty - b.row.qty || a.product!.name.localeCompare(b.product!.name));
  }, [inventory, products, shops, shopFilter]);

  // Every product x shop pair, so anything can be reordered at any time.
  const allRows = useMemo(() => {
    const term = allQ.trim().toLowerCase();
    return shops
      .flatMap((shop) =>
        products.map((product) => ({
          product,
          shop,
          qty: inventory.find((r) => r.productId === product.id && r.shopId === shop.id)?.qty ?? 0,
        })),
      )
      .filter((r) => (shopFilter === "all" ? true : r.shop.id === shopFilter))
      .filter((r) => (term ? r.product.name.toLowerCase().includes(term) || r.product.barcode.includes(term) : true))
      .sort((a, b) => a.product.name.localeCompare(b.product.name) || a.shop.name.localeCompare(b.shop.name));
  }, [products, shops, inventory, shopFilter, allQ]);

  const total = lines.reduce((a, l) => a + l.qty * l.rate, 0);

  // Arriving from Inventory / Stock alerts opens the bill already filled in, then
  // clears the params so a refresh does not reopen it.
  useEffect(() => {
    if (!restockParam) return;
    const prod = products.find((x) => x.id === restockParam);
    if (!prod) return;
    setLines([{ productId: prod.id, shopId: shopParam || shops[0]?.id || "", qty: Math.max(1, qtyParam ?? 1), rate: prod.cost }]);
    setBillNo("");
    setDate(todayISO());
    setOpen(true);
    navigate({ to: "/app/purchases", search: {}, replace: true });

  }, [restockParam, shopParam, qtyParam]);

  const openBlank = () => {
    setLines([emptyLine()]);
    setBillNo("");
    setDate(todayISO());
    setOpen(true);
  };

  /** "Restock" from the low-stock list: opens the bill prefilled for that product+shop. */
  const restock = (productId: string, shopId: string, suggestedQty: number) => {
    const p = products.find((x) => x.id === productId);
    setLines([{ productId, shopId, qty: Math.max(1, suggestedQty), rate: p?.cost ?? 0 }]);
    setBillNo("");
    setDate(todayISO());
    setOpen(true);
  };

  const restockAllListed = () => {
    if (restockRows.length === 0) return;
    setLines(
      restockRows.slice(0, 20).map((r) => ({
        productId: r.product!.id,
        shopId: r.row.shopId,
        qty: Math.max(1, suggestQty(r.row.qty, r.product!.lowAlert)),
        rate: r.product!.cost,
      })),
    );
    setBillNo("");
    setDate(todayISO());
    setOpen(true);
  };

  /**
   * Creates the vendor inline rather than in a nested dialog: a second Dialog is
   * portalled outside this one, so clicking inside it counted as an outside click
   * and dismissed the half-built bill.
   */
  const saveNewSupplier = () => {
    const name = newSupplier.name.trim();
    if (!name) { toast.error("Supplier name required"); return; }
    if (suppliers.some((x) => x.name.toLowerCase() === name.toLowerCase())) {
      toast.error(`“${name}” already exists`);
      return;
    }
    const created = addSupplier({ ...newSupplier, name, email: "", address: "", notes: "", active: true });
    setSupplierId(created.id);
    setAddingSupplier(false);
    setNewSupplier({ name: "", contact: "", phone: "" });
    toast.success(`${name} added`);
  };

  /** Barcode entry inside the bill: adds or bumps the matching line. */
  const scanIntoBill = () => {
    const code = scan.trim();
    if (!code) return;
    const p = products.find((x) => x.barcode === code) ??
      products.find((x) => x.name.toLowerCase().includes(code.toLowerCase()));
    if (!p) { toast.error(`No product with barcode “${code}”`); return; }
    setLines((prev) => {
      const i = prev.findIndex((l) => l.productId === p.id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], qty: next[i].qty + 1 };
        return next;
      }
      return [...prev, { productId: p.id, shopId: shops[0]?.id ?? "", qty: 1, rate: p.cost }];
    });
    setScan("");
  };

  const save = () => {
    if (!supplier) { toast.error("Select a supplier"); return; }
    if (!billNo.trim()) { toast.error("Bill number required"); return; }
    // The delete button could strip every line, and qty/rate accepted 0 — both
    // let an empty Rs 0 bill through that still counted as a purchase.
    if (lines.length === 0) { toast.error("Add at least one line item"); return; }
    if (lines.some((l) => !l.productId || !l.shopId)) { toast.error("Every line needs a product and a shop"); return; }
    if (lines.some((l) => l.qty <= 0)) { toast.error("Every line needs a quantity of at least 1"); return; }
    if (purchases.some((p) => p.billNo.toLowerCase() === billNo.trim().toLowerCase())) {
      toast.error(`Bill ${billNo.trim()} already exists`);
      return;
    }
    addPurchase({ supplier: supplier.name, supplierId: supplier.id, billNo: billNo.trim(), date, lines, total });
    toast.success("Purchase saved and stock added to shops");
    setOpen(false);
    setBillNo("");
    setLines([emptyLine()]);
  };

  const exportRestock = () => {
    if (restockRows.length === 0) { toast.error("Nothing to export"); return; }
    downloadCsv(
      `restock-list-${todayISO()}.csv`,
      ["Product", "Barcode", "Category", "Shop", "In stock", "Alert level", "Suggested order", "Unit cost", "Estimated cost"],
      restockRows.map((r) => {
        const qty = suggestQty(r.row.qty, r.product!.lowAlert);
        return [
          r.product!.name, r.product!.barcode, r.product!.category, r.shop!.name,
          r.row.qty, r.product!.lowAlert, qty, r.product!.cost, qty * r.product!.cost,
        ];
      }),
    );
    toast.success(`Exported ${restockRows.length} rows`);
  };

  const exportPurchases = () => {
    if (purchases.length === 0) { toast.error("Nothing to export"); return; }
    downloadCsv(
      `purchases-${todayISO()}.csv`,
      ["Bill no", "Supplier", "Date", "Product", "Barcode", "Shop", "Qty", "Rate", "Line total"],
      purchases.flatMap((p) =>
        p.lines.map((l) => {
          const prod = products.find((x) => x.id === l.productId);
          return [
            p.billNo, p.supplier, p.date, prod?.name ?? l.productId, prod?.barcode ?? "",
            shops.find((s) => s.id === l.shopId)?.name ?? "", l.qty, l.rate, l.qty * l.rate,
          ];
        }),
      ),
    );
    toast.success("Purchases exported");
  };

  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="Purchases" subtitle="Record wholesale bills and distribute stock to shops." />
        <Card className="p-10 text-center text-sm text-muted-foreground">Admins only.</Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Purchases"
        subtitle="Stock bought from wholesalers. Recording a bill adds that stock to the shop you assign it to."
        actions={<Button onClick={openBlank}><Plus className="h-4 w-4 mr-1.5" />New purchase</Button>}
      />

      {/* Restock-needed opens first: it's the reason you come to this page. */}
      <Tabs defaultValue="restock">
        <TabsList>
          <TabsTrigger value="restock">Needs restock ({restockRows.length})</TabsTrigger>
          <TabsTrigger value="all">All items ({allRows.length})</TabsTrigger>
          <TabsTrigger value="history">Purchase history ({purchases.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="restock" className="mt-4">
          <Card className="p-4 mb-4 flex flex-wrap gap-3 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs">Shop</Label>
              <Select value={shopFilter} onValueChange={setShopFilter}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All shops</SelectItem>
                  {shops.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" onClick={exportRestock}><Download className="h-4 w-4 mr-1.5" />Export CSV</Button>
              <Button onClick={restockAllListed} disabled={restockRows.length === 0}>
                <PackagePlus className="h-4 w-4 mr-1.5" />Restock all listed
              </Button>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0 z-10"><tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">Shop</th>
                  <th className="px-4 py-3 font-medium text-right">In stock</th>
                  <th className="px-4 py-3 font-medium text-right">Alert level</th>
                  <th className="px-4 py-3 font-medium text-right">Suggested order</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Barcode</th>
                  <th className="px-4 py-3 font-medium text-right">Action</th>
                </tr></thead>
                <tbody>
                  {restockRows.map((r) => {
                    const qty = suggestQty(r.row.qty, r.product!.lowAlert);
                    return (
                      <tr key={`${r.row.productId}-${r.row.shopId}`} className="border-t hover:bg-muted/40">
                        <td className="px-4 py-3 font-medium">{r.product!.name}</td>
                        <td className="px-4 py-3 text-muted-foreground">{r.shop!.name}</td>
                        <td className="px-4 py-3 text-right font-medium">{r.row.qty}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{r.product!.lowAlert}</td>
                        <td className="px-4 py-3 text-right">{qty}</td>
                        <td className="px-4 py-3"><StatusPill status={r.row.qty === 0 ? "OUT" : "LOW"} /></td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.product!.barcode || "—"}</td>
                        <td className="px-4 py-3 text-right">
                          <Button size="sm" variant="outline" onClick={() => restock(r.product!.id, r.row.shopId, qty)}>
                            <PackagePlus className="h-3.5 w-3.5 mr-1.5" />Restock
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  {restockRows.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                      Nothing needs restocking — every product is above its alert level.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="all" className="mt-4">
          <Card className="p-4 mb-4 flex flex-wrap gap-3 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs">Search</Label>
              <Input placeholder="Product name or barcode..." value={allQ} onChange={(e) => setAllQ(e.target.value)} className="w-full sm:w-64" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Shop</Label>
              <Select value={shopFilter} onValueChange={setShopFilter}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All shops</SelectItem>
                  {shops.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground ml-auto">Reorder anything, whether or not it is low.</p>
          </Card>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0 z-10"><tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">Shop</th>
                  <th className="px-4 py-3 font-medium text-right">In stock</th>
                  <th className="px-4 py-3 font-medium text-right">Alert level</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Barcode</th>
                  <th className="px-4 py-3 font-medium text-right">Action</th>
                </tr></thead>
                <tbody>
                  {allRows.slice(0, 200).map((r) => (
                    <tr key={`${r.product.id}-${r.shop.id}`} className="border-t hover:bg-muted/40">
                      <td className="px-4 py-3 font-medium">{r.product.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.shop.name}</td>
                      <td className="px-4 py-3 text-right font-medium">{r.qty}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{r.product.lowAlert}</td>
                      <td className="px-4 py-3">
                        <StatusPill status={r.qty === 0 ? "OUT" : r.qty <= r.product.lowAlert ? "LOW" : "OK"} />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.product.barcode || "\u2014"}</td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="outline" onClick={() => restock(r.product.id, r.shop.id, suggestQty(r.qty, r.product.lowAlert))}>
                          <PackagePlus className="h-3.5 w-3.5 mr-1.5" />Restock
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {allRows.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">No products match this filter.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {allRows.length > 200 && (
              <div className="px-4 py-3 text-xs text-muted-foreground border-t">
                Showing the first 200 of {allRows.length} rows - narrow the search or pick a shop.
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card className="p-4 mb-4 flex justify-end">
            <Button variant="outline" onClick={exportPurchases}><Download className="h-4 w-4 mr-1.5" />Export CSV</Button>
          </Card>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0 z-10"><tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Bill no</th>
                  <th className="px-4 py-3 font-medium">Supplier</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium text-right">Items</th>
                  <th className="px-4 py-3 font-medium">Destinations</th>
                  <th className="px-4 py-3 font-medium text-right">Total</th>
                </tr></thead>
                <tbody>
                  {purchases.map((p) => (
                    <tr key={p.id} className="border-t hover:bg-muted/40">
                      <td className="px-4 py-3 font-mono text-xs">{p.billNo}</td>
                      <td className="px-4 py-3">{p.supplier}</td>
                      <td className="px-4 py-3">{p.date}</td>
                      <td className="px-4 py-3 text-right">{p.lines.reduce((a, l) => a + l.qty, 0)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {Array.from(new Set(p.lines.map((l) => l.shopId))).map((sid) => (
                            <span key={sid} className="text-xs px-2 py-0.5 bg-muted rounded-full">{shops.find((s) => s.id === sid)?.name}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{formatRs(p.total)}</td>
                    </tr>
                  ))}
                  {purchases.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">No purchases recorded yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New purchase</DialogTitle></DialogHeader>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Supplier</Label>
              <Select
                value={supplierId}
                onValueChange={(v) => { if (v === "__new__") { setAddingSupplier(true); return; } setSupplierId(v); }}
              >
                <SelectTrigger><SelectValue placeholder="Select a supplier..." /></SelectTrigger>
                <SelectContent>
                  {suppliers.filter((x) => x.active || x.id === supplierId).map((x) => (
                    <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>
                  ))}
                  <SelectItem value="__new__">+ Add new supplier...</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Bill no</Label><Input value={billNo} onChange={(e) => setBillNo(e.target.value)} placeholder="BILL-1234" /></div>
            <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          </div>

          {addingSupplier && (
            <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
              <div className="text-sm font-medium">New supplier</div>
              <div className="grid sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Name</Label>
                  <Input
                    autoFocus
                    value={newSupplier.name}
                    onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveNewSupplier(); } }}
                    placeholder="e.g. Noor Traders"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Contact person</Label>
                  <Input value={newSupplier.contact} onChange={(e) => setNewSupplier({ ...newSupplier, contact: e.target.value })} placeholder="Optional" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Phone</Label>
                  <Input value={newSupplier.phone} onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })} placeholder="Optional" />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="outline" onClick={() => { setAddingSupplier(false); setNewSupplier({ name: "", contact: "", phone: "" }); }}>
                  Cancel
                </Button>
                <Button size="sm" onClick={saveNewSupplier}>Add supplier</Button>
              </div>
              <p className="text-xs text-muted-foreground">Full details (email, address, notes) can be filled in from the Suppliers tab.</p>
            </div>
          )}

          {supplier && !addingSupplier && (supplier.contact || supplier.phone || supplier.notes) && (
            <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 -mt-1">
              <span className="inline-flex items-center gap-1"><Truck className="h-3 w-3" />{supplier.name}</span>
              {supplier.contact && <span>{supplier.contact}</span>}
              {supplier.phone && <span>{supplier.phone}</span>}
              {supplier.notes && <span className="italic">{supplier.notes}</span>}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Add by barcode</Label>
            <div className="relative">
              <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={scan}
                onChange={(e) => setScan(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); scanIntoBill(); } }}
                placeholder="Scan or type a barcode, then press Enter…"
                className="pl-9"
              />
            </div>
          </div>

          <div className="mt-1">
            <Label className="mb-2 block">Line items</Label>
            <div className="space-y-2">
              {lines.map((l, i) => {
                const p = products.find((x) => x.id === l.productId);
                return (
                  <div key={i} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-4">
                      <Select value={l.productId} onValueChange={(v) => {
                        const prod = products.find((x) => x.id === v);
                        setLines((prev) => prev.map((x, j) => j === i ? { ...x, productId: v, rate: prod?.cost ?? x.rate } : x));
                      }}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{products.map((prod) => <SelectItem key={prod.id} value={prod.id}>{prod.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-3">
                      <Select value={l.shopId} onValueChange={(v) => setLines((prev) => prev.map((x, j) => j === i ? { ...x, shopId: v } : x))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{shops.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <Input type="number" min={1} value={l.qty} onChange={(e) => setLines((prev) => prev.map((x, j) => j === i ? { ...x, qty: Number(e.target.value) || 0 } : x))} />
                    </div>
                    <div className="col-span-2">
                      <Input type="number" min={0} value={l.rate} onChange={(e) => setLines((prev) => prev.map((x, j) => j === i ? { ...x, rate: Number(e.target.value) || 0 } : x))} />
                    </div>
                    <div className="col-span-1 flex items-center gap-1">
                      <span className="text-xs text-muted-foreground truncate">{formatRs(l.qty * l.rate)}</span>
                      {/* Removing the only line left the form unsubmittable-but-looking-fine. */}
                      <button
                        onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}
                        disabled={lines.length === 1}
                        title={lines.length === 1 ? "A purchase needs at least one line" : "Remove line"}
                        className="text-muted-foreground hover:text-destructive disabled:opacity-40 disabled:hover:text-muted-foreground disabled:cursor-not-allowed"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    {p && (
                      <div className="col-span-12 -mt-1 text-xs text-muted-foreground pl-1 flex flex-wrap gap-x-3">
                        {p.barcode && <span className="font-mono">{p.barcode}</span>}
                        {l.rate > 0 && l.rate !== p.cost && <span>Cost updates {formatRs(p.cost)} → {formatRs(l.rate)}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setLines((prev) => [...prev, emptyLine()])}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add line
            </Button>
          </div>

          <DialogFooter className="border-t pt-4 flex !justify-between items-center">
            <div className="text-lg font-semibold">Total: {formatRs(total)}</div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save}>Save purchase</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function row_needsRestock(qty: number, lowAlert: number) {
  return qty <= lowAlert;
}

/** Order enough to land comfortably above the alert level. */
function suggestQty(qty: number, lowAlert: number) {
  return Math.max(1, lowAlert * 2 - qty);
}
