import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/Stat";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/app/users")({ component: UsersPage });

function UsersPage() {
  const { user, users, shops } = useStore();
  if (user?.role !== "admin") return <div className="text-center py-20 text-muted-foreground">Admins only.</div>;
  return (
    <div>
      <PageHeader title="Users" subtitle="Manage owner & shop logins." actions={<Button><Plus className="h-4 w-4 mr-1.5" />Add shop login</Button>} />
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50"><tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 font-medium">Email</th>
            <th className="px-4 py-3 font-medium">Role</th>
            <th className="px-4 py-3 font-medium">Shop</th>
            <th className="px-4 py-3 font-medium">Last login</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3"></th>
          </tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t hover:bg-muted/40">
                <td className="px-4 py-3 font-medium">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">{u.name.charAt(0)}</div>
                    {u.name}
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${u.role === "admin" ? "bg-primary/15 text-primary" : "bg-accent/20 text-accent-foreground"}`}>{u.role}</span></td>
                <td className="px-4 py-3">{u.shopId ? shops.find((s) => s.id === u.shopId)?.name : "—"}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{u.lastLogin ?? "—"}</td>
                <td className="px-4 py-3"><StatusPill status={u.active ? "OK" : "OUT"} /></td>
                <td className="px-4 py-3 text-right"><Button variant="ghost" size="sm">Reset password</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}