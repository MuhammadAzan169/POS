import { createFileRoute } from "@tanstack/react-router";
import { useStore, formatRs } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Undo2 } from "lucide-react";

export const Route = createFileRoute("/app/returns")({ component: ReturnsPage });

function ReturnsPage() {
  const { user, returns, shops } = useStore();
  const isAdmin = user?.role === "admin";
  const rows = returns.filter((r) => (isAdmin ? true : r.shopId === user?.shopId));

  return (
    <div>
      <PageHeader title="Returns" subtitle={isAdmin ? "Refunds across every shop." : "Your shop's returns."} actions={<Button><Undo2 className="h-4 w-4 mr-1.5" />New return</Button>} />
      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <div className="text-center py-20 text-sm text-muted-foreground">
            <div className="inline-flex h-12 w-12 rounded-full bg-muted items-center justify-center mb-3"><Undo2 className="h-5 w-5" /></div>
            <div>No returns yet.</div>
            <div className="text-xs mt-1">Process a return from any sale invoice to populate this list.</div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50"><tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3 font-medium">Return no</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Shop</th>
              <th className="px-4 py-3 font-medium">Invoice</th>
              <th className="px-4 py-3 font-medium text-right">Refund</th>
              <th className="px-4 py-3 font-medium">Reason</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-3 font-mono text-xs">{r.returnNo}</td>
                  <td className="px-4 py-3">{r.date}</td>
                  <td className="px-4 py-3">{shops.find((s) => s.id === r.shopId)?.name}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.invoice}</td>
                  <td className="px-4 py-3 text-right">{formatRs(r.refund)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}