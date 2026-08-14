import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useStore, type ReceiptDesign } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { Receipt as ReceiptView } from "@/components/Receipt";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Download, Check, Receipt as ReceiptIcon } from "lucide-react";
import { toast } from "sonner";
import { downloadJson } from "@/lib/export";

export const Route = createFileRoute("/app/settings")({ component: SettingsPage });

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

function Field({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: ReactNode }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** One on/off row in the receipt designer. */
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1.5 cursor-pointer">
      <span className="text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

/** Segmented picker for the small either/or layout choices. */
function Segmented<T extends string>({
  value, options, onChange,
}: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 text-xs px-2 py-1.5 rounded-md border transition-colors ${
            value === o.value ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const SAMPLE = {
  invoice: "INV-S1-000123",
  at: new Date(),
  shopName: "Main Branch",
  cashier: "Shop 1 Cashier",
  customer: "Ayesha K.",
  payment: "Cash",
  tendered: 2000,
  change: 650,
  subtotal: 1500,
  discount: 150,
  total: 1350,
  lines: [
    { name: "Matte Lipstick — Ruby 02", qty: 2, price: 450, barcode: "8901001" },
    { name: "Kajal Pencil — Black", qty: 4, price: 150, barcode: "8901002" },
  ],
};

function SettingsPage() {
  const store = useStore();
  const { user, settings, updateSettings, updateReceiptDesign } = store;
  const isAdmin = user?.role === "admin";
  const d = settings.receipt;

  /**
   * A backup that omits a table is worse than no backup — you only find out
   * what was missing when you try to restore from it. This one silently left
   * out suppliers, and later grew to also miss day sessions, transfers,
   * customers and the money they owe. Every dataset the store holds now goes in.
   */
  const exportBackup = () => {
    const {
      shops, users, products, inventory, sales, purchases, suppliers, expenses, returns,
      daySessions, transfers, customers, customerPayments, discounts,
    } = store;
    downloadJson(`apos-backup-${new Date().toISOString().slice(0, 10)}.json`, {
      exportedAt: new Date().toISOString(),
      version: 3,
      settings, discounts,
      shops, users, products, inventory, sales, purchases, suppliers, expenses, returns,
      daySessions, transfers, customers, customerPayments,
    });
    toast.success("Backup downloaded");
  };

  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="Settings" subtitle="Business details and receipt design." />
        <Card className="p-10 text-center text-sm text-muted-foreground">Admins only.</Card>
      </div>
    );
  }

  const toggles: { key: keyof ReceiptDesign; label: string }[] = [
    { key: "showBusinessName", label: "Business name" },
    { key: "showShopName", label: "Shop name" },
    { key: "showAddress", label: "Address" },
    { key: "showPhone", label: "Phone" },
    { key: "showHeaderText", label: "Header text" },
    { key: "showInvoiceNo", label: "Invoice number" },
    { key: "showDateTime", label: "Date & time" },
    { key: "showCustomer", label: "Customer name" },
    { key: "showCashier", label: "Cashier name" },
    { key: "showUnitPrice", label: "Unit price per item" },
    { key: "showItemBarcodes", label: "Item barcodes" },
    { key: "showPaymentLine", label: "Payment & change" },
    { key: "showThankYouDivider", label: "Dividers" },
    { key: "showFooterText", label: "Footer text" },
  ];

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Business details and receipt design. Stock alerts and discounts have their own tabs."
        actions={
          <>
            {/*
              There was a "Save changes" button here that only fired a toast.
              Every field on this page already writes through updateSettings on
              change, so the button saved nothing — and implied that edits would
              be LOST without it, which was the opposite of the truth.
            */}
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground px-2.5 py-1.5">
              <Check className="h-3.5 w-3.5 text-success-strong" />
              Changes save as you type
            </span>
            <Button variant="outline" onClick={exportBackup}><Download className="h-4 w-4 mr-1.5" />Export backup</Button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
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
              <Field label="Tax / NTN number" hint="Printed on receipts when set." className="sm:col-span-4">
                <Input value={settings.taxNumber} onChange={(e) => updateSettings({ taxNumber: e.target.value })} placeholder="Optional" />
              </Field>
              <Field label="Invoice prefix" hint="e.g. INV-S1-000123" className="sm:col-span-2">
                <Input value={settings.invoicePrefix} onChange={(e) => updateSettings({ invoicePrefix: e.target.value })} />
              </Field>
            </div>
          </Section>

          <Section title="Receipt text" description="The lines printed above and below the sale.">
            <div className="grid gap-4">
              <Field label="Header text" hint="Appears under the shop address.">
                <Input value={settings.receiptHeader} onChange={(e) => updateSettings({ receiptHeader: e.target.value })} />
              </Field>
              <Field label="Footer text" hint="The last line of the receipt.">
                <Input value={settings.receiptFooter} onChange={(e) => updateSettings({ receiptFooter: e.target.value })} />
              </Field>
            </div>
          </Section>

          <Section title="Receipt design" description="Choose what prints and how it's laid out. The preview updates as you change these.">
            <div className="grid gap-5 sm:grid-cols-3">
              <Field label="Paper width">
                <Segmented
                  value={d.paperWidth}
                  onChange={(v) => updateReceiptDesign({ paperWidth: v })}
                  options={[{ value: "58mm", label: "58mm" }, { value: "80mm", label: "80mm" }, { value: "A4", label: "A4" }]}
                />
              </Field>
              <Field label="Font size">
                <Segmented
                  value={d.fontSize}
                  onChange={(v) => updateReceiptDesign({ fontSize: v })}
                  options={[{ value: "sm", label: "Small" }, { value: "md", label: "Medium" }, { value: "lg", label: "Large" }]}
                />
              </Field>
              <Field label="Alignment">
                <Segmented
                  value={d.align}
                  onChange={(v) => updateReceiptDesign({ align: v })}
                  options={[{ value: "left", label: "Left" }, { value: "center", label: "Centred" }]}
                />
              </Field>
            </div>

            <Separator className="my-5" />

            <div className="grid sm:grid-cols-2 gap-x-8">
              {toggles.map((t) => (
                <Toggle
                  key={t.key}
                  label={t.label}
                  checked={Boolean(d[t.key])}
                  onChange={(v) => updateReceiptDesign({ [t.key]: v } as Partial<ReceiptDesign>)}
                />
              ))}
            </div>
          </Section>
        </div>

        <Card className="p-5 lg:sticky lg:top-0 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <ReceiptIcon className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold">Receipt preview</h3>
          </div>
          <p className="text-xs text-muted-foreground">Sample sale. Updates as you type.</p>
          <Separator className="my-4" />
          <div className="max-h-[60dvh] overflow-y-auto">
            <ReceiptView data={SAMPLE} settings={settings} />
          </div>
        </Card>
      </div>
    </div>
  );
}
