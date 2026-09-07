import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useStore, formatRs, shopKind } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { MobileCards, ListCard, TableWrap } from "@/components/DataList";
import { Plus, Search, Pencil } from "lucide-react";
import { toast } from "sonner";
import { ProductEditDialog } from "@/components/ProductEditDialog";
import type { Product } from "@/lib/store";

/** Guards the divide-by-zero that rendered "NaN%"/"Infinity%" for zero-priced items. */
function margin(price: number, cost: number) {
  if (!price) return "No price set";
  return `${Math.round(((price - cost) / price) * 100)}%`;
}

export const Route = createFileRoute("/app/products")({
  // Optional, so plain <Link to="/app/products"> keeps working without a search prop.
  validateSearch: (search: Record<string, unknown>): { q?: string } =>
    typeof search.q === "string" && search.q ? { q: search.q } : {},
  component: ProductsPage,
});

function ProductsPage() {
  const { user, products, inventory, shops, addProduct, setOpeningStock } = useStore();
  const { q: searchParam } = Route.useSearch();
  const isAdmin = user?.role === "admin";
  /*
   * Which shops may be given an opening count here.
   *
   * The owner sets it for any active shop. A shop worker only ever sees their
   * own, and only at a wholesale counter — a retail till is stocked by
   * transfers and purchases from the owner, so letting a retail cashier type a
   * stock figure would be a way to paper over a discrepancy rather than report
   * it.
   */
  const openingShops = useMemo(() => {
    const active = shops.filter((x) => x.active);
    if (isAdmin) return active;
    return active.filter((x) => x.id === user?.shopId && shopKind(x) === "wholesale");
  }, [shops, isAdmin, user?.shopId]);

  const [q, setQ] = useState(searchParam ?? "");
  const [editing, setEditing] = useState<Product | null>(null);

  // Keep the filter in step with the header search that navigated here.
  // The ?? "" keeps the <Input> controlled when the param is absent.
  useEffect(() => {
    setQ(searchParam ?? "");
  }, [searchParam]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    barcode: "",
    name: "",
    category: "Cosmetics",
    brand: "",
    cost: 0,
    price: 0,
    wholesalePrice: 0,
    lowAlert: 5,
    /*
     * What is already on the shelf, entered while the product is being added.
     *
     * A shop that starts using the system mid-trading does not have an empty
     * shop — asking them to add a product and then go somewhere else to say
     * they have forty of it is two jobs for one fact.
     */
    openingQty: 0,
    openingShopId: "",
  });

  /*
   * One shop is the common case, and picking it by hand every time is a step
   * that exists only to be forgotten. Runs when the list arrives, not on mount,
   * because shops load after the first render.
   */
  useEffect(() => {
    if (openingShops.length === 1) {
      setForm((f) => (f.openingShopId ? f : { ...f, openingShopId: openingShops[0].id }));
    }
  }, [openingShops]);

  const rows = useMemo(() => {
    return products
      .filter((p) =>
        q ? p.name.toLowerCase().includes(q.toLowerCase()) || p.barcode.includes(q) : true,
      )
      .map((p) => ({
        ...p,
        totalStock: inventory.filter((r) => r.productId === p.id).reduce((a, r) => a + r.qty, 0),
      }));
  }, [products, inventory, q]);

  const save = () => {
    if (!form.name.trim()) {
      toast.error("Name required");
      return;
    }
    if (form.price <= 0) {
      toast.error("Sell price must be greater than 0");
      return;
    }
    if (form.cost < 0 || form.lowAlert < 0) {
      toast.error("Cost and low-stock alert can't be negative");
      return;
    }
    if (form.barcode.trim() && products.some((p) => p.barcode === form.barcode.trim())) {
      toast.error(`Barcode ${form.barcode.trim()} is already used`);
      return;
    }
    if (form.openingQty > 0 && !form.openingShopId) {
      toast.error("Choose which shop the opening stock is in");
      return;
    }

    const { openingQty, openingShopId, ...fields } = form;
    const created = addProduct({
      ...fields,
      name: form.name.trim(),
      barcode: form.barcode.trim(),
      // 0 means "not set" here — the wholesale counter then falls back to the
      // retail price rather than giving the stock away.
      wholesalePrice: form.wholesalePrice > 0 ? form.wholesalePrice : undefined,
      active: true,
      size: "",
      color: "",
    });
    if (openingQty > 0 && openingShopId) {
      setOpeningStock(openingShopId, [{ productId: created.id, qty: openingQty }]);
      const where = shops.find((x) => x.id === openingShopId)?.name ?? "the shop";
      toast.success(`Product added, with ${openingQty} in stock at ${where}`);
    } else {
      toast.success("Product added");
    }
    setOpen(false);
    setForm({
      barcode: "",
      name: "",
      category: "Cosmetics",
      brand: "",
      cost: 0,
      price: 0,
      wholesalePrice: 0,
      lowAlert: 5,
      openingQty: 0,
      // The shop is kept: someone entering a shelf's worth of products is
      // entering them all for the same shop, and re-picking it every time is
      // the sort of thing that gets stock filed against the wrong branch.
      openingShopId,
    });
  };

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle={isAdmin ? "Master catalogue shared by all shops." : "Catalogue (read-only)."}
        actions={
          isAdmin && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add product
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New product</DialogTitle>
                </DialogHeader>
                {/* One column on phones — two 150px fields side by side made
                    "Low-stock alert" wrap to three lines. */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Name</Label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Barcode</Label>
                    <Input
                      value={form.barcode}
                      onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Brand</Label>
                    <Input
                      value={form.brand}
                      onChange={(e) => setForm({ ...form, brand: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Category</Label>
                    <Input
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Low-stock alert</Label>
                    <Input
                      type="number"
                      value={form.lowAlert}
                      onChange={(e) => setForm({ ...form, lowAlert: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Cost (Rs)</Label>
                    <Input
                      type="number"
                      value={form.cost}
                      onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Retail price (Rs)</Label>
                    <Input
                      type="number"
                      value={form.price}
                      onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Wholesale price (Rs)</Label>
                    <Input
                      type="number"
                      value={form.wholesalePrice || ""}
                      placeholder="Optional — defaults to the retail price"
                      onChange={(e) =>
                        setForm({ ...form, wholesalePrice: Number(e.target.value) || 0 })
                      }
                    />
                    <p className="text-xs text-muted-foreground">Used only at wholesale shops.</p>
                  </div>

                  {/*
                    Opening stock, entered where the product is created.
                    Optional: a product being added because a delivery is coming
                    has none yet, and is left at zero.
                  */}
                  {openingShops.length > 0 && (
                    <>
                      <div className="sm:col-span-2 pt-1">
                        <Separator />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Opening stock</Label>
                        <Input
                          type="number"
                          min={0}
                          value={form.openingQty || ""}
                          placeholder="0"
                          onChange={(e) =>
                            setForm({
                              ...form,
                              openingQty: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>In which shop</Label>
                        <Select
                          value={form.openingShopId}
                          onValueChange={(openingShopId) => setForm({ ...form, openingShopId })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Pick a shop" />
                          </SelectTrigger>
                          <SelectContent>
                            {openingShops.map((x) => (
                              <SelectItem key={x.id} value={x.id}>
                                {x.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <p className="text-xs text-muted-foreground sm:col-span-2">
                        How many you already have on the shelf. Leave at 0 if none — this records a
                        count, not a purchase, so nothing is added to your costs.
                      </p>
                    </>
                  )}
                  {form.cost > 0 && form.price > 0 && (
                    <div
                      className={`sm:col-span-2 text-sm rounded-md p-2 ${form.price >= form.cost ? "text-success-strong bg-success/10" : "text-destructive bg-destructive/10"}`}
                    >
                      Margin: {formatRs(form.price - form.cost)} ({margin(form.price, form.cost)})
                      {form.price < form.cost && " — selling below cost"}
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={save}>Save</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )
        }
      />

      <Card className="p-3 mb-4">
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name or barcode…"
            className="pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <MobileCards
          items={rows}
          keyOf={(p) => p.id}
          empty={q ? `No products match “${q}”.` : "No products yet."}
          render={(p) => (
            <ListCard
              title={p.name}
              subtitle={<span className="font-mono">{p.barcode || "No barcode"}</span>}
              right={formatRs(p.price)}
              rightSub={isAdmin ? `cost ${formatRs(p.cost)}` : undefined}
              fields={[
                { label: "Category", value: p.category || "Uncategorised" },
                { label: "Brand", value: p.brand || "No brand" },
                { label: "Stock", value: p.totalStock },
                {
                  label: "Wholesale",
                  value: p.wholesalePrice ? formatRs(p.wholesalePrice) : "Retail price only",
                },
                ...(isAdmin
                  ? [
                      {
                        label: p.profitTarget !== undefined ? "Profit (pinned)" : "Profit",
                        value: `${formatRs(p.price - p.cost)} · ${margin(p.price, p.cost)}`,
                        className: p.price >= p.cost ? "text-success-strong" : "text-destructive",
                      },
                    ]
                  : []),
              ]}
              actions={
                isAdmin ? (
                  <Button size="sm" variant="outline" onClick={() => setEditing(p)}>
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />
                    Edit
                  </Button>
                ) : undefined
              }
            />
          )}
        />
        <TableWrap>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0 z-10">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-medium">Barcode</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Brand</th>
                {isAdmin && <th className="px-4 py-3 font-medium text-right">Cost</th>}
                <th className="px-4 py-3 font-medium text-right">Retail</th>
                <th className="px-4 py-3 font-medium text-right">Wholesale</th>
                {isAdmin && <th className="px-4 py-3 font-medium text-right">Profit / unit</th>}
                <th className="px-4 py-3 font-medium text-right">Stock</th>
                {isAdmin && <th className="px-4 py-3 font-medium text-right">Edit</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-t hover:bg-muted/40">
                  <td className="px-4 py-3 font-mono text-xs">{p.barcode}</td>
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3">{p.category}</td>
                  <td className="px-4 py-3">{p.brand}</td>
                  {isAdmin && <td className="px-4 py-3 text-right">{formatRs(p.cost)}</td>}
                  <td className="px-4 py-3 text-right font-medium">{formatRs(p.price)}</td>
                  {/* A dash reads as "same as retail", which is exactly how the
                      wholesale till treats an unset rate. */}
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {p.wholesalePrice ? formatRs(p.wholesalePrice) : "Retail price only"}
                  </td>
                  {isAdmin && (
                    <td
                      className={`px-4 py-3 text-right ${p.price >= p.cost ? "text-success-strong" : "text-destructive"}`}
                    >
                      {/* The rupees first: that is the figure an owner sets and
                          recognises. The percentage is context, not the point. */}
                      <div className="font-medium">{formatRs(p.price - p.cost)}</div>
                      <div className="text-xs font-normal text-muted-foreground">
                        {margin(p.price, p.cost)}
                        {p.profitTarget !== undefined && " · pinned"}
                      </div>
                    </td>
                  )}
                  <td className="px-4 py-3 text-right">{p.totalStock}</td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
                        <Pencil className="h-3.5 w-3.5 mr-1.5" />
                        Edit
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={isAdmin ? 10 : 7}
                    className="px-4 py-12 text-center text-sm text-muted-foreground"
                  >
                    No products match “{q}”.
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
