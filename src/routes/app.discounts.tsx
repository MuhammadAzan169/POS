import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useStore, formatRs, discountPctFor, type Product } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Confirm } from "@/components/Confirm";
import { ProductEditDialog } from "@/components/ProductEditDialog";
import { MobileCards, ListCard, TableWrap } from "@/components/DataList";
import { Download, Percent, Search, Pencil, RotateCcw } from "lucide-react";
import { downloadCsv } from "@/lib/export";
import { toast } from "sonner";

export const Route = createFileRoute("/app/discounts")({ component: DiscountsPage });

function DiscountsPage() {
  const { user, products, discounts, settings, updateDiscounts, setProductDiscount } = useStore();
  const isAdmin = user?.role === "admin";
  const [q, setQ] = useState("");
  const [onlyDiscounted, setOnlyDiscounted] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Product | null>(null);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return products
      .map((p) => {
        const own = discounts.perProduct[p.id];
        const pct = discountPctFor(p.id, discounts);
        return {
          product: p,
          ownPct: own,
          hasOwn: own !== undefined,
          effectivePct: pct,
          finalPrice: Math.round(p.price - (p.price * pct) / 100),
        };
      })
      .filter((r) =>
        term
          ? r.product.name.toLowerCase().includes(term) || r.product.barcode.includes(term)
          : true,
      )
      .filter((r) => (onlyDiscounted ? r.effectivePct > 0 : true))
      .sort(
        (a, b) => b.effectivePct - a.effectivePct || a.product.name.localeCompare(b.product.name),
      );
  }, [products, discounts, q, onlyDiscounted]);

  /**
   * Commits on blur from the input's own value. It must not depend on `drafts`:
   * that lookup came from the render that was current when the handler was
   * created, so typing and immediately clicking away discarded the edit.
   */
  const commit = (productId: string, raw: string) => {
    setDrafts((d) => {
      const n = { ...d };
      delete n[productId];
      return n;
    });
    const current = discounts.perProduct[productId];
    if (raw.trim() === "") {
      if (current === undefined) return; // nothing to clear
      setProductDiscount(productId, null);
      toast.success("Using the overall rate");
      return;
    }
    const v = Number(raw);
    if (Number.isNaN(v) || v < 0 || v > 100) {
      toast.error("Enter a percentage between 0 and 100");
      return;
    }
    if (v === current) return;
    if (v > discounts.maxPct) toast.warning(`Capped at the ${discounts.maxPct}% maximum`);
    setProductDiscount(productId, v);
    toast.success(`${Math.min(v, discounts.maxPct)}% discount applied`);
  };

  const exportCsv = () => {
    if (rows.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    downloadCsv(
      `discounts-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        "Product",
        "Barcode",
        "Category",
        "Price",
        "Item discount %",
        "Effective discount %",
        "Price after discount",
        "Source",
      ],
      rows.map((r) => [
        r.product.name,
        r.product.barcode,
        r.product.category,
        r.product.price,
        r.hasOwn ? r.ownPct! : "",
        r.effectivePct,
        r.finalPrice,
        r.hasOwn ? "Item" : r.effectivePct > 0 ? "Overall" : "None",
      ]),
    );
    toast.success(`Exported ${rows.length} products`);
  };

  if (!isAdmin) {
    return (
      <div>
        <PageHeader
          title="Discounts"
          subtitle="Set discounts per item or across the whole business."
        />
        <Card className="p-10 text-center text-sm text-muted-foreground">Admins only.</Card>
      </div>
    );
  }

  const withOwn = rows.filter((r) => r.hasOwn).length;

  return (
    <div>
      <PageHeader
        title="Discounts"
        subtitle="An item's own rate wins; everything else uses the overall rate. Applied automatically at checkout."
        actions={
          <Button variant="outline" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-1.5" />
            Export CSV
          </Button>
        }
      />

      <Card className="p-5 mb-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-medium text-sm">Discounts enabled</div>
            <div className="text-xs text-muted-foreground">
              Turn off to sell everything at full price without losing your rates.
            </div>
          </div>
          <Switch
            checked={discounts.enabled}
            onCheckedChange={(v) => updateDiscounts({ enabled: v })}
          />
        </div>
        <Separator className="my-4" />
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Overall discount %</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={discounts.overallPct}
              onChange={(e) =>
                updateDiscounts({
                  overallPct: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                })
              }
            />
            <p className="text-xs text-muted-foreground">
              Applies to every product without its own rate.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Maximum discount %</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={discounts.maxPct}
              onChange={(e) =>
                updateDiscounts({ maxPct: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })
              }
            />
            <p className="text-xs text-muted-foreground">Hard cap — no item can exceed this.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Currently discounted</Label>
            <div className="h-9 flex items-center gap-2 text-sm">
              <Percent className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{rows.filter((r) => r.effectivePct > 0).length}</span>
              <span className="text-muted-foreground">of {products.length} products</span>
            </div>
            <p className="text-xs text-muted-foreground">{withOwn} with an item-specific rate.</p>
          </div>
        </div>
      </Card>

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
          onClick={() => setOnlyDiscounted((v) => !v)}
          className={`min-h-10 text-xs px-3 py-2 rounded-md border transition-colors sm:min-h-9 ${
            onlyDiscounted ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
          }`}
        >
          Only discounted items
        </button>
        <Confirm
          title="Clear all item discounts?"
          description="Every item-specific rate is removed. Products fall back to the overall rate. The overall rate itself is not changed."
          confirmLabel="Clear item rates"
          destructive
          disabled={withOwn === 0}
          onConfirm={() => {
            Object.keys(discounts.perProduct).forEach((id) => setProductDiscount(id, null));
            toast.success("Item discounts cleared");
          }}
          trigger={
            <Button
              variant="outline"
              className="w-full sm:w-auto sm:ml-auto"
              disabled={withOwn === 0}
            >
              <RotateCcw className="h-4 w-4 mr-1.5" />
              Clear item rates
            </Button>
          }
        />
      </Card>

      <Card className="overflow-hidden">
        <MobileCards
          items={rows}
          keyOf={(r) => r.product.id}
          empty={onlyDiscounted ? "No item currently has a discount." : `No products match “${q}”.`}
          render={(r) => (
            <ListCard
              title={r.product.name}
              subtitle={<span className="font-mono">{r.product.barcode || "No barcode"}</span>}
              right={formatRs(r.finalPrice, settings.currency)}
              rightSub={
                r.effectivePct > 0
                  ? `was ${formatRs(r.product.price, settings.currency)}`
                  : undefined
              }
              fields={[
                { label: "Category", value: r.product.category },
                {
                  label: "Effective",
                  value: `${r.effectivePct}%`,
                  className:
                    r.effectivePct > 0 ? "text-accent-strong font-medium" : "text-muted-foreground",
                },
                {
                  label: "Source",
                  value: r.hasOwn ? "Item rate" : r.effectivePct > 0 ? "Overall rate" : "None",
                },
              ]}
              actions={
                <>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs whitespace-nowrap">Item %</Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={100}
                      aria-label={`Discount for ${r.product.name}`}
                      placeholder={`${discounts.overallPct}`}
                      value={drafts[r.product.id] ?? (r.hasOwn ? String(r.ownPct) : "")}
                      onChange={(e) => setDrafts((d) => ({ ...d, [r.product.id]: e.target.value }))}
                      onBlur={(e) => commit(r.product.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                      className="w-20 text-right"
                    />
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setEditing(r.product)}>
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />
                    Edit
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
                <th className="px-4 py-3 font-medium text-right">Price</th>
                <th className="px-4 py-3 font-medium text-right w-32">Item %</th>
                <th className="px-4 py-3 font-medium text-right">Effective</th>
                <th className="px-4 py-3 font-medium text-right">Sells for</th>
                <th className="px-4 py-3 font-medium text-right">Edit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.product.id} className="border-t hover:bg-muted/40">
                  <td className="px-4 py-3 font-medium">{r.product.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {r.product.barcode || "No barcode"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.product.category}</td>
                  <td className="px-4 py-3 text-right">
                    {formatRs(r.product.price, settings.currency)}
                  </td>
                  <td className="px-4 py-3">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      aria-label={`Discount for ${r.product.name}`}
                      placeholder={`${discounts.overallPct}`}
                      value={drafts[r.product.id] ?? (r.hasOwn ? String(r.ownPct) : "")}
                      onChange={(e) => setDrafts((d) => ({ ...d, [r.product.id]: e.target.value }))}
                      onBlur={(e) => commit(r.product.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                      className="h-8 text-right"
                    />
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-medium ${r.effectivePct > 0 ? "text-accent-strong" : "text-muted-foreground"}`}
                  >
                    {r.effectivePct}%{r.hasOwn && r.effectivePct > 0 ? "" : ""}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {formatRs(r.finalPrice, settings.currency)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(r.product)}>
                      <Pencil className="h-3.5 w-3.5 mr-1.5" />
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    {onlyDiscounted
                      ? "No item currently has a discount."
                      : `No products match “${q}”.`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableWrap>
      </Card>

      <ProductEditDialog product={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
