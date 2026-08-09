import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useStore, formatRs } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Download, Save, Receipt as ReceiptIcon } from "lucide-react";
import { toast } from "sonner";
import { downloadJson } from "@/lib/export";

export const Route = createFileRoute("/app/settings")({ component: SettingsPage });

/** Section shell so every block gets the same title/description/spacing treatment. */
function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-1">
        <h3 className="font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <Separator className="my-4" />
      {children}
    </Card>
  );
}

/** Field with an optional hint and a width that suits its content. */
function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SettingsPage() {
  const store = useStore();
  const { user, settings, updateSettings } = store;
  const isAdmin = user?.role === "admin";

  const exportBackup = () => {
    const { shops, users, products, inventory, sales, purchases, expenses, returns } = store;
    downloadJson(`apos-backup-${new Date().toISOString().slice(0, 10)}.json`, {
      exportedAt: new Date().toISOString(),
      settings, shops, users, products, inventory, sales, purchases, expenses, returns,
    });
    toast.success("Backup downloaded");
  };

  if (!isAdmin) {
    // Keeps the page frame instead of dropping a bare sentence onto a blank screen.
    return (
      <div>
        <PageHeader title="Settings" subtitle="Business, receipt and defaults." />
        <Card className="p-10 text-center text-sm text-muted-foreground">Admins only.</Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Business details, receipt text and checkout defaults."
        actions={
          <>
            <Button variant="outline" onClick={exportBackup}>
              <Download className="h-4 w-4 mr-1.5" />Export backup
            </Button>
            <Button onClick={() => toast.success("Settings saved")}>
              <Save className="h-4 w-4 mr-1.5" />Save changes
            </Button>
          </>
        }
      />

      {/* Settings on the left, a live receipt preview parked alongside on wide screens. */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
        <div className="grid gap-5 min-w-0">
          <Section title="Business" description="Shown on receipts and exported reports.">
            <div className="grid gap-4 sm:grid-cols-6">
              <Field label="Business name" className="sm:col-span-4">
                <Input value={settings.businessName} onChange={(e) => updateSettings({ businessName: e.target.value })} />
              </Field>
              <Field label="Currency" hint="Symbol or code" className="sm:col-span-2">
                <Input value={settings.currency} onChange={(e) => updateSettings({ currency: e.target.value })} />
              </Field>
              <Field label="Address" className="sm:col-span-4">
                <Input value={settings.address} onChange={(e) => updateSettings({ address: e.target.value })} />
              </Field>
              <Field label="Phone" className="sm:col-span-2">
                <Input value={settings.phone} onChange={(e) => updateSettings({ phone: e.target.value })} />
              </Field>
            </div>
          </Section>

          <Section title="Receipt" description="Lines printed above and below the sale on every receipt.">
            <div className="grid gap-4">
              <Field label="Header text" hint="Appears under the shop address.">
                <Input value={settings.receiptHeader} onChange={(e) => updateSettings({ receiptHeader: e.target.value })} />
              </Field>
              <Field label="Footer text" hint="The last line of the receipt.">
                <Input value={settings.receiptFooter} onChange={(e) => updateSettings({ receiptFooter: e.target.value })} />
              </Field>
            </div>
          </Section>

          <Section title="Defaults" description="Applied to new products and the checkout screen.">
            <div className="grid gap-4">
              <Field label="Default low-stock alert" hint="Used when a new product doesn't set its own." className="sm:max-w-[200px]">
                <Input
                  type="number"
                  min={0}
                  value={settings.lowStockDefault}
                  onChange={(e) => updateSettings({ lowStockDefault: Math.max(0, Number(e.target.value)) })}
                />
              </Field>

              <div className="flex items-center justify-between gap-4 p-3 border rounded-lg">
                <div className="min-w-0">
                  <div className="font-medium text-sm">Allow discount at checkout</div>
                  <div className="text-xs text-muted-foreground">Cashiers can apply discounts up to the maximum.</div>
                </div>
                <Switch
                  className="shrink-0"
                  checked={settings.allowDiscount}
                  onCheckedChange={(v) => updateSettings({ allowDiscount: v })}
                />
              </div>

              {/* Reserved height so toggling the switch doesn't jump the page. */}
              <div className="min-h-[76px]">
                {settings.allowDiscount && (
                  <Field label="Max discount %" hint="0–100." className="sm:max-w-[200px]">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={settings.maxDiscount}
                      onChange={(e) => updateSettings({ maxDiscount: Math.min(100, Math.max(0, Number(e.target.value))) })}
                    />
                  </Field>
                )}
              </div>
            </div>
          </Section>
        </div>

        <Card className="p-5 lg:sticky lg:top-0 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <ReceiptIcon className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold">Receipt preview</h3>
          </div>
          <p className="text-xs text-muted-foreground">Updates as you type.</p>
          <Separator className="my-4" />
          <div className="font-mono text-xs bg-muted/40 border rounded-lg p-4">
            <div className="text-center space-y-0.5">
              <div className="font-bold text-sm">{settings.businessName || "Business name"}</div>
              {settings.address && <div className="text-muted-foreground">{settings.address}</div>}
              {settings.phone && <div className="text-muted-foreground">{settings.phone}</div>}
              {settings.receiptHeader && <div className="mt-1.5">{settings.receiptHeader}</div>}
            </div>
            <div className="my-2 border-t border-dashed" />
            <div className="space-y-1">
              <div className="flex justify-between gap-2"><span className="truncate">2 × Sample item</span><span>{formatRs(900, settings.currency)}</span></div>
              <div className="flex justify-between gap-2"><span className="truncate">1 × Another item</span><span>{formatRs(450, settings.currency)}</span></div>
            </div>
            <div className="my-2 border-t border-dashed" />
            <div className="flex justify-between font-bold text-sm"><span>TOTAL</span><span>{formatRs(1350, settings.currency)}</span></div>
            <div className="mt-3 text-center">{settings.receiptFooter || "Footer text"}</div>
          </div>
        </Card>
      </div>
    </div>
  );
}
