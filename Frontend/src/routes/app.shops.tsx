import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/Stat";
import { Plus, Store } from "lucide-react";

export const Route = createFileRoute("/app/shops")({ component: ShopsPage });

function ShopsPage() {
  const { user, shops, users } = useStore();
  if (user?.role !== "admin") return <div className="text-center py-20 text-muted-foreground">Admins only.</div>;
  return (
    <div>
      <PageHeader title="Shops" subtitle="Manage outlet locations." actions={<Button><Plus className="h-4 w-4 mr-1.5" />Add shop</Button>} />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {shops.map((s) => {
          const linked = users.find((u) => u.shopId === s.id);
          return (
            <Card key={s.id} className="p-5">
              <div className="flex items-start justify-between">
                <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><Store className="h-5 w-5" /></div>
                <StatusPill status={s.active ? "OK" : "OUT"} />
              </div>
              <h3 className="font-semibold mt-4">{s.name}</h3>
              <div className="text-sm text-muted-foreground mt-1">{s.address}</div>
              <div className="text-sm text-muted-foreground">{s.phone}</div>
              <div className="mt-4 pt-4 border-t text-xs text-muted-foreground">
                Linked login: <span className="text-foreground font-medium">{linked?.email ?? "—"}</span>
              </div>
              <div className="flex gap-2 mt-4">
                <Button variant="outline" size="sm" className="flex-1">Edit</Button>
                <Button variant="outline" size="sm" className="flex-1">Deactivate</Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}