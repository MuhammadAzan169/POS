import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { StatusPill } from "@/components/Stat";
import { MobileCards, ListCard, TableWrap } from "@/components/DataList";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Confirm } from "@/components/Confirm";
import { Download, BellRing, Search, PackagePlus } from "lucide-react";
import { downloadCsv } from "@/lib/export";
import { toast } from "sonner";

export const Route = createFileRoute("/app/alerts")({ component: AlertsPage });

function AlertsPage() {
  const { user, products, inventory, shops, settings, updateProductAlert, updateSettings } =
    useStore();
  const isAdmin = user?.role === "admin";
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [onlyBreached, setOnlyBreached] = useState(false);
  // Local edits so typing doesn't rewrite the store on every keystroke.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [bulk, setBulk] = useState("");

  // One row per unique product, with stock summed across every shop.
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return products
      .map((p) => {
        const perShop = shops.map((s) => ({
          shop: s,
          qty: inventory.find((r) => r.productId === p.id && r.shopId === s.id)?.qty ?? 0,
        }));
        const total = perShop.reduce((a, x) => a + x.qty, 0);
        const breached = perShop.filter((x) => x.qty <= p.lowAlert);
        return { product: p, perShop, total, breachedCount: breached.length };
      })
      .filter((r) =>
        term
          ? r.product.name.toLowerCase().includes(term) || r.product.barcode.includes(term)
          : true,
      )
      .filter((r) => (onlyBreached ? r.breachedCount > 0 : true))
      .sort(
        (a, b) => b.breachedCount - a.breachedCount || a.product.name.localeCompare(b.product.name),
      );
  }, [products, inventory, shops, q, onlyBreached]);

  /** Reorder for the shop that is furthest below the alert level. */
  const restock = (
    productId: string,
    perShop: { shop: { id: string }; qty: number }[],
    lowAlert: number,
  ) => {
    const worst = [...perShop].sort((a, b) => a.qty - b.qty)[0];
    navigate({
      to: "/app/purchases",
      search: {
        restock: productId,
        shop: worst?.shop.id,
        qty: Math.max(1, lowAlert * 2 - (worst?.qty ?? 0)),
      },
    });
  };

  /**
   * Commits from the input's own value rather than the `drafts` map: that lookup
   * came from an earlier render, so typing then immediately clicking away
   * silently dropped the edit.
   */
  const commit = (productId: string, raw: string) => {
    setDrafts((d) => {
      const next = { ...d };
      delete next[productId];
      return next;
    });
    const value = Number(raw);
    if (raw.trim() === "" || Number.isNaN(value) || value < 0) {
      toast.error("Enter a number of 0 or more");
      return;
    }
    const current = products.find((p) => p.id === productId)?.lowAlert;
    if (Math.floor(value) === current) return;
    updateProductAlert(productId, Math.floor(value));
    toast.success("Alert level updated");
  };

  const applyToAll = () => {
    const value = Number(bulk);
    if (bulk.trim() === "" || Number.isNaN(value) || value < 0) {
      toast.error("Enter a number of 0 or more");
      return;
    }
    rows.forEach((r) => updateProductAlert(r.product.id, Math.floor(value)));
    toast.success(
      `Set ${rows.length} product${rows.length === 1 ? "" : "s"} to ${Math.floor(value)}`,
    );
    setBulk("");
  };

  const exportCsv = () => {
    if (rows.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    downloadCsv(
      `stock-alerts-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        "Product",
        "Barcode",
        "Category",
        "Low alert",
        "Total stock",
        ...shops.map((s) => s.name),
        "Shops below alert",
      ],
      rows.map((r) => [
        r.product.name,
        r.product.barcode,
        r.product.category,
        r.product.lowAlert,
        r.total,
        ...r.perShop.map((x) => x.qty),
        r.breachedCount,
      ]),
    );
    toast.success(`Exported ${rows.length} products`);
  };

  if (!isAdmin) {
    return (
      <div>
        <PageHeader
          title="Stock alerts"
          subtitle="Set the low-stock alert level for every product."
        />
        <Card className="p-10 text-center text-sm text-muted-foreground">Admins only.</Card>
      </div>
    );
  }

  const breachedTotal = rows.filter((r) => r.breachedCount > 0).length;

  return (
    <div>
      <PageHeader
        title="Stock alerts"
        subtitle="Set the alert level for each product. A shop is flagged LOW once its stock reaches this number."
        actions={
          <Button variant="outline" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-1.5" />
            Export CSV
          </Button>
        }
      />

      <Card className="p-3 sm:p-4 mb-4 grid gap-3 sm:flex sm:flex-wrap sm:items-end">
        <div className="space-y-1.5">
          <Label className="text-xs">Search</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Product name or barcode…"
              className="pl-9 w-full sm:w-64"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
        <button
          onClick={() => setOnlyBreached((v) => !v)}
          className={`min-h-10 text-xs px-3 py-2 rounded-md border transition-colors sm:min-h-9 ${
            onlyBreached ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
          }`}
        >
          Only products below alert ({breachedTotal})
        </button>
        {/* Moved here from Settings, where it sat next to unrelated options. */}
        <div className="space-y-1.5">
          <Label className="text-xs">Default for new products</Label>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            value={settings.lowStockDefault}
            onChange={(e) =>
              updateSettings({ lowStockDefault: Math.max(0, Number(e.target.value) || 0) })
            }
            className="w-full sm:w-32"
          />
        </div>
        <div className="flex items-end gap-2 sm:ml-auto">
          <div className="space-y-1.5 flex-1 sm:flex-none">
            <Label className="text-xs">Set all listed to</Label>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={bulk}
              onChange={(e) => setBulk(e.target.value)}
              placeholder={String(settings.lowStockDefault)}
              className="w-full sm:w-28"
            />
          </div>
          <Confirm
            title={`Set ${rows.length} product${rows.length === 1 ? "" : "s"} to ${bulk || "…"}?`}
            description="This overwrites the alert level on every product currently listed below, including any you set individually."
            confirmLabel="Apply to all listed"
            destructive
            disabled={!bulk.trim() || rows.length === 0}
            onConfirm={applyToAll}
            trigger={
              <Button variant="outline" disabled={!bulk.trim() || rows.length === 0}>
                Apply
              </Button>
            }
          />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <MobileCards
          items={rows}
          keyOf={(r) => r.product.id}
          empty={
            onlyBreached ? "No product is below its alert level." : `No products match “${q}”.`
          }
          render={(r) => (
            <ListCard
              title={r.product.name}
              subtitle={<span className="font-mono">{r.product.barcode || "No barcode"}</span>}
              right={r.total}
              rightSub="total stock"
              badges={
                r.breachedCount > 0 ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-warning-strong">
                    <BellRing className="h-3.5 w-3.5" />
                    {r.breachedCount} shop{r.breachedCount === 1 ? "" : "s"} low
                  </span>
                ) : (
                  <StatusPill status="OK" />
                )
              }
              // One field per shop, so the per-shop columns survive the move to
              // a card without needing a sideways scroll.
              fields={[
                { label: "Category", value: r.product.category },
                ...r.perShop.map((x) => ({
                  label: x.shop.name,
                  value: x.qty,
                  className:
                    x.qty === 0
                      ? "text-destructive font-medium"
                      : x.qty <= r.product.lowAlert
                        ? "text-warning-strong font-medium"
                        : undefined,
                })),
              ]}
              actions={
                <>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs whitespace-nowrap">Alert at</Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      aria-label={`Low-stock alert for ${r.product.name}`}
                      value={drafts[r.product.id] ?? String(r.product.lowAlert)}
                      onChange={(e) => setDrafts((d) => ({ ...d, [r.product.id]: e.target.value }))}
                      onBlur={(e) => commit(r.product.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                      className="w-20 text-right"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => restock(r.product.id, r.perShop, r.product.lowAlert)}
                  >
                    <PackagePlus className="h-3.5 w-3.5 mr-1.5" />
                    Restock
                  </Button>
                </>
              }
            />
          )}
        />
        <TableWrap>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0 z-10">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Barcode</th>
                <th className="px-4 py-3 font-medium">Category</th>
                {shops.map((s) => (
                  <th key={s.id} className="px-4 py-3 font-medium text-right">
                    {s.name}
                  </th>
                ))}
                <th className="px-4 py-3 font-medium text-right">Total</th>
                <th className="px-4 py-3 font-medium text-right w-36">Alert level</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const draft = drafts[r.product.id];
                return (
                  <tr key={r.product.id} className="border-t hover:bg-muted/40">
                    <td className="px-4 py-3 font-medium">{r.product.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {r.product.barcode || "No barcode"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.product.category}</td>
                    {r.perShop.map((x) => (
                      <td
                        key={x.shop.id}
                        className={`px-4 py-3 text-right ${x.qty === 0 ? "text-destructive font-medium" : x.qty <= r.product.lowAlert ? "text-warning-strong font-medium" : ""}`}
                      >
                        {x.qty}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right font-medium">{r.total}</td>
                    <td className="px-4 py-3">
                      <Input
                        type="number"
                        min={0}
                        aria-label={`Low-stock alert for ${r.product.name}`}
                        value={draft ?? String(r.product.lowAlert)}
                        onChange={(e) =>
                          setDrafts((d) => ({ ...d, [r.product.id]: e.target.value }))
                        }
                        onBlur={(e) => commit(r.product.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        }}
                        className="h-8 text-right"
                      />
                    </td>
                    <td className="px-4 py-3">
                      {r.breachedCount > 0 ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-warning-strong">
                          <BellRing className="h-3.5 w-3.5" />
                          {r.breachedCount} shop{r.breachedCount === 1 ? "" : "s"} low
                        </span>
                      ) : (
                        <StatusPill status="OK" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => restock(r.product.id, r.perShop, r.product.lowAlert)}
                      >
                        <PackagePlus className="h-3.5 w-3.5 mr-1.5" />
                        Restock
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={shops.length + 7}
                    className="px-4 py-12 text-center text-sm text-muted-foreground"
                  >
                    {onlyBreached
                      ? "No product is below its alert level."
                      : `No products match “${q}”.`}
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
