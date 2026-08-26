import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  useStore, formatRs, todayISO, daysAgoISO, dayOf, discountSplitOf, allocateSale,
  closedSessionFor, shortDay, type DaySession, type Sale,
} from "@/lib/store";
import { SaleEditDialog } from "@/components/SaleEditDialog";
import { Receipt as ReceiptView, type ReceiptData } from "@/components/Receipt";
import { PageHeader } from "@/components/AppLayout";
import { StatusPill } from "@/components/Stat";
import { MobileCards, ListCard, TableWrap } from "@/components/DataList";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Download, Printer, Undo2, Pencil, Trash2, RotateCcw, ReceiptText } from "lucide-react";
import { downloadCsv } from "@/lib/export";
import { cn } from "@/lib/utils";
import { Confirm } from "@/components/Confirm";
import { toast } from "sonner";

/** Quick day/range shortcuts for the sales date filter. */
const DATE_PRESETS = [
  { label: "Today", range: () => ({ from: todayISO(), to: todayISO() }) },
  { label: "Yesterday", range: () => ({ from: daysAgoISO(1), to: daysAgoISO(1) }) },
  { label: "Last 7 days", range: () => ({ from: daysAgoISO(6), to: todayISO() }) },
  { label: "Last 30 days", range: () => ({ from: daysAgoISO(29), to: todayISO() }) },
  { label: "This month", range: () => { const d = new Date(); return { from: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`, to: todayISO() }; } },
];

export const Route = createFileRoute("/app/sales")({
  // Optional, so plain <Link to="/app/sales"> keeps working without a search prop.
  validateSearch: (search: Record<string, unknown>): { q?: string } =>
    typeof search.q === "string" && search.q ? { q: search.q } : {},
  component: SalesPage,
});

/** A stored sale rendered through the same receipt layout used at checkout. */
function useSaleToReceipt() {
  const { shops } = useStore();
  return (s: Sale): ReceiptData => ({
    invoice: s.invoice,
    at: new Date(s.date),
    shopName: shops.find((x) => x.id === s.shopId)?.name,
    cashier: s.cashier,
    customer: s.customer,
    payment: s.payment,
    tendered: 0,
    change: 0,
    subtotal: s.subtotal,
    discount: s.discount,
    total: s.total,
    lines: s.lines.map((l) => ({ name: l.name, qty: l.qty, price: l.price })),
  });
}

/**
 * A line added to a delete confirmation when the sale belongs to a day that has
 * already been settled.
 *
 * Deliberately part of the confirmation rather than a blocker: correcting an
 * old invoice is legitimate, and refusing it would send someone to the database.
 * But the cash for that day was counted and handed over, so removing a sale from
 * it makes a sheet that balanced stop balancing.
 */
function ClosedDayWarning({ sale, sessions }: { sale: Sale; sessions: DaySession[] }) {
  const day = closedSessionFor(sessions, sale);
  if (!day) return null;
  return (
    <>
      {" "}
      <strong className="text-warning-strong">
        {shortDay(day.businessDate)} is already closed and its cash counted — those takings will no
        longer match what was handed over.
      </strong>
    </>
  );
}

function SalesPage() {
  const { user, sales, shops, products, addReturn, deleteSale, daySessions, settings } = useStore();
  const navigate = useNavigate();
  const { q: searchParam } = Route.useSearch();
  const saleToReceipt = useSaleToReceipt();
  const isAdmin = user?.role === "admin";
  const [shopFilter, setShopFilter] = useState<string>("all");
  const [q, setQ] = useState(searchParam ?? "");
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<Sale | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // Arriving from the header search (or a second search while already here)
  // should refill the filter box.
  // The ?? "" keeps the <Input> controlled when the param is absent.
  useEffect(() => { setQ(searchParam ?? ""); }, [searchParam]);

  const rows = useMemo(() => {
    return sales
      .filter((s) => (isAdmin ? true : s.shopId === user?.shopId))
      .filter((s) => (shopFilter === "all" ? true : s.shopId === shopFilter))
      // Date filters compare on the YYYY-MM-DD part, so a single day works by
      // setting from and to the same date.
      .filter((s) => (from ? dayOf(s.date) >= from : true))
      .filter((s) => (to ? dayOf(s.date) <= to : true))
      .filter((s) =>
        q
          ? s.invoice.toLowerCase().includes(q.toLowerCase()) ||
            s.customer.toLowerCase().includes(q.toLowerCase())
          : true,
      );
  }, [sales, isAdmin, user?.shopId, shopFilter, q, from, to]);

  const selected = open ? sales.find((s) => s.id === open) : null;

  /** Headline figures for whatever the filters currently select. */
  const stats = useMemo(() => {
    const live = rows.filter((s) => s.status !== "Returned");
    const revenue = live.reduce((a, s) => a + s.total, 0);
    const returned = rows.filter((s) => s.status === "Returned");
    // Split the same way every row is: per-item rates, and what was knocked off
    // the slip as a whole. Money given away is worth its own headline figure.
    const splits = live.map(discountSplitOf);
    return {
      invoices: live.length,
      revenue,
      itemDiscount: splits.reduce((a, d) => a + d.items, 0),
      billDiscount: splits.reduce((a, d) => a + d.bill, 0),
      discount: splits.reduce((a, d) => a + d.total, 0),
      profit: live.reduce((a, s) => a + s.profit, 0),
      items: live.reduce((a, s) => a + s.lines.reduce((b, l) => b + l.qty, 0), 0),
      // Average basket is the number that tells you whether people are buying
      // more per visit; a revenue total on its own never does.
      average: live.length > 0 ? Math.round(revenue / live.length) : 0,
      returned: returned.length,
      returnedValue: returned.reduce((a, s) => a + s.total, 0),
    };
  }, [rows]);

  const hasFilters = Boolean(q || from || to || shopFilter !== "all");
  const clearFilters = () => { setQ(""); setFrom(""); setTo(""); setShopFilter("all"); };

  /**
   * The same filtered sales, rolled up per product.
   *
   * The invoice list answers "what did this customer buy"; this answers "what is
   * actually selling", which is the question you ask when deciding what to
   * reorder. Both read from `rows`, so they can never disagree about the period.
   */
  const productRows = useMemo(() => {
    const map = new Map<string, { name: string; barcode: string; qty: number; revenue: number; profit: number; invoices: number }>();
    rows
      .filter((s) => s.status !== "Returned")
      // Both discounts are accounted for by allocateSale, so this tab's totals
      // reconcile with the Revenue headline above it rather than overstating
      // every bill that was discounted as a whole.
      .forEach((s) =>
        allocateSale(s).forEach(({ line: l, revenue, profit }) => {
          const cur = map.get(l.productId) ?? {
            name: l.name,
            barcode: products.find((p) => p.id === l.productId)?.barcode ?? "",
            qty: 0, revenue: 0, profit: 0, invoices: 0,
          };
          cur.qty += l.qty;
          cur.revenue += revenue;
          cur.profit += profit;
          cur.invoices += 1;
          map.set(l.productId, cur);
        }),
      );
    return [...map.values()].sort((a, b) => b.revenue - a.revenue);
  }, [rows, products]);

  const productTotals = useMemo(
    () => ({
      qty: productRows.reduce((a, r) => a + r.qty, 0),
      revenue: productRows.reduce((a, r) => a + r.revenue, 0),
      profit: productRows.reduce((a, r) => a + r.profit, 0),
    }),
    [productRows],
  );

  const exportProducts = () => {
    if (productRows.length === 0) { toast.error("Nothing to export"); return; }
    downloadCsv(
      `products-sold-${todayISO()}.csv`,
      ["Product", "Barcode", "Qty sold", "Revenue", ...(isAdmin ? ["Profit"] : []), "Times sold"],
      [
        ...productRows.map((r) => [r.name, r.barcode, r.qty, r.revenue, ...(isAdmin ? [r.profit] : []), r.invoices]),
        ["TOTAL", "", productTotals.qty, productTotals.revenue, ...(isAdmin ? [productTotals.profit] : []), ""],
      ],
    );
    toast.success(`Exported ${productRows.length} products`);
  };

  const exportCsv = () => {
    if (rows.length === 0) { toast.error("Nothing to export"); return; }
    downloadCsv(
      `sales-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        "Invoice", "Date", "Shop", "Customer", "Paid by", "Items", "Subtotal",
        "Item discount", "Bill discount", "Total discount", "Total",
        ...(isAdmin ? ["Profit"] : []), "Status",
      ],
      rows.map((s) => {
        const d = discountSplitOf(s);
        return [
          s.invoice,
          new Date(s.date).toLocaleString(),
          shops.find((sh) => sh.id === s.shopId)?.name ?? "",
          s.customer,
          s.payment,
          s.lines.reduce((a, l) => a + l.qty, 0),
          s.subtotal,
          d.items,
          d.bill,
          d.total,
          s.total,
          ...(isAdmin ? [s.profit] : []),
          s.status,
        ];
      }),
    );
    toast.success(`Exported ${rows.length} invoices`);
  };

  const processReturn = (sale: Sale) => {
    addReturn({
      kind: "customer",
      date: todayISO(),
      shopId: sale.shopId,
      invoice: sale.invoice,
      items: sale.lines.map((l) => ({ productId: l.productId, name: l.name, qty: l.qty })),
      refund: sale.total,
      reason: "Customer return",
    });
    toast.success(`Return created for ${sale.invoice}`);
    setOpen(null);
    navigate({ to: "/app/returns" });
  };

  return (
    <div>
      <PageHeader
        title="Sales"
        subtitle={isAdmin ? "Every invoice across every shop." : "Your shop's invoices."}
        actions={
          <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-1.5" />Export CSV</Button>
        }
      />

      {/*
        A summary strip rather than five StatCards: this sits directly above the
        table it describes, so it reads as a header for the data instead of
        competing with it. One bordered row, divided, numbers in tabular figures
        so they stay aligned as the filters change.
      */}
      <Card className="mb-4 overflow-hidden">
        <dl className="grid grid-cols-2 divide-x divide-y sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0">
          <Metric label="Invoices" value={stats.invoices.toLocaleString()} />
          <Metric label="Revenue" value={formatRs(stats.revenue, settings.currency)} emphasis />
          <Metric label="Items sold" value={stats.items.toLocaleString()} />
          <Metric label="Average sale" value={formatRs(stats.average, settings.currency)} />
          {/* Discount given is money that left the business as surely as an
              expense did, so it gets a headline of its own rather than being
              buried inside each invoice. */}
          <Metric
            label="Discount given"
            value={stats.discount === 0 ? "None given" : formatRs(stats.discount, settings.currency)}
            sub={
              stats.discount > 0
                ? `${formatRs(stats.itemDiscount, settings.currency)} item · ${formatRs(stats.billDiscount, settings.currency)} bill`
                : undefined
            }
          />
          {isAdmin ? (
            <Metric label="Profit" value={formatRs(stats.profit, settings.currency)} tone="success" />
          ) : (
            <Metric
              label="Returned"
              value={stats.returned === 0 ? "None" : String(stats.returned)}
              tone={stats.returned > 0 ? "destructive" : undefined}
            />
          )}
        </dl>
        {isAdmin && stats.returned > 0 && (
          <div className="px-4 py-2 border-t bg-destructive/5 text-xs text-destructive">
            {stats.returned} returned invoice{stats.returned === 1 ? "" : "s"} worth{" "}
            {formatRs(stats.returnedValue, settings.currency)} excluded from the figures above.
          </div>
        )}
      </Card>

      <Card className="p-3 sm:p-4 mb-4 space-y-3">
        {/*
          A `flex flex-wrap` bar of fixed-width controls (w-56, w-44, two w-40s)
          left ragged half-empty rows on a phone. A two-column grid that unfolds
          into the flex bar at sm keeps every control full-width and aligned.
        */}
        <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
          <div className="space-y-1.5 col-span-2 sm:col-auto">
            <Label className="text-xs">Search</Label>
            <Input placeholder="Invoice or customer…" value={q} onChange={(e) => setQ(e.target.value)} className="w-full sm:w-56" />
          </div>
          {isAdmin && (
            <div className="space-y-1.5 col-span-2 sm:col-auto">
              <Label className="text-xs">Shop</Label>
              <Select value={shopFilter} onValueChange={setShopFilter}>
                <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="All shops" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All shops</SelectItem>
                  {shops.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full sm:w-40" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full sm:w-40" />
          </div>
          {hasFilters && (
            <Button variant="ghost" size="sm" className="col-span-2 sm:col-auto" onClick={clearFilters}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />Clear
            </Button>
          )}
          <div className="col-span-2 text-xs text-muted-foreground sm:col-auto sm:ml-auto tabular-nums">
            Showing {rows.length.toLocaleString()} of {sales.length.toLocaleString()} invoices
          </div>
        </div>
        {/* The date presets scroll rather than wrap into three stacked lines. */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-3 px-3 sm:mx-0 sm:px-0 sm:flex-wrap sm:overflow-visible">
          {DATE_PRESETS.map((p) => {
            const range = p.range();
            const active = from === range.from && to === range.to;
            return (
              <button
                key={p.label}
                onClick={() => { setFrom(range.from); setTo(range.to); }}
                className={`shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  active ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </Card>

      <Tabs defaultValue="invoices">
        <TabsList>
          <TabsTrigger value="invoices">Invoices ({rows.length})</TabsTrigger>
          <TabsTrigger value="products">Products sold ({productRows.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="mt-4">
          <Card className="p-3 sm:p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <span className="font-semibold">{productTotals.qty.toLocaleString()} units</span>
              <span className="text-muted-foreground"> · {formatRs(productTotals.revenue, settings.currency)}</span>
              {isAdmin && (
                <span className="text-success-strong"> · {formatRs(productTotals.profit, settings.currency)} profit</span>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={exportProducts}>
              <Download className="h-4 w-4 mr-1.5" />Export
            </Button>
          </Card>

          <Card className="overflow-hidden">
            <MobileCards
              items={productRows}
              keyOf={(r) => r.name}
              empty="No products sold in this period."
              render={(r) => (
                <ListCard
                  title={r.name}
                  subtitle={<span className="font-mono">{r.barcode || "No barcode"}</span>}
                  right={formatRs(r.revenue, settings.currency)}
                  rightSub={`${r.qty} sold`}
                  fields={[
                    { label: "Units", value: r.qty },
                    ...(isAdmin
                      ? [{ label: "Profit", value: formatRs(r.profit, settings.currency), className: "text-success-strong" }]
                      : []),
                    { label: "Invoices", value: r.invoices },
                  ]}
                />
              )}
            />
            <TableWrap>
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0 z-10">
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Product</th>
                    <th className="px-4 py-3 font-medium">Barcode</th>
                    <th className="px-4 py-3 font-medium text-right">Qty sold</th>
                    <th className="px-4 py-3 font-medium text-right">Revenue</th>
                    {isAdmin && <th className="px-4 py-3 font-medium text-right">Profit</th>}
                    <th className="px-4 py-3 font-medium text-right">Invoices</th>
                  </tr>
                </thead>
                <tbody>
                  {productRows.map((r) => (
                    <tr key={r.name} className="border-t hover:bg-muted/40">
                      <td className="px-4 py-3 font-medium">{r.name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.barcode || "No barcode"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.qty}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatRs(r.revenue, settings.currency)}</td>
                      {isAdmin && <td className="px-4 py-3 text-right tabular-nums text-success-strong">{formatRs(r.profit, settings.currency)}</td>}
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{r.invoices}</td>
                    </tr>
                  ))}
                  {productRows.length === 0 && (
                    <tr>
                      <td colSpan={isAdmin ? 6 : 5} className="px-4 py-12 text-center text-sm text-muted-foreground">
                        No products sold in this period.
                      </td>
                    </tr>
                  )}
                </tbody>
                {productRows.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 bg-muted/30 font-semibold">
                      <td className="px-4 py-3" colSpan={2}>Total</td>
                      <td className="px-4 py-3 text-right tabular-nums">{productTotals.qty.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatRs(productTotals.revenue, settings.currency)}</td>
                      {isAdmin && <td className="px-4 py-3 text-right tabular-nums text-success-strong">{formatRs(productTotals.profit, settings.currency)}</td>}
                      <td className="px-4 py-3" />
                    </tr>
                  </tfoot>
                )}
              </table>
            </TableWrap>
          </Card>
        </TabsContent>

        <TabsContent value="invoices" className="mt-4">
      <Card className="overflow-hidden">
        <MobileCards
          items={rows}
          keyOf={(s) => s.id}
          empty={<EmptyState hasFilters={hasFilters} onClear={clearFilters} />}
          render={(s) => (
            <ListCard
              onClick={() => setOpen(s.id)}
              title={<span className="font-mono">{s.invoice}</span>}
              subtitle={`${new Date(s.date).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}${isAdmin ? ` · ${shops.find((sh) => sh.id === s.shopId)?.name ?? ""}` : ""}`}
              right={<span className="tabular-nums">{formatRs(s.total, settings.currency)}</span>}
              rightSub={
                isAdmin && s.status !== "Returned" ? (
                  <span className="text-success-strong tabular-nums">{formatRs(s.profit, settings.currency)} profit</span>
                ) : undefined
              }
              badges={
                <>
                  <StatusPill status={s.status} />
                  <StatusPill status={s.payment} />
                </>
              }
              fields={[
                { label: "Customer", value: s.customer },
                { label: "Items", value: s.lines.reduce((a, l) => a + l.qty, 0) },
                ...(s.discount > 0
                  ? [{
                      label: "Discount",
                      value: `− ${formatRs(s.discount, settings.currency)}`,
                      className: "text-success-strong",
                    }]
                  : []),
              ]}
              actions={
                <>
                  <Button size="sm" variant="outline" onClick={() => setEditing(s)} disabled={s.status === "Returned"}>
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />Edit
                  </Button>
                  <Confirm
                    title={`Delete ${s.invoice}?`}
                    description={
                      <>
                        The invoice is removed from all sales figures{s.status === "Returned" ? "" : " and its items go back into stock"}.
                        <ClosedDayWarning sale={s} sessions={daySessions} />
                        {" "}It is recorded on the Activity page, where the owner can put it back.
                      </>
                    }
                    confirmLabel="Delete sale"
                    destructive
                    onConfirm={() => { deleteSale(s.id); toast.success(`${s.invoice} deleted`); }}
                    trigger={
                      <Button size="sm" variant="outline" className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />Delete
                      </Button>
                    }
                  />
                </>
              }
            />
          )}
        />
        <TableWrap>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0 z-10">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-medium">Invoice</th>
                <th className="px-4 py-3 font-medium">Date</th>
                {isAdmin && <th className="px-4 py-3 font-medium">Shop</th>}
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Paid by</th>
                <th className="px-4 py-3 font-medium text-right">Items</th>
                <th className="px-4 py-3 font-medium text-right">Discount</th>
                <th className="px-4 py-3 font-medium text-right">Total</th>
                {isAdmin && <th className="px-4 py-3 font-medium text-right">Profit</th>}
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => setOpen(s.id)}
                  className={`border-t cursor-pointer transition-colors hover:bg-muted/40 ${
                    // A returned invoice still shows, but reads as struck from
                    // the figures rather than sitting there looking like income.
                    s.status === "Returned" ? "text-muted-foreground" : ""
                  }`}
                >
                  <td className="px-4 py-3 font-mono text-xs">{s.invoice}</td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                    {new Date(s.date).toLocaleDateString(undefined, { day: "2-digit", month: "short" })}
                    <span className="block text-xs text-muted-foreground">
                      {new Date(s.date).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                    </span>
                  </td>
                  {isAdmin && <td className="px-4 py-3">{shops.find((sh) => sh.id === s.shopId)?.name}</td>}
                  <td className="px-4 py-3 max-w-[14rem] truncate">{s.customer}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${
                      s.payment === "Credit"
                        ? "bg-warning/15 text-warning-strong border-warning/40"
                        : "bg-muted text-muted-foreground border-border"
                    }`}>
                      {s.payment}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{s.lines.reduce((a, l) => a + l.qty, 0)}</td>
                  {/* Split in the tooltip rather than in two more columns: the
                      table is already wide, and the breakdown is what you check
                      on one invoice, not something you scan down a page. */}
                  <td
                    className={cn(
                      "px-4 py-3 text-right tabular-nums",
                      s.discount > 0 ? "text-success-strong" : "text-muted-foreground",
                    )}
                    title={
                      s.discount > 0
                        ? `${formatRs(discountSplitOf(s).items, settings.currency)} on items · ${formatRs(discountSplitOf(s).bill, settings.currency)} on the bill`
                        : undefined
                    }
                  >
                    {s.discount > 0 ? `− ${formatRs(s.discount, settings.currency)}` : "No discount"}
                  </td>
                  {/* tabular-nums keeps the rupee columns aligned digit-for-digit;
                      proportional figures made every row's total sit differently. */}
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatRs(s.total, settings.currency)}</td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-right font-medium tabular-nums text-success-strong">
                      {s.status === "Returned" ? "Returned" : formatRs(s.profit, settings.currency)}
                    </td>
                  )}
                  <td className="px-4 py-3"><StatusPill status={s.status} /></td>
                  {/* stopPropagation so acting on a row doesn't also open the detail sheet. */}
                  <td className="px-4 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(s)} disabled={s.status === "Returned"}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Confirm
                      title={`Delete ${s.invoice}?`}
                      description={
                        <>
                          The invoice is removed from all sales figures{s.status === "Returned" ? "" : " and its items go back into stock"}.
                          This can't be undone.
                        </>
                      }
                      confirmLabel="Delete sale"
                      destructive
                      onConfirm={() => { deleteSale(s.id); toast.success(`${s.invoice} deleted`); }}
                      trigger={
                        <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      }
                    />
                  </td>
                </tr>
              ))}
              {/* Shop users see fewer columns than admins — a fixed colSpan left
                  the empty row overhanging and breaking the bottom border. */}
              {rows.length === 0 && (
                <tr>
                  {/* 9 base columns, plus Shop and Profit for an owner. */}
                  <td colSpan={isAdmin ? 11 : 9} className="px-4 py-16">
                    <EmptyState hasFilters={hasFilters} onClear={clearFilters} />
                  </td>
                </tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 bg-muted/30 font-semibold">
                  <td className="px-4 py-3" colSpan={isAdmin ? 5 : 4}>
                    Total
                    <span className="ml-2 font-normal text-xs text-muted-foreground">
                      {stats.invoices} invoice{stats.invoices === 1 ? "" : "s"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{stats.items.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-success-strong">
                    {stats.discount > 0 ? `− ${formatRs(stats.discount, settings.currency)}` : "No discount"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatRs(stats.revenue, settings.currency)}</td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-right tabular-nums text-success-strong">
                      {formatRs(stats.profit, settings.currency)}
                    </td>
                  )}
                  <td className="px-4 py-3" colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </TableWrap>
      </Card>
        </TabsContent>
      </Tabs>

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="font-mono text-base">{selected.invoice}</SheetTitle>
                <SheetDescription>
                  {new Date(selected.date).toLocaleString()} · {shops.find((s) => s.id === selected.shopId)?.name}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><div className="text-muted-foreground text-xs">Customer</div><div className="font-medium">{selected.customer}</div></div>
                  <div><div className="text-muted-foreground text-xs">Cashier</div><div className="font-medium">{selected.cashier}</div></div>
                  <div><div className="text-muted-foreground text-xs">Payment</div><div className="font-medium">{selected.payment}</div></div>
                  <div><div className="text-muted-foreground text-xs">Status</div><StatusPill status={selected.status} /></div>
                </div>
                {/* Per-item discount gets its own column: "why is this line
                    Rs 40 less than qty × price" is the first question anyone
                    asks of a slip, and the answer was nowhere on this screen. */}
                <div className="border rounded-lg overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs uppercase">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Item</th>
                        <th className="px-3 py-2 text-right font-medium">Qty</th>
                        <th className="px-3 py-2 text-right font-medium">Price</th>
                        <th className="px-3 py-2 text-right font-medium">Disc.</th>
                        <th className="px-3 py-2 text-right font-medium">Line</th>
                        {isAdmin && <th className="px-3 py-2 text-right font-medium">Profit</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {selected.lines.map((l, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-3 py-2">{l.name}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{l.qty}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatRs(l.price, settings.currency)}</td>
                          <td className={cn("px-3 py-2 text-right tabular-nums", l.discount > 0 ? "text-success-strong" : "text-muted-foreground")}>
                            {l.discount > 0 ? `− ${formatRs(l.discount, settings.currency)}` : "Full price"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium">
                            {formatRs(l.qty * l.price - l.discount, settings.currency)}
                          </td>
                          {/* The line discount comes off the profit too — this
                              column used to ignore it and overstate every
                              discounted line. */}
                          {isAdmin && (
                            <td className="px-3 py-2 text-right tabular-nums text-success-strong">
                              {formatRs(l.qty * (l.price - l.cost) - l.discount, settings.currency)}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="tabular-nums">{formatRs(selected.subtotal, settings.currency)}</span>
                  </div>
                  {/* Itemised and whole-slip discounts are different decisions —
                      a standing rate versus something knocked off at the
                      counter — so they are reported separately. */}
                  {(() => {
                    const d = discountSplitOf(selected);
                    return (
                      <>
                        {d.items > 0 && (
                          <div className="flex justify-between text-success-strong">
                            <span>Item discounts</span>
                            <span className="tabular-nums">− {formatRs(d.items, settings.currency)}</span>
                          </div>
                        )}
                        {d.bill > 0 && (
                          <div className="flex justify-between text-success-strong">
                            <span>Discount on the bill</span>
                            <span className="tabular-nums">− {formatRs(d.bill, settings.currency)}</span>
                          </div>
                        )}
                        {d.total === 0 && (
                          <div className="flex justify-between text-muted-foreground">
                            <span>Discount</span><span>none</span>
                          </div>
                        )}
                      </>
                    );
                  })()}
                  <div className="flex justify-between font-semibold text-base pt-2 border-t">
                    <span>Total</span>
                    <span className="tabular-nums">{formatRs(selected.total, settings.currency)}</span>
                  </div>
                  {isAdmin && (
                    <div className="flex justify-between text-success-strong">
                      <span>Profit</span>
                      <span className="tabular-nums">{formatRs(selected.profit, settings.currency)}</span>
                    </div>
                  )}
                </div>
                {/* Screen-only actions: never appear on paper. */}
                <div data-print="hide" className="flex gap-2 pt-2">
                  <Button variant="outline" className="flex-1" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1.5" />Print</Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    disabled={selected.status === "Returned"}
                    onClick={() => { setEditing(selected); setOpen(null); }}
                  >
                    <Pencil className="h-4 w-4 mr-1.5" />Edit
                  </Button>
                  <Confirm
                    title={`Return ${selected.invoice}?`}
                    description={
                      <>
                        This refunds <strong>{formatRs(selected.total)}</strong>, puts{" "}
                        {selected.lines.reduce((a, l) => a + l.qty, 0)} item(s) back into stock, and marks the
                        invoice as returned. This can't be undone.
                      </>
                    }
                    confirmLabel="Process return"
                    destructive
                    disabled={selected.status === "Returned"}
                    onConfirm={() => processReturn(selected)}
                    trigger={
                      <Button variant="outline" className="flex-1" disabled={selected.status === "Returned"}>
                        <Undo2 className="h-4 w-4 mr-1.5" />
                        {selected.status === "Returned" ? "Returned" : "Return"}
                      </Button>
                    }
                  />
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Hidden on screen; the print stylesheet shows only this element. */}
      {selected && (
        <div data-print="only" className="hidden print:block">
          <ReceiptView data={saleToReceipt(selected)} settings={settings} />
        </div>
      )}

      <SaleEditDialog sale={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

/**
 * One figure in the summary strip.
 *
 * `tabular-nums` matters more here than it looks: without it the digits are
 * proportionally spaced, so the numbers visibly jump sideways every time the
 * filters change. Fixed-width figures keep them planted.
 */
function Metric({
  label,
  value,
  sub,
  emphasis,
  tone,
}: {
  label: string;
  value: string;
  /** Optional breakdown line under the figure, e.g. how a total splits. */
  sub?: string;
  emphasis?: boolean;
  tone?: "success" | "destructive";
}) {
  return (
    <div className="px-4 py-3 sm:px-5 sm:py-4 min-w-0">
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</dt>
      <dd
        className={cn(
          "mt-1 font-semibold tabular-nums break-words",
          emphasis ? "text-xl sm:text-2xl font-display" : "text-base sm:text-lg",
          tone === "success" && "text-success-strong",
          tone === "destructive" && "text-destructive",
        )}
      >
        {value}
      </dd>
      {sub && <dd className="text-[11px] text-muted-foreground mt-0.5 tabular-nums break-words">{sub}</dd>}
    </div>
  );
}

/**
 * Shown when the list comes back empty.
 *
 * "No sales match these filters" alone leaves you guessing whether the shop had
 * a quiet day or you narrowed the range too far. Naming which of the two it is —
 * and offering the way out — is the difference.
 */
function EmptyState({ hasFilters, onClear }: { hasFilters: boolean; onClear: () => void }) {
  return (
    <div className="text-center">
      <div className="mx-auto h-11 w-11 rounded-full bg-muted flex items-center justify-center mb-3">
        <ReceiptText className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium">{hasFilters ? "No sales match these filters" : "No sales recorded yet"}</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
        {hasFilters
          ? "Try widening the date range, or clear the filters to see everything."
          : "Invoices appear here as soon as the first sale is rung up at the till."}
      </p>
      {hasFilters && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onClear}>
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" />Clear filters
        </Button>
      )}
    </div>
  );
}