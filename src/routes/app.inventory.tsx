import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useStore, todayISO, daysAgoISO, stockAsOf } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { StatusPill } from "@/components/Stat";
import { MobileCards, ListCard, TableWrap } from "@/components/DataList";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, CalendarClock, RotateCcw, PackagePlus } from "lucide-react";
import { downloadCsv } from "@/lib/export";
import { toast } from "sonner";

export const Route = createFileRoute("/app/inventory")({ component: InventoryPage });

/** Quick ranges, expressed as "days back from today". */
const PRESETS = [
  { label: "Today", days: 0 },
  { label: "Yesterday", days: 1 },
  { label: "2 days ago", days: 2 },
  { label: "1 week ago", days: 7 },
  { label: "1 month ago", days: 30 },
];

function InventoryPage() {
  const { user, inventory, products, shops, sales, purchases, returns, settings } = useStore();
  const isAdmin = user?.role === "admin";
  const navigate = useNavigate();
  const [shop, setShop] = useState<string>(isAdmin ? "all" : (user?.shopId ?? "all"));
  const [q, setQ] = useState("");
  const today = todayISO();
  const [asOf, setAsOf] = useState(today);

  const isHistorical = asOf !== today;

  // Current stock, or stock rebuilt as it stood at the end of the chosen day.
  const source = useMemo(
    () => (isHistorical ? stockAsOf(asOf, { inventory, sales, purchases, returns }) : inventory),
    [isHistorical, asOf, inventory, sales, purchases, returns],
  );

  const rows = useMemo(() => {
    return (
      source
        .filter((r) => (shop === "all" ? true : r.shopId === shop))
        .filter((r) => (!isAdmin ? r.shopId === user?.shopId : true))
        .map((r) => ({
          ...r,
          product: products.find((p) => p.id === r.productId)!,
          shop: shops.find((s) => s.id === r.shopId)!,
        }))
        // A row whose product/shop no longer exists would blow up the sort below.
        .filter((r) => Boolean(r.product && r.shop))
        .filter((r) =>
          q
            ? r.product.name.toLowerCase().includes(q.toLowerCase()) ||
              r.product.barcode.includes(q)
            : true,
        )
        .sort((a, b) => a.product.name.localeCompare(b.product.name))
    );
  }, [source, products, shops, shop, q, isAdmin, user?.shopId]);

  const statusOf = (qty: number, lowAlert: number) =>
    qty === 0 ? "OUT" : qty <= lowAlert ? "LOW" : "OK";

  /** Hands off to Purchases, which opens a bill prefilled for this product+shop. */
  const restock = (productId: string, shopId: string, qty: number, lowAlert: number) =>
    navigate({
      to: "/app/purchases",
      search: { restock: productId, shop: shopId, qty: Math.max(1, lowAlert * 2 - qty) },
    });

  const totals = useMemo(
    () => ({
      units: rows.reduce((a, r) => a + r.qty, 0),
      low: rows.filter((r) => statusOf(r.qty, r.product.lowAlert) !== "OK").length,
      value: rows.reduce((a, r) => a + r.qty * r.product.cost, 0),
    }),
    [rows],
  );

  const exportCsv = () => {
    if (rows.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    downloadCsv(
      `inventory-${asOf}.csv`,
      [
        "Product",
        "Barcode",
        "Category",
        "Brand",
        "Shop",
        "Qty",
        "Low alert",
        "Status",
        ...(isAdmin ? ["Unit cost", "Stock value"] : []),
        "As of",
      ],
      rows.map((r) => [
        r.product.name,
        r.product.barcode,
        r.product.category,
        r.product.brand,
        r.shop.name,
        r.qty,
        r.product.lowAlert,
        statusOf(r.qty, r.product.lowAlert),
        ...(isAdmin ? [r.product.cost, r.qty * r.product.cost] : []),
        asOf,
      ]),
    );
    toast.success(`Exported ${rows.length} rows`);
  };

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle={isAdmin ? "Stock per shop across the business." : "Your shop's current stock."}
        actions={
          <Button variant="outline" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-1.5" />
            Export CSV
          </Button>
        }
      />

      <Card className="p-3 sm:p-4 mb-4 space-y-4">
        <div className="grid gap-3 sm:flex sm:flex-wrap sm:items-end">
          <div className="space-y-1.5">
            <Label className="text-xs">Search</Label>
            <Input
              placeholder="Product name or barcode…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full sm:w-64"
            />
          </div>
          {isAdmin && (
            <div className="space-y-1.5">
              <Label className="text-xs">Shop</Label>
              <Select value={shop} onValueChange={setShop}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All shops</SelectItem>
                  {shops.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">Stock as of</Label>
            <Input
              type="date"
              max={today}
              value={asOf}
              onChange={(e) => setAsOf(e.target.value || today)}
              className="w-full sm:w-44"
            />
          </div>
          {isHistorical && (
            <Button variant="ghost" size="sm" onClick={() => setAsOf(today)}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Back to today
            </Button>
          )}
        </div>

        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-3 px-3 sm:mx-0 sm:px-0 sm:flex-wrap sm:overflow-visible">
          {PRESETS.map((p) => {
            const value = daysAgoISO(p.days);
            return (
              <button
                key={p.label}
                onClick={() => setAsOf(value)}
                className={`shrink-0 text-xs px-3 h-9 sm:h-8 inline-flex items-center rounded-full border transition-colors ${
                  asOf === value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "hover:bg-muted"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {isHistorical && (
          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 border rounded-md p-2.5">
            <CalendarClock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Showing stock as it stood at the end of{" "}
              <strong className="text-foreground">{asOf}</strong>, rebuilt by rewinding sales,
              purchases and returns recorded after that date.
            </span>
          </div>
        )}
      </Card>

      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4 mb-4">
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
            Rows
          </div>
          <div className="text-2xl font-bold mt-1">{rows.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
            Units in stock
          </div>
          <div className="text-2xl font-bold mt-1">{totals.units.toLocaleString()}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
            Need attention
          </div>
          <div className={`text-2xl font-bold mt-1 ${totals.low > 0 ? "text-warning-strong" : ""}`}>
            {totals.low}
          </div>
        </Card>
        {isAdmin && (
          <Card className="p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              Value at cost
            </div>
            <div className="text-2xl font-bold mt-1">
              {settings.currency}{" "}
              {totals.value.toLocaleString("en-PK", { maximumFractionDigits: 0 })}
            </div>
          </Card>
        )}
      </div>

      <Card className="overflow-hidden">
        <MobileCards
          items={rows}
          keyOf={(r) => `${r.productId}-${r.shopId}`}
          empty={q ? `No stock rows match “${q}”.` : "No stock records for this selection."}
          render={(r) => {
            const status = statusOf(r.qty, r.product.lowAlert);
            return (
              <ListCard
                title={r.product.name}
                subtitle={<span className="font-mono">{r.product.barcode || "No barcode"}</span>}
                right={r.qty}
                rightSub="in stock"
                badges={<StatusPill status={status} />}
                fields={[
                  { label: "Shop", value: r.shop.name },
                  { label: "Low alert", value: r.product.lowAlert },
                ]}
                actions={
                  isAdmin ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isHistorical}
                      title={isHistorical ? "Switch back to today to reorder" : "Reorder this item"}
                      onClick={() => restock(r.productId, r.shopId, r.qty, r.product.lowAlert)}
                    >
                      <PackagePlus className="h-3.5 w-3.5 mr-1.5" />
                      Restock
                    </Button>
                  ) : undefined
                }
              />
            );
          }}
        />
        <TableWrap>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0 z-10">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Shop</th>
                <th className="px-4 py-3 font-medium text-right">Qty</th>
                <th className="px-4 py-3 font-medium text-right">Low alert</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Barcode</th>
                {isAdmin && <th className="px-4 py-3 font-medium text-right">Action</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const status = statusOf(r.qty, r.product.lowAlert);
                return (
                  <tr key={`${r.productId}-${r.shopId}`} className="border-t hover:bg-muted/40">
                    <td className="px-4 py-3 font-medium">{r.product.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.shop.name}</td>
                    <td className="px-4 py-3 text-right font-medium">{r.qty}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {r.product.lowAlert}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={status} />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {r.product.barcode || "No barcode"}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isHistorical}
                          title={
                            isHistorical ? "Switch back to today to reorder" : "Reorder this item"
                          }
                          onClick={() => restock(r.productId, r.shopId, r.qty, r.product.lowAlert)}
                        >
                          <PackagePlus className="h-3.5 w-3.5 mr-1.5" />
                          Restock
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={isAdmin ? 7 : 6}
                    className="px-4 py-12 text-center text-sm text-muted-foreground"
                  >
                    {q ? `No stock rows match “${q}”.` : "No stock records for this selection."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableWrap>
      </Card>
    </div>
  );
}
