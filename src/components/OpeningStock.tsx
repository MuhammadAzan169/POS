/**
 * Recording what is already on the shelf when a shop starts using the system.
 *
 * A business does not begin trading on the day it installs software. The first
 * thing an owner needs is a way to say "I already have forty of these" without
 * inventing a purchase to explain it — there is no bill, no supplier, and no
 * money was spent, so booking one would put a cost into the accounts that never
 * happened.
 *
 * So this writes a COUNT, not a movement: the number typed here becomes the
 * quantity, replacing whatever was there. Everything afterwards — sales,
 * purchases, transfers, returns — moves it the normal way.
 */
import { useMemo, useState } from "react";
import { useStore, formatRs, type Shop } from "@/lib/store";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Confirm } from "./Confirm";
import { PackagePlus, Search } from "lucide-react";
import { toast } from "sonner";

export function OpeningStock({ shops }: { shops: Shop[] }) {
  const { products, inventory, settings, setOpeningStock } = useStore();

  const [shopId, setShopId] = useState(shops[0]?.id ?? "");
  const [q, setQ] = useState("");
  /** Only what has actually been typed, keyed by product. */
  const [counts, setCounts] = useState<Record<string, string>>({});

  const shop = shops.find((s) => s.id === shopId) ?? null;

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return products
      .filter((p) => p.active)
      .filter((p) =>
        term ? p.name.toLowerCase().includes(term) || p.barcode.includes(term) : true,
      )
      .map((p) => ({
        product: p,
        current: inventory.find((r) => r.productId === p.id && r.shopId === shopId)?.qty ?? 0,
      }))
      .sort((a, b) => a.product.name.localeCompare(b.product.name));
  }, [products, inventory, shopId, q]);

  /*
   * A blank box means "leave this one alone", which is not the same as a typed
   * zero — that means "I have none of these", and is worth recording on a shelf
   * the system currently thinks is full.
   */
  const entered = useMemo(
    () =>
      Object.entries(counts)
        .filter(([, v]) => v.trim() !== "")
        .map(([productId, v]) => ({ productId, qty: Math.max(0, Math.round(Number(v) || 0)) })),
    [counts],
  );

  const value = useMemo(
    () =>
      entered.reduce((a, e) => {
        const p = products.find((x) => x.id === e.productId);
        return a + e.qty * (p?.cost ?? 0);
      }, 0),
    [entered, products],
  );

  const apply = () => {
    if (!shopId) return toast.error("Pick a shop first");
    if (entered.length === 0) return toast.error("Nothing typed in yet");
    setOpeningStock(shopId, entered);
    toast.success(
      `Opening stock recorded for ${entered.length} product${entered.length === 1 ? "" : "s"}`,
    );
    setCounts({});
  };

  if (shops.length === 0) {
    return (
      <Card className="p-10 text-center text-sm text-muted-foreground">
        Opening stock is set by the owner, or at a wholesale counter.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-lg bg-accent/15 text-accent-strong grid place-items-center shrink-0">
            <PackagePlus className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold">Stock you already have</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Type what is on the shelf today. This sets the count outright — it is not a delivery,
              so nothing is added to your costs and no supplier bill is created. Leave a box empty
              to leave that product alone.
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-3 sm:p-4">
        <div className="grid gap-3 sm:flex sm:flex-wrap sm:items-end">
          {shops.length > 1 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Shop</Label>
              <Select
                value={shopId}
                onValueChange={(v) => {
                  // Counts belong to the shop they were typed for; carrying them
                  // across would file one shelf's numbers against another.
                  setShopId(v);
                  setCounts({});
                }}
              >
                <SelectTrigger className="w-full sm:w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {shops.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5 flex-1 min-w-0">
            <Label className="text-xs">Search</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Product name or barcode…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>
        </div>
      </Card>

      {products.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-sm font-medium">No products yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Add them on the Products page first — you can set the opening count there as you go.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[34rem]">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium text-right">In system now</th>
                  <th className="px-4 py-3 font-medium text-right w-40">Actual count</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map(({ product, current }) => {
                  const typed = counts[product.id] ?? "";
                  const changed = typed.trim() !== "" && Number(typed) !== current;
                  return (
                    <tr key={product.id} className={changed ? "bg-accent/5" : undefined}>
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{product.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {product.barcode || "no barcode"} · {product.category}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                        {current}
                      </td>
                      <td className="px-4 py-2.5">
                        <Input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          placeholder="—"
                          className="h-9 text-right tabular-nums"
                          value={typed}
                          onChange={(e) =>
                            setCounts((c) => ({ ...c, [product.id]: e.target.value }))
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-10 text-center text-muted-foreground">
                      Nothing matches “{q}”.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Pinned rather than at the foot of a long list: on a hundred products
          the button would otherwise be a scroll away from the last box typed. */}
      {entered.length > 0 && (
        <div className="sticky bottom-4 z-10">
          <Card className="p-3 sm:p-4 flex items-center gap-3 flex-wrap shadow-lg">
            <div className="min-w-0">
              <div className="font-medium">
                {entered.length} product{entered.length === 1 ? "" : "s"} ·{" "}
                {entered.reduce((a, e) => a + e.qty, 0)} units
              </div>
              <div className="text-xs text-muted-foreground">
                Worth {formatRs(value, settings.currency)} at cost · {shop?.name}
              </div>
            </div>
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" onClick={() => setCounts({})}>
                Clear
              </Button>
              <Confirm
                title="Set the opening stock?"
                description={
                  <>
                    This replaces the counted quantity for {entered.length} product
                    {entered.length === 1 ? "" : "s"} at <strong>{shop?.name}</strong>. It records a
                    count, not a purchase — nothing is added to your costs.
                  </>
                }
                confirmLabel="Set opening stock"
                onConfirm={apply}
                trigger={<Button>Save opening stock</Button>}
              />
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
