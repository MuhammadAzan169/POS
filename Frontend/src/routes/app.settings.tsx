import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { downloadJson } from "@/lib/export";

export const Route = createFileRoute("/app/settings")({ component: SettingsPage });

function SettingsPage() {
  const store = useStore();
  const { user, settings, updateSettings } = store;
  if (user?.role !== "admin") return <div className="text-center py-20 text-muted-foreground">Admins only.</div>;

  const exportBackup = () => {
    const { shops, users, products, inventory, sales, purchases, expenses, returns } = store;
    downloadJson(`apos-backup-${new Date().toISOString().slice(0, 10)}.json`, {
      exportedAt: new Date().toISOString(),
      settings, shops, users, products, inventory, sales, purchases, expenses, returns,
    });
    toast.success("Backup downloaded");
  };
  return (
    <div>
      <PageHeader title="Settings" subtitle="Business, receipt and defaults." />
      <div className="grid gap-6 max-w-3xl">
        <Card className="p-6">
          <h3 className="font-semibold mb-4">Business</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Business name</Label><Input value={settings.businessName} onChange={(e) => updateSettings({ businessName: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Currency</Label><Input value={settings.currency} onChange={(e) => updateSettings({ currency: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Address</Label><Input value={settings.address} onChange={(e) => updateSettings({ address: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Phone</Label><Input value={settings.phone} onChange={(e) => updateSettings({ phone: e.target.value })} /></div>
          </div>
        </Card>
        <Card className="p-6">
          <h3 className="font-semibold mb-4">Receipt</h3>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>Header text</Label><Input value={settings.receiptHeader} onChange={(e) => updateSettings({ receiptHeader: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Footer text</Label><Input value={settings.receiptFooter} onChange={(e) => updateSettings({ receiptFooter: e.target.value })} /></div>
          </div>
        </Card>
        <Card className="p-6">
          <h3 className="font-semibold mb-4">Defaults</h3>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>Default low-stock alert</Label><Input type="number" value={settings.lowStockDefault} onChange={(e) => updateSettings({ lowStockDefault: Number(e.target.value) })} /></div>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <div className="font-medium text-sm">Allow discount at checkout</div>
                <div className="text-xs text-muted-foreground">Cashiers can apply discounts up to the maximum.</div>
              </div>
              <Switch checked={settings.allowDiscount} onCheckedChange={(v) => updateSettings({ allowDiscount: v })} />
            </div>
            {settings.allowDiscount && (
              <div className="space-y-1.5"><Label>Max discount %</Label><Input type="number" value={settings.maxDiscount} onChange={(e) => updateSettings({ maxDiscount: Number(e.target.value) })} /></div>
            )}
          </div>
        </Card>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={exportBackup}>Export backup</Button>
          <Button onClick={() => toast.success("Settings saved")}>Save changes</Button>
        </div>
      </div>
    </div>
  );
}