import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useStore, INVOICE_ACCENTS, type InvoiceDesign, type ReceiptDesign } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { Receipt as ReceiptView } from "@/components/Receipt";
import { Invoice as InvoiceView, type InvoiceData } from "@/components/Invoice";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, Check, Building2, FileText, Receipt as ReceiptIcon } from "lucide-react";
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

/**
 * The preview bill. Deliberately a trade order carrying a balance forward - the
 * account block is the half of the design most worth seeing before it goes out
 * to a wholesale customer, and a one-line cash sale would never show it.
 */
const SAMPLE_BILL: InvoiceData = {
  invoice: "INV-0848",
  at: new Date(),
  shopName: "Main Branch",
  cashier: "Owner",
  customer: "Bilal Traders",
  customerPhone: "0300-1234567",
  lines: [
    { name: "Chand Maxi", qty: 7, rate: 2300 },
    { name: "Crush Flare - Golden", qty: 5, rate: 3100 },
    { name: "Silk Contrast", qty: 9, rate: 4200 },
  ],
  subtotal: 69400,
  discount: 0,
  total: 69400,
  payment: "Credit",
  status: "Completed",
  account: { previousBalance: 36550, onAccount: 69400, received: 32000, closingBalance: 73950 },
};

function SettingsPage() {
  const store = useStore();
  const { user, settings, updateSettings, updateReceiptDesign, updateInvoiceDesign } = store;
  const isAdmin = user?.role === "admin";
  const d = settings.receipt;
  const b = settings.invoice;

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
        <PageHeader title="Settings" subtitle="Business details, receipt and bill design." />
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

  const billToggles: { key: keyof InvoiceDesign; label: string }[] = [
    { key: "showBillTag", label: "INVOICE / BILL tag" },
    { key: "showBusinessName", label: "Business name" },
    { key: "showShopName", label: "Shop name" },
    { key: "showAddress", label: "Address" },
    { key: "showPhone", label: "Phone" },
    { key: "showTaxNumber", label: "NTN number" },
    { key: "showInvoiceNo", label: "Bill number (S.No.)" },
    { key: "showDate", label: "Date" },
    { key: "showCustomer", label: "Customer (M/s)" },
    { key: "showCustomerPhone", label: "Customer phone" },
    { key: "showCashier", label: "Billed by" },
    { key: "showLineNumbers", label: "Line numbers" },
    { key: "showUnitRate", label: "Rate column" },
    { key: "showAccountBlock", label: "Previous balance & account" },
    { key: "showAmountInWords", label: "Total written in words" },
    { key: "ruledRows", label: "Empty ruled rows" },
    { key: "showCopyLabel", label: "Copy stamp (Original / Office)" },
    { key: "showTerms", label: "Terms line" },
    { key: "showSignature", label: "Signature space" },
  ];

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Your business, the till receipt, and the bill — one tab each. Stock alerts and discounts have their own pages."
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

      {/*
        Three documents' worth of settings on one page had grown to five stacked
        sections and two previews — most of it scrolled past to reach the one
        field being changed. Tabbed, each job is a screen: the business details,
        the till slip, or the bill. Both previews used to be side by side in the
        rail whichever you were editing, so half of it was always answering a
        question nobody had asked; now the preview belongs to its tab.
      */}
      <Tabs defaultValue="business">
        <TabsList className="mb-4">
          <TabsTrigger value="business">
            <Building2 className="h-4 w-4 mr-1.5" />Business
          </TabsTrigger>
          <TabsTrigger value="receipt">
            <ReceiptIcon className="h-4 w-4 mr-1.5" />Receipt
          </TabsTrigger>
          <TabsTrigger value="bill">
            <FileText className="h-4 w-4 mr-1.5" />Bill
          </TabsTrigger>
        </TabsList>

        {/* No preview here — none of these fields has a shape, and a half-empty
            rail beside them only narrows the form. */}
        <TabsContent value="business" className="grid gap-5 max-w-3xl">
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
        </TabsContent>

        <TabsContent
          value="receipt"
          className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] items-start"
        >
          <div className="grid gap-5 min-w-0">
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
          <div className="max-h-[70dvh] overflow-y-auto">
            <ReceiptView data={SAMPLE} settings={settings} />
          </div>
          </Card>
        </TabsContent>

        {/*
          The columns are the other way round from the receipt tab, and on
          purpose. A 340px rail cannot hold an A4 sheet: the bill was shrunk to
          62% and still had to be scrolled in both directions to be read, which
          is not a preview of anything. The controls are the narrow thing here —
          they are a list of switches — so the sheet gets the rest of the page
          and prints at its real proportions.
        */}
        <TabsContent
          value="bill"
          className="grid gap-5 lg:grid-cols-[22rem_minmax(0,1fr)] items-start"
        >
          <div className="grid gap-5 min-w-0">
          <Section title="Bill text" description="The lines printed on a bill, above the items and under the totals.">
            <div className="grid gap-4">
              <Field label="Note above the items" hint="Order reference, delivery terms - left blank on most bills.">
                <Input
                  value={settings.invoiceNote}
                  placeholder="e.g. Against order dated 12/08"
                  onChange={(e) => updateSettings({ invoiceNote: e.target.value })}
                />
              </Field>
              <Field label="Terms" hint="The small print beside the signature.">
                <Input
                  value={settings.invoiceTerms}
                  onChange={(e) => updateSettings({ invoiceTerms: e.target.value })}
                />
              </Field>
              <Field label="Title in the tab" hint="Some shops send a delivery challan rather than a bill.">
                <Input
                  value={settings.invoiceTitle}
                  placeholder="INVOICE / BILL"
                  onChange={(e) => updateSettings({ invoiceTitle: e.target.value })}
                />
              </Field>
              <Field label="Under the signature line">
                <Input
                  value={settings.invoiceSignatory}
                  placeholder="Authorised signature"
                  onChange={(e) => updateSettings({ invoiceSignatory: e.target.value })}
                />
              </Field>
              <Field label="Copy stamp" hint="Shown in the corner when the stamp is switched on below.">
                <Input
                  value={settings.invoiceCopyLabel}
                  placeholder="ORIGINAL"
                  onChange={(e) => updateSettings({ invoiceCopyLabel: e.target.value })}
                />
              </Field>
            </div>
          </Section>

          <Section title="Bill design" description="What appears on a printed or downloaded bill. The preview updates as you change these.">
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
              <Field label="Paper size">
                <Segmented
                  value={b.paperSize}
                  onChange={(v) => updateInvoiceDesign({ paperSize: v })}
                  options={[{ value: "A4", label: "A4" }, { value: "A5", label: "A5" }]}
                />
              </Field>
              <Field label="Font size">
                <Segmented
                  value={b.fontSize}
                  onChange={(v) => updateInvoiceDesign({ fontSize: v })}
                  options={[{ value: "sm", label: "Small" }, { value: "md", label: "Medium" }, { value: "lg", label: "Large" }]}
                />
              </Field>
              <Field label="Table heading" hint="Solid matches a printed bill book; plain saves toner.">
                <Segmented
                  value={b.accent}
                  onChange={(v) => updateInvoiceDesign({ accent: v })}
                  options={[{ value: "ink", label: "Solid" }, { value: "plain", label: "Plain" }]}
                />
              </Field>
              <Field
                label="Letterhead"
                hint="Split puts your details down the left with the title centred under a rule, the way a printed invoice reads."
              >
                <Segmented
                  value={b.headerAlign}
                  onChange={(v) => updateInvoiceDesign({ headerAlign: v })}
                  options={[
                    { value: "split", label: "Split" },
                    { value: "center", label: "Centred" },
                    { value: "left", label: "Left" },
                  ]}
                />
              </Field>
              <Field label="Row height" hint="Compact fits about a third more items on a sheet.">
                <Segmented
                  value={b.density}
                  onChange={(v) => updateInvoiceDesign({ density: v })}
                  options={[{ value: "normal", label: "Normal" }, { value: "compact", label: "Compact" }]}
                />
              </Field>

              {/*
                Four inks rather than a colour picker: these are the ones that
                still read as white type on a mono laser, which is what most of
                these bills are actually printed on. A free picker invites yellow.
              */}
              <Field label="Ink" hint="Colours the heading band and the title tab.">
                <div className="flex gap-2">
                  {(Object.keys(INVOICE_ACCENTS) as (keyof typeof INVOICE_ACCENTS)[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => updateInvoiceDesign({ accentColor: key })}
                      title={INVOICE_ACCENTS[key].label}
                      aria-label={INVOICE_ACCENTS[key].label}
                      aria-pressed={b.accentColor === key}
                      className={`h-9 w-9 rounded-md border-2 transition-all cursor-pointer ${
                        b.accentColor === key ? "border-ring scale-105" : "border-transparent hover:scale-105"
                      }`}
                      style={{ backgroundColor: INVOICE_ACCENTS[key].hex }}
                    />
                  ))}
                </div>
              </Field>

              <Field
                label={`Ruled rows: ${b.ruledRowCount}`}
                hint="How far the table is padded out when a bill is short."
              >
                <input
                  type="range"
                  min={0}
                  max={20}
                  value={b.ruledRowCount}
                  onChange={(e) => updateInvoiceDesign({ ruledRowCount: Number(e.target.value) })}
                  className="w-full accent-primary cursor-pointer"
                  disabled={!b.ruledRows}
                />
              </Field>
            </div>

            <Separator className="my-5" />

            {/* One per row: the column is 22rem now, and "Previous balance &
                account" wrapped onto two lines in half of that. */}
            <div className="grid">
              {billToggles.map((t) => (
                <Toggle
                  key={t.key}
                  label={t.label}
                  checked={Boolean(b[t.key])}
                  onChange={(v) => updateInvoiceDesign({ [t.key]: v } as Partial<InvoiceDesign>)}
                />
              ))}
            </div>
          </Section>
          </div>


          <Card className="p-4 sm:p-6 lg:sticky lg:top-0 min-w-0 bg-muted/30">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold">Bill preview</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              A trade order carrying a balance forward — the same layout that prints and downloads.
            </p>
            <Separator className="my-4" />
            {/* At its own size, centred, with nothing clipping it. The sheet is
                capped at A4's width and simply narrows on a smaller screen. */}
            <div className="mx-auto w-full max-w-[820px]">
              <InvoiceView data={SAMPLE_BILL} settings={settings} className="shadow-sm" />
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
