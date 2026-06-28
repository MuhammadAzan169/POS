import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { StatusPill } from "@/components/Stat";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/app/inventory")({ component: InventoryPage });

function InventoryPage() {
  const { user, inventory, products, shops } = useStore();
  const isAdmin = user?.role === "admin";
  const [shop, setShop] = useState<string>(isAdmin ? "all" : user?.shopId ?? "all");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    return inventory
      .filter((r) => (shop === "all" ? true : r.shopId === shop))
      .filter((r) => (!isAdmin ? r.shopId === user?.shopId : true))
      .map((r) => ({
        ...r,
        product: products.find((p) => p.id === r.productId)!,
        shop: shops.find((s) => s.id === r.shopId)!,
      }))
      .filter((r) => (q ? r.product?.name.toLowerCase().includes(q.toLowerCase()) : true))
      .sort((a, b) => a.product.name.localeCompare(b.product.name));
  }, [inventory, products, shops, shop, q, isAdmin, user?.shopId]);

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle={isAdmin ? "Stock per shop across the business." : "Your shop's current stock."}
      />
      <Card className="p-3 mb-4 flex flex-wrap gap-3">
        <Input placeholder="Search product…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        {isAdmin && (
          <Select value={shop} onValueChange={setShop}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All shops</SelectItem>
              {shops.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </Card>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50"><tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">Shop</th>
              <th className="px-4 py-3 font-medium text-right">Qty</th>
              <th className="px-4 py-3 font-medium text-right">Low alert</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr></thead>
            <tbody>
              {rows.map((r, i) => {
                const status = r.qty === 0 ? "OUT" : r.qty <= r.product.lowAlert ? "LOW" : "OK";
                return (
                  <tr key={i} className="border-t hover:bg-muted/40">
                    <td className="px-4 py-3 font-medium">{r.product.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.shop.name}</td>
                    <td className="px-4 py-3 text-right font-medium">{r.qty}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{r.product.lowAlert}</td>
                    <td className="px-4 py-3"><StatusPill status={status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}