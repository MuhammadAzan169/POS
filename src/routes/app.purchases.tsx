import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  useStore, formatRs, todayISO, shiftDay, matchProduct, purchaseSettlement,
  type PaymentMethod, type Purchase,
} from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { StatusPill } from "@/components/Stat";
import { MobileCards, ListCard, TableWrap } from "@/components/DataList";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Confirm } from "@/components/Confirm";
import { SupplierPaymentDialog } from "@/components/SupplierPaymentDialog";
import { Plus, Trash2, Download, PackagePlus, ScanLine, Truck, Pencil, Wallet, AlertTriangle } from "lucide-react";
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
  const {
    user, purchases, shops, products, inventory, suppliers,
    addPurchase, updatePurchase, deletePurchase, addSupplier, settings,
  } = useStore();
  const isAdmin = user?.role === "admin";

  /**
   * Shopkeepers buy stock in for their own shop too, so this page is no longer
   * admin-only. What changes for them is scope, not capability: they can only
   * see and receive stock into their own shop, and never pick a destination.
   */
  const ownShopId = user?.shopId ?? "";
  const visibleShops = useMemo(
    () => (isAdmin ? shops : shops.filter((s) => s.id === ownShopId)),
    [isAdmin, shops, ownShopId],
  );

  const [open, setOpen] = useState(false);
  /** The bill being corrected; null means the dialog is entering a new one. */
  const [editing, setEditing] = useState<Purchase | null>(null);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ name: "", contact: "", phone: "" });
  const supplier = suppliers.find((x) => x.id === supplierId);
  const [billNo, setBillNo] = useState("");
  const [date, setDate] = useState(todayISO());
  // A shopkeeper's lines always land in their own shop; only admins choose.
  const defaultShopId = isAdmin ? shops[0]?.id ?? "" : ownShopId;
  const emptyLine = (): Line => ({ productId: products[0]?.id ?? "", shopId: defaultShopId, qty: 10, rate: products[0]?.cost ?? 0 });
  // Starts empty: the first thing a buyer does is scan, and a pre-filled line
  // for an arbitrary product only ever had to be corrected or deleted.
  const [lines, setLines] = useState<Line[]>([]);
  const [scan, setScan] = useState("");
  /**
   * How this bill is being settled.
   *
   * Buying on credit is the norm in trade — the delivery man leaves the stock
   * and the money follows at the end of the month — but the form had no way to
   * say so, and every bill was silently recorded as paid. `paidNow` carries the
   * middle case too: something now, the rest later.
   */
  /**
   * The supplier being paid off.
   *
   * A shopkeeper can raise a bill on account, so they must also be able to
   * settle one later — otherwise the money leaves their till on a day the app
   * knows nothing about, and the evening count reads short with no explanation.
   * The dialog locks a non-admin to their own till, so the cash lands on the
   * right trading day by itself.
   */
  const [payFor, setPayFor] = useState<(typeof suppliers)[number] | null>(null);

  const [payMethod, setPayMethod] = useState<PaymentMethod>("Cash");
  const [paidNow, setPaidNow] = useState<number | null>(null);
  const [dueDate, setDueDate] = useState("");
  const [shopFilter, setShopFilter] = useState(isAdmin ? "all" : ownShopId);
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
      // Scope first, then the dropdown: a shopkeeper must never see another
      // shop's shelves however the filter is set.
      .filter((r) => (isAdmin ? true : r.row.shopId === ownShopId))
      .filter((r) => (shopFilter === "all" ? true : r.row.shopId === shopFilter))
      .sort((a, b) => a.row.qty - b.row.qty || a.product!.name.localeCompare(b.product!.name));
  }, [inventory, products, shops, shopFilter, isAdmin, ownShopId]);

  // Every product x shop pair, so anything can be reordered at any time.
  const allRows = useMemo(() => {
    const term = allQ.trim().toLowerCase();
    return visibleShops
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
  }, [products, visibleShops, inventory, shopFilter, allQ]);

  /** Bills a shopkeeper is allowed to see: any that put stock into their shop. */
  const visiblePurchases = useMemo(
    () => (isAdmin ? purchases : purchases.filter((p) => p.lines.some((l) => l.shopId === ownShopId))),
    [purchases, isAdmin, ownShopId],
  );

  /**
   * Bills with money still on them, oldest first.
   *
   * The point of the list is the phone call it prompts, so it is ordered by how
   * long the money has been owed rather than by size — and an overdue bill is
   * called out separately from one that simply has not fallen due yet.
   */
  const owedBills = useMemo(
    () =>
      visiblePurchases
        .map((p) => ({ purchase: p, ...purchaseSettlement(p) }))
        .filter((b) => b.balance > 0)
        .sort((a, b) => a.purchase.date.localeCompare(b.purchase.date)),
    [visiblePurchases],
  );
  const owedTotal = owedBills.reduce((a, b) => a + b.balance, 0);
  const overdueTotal = owedBills
    .filter((b) => b.purchase.dueDate && b.purchase.dueDate < todayISO())
    .reduce((a, b) => a + b.balance, 0);

  const total = lines.reduce((a, l) => a + l.qty * l.rate, 0);

  // A settled bill is paid in full unless the user says otherwise; a credit
  // bill starts at nothing paid. Either way `paidNow === null` means "follow
  // the method", so switching the method does not fight a figure they typed.
  const paidAmount = Math.max(0, Math.min(total, paidNow ?? (payMethod === "Credit" ? 0 : total)));
  const billBalance = Math.max(0, total - paidAmount);

  /** Puts the settlement controls back to the default for a fresh bill. */
  const resetSettlement = () => {
    setPayMethod("Cash");
    setPaidNow(null);
    setDueDate("");
  };

  // Arriving from Inventory / Stock alerts opens the bill already filled in, then
  // clears the params so a refresh does not reopen it.
  useEffect(() => {
    if (!restockParam) return;
    const prod = products.find((x) => x.id === restockParam);
    if (!prod) return;
    setEditing(null);
    setLines([{ productId: prod.id, shopId: shopParam || shops[0]?.id || "", qty: Math.max(1, qtyParam ?? 1), rate: prod.cost }]);
    setBillNo("");
    setDate(todayISO());
    resetSettlement();
    setOpen(true);
    navigate({ to: "/app/purchases", search: {}, replace: true });

  }, [restockParam, shopParam, qtyParam]);

  const openBlank = () => {
    setEditing(null);
    setLines([]);
    setBillNo("");
    setDate(todayISO());
    resetSettlement();
    setOpen(true);
  };

  /**
   * Bills a user may correct. A shopkeeper only ever sees bills that stocked
   * their own shop, and may only touch the ones that stocked nothing else —
   * editing a head-office bill would move stock at branches they can't see.
   */
  const canEdit = (p: Purchase) => isAdmin || p.lines.every((l) => l.shopId === ownShopId);

  /** The same form, loaded with a bill that was already entered. */
  const openEdit = (p: Purchase) => {
    const st = purchaseSettlement(p);
    setEditing(p);
    setSupplierId(p.supplierId ?? suppliers.find((s) => s.name === p.supplier)?.id ?? "");
    setBillNo(p.billNo);
    setDate(p.date);
    setLines(p.lines.map((l) => ({ ...l })));
    // Loaded from the bill rather than reset, so correcting a line on a bill
    // that was half paid does not quietly mark the rest as settled.
    setPayMethod(st.method);
    setPaidNow(st.paid);
    setDueDate(p.dueDate ?? "");
    setOpen(true);
  };

  /** "Restock" from the low-stock list: opens the bill prefilled for that product+shop. */
  const restock = (productId: string, shopId: string, suggestedQty: number) => {
    const p = products.find((x) => x.id === productId);
    setEditing(null);
    setLines([{ productId, shopId, qty: Math.max(1, suggestedQty), rate: p?.cost ?? 0 }]);
    setBillNo("");
    setDate(todayISO());
    resetSettlement();
    setOpen(true);
  };

  const restockAllListed = () => {
    if (restockRows.length === 0) return;
    setEditing(null);
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
    resetSettlement();
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
  /**
   * What the code in the box currently points at, recomputed as it is typed.
   *
   * Feedback only on Enter meant a mistyped code produced a toast that was gone
   * a second later, while the bill still showed the line that was already
   * there — so it read as "the scan added the wrong product".
   */
  const scanMatch = matchProduct(products, scan);

  const scanIntoBill = () => {
    const code = scan.trim();
    if (!code) return;
    const p = scanMatch;
    if (!p) { toast.error(`No product with barcode “${code}”`); return; }
    setLines((prev) => {
      const i = prev.findIndex((l) => l.productId === p.id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], qty: next[i].qty + 1 };
        return next;
      }
      return [...prev, { productId: p.id, shopId: defaultShopId, qty: 1, rate: p.cost }];
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
    // Belt and braces: the form gives shopkeepers no way to pick another shop,
    // but a stale line from a prefilled restock link could still carry one.
    if (!isAdmin && lines.some((l) => l.shopId !== ownShopId)) {
      toast.error("You can only receive stock into your own shop");
      return;
    }
    // A bill being corrected keeps its own number, so it must not collide with
    // itself in the duplicate check.
    if (purchases.some((p) => p.id !== editing?.id && p.billNo.toLowerCase() === billNo.trim().toLowerCase())) {
      toast.error(`Bill ${billNo.trim()} already exists`);
      return;
    }

    // A due date only means anything while money is still owed, so it is
    // dropped rather than stored against a bill that is already square.
    const settlement = {
      payment: payMethod,
      amountPaid: paidAmount,
      dueDate: billBalance > 0 && dueDate ? dueDate : undefined,
    };

    if (editing) {
      updatePurchase({
        ...editing,
        supplier: supplier.name,
        supplierId: supplier.id,
        billNo: billNo.trim(),
        date,
        lines,
        total,
        ...settlement,
      });
      toast.success(`${billNo.trim()} corrected — stock adjusted by the difference`);
    } else {
      addPurchase({
        supplier: supplier.name,
        supplierId: supplier.id,
        billNo: billNo.trim(),
        date,
        lines,
        total,
        createdBy: user?.name ?? "Unknown",
        // Recorded only for shop-raised bills, so the owner can tell head-office
        // buying apart from a shop restocking on its own account.
        createdByShopId: isAdmin ? undefined : ownShopId,
        ...settlement,
      });
      toast.success(
        billBalance > 0
          ? `Purchase saved — ${formatRs(billBalance, settings.currency)} still owed to ${supplier.name}`
          : isAdmin
            ? "Purchase saved and stock added to shops"
            : "Purchase saved and stock added to your shop",
      );
    }
    setOpen(false);
    setEditing(null);
    setBillNo("");
    setLines([]);
    resetSettlement();
  };

  /**
   * Corrections on a recorded bill.
   *
   * Deleting takes back everything the bill delivered, so it is the right fix
   * for a bill entered twice — and the wrong one for goods already sold, which
   * is what the confirmation says out loud.
   */
  const billActions = (p: Purchase, compact: boolean) => {
    if (!canEdit(p)) return null;
    return (
      <>
        <Button
          size="sm"
          variant={compact ? "ghost" : "outline"}
          onClick={() => openEdit(p)}
          aria-label={compact ? `Correct bill ${p.billNo}` : undefined}
        >
          <Pencil className={compact ? "h-3.5 w-3.5" : "h-3.5 w-3.5 mr-1.5"} />
          {!compact && "Correct"}
        </Button>
        <Confirm
          title={`Delete bill ${p.billNo}?`}
          description={
            <>
              {p.lines.reduce((a, l) => a + l.qty, 0)} unit(s) worth {formatRs(p.total, settings.currency)} are
              taken back off the shelves. If any of them have already been sold, correct the bill instead —
              stock can't go below zero.
            </>
          }
          confirmLabel="Delete bill"
          destructive
          onConfirm={() => { deletePurchase(p.id); toast.success(`Bill ${p.billNo} deleted`); }}
          trigger={
            <Button
              size="sm"
              variant={compact ? "ghost" : "outline"}
              className="text-muted-foreground hover:text-destructive"
              aria-label={compact ? `Delete bill ${p.billNo}` : undefined}
            >
              <Trash2 className={compact ? "h-3.5 w-3.5" : "h-3.5 w-3.5 mr-1.5"} />
              {!compact && "Delete"}
            </Button>
          }
        />
      </>
    );
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
    if (visiblePurchases.length === 0) { toast.error("Nothing to export"); return; }
    downloadCsv(
      `purchases-${todayISO()}.csv`,
      ["Bill no", "Supplier", "Date", "Product", "Barcode", "Shop", "Qty", "Rate", "Line total", "Recorded by"],
      visiblePurchases.flatMap((p) =>
        p.lines.map((l) => {
          const prod = products.find((x) => x.id === l.productId);
          return [
            p.billNo, p.supplier, p.date, prod?.name ?? l.productId, prod?.barcode ?? "",
            shops.find((s) => s.id === l.shopId)?.name ?? "", l.qty, l.rate, l.qty * l.rate, p.createdBy ?? "",
          ];
        }),
      ),
    );
    toast.success("Purchases exported");
  };

  return (
    <div>
      <PageHeader
        title="Purchases"
        subtitle={
          isAdmin
            ? "Stock bought from wholesalers. Recording a bill adds that stock to the shop you assign it to."
            : "Stock you buy in for your shop. Recording a bill adds it straight to your own inventory."
        }
        actions={<Button onClick={openBlank}><Plus className="h-4 w-4 mr-1.5" />New purchase</Button>}
      />

      {/* Restock-needed opens first: it's the reason you come to this page. */}
      <Tabs defaultValue="restock">
        <TabsList>
          <TabsTrigger value="restock">Needs restock ({restockRows.length})</TabsTrigger>
          <TabsTrigger value="all">All items ({allRows.length})</TabsTrigger>
          <TabsTrigger value="history">Purchase history ({visiblePurchases.length})</TabsTrigger>
          <TabsTrigger value="owed">Still to pay ({owedBills.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="restock" className="mt-4">
          <Card className="p-3 sm:p-4 mb-4 grid gap-3 sm:flex sm:flex-wrap sm:items-end">
            <div className="space-y-1.5">
              <Label className="text-xs">Shop</Label>
              <Select value={shopFilter} onValueChange={setShopFilter} disabled={!isAdmin}>
                <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {isAdmin && <SelectItem value="all">All shops</SelectItem>}
                  {visibleShops.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 sm:ml-auto [&>*]:flex-1 sm:[&>*]:flex-none">
              <Button variant="outline" onClick={exportRestock}><Download className="h-4 w-4 mr-1.5" />Export CSV</Button>
              <Button onClick={restockAllListed} disabled={restockRows.length === 0}>
                <PackagePlus className="h-4 w-4 mr-1.5" />Restock all listed
              </Button>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <MobileCards
              items={restockRows}
              keyOf={(r) => `${r.row.productId}-${r.row.shopId}`}
              empty="Nothing needs restocking — every product is above its alert level."
              render={(r) => {
                const qty = suggestQty(r.row.qty, r.product!.lowAlert);
                return (
                  <ListCard
                    title={r.product!.name}
                    subtitle={<span className="font-mono">{r.product!.barcode || "No barcode"}</span>}
                    right={r.row.qty}
                    rightSub="in stock"
                    badges={<StatusPill status={r.row.qty === 0 ? "OUT" : "LOW"} />}
                    fields={[
                      { label: "Shop", value: r.shop!.name },
                      { label: "Alert level", value: r.product!.lowAlert },
                      { label: "Suggested", value: qty, className: "font-medium" },
                    ]}
                    actions={
                      <Button size="sm" variant="outline" onClick={() => restock(r.product!.id, r.row.shopId, qty)}>
                        <PackagePlus className="h-3.5 w-3.5 mr-1.5" />Restock
                      </Button>
                    }
                  />
                );
              }}
            />
            <TableWrap>
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
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.product!.barcode || "No barcode"}</td>
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
            </TableWrap>
          </Card>
        </TabsContent>

        <TabsContent value="all" className="mt-4">
          <Card className="p-3 sm:p-4 mb-4 grid gap-3 sm:flex sm:flex-wrap sm:items-end">
            <div className="space-y-1.5">
              <Label className="text-xs">Search</Label>
              <Input placeholder="Product name or barcode..." value={allQ} onChange={(e) => setAllQ(e.target.value)} className="w-full sm:w-64" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Shop</Label>
              <Select value={shopFilter} onValueChange={setShopFilter} disabled={!isAdmin}>
                <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {isAdmin && <SelectItem value="all">All shops</SelectItem>}
                  {visibleShops.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground sm:ml-auto">Reorder anything, whether or not it is low.</p>
          </Card>

          <Card className="overflow-hidden">
            <MobileCards
              items={allRows.slice(0, 200)}
              keyOf={(r) => `${r.product.id}-${r.shop.id}`}
              empty="No products match this filter."
              render={(r) => (
                <ListCard
                  title={r.product.name}
                  subtitle={<span className="font-mono">{r.product.barcode || "No barcode"}</span>}
                  right={r.qty}
                  rightSub="in stock"
                  badges={<StatusPill status={r.qty === 0 ? "OUT" : r.qty <= r.product.lowAlert ? "LOW" : "OK"} />}
                  fields={[
                    { label: "Shop", value: r.shop.name },
                    { label: "Alert level", value: r.product.lowAlert },
                  ]}
                  actions={
                    <Button size="sm" variant="outline" onClick={() => restock(r.product.id, r.shop.id, suggestQty(r.qty, r.product.lowAlert))}>
                      <PackagePlus className="h-3.5 w-3.5 mr-1.5" />Restock
                    </Button>
                  }
                />
              )}
            />
            <TableWrap>
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
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.product.barcode || "No barcode"}</td>
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
            </TableWrap>
            {allRows.length > 200 && (
              <div className="px-4 py-3 text-xs text-muted-foreground border-t">
                Showing the first 200 of {allRows.length} rows - narrow the search or pick a shop.
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card className="p-3 sm:p-4 mb-4 flex justify-end">
            <Button variant="outline" className="w-full sm:w-auto" onClick={exportPurchases}><Download className="h-4 w-4 mr-1.5" />Export CSV</Button>
          </Card>
          <Card className="overflow-hidden">
            <MobileCards
              items={visiblePurchases}
              keyOf={(p) => p.id}
              empty="No purchases recorded yet."
              render={(p) => (
                <ListCard
                  title={<span className="font-mono">{p.billNo}</span>}
                  subtitle={`${p.supplier} · ${p.date}`}
                  right={formatRs(p.total, settings.currency)}
                  badges={Array.from(new Set(p.lines.map((l) => l.shopId))).map((sid) => (
                    <span key={sid} className="text-xs px-2 py-0.5 bg-muted rounded-full">
                      {shops.find((s) => s.id === sid)?.name}
                    </span>
                  ))}
                  fields={[
                    { label: "Items", value: p.lines.reduce((a, l) => a + l.qty, 0) },
                    { label: "Recorded by", value: p.createdBy || "Not recorded" },
                    { label: "Paid", value: formatRs(purchaseSettlement(p).paid, settings.currency) },
                    {
                      label: "Still owed",
                      value:
                        purchaseSettlement(p).balance > 0
                          ? formatRs(purchaseSettlement(p).balance, settings.currency)
                          : "Nothing",
                    },
                  ]}
                  actions={billActions(p, false)}
                />
              )}
            />
            <TableWrap>
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0 z-10"><tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Bill no</th>
                  <th className="px-4 py-3 font-medium">Supplier</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium text-right">Items</th>
                  <th className="px-4 py-3 font-medium">Destinations</th>
                  <th className="px-4 py-3 font-medium">Recorded by</th>
                  <th className="px-4 py-3 font-medium text-right">Total</th>
                  <th className="px-4 py-3 font-medium text-right">Owed</th>
                  <th className="px-4 py-3 font-medium">Payment</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr></thead>
                <tbody>
                  {visiblePurchases.map((p) => (
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
                      <td className="px-4 py-3 text-muted-foreground">
                        {p.createdBy || "Not recorded"}
                        {p.createdByShopId && (
                          <span className="ml-1.5 text-xs px-1.5 py-0.5 bg-muted rounded-full">shop</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{formatRs(p.total, settings.currency)}</td>
                      <td className="px-4 py-3 text-right">
                        {purchaseSettlement(p).balance > 0 ? (
                          <span className="font-medium text-warning-strong">
                            {formatRs(purchaseSettlement(p).balance, settings.currency)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Nothing owed</span>
                        )}
                      </td>
                      <td className="px-4 py-3"><BillStatus purchase={p} /></td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">{billActions(p, true)}</td>
                    </tr>
                  ))}
                  {visiblePurchases.length === 0 && (
                    <tr><td colSpan={10} className="px-4 py-12 text-center text-sm text-muted-foreground">No purchases recorded yet.</td></tr>
                  )}
                </tbody>
              </table>
            </TableWrap>
          </Card>
        </TabsContent>

        {/*
          Bought on account and not yet settled.

          This is the half of the credit story the app never showed: the
          Customers tab has always known what people owe YOU, while what you owe
          your suppliers was a boolean nobody could total up.
        */}
        <TabsContent value="owed" className="mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <Card className="p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Still to pay</div>
              <div className="mt-1 text-2xl font-semibold">{formatRs(owedTotal, settings.currency)}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Past its due date</div>
              <div className={`mt-1 text-2xl font-semibold ${overdueTotal > 0 ? "text-destructive" : ""}`}>
                {formatRs(overdueTotal, settings.currency)}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Open bills</div>
              <div className="mt-1 text-2xl font-semibold">{owedBills.length}</div>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <MobileCards
              items={owedBills}
              keyOf={(b) => b.purchase.id}
              empty="Nothing owed — every bill is settled."
              render={(b) => (
                <ListCard
                  title={<span className="font-mono">{b.purchase.billNo}</span>}
                  subtitle={`${b.purchase.supplier} · ${b.purchase.date}`}
                  right={formatRs(b.balance, settings.currency)}
                  badges={[<BillStatus key="st" purchase={b.purchase} />]}
                  fields={[
                    { label: "Bill total", value: formatRs(b.purchase.total, settings.currency) },
                    { label: "Paid so far", value: formatRs(b.paid, settings.currency) },
                    { label: "Due", value: b.purchase.dueDate || "No date agreed" },
                  ]}
                  actions={billActions(b.purchase, false)}
                />
              )}
            />
            <TableWrap>
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0 z-10"><tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Bill no</th>
                  <th className="px-4 py-3 font-medium">Supplier</th>
                  <th className="px-4 py-3 font-medium">Dated</th>
                  <th className="px-4 py-3 font-medium">Due</th>
                  <th className="px-4 py-3 font-medium text-right">Bill total</th>
                  <th className="px-4 py-3 font-medium text-right">Paid</th>
                  <th className="px-4 py-3 font-medium text-right">Still owed</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr></thead>
                <tbody>
                  {owedBills.map((b) => (
                    <tr key={b.purchase.id} className="border-t hover:bg-muted/40">
                      <td className="px-4 py-3 font-mono text-xs">{b.purchase.billNo}</td>
                      <td className="px-4 py-3">{b.purchase.supplier}</td>
                      <td className="px-4 py-3">{b.purchase.date}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {b.purchase.dueDate || "No date agreed"}
                      </td>
                      <td className="px-4 py-3 text-right">{formatRs(b.purchase.total, settings.currency)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{formatRs(b.paid, settings.currency)}</td>
                      <td className="px-4 py-3 text-right font-medium text-warning-strong">{formatRs(b.balance, settings.currency)}</td>
                      <td className="px-4 py-3"><BillStatus purchase={b.purchase} /></td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">{billActions(b.purchase, true)}</td>
                    </tr>
                  ))}
                  {owedBills.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-12 text-center text-sm text-muted-foreground">Nothing owed — every bill is settled.</td></tr>
                  )}
                </tbody>
              </table>
            </TableWrap>
          </Card>

          {/*
            Paying is offered per SUPPLIER rather than per bill, because that is
            how it is actually settled: one lump sum at the end of the month
            covering whatever is outstanding, not a payment allocated to a
            particular slip.
          */}
          {owedBills.length > 0 && (
            <Card className="mt-4 p-4">
              <div className="text-sm font-medium mb-1">Pay a supplier</div>
              <p className="text-xs text-muted-foreground mb-3">
                Paid against their whole account, not one bill. The oldest bills clear first.
              </p>
              <div className="flex flex-wrap gap-2">
                {[...new Set(owedBills.map((b) => b.purchase.supplierId).filter(Boolean))].map((sid) => {
                  const sup = suppliers.find((x) => x.id === sid);
                  if (!sup) return null;
                  const owed = owedBills
                    .filter((b) => b.purchase.supplierId === sid)
                    .reduce((a, b) => a + b.balance, 0);
                  return (
                    <Button key={sid} variant="outline" size="sm" onClick={() => setPayFor(sup)}>
                      <Wallet className="h-3.5 w-3.5 mr-1.5" />
                      {sup.name} — {formatRs(owed, settings.currency)}
                    </Button>
                  );
                })}
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <SupplierPaymentDialog supplier={payFor} onClose={() => setPayFor(null)} />

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Correct bill ${editing.billNo}` : "New purchase"}</DialogTitle>
            {editing && (
              <DialogDescription>
                Stock moves by the difference between what this bill says now and what it said before, so
                nothing is received twice.
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
            <div className="flex gap-2">
              <div className="relative flex-1">
                <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  value={scan}
                  onChange={(e) => setScan(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); scanIntoBill(); } }}
                  placeholder="Scan a barcode, or type a product name…"
                  autoCapitalize="off"
                  autoCorrect="off"
                  className="pl-9"
                />
              </div>
              {/* Enter alone is invisible to anyone typing rather than scanning. */}
              <Button variant="outline" onClick={scanIntoBill} disabled={!scan.trim()}>
                Add
              </Button>
            </div>

            {/* Says what the code resolves to before it is committed, so a code
                that matches nothing is obvious while it is still on screen. */}
            {scan.trim() && (
              scanMatch ? (
                <p className="text-xs flex items-center gap-1.5 text-success-strong">
                  <PackagePlus className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    {scanMatch.name}
                    <span className="text-muted-foreground">
                      {" · "}{scanMatch.barcode || "no barcode"}{" · cost "}{formatRs(scanMatch.cost, settings.currency)}
                    </span>
                  </span>
                </p>
              ) : (
                <p className="text-xs text-destructive">
                  Nothing matches “{scan.trim()}”. Check the code, or add the product on the{" "}
                  <span className="font-medium">Products</span> page first.
                </p>
              )
            )}
          </div>

          <div className="mt-1">
            <Label className="mb-2 block">Line items</Label>
            <div className="space-y-2">
              {/*
                Twelve columns across a 360px dialog gave the product select
                about 110px and the delete button ~30px. On phones each line
                becomes its own bordered block: product and shop full width,
                then qty / rate side by side with the line total and delete.
              */}
              {lines.map((l, i) => {
                const p = products.find((x) => x.id === l.productId);
                return (
                  <div key={i} className="grid grid-cols-2 gap-2 items-end rounded-lg border p-3 sm:grid-cols-12 sm:border-0 sm:p-0">
                    <div className="col-span-2 sm:col-span-4">
                      <Label className="text-xs sm:hidden">Product</Label>
                      <Select value={l.productId} onValueChange={(v) => {
                        const prod = products.find((x) => x.id === v);
                        setLines((prev) => prev.map((x, j) => j === i ? { ...x, productId: v, rate: prod?.cost ?? x.rate } : x));
                      }}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{products.map((prod) => <SelectItem key={prod.id} value={prod.id}>{prod.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    {/* A shopkeeper has exactly one possible destination, so the
                        select becomes a read-only label rather than a one-option
                        dropdown pretending to be a choice. */}
                    <div className="col-span-2 sm:col-span-3">
                      <Label className="text-xs sm:hidden">Shop</Label>
                      {isAdmin ? (
                        <Select value={l.shopId} onValueChange={(v) => setLines((prev) => prev.map((x, j) => j === i ? { ...x, shopId: v } : x))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{shops.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                        </Select>
                      ) : (
                        <div className="h-9 flex items-center px-3 rounded-md border bg-muted/50 text-sm truncate">
                          {shops.find((s) => s.id === l.shopId)?.name ?? "Your shop"}
                        </div>
                      )}
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-xs sm:hidden">Qty</Label>
                      <Input type="number" inputMode="numeric" min={1} value={l.qty} onChange={(e) => setLines((prev) => prev.map((x, j) => j === i ? { ...x, qty: Number(e.target.value) || 0 } : x))} />
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-xs sm:hidden">Rate</Label>
                      <Input type="number" inputMode="decimal" min={0} value={l.rate} onChange={(e) => setLines((prev) => prev.map((x, j) => j === i ? { ...x, rate: Number(e.target.value) || 0 } : x))} />
                    </div>
                    <div className="col-span-2 flex items-center justify-between gap-1 sm:col-span-1 sm:justify-start">
                      <span className="text-xs text-muted-foreground truncate">{formatRs(l.qty * l.rate)}</span>
                      {/* Removing the only line left the form unsubmittable-but-looking-fine. */}
                      <button
                        onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}
                        disabled={lines.length === 1}
                        title={lines.length === 1 ? "A purchase needs at least one line" : "Remove line"}
                        aria-label="Remove line"
                        className="h-9 w-9 shrink-0 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive disabled:opacity-40 disabled:hover:text-muted-foreground disabled:cursor-not-allowed sm:h-auto sm:w-auto"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    {p && (
                      <div className="col-span-2 -mt-1 text-xs text-muted-foreground sm:col-span-12 sm:pl-1 flex flex-wrap gap-x-3">
                        {p.barcode && <span className="font-mono">{p.barcode}</span>}
                        {l.rate > 0 && l.rate !== p.cost && <span>Cost updates {formatRs(p.cost)} → {formatRs(l.rate)}</span>}
                      </div>
                    )}
                  </div>
                );
              })}

              {/*
                A bill used to open with one line pre-filled to whatever product
                happened to be first in the catalogue. Scan a code that matched
                nothing and that stray line was still sitting there, so the scan
                looked like it had added the wrong item. It starts empty now and
                says what to do.
              */}
              {lines.length === 0 && (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  <ScanLine className="h-5 w-5 mx-auto mb-2 opacity-60" />
                  Scan a barcode above, or add a line and pick the product.
                </div>
              )}
            </div>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setLines((prev) => [...prev, emptyLine()])}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add line
            </Button>
          </div>

          {/*
            How the bill is being settled.

            Kept next to the total rather than at the top of the form, because
            it is the last thing decided: you agree the goods, you total them
            up, and then you work out what is going across the counter today.
          */}
          <div className="mt-4 rounded-lg border p-3 space-y-3 bg-muted/20">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Wallet className="h-4 w-4" /> Payment
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-xs">How is it being paid?</Label>
                <Select
                  value={payMethod}
                  onValueChange={(v) => {
                    setPayMethod(v as PaymentMethod);
                    // Back to following the method: switching to Credit should
                    // clear a full payment typed a moment ago, and vice versa.
                    setPaidNow(null);
                    if (v === "Credit" && !dueDate) setDueDate(shiftDay(date, 30));
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cash">Cash — paid now</SelectItem>
                    <SelectItem value="Card">Card — paid now</SelectItem>
                    <SelectItem value="Online">Online / transfer — paid now</SelectItem>
                    <SelectItem value="Credit">On account — pay later</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Paid today</Label>
                <Input
                  type="number"
                  min={0}
                  max={total}
                  value={paidAmount || ""}
                  placeholder="0"
                  onChange={(e) => setPaidNow(Math.max(0, Math.min(total, Number(e.target.value) || 0)))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Balance due by</Label>
                <Input
                  type="date"
                  value={dueDate}
                  disabled={billBalance === 0}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {billBalance === 0 ? (
                <>Settled in full — nothing is added to what you owe {supplier?.name ?? "this supplier"}.</>
              ) : (
                <>
                  {formatRs(billBalance, settings.currency)} goes onto {supplier?.name ?? "the supplier"}
                  {"'"}s account
                  {dueDate ? `, due ${dueDate}` : " with no due date set"}. Pay it from the Suppliers tab.
                </>
              )}
              {!isAdmin && payMethod === "Cash" && paidAmount > 0 && (
                <> This cash leaves your till, so tonight{"'"}s count expects it to be gone.</>
              )}
            </p>
          </div>

          {/* flex-col-reverse (the footer default) would put the total under the
              buttons on a phone, so this footer lays itself out explicitly. */}
          <DialogFooter className="border-t pt-4 flex-col gap-3 !justify-between sm:flex-row sm:items-center">
            <div className="text-lg font-semibold">
              Total: {formatRs(total)}
              {billBalance > 0 && (
                <span className="ml-2 text-sm font-normal text-warning-strong">
                  {formatRs(paidAmount)} paid · {formatRs(billBalance)} owed
                </span>
              )}
            </div>
            <div className="flex gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
              <Button variant="outline" onClick={() => { setOpen(false); setEditing(null); }}>Cancel</Button>
              <Button onClick={save}>{editing ? "Save correction" : "Save purchase"}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Where a bill stands: paid, part paid, or wholly on account.
 *
 * An overdue bill says so rather than just reading "Unpaid" — the number of
 * days is the part that makes someone pick up the phone.
 */
function BillStatus({ purchase }: { purchase: Purchase }) {
  const { status, balance } = purchaseSettlement(purchase);
  const overdue = balance > 0 && purchase.dueDate && purchase.dueDate < todayISO();

  if (status === "Paid") return <StatusPill status="Paid" />;
  return (
    <span className="inline-flex items-center gap-1.5">
      <StatusPill status={status} />
      {overdue && (
        <span className="inline-flex items-center gap-1 text-xs text-destructive">
          <AlertTriangle className="h-3 w-3" /> overdue
        </span>
      )}
    </span>
  );
}

function row_needsRestock(qty: number, lowAlert: number) {
  return qty <= lowAlert;
}

/** Order enough to land comfortably above the alert level. */
function suggestQty(qty: number, lowAlert: number) {
  return Math.max(1, lowAlert * 2 - qty);
}
