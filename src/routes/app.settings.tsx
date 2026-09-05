import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import type { ReactNode } from "react";
import { useStore, INVOICE_ACCENTS, type InvoiceDesign, type ReceiptDesign } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { Receipt as ReceiptView } from "@/components/Receipt";
import { Invoice as InvoiceView, type InvoiceData } from "@/components/Invoice";
import { LogoPicker } from "@/components/LogoPicker";
import { settingsForShop } from "@/lib/bill-settings";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Download,
  Check,
  Building2,
  FileText,
  Image as ImageIcon,
  Receipt as ReceiptIcon,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { downloadJson } from "@/lib/export";

export const Route = createFileRoute("/app/settings")({ component: SettingsPage });

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
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

/** One on/off row in the receipt designer. */
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 py-1.5 cursor-pointer">
      <span className="text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

/** Segmented picker for the small either/or layout choices. */
function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 text-xs px-2 py-1.5 rounded-md border transition-colors ${
            value === o.value
              ? "bg-primary text-primary-foreground border-primary"
              : "hover:bg-muted"
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
  const {
    user,
    settings,
    updateSettings,
    updateReceiptDesign,
    updateInvoiceDesign,
    shops,
    updateShop,
  } = store;
  const isAdmin = user?.role === "admin";
  const d = settings.receipt;

  /*
   * The bill designer edits one of two things: the business-wide design, or a
   * single shop's overrides of it.
   *
   * Held as a shop id rather than a copy of the design, so switching outlets
   * cannot leave half-edited state behind, and every write goes straight to the
   * row it belongs to.
   */
  const [billShopId, setBillShopId] = useState<string>("");
  const billShop = billShopId ? (shops.find((x) => x.id === billShopId) ?? null) : null;

  // What the chosen target actually renders with — the business design, or the
  // business design with this shop's overrides folded in.
  const effective = billShop ? settingsForShop(settings, billShop) : settings;
  const b = effective.invoice;

  /** Writes a design change to whichever target is being edited. */
  const setDesign = (patch: Partial<InvoiceDesign>) => {
    if (!billShop) return updateInvoiceDesign(patch);
    updateShop({
      ...billShop,
      bill: { ...billShop.bill, design: { ...billShop.bill?.design, ...patch } },
    });
  };

  /** The same for the wording, which lives on Settings rather than the design. */
  const setText = (
    patch: Partial<
      Pick<
        typeof settings,
        "invoiceTitle" | "invoiceTerms" | "invoiceSignatory" | "invoiceCopyLabel" | "invoiceNote"
      >
    >,
  ) => {
    if (!billShop) return updateSettings(patch);
    const map = {
      invoiceTitle: "title",
      invoiceTerms: "terms",
      invoiceSignatory: "signatory",
      invoiceCopyLabel: "copyLabel",
      invoiceNote: "note",
    } as const;
    const bill = { ...billShop.bill };
    for (const [key, value] of Object.entries(patch)) {
      bill[map[key as keyof typeof map]] = value as string;
    }
    updateShop({ ...billShop, bill });
  };

  /** Puts one outlet back on the business-wide design entirely. */
  const resetShop = () => {
    if (!billShop) return;
    updateShop({ ...billShop, bill: undefined });
    toast.success(`${billShop.name} follows the business design again`);
  };

  /**
   * A backup that omits a table is worse than no backup — you only find out
   * what was missing when you try to restore from it. This one silently left
   * out suppliers, and later grew to also miss day sessions, transfers,
   * customers and the money they owe. Every dataset the store holds now goes in.
   */
  const exportBackup = () => {
    const {
      shops,
      users,
      products,
      inventory,
      sales,
      purchases,
      suppliers,
      expenses,
      returns,
      daySessions,
      transfers,
      customers,
      customerPayments,
      discounts,
    } = store;
    downloadJson(`apos-backup-${new Date().toISOString().slice(0, 10)}.json`, {
      exportedAt: new Date().toISOString(),
      version: 3,
      settings,
      discounts,
      shops,
      users,
      products,
      inventory,
      sales,
      purchases,
      suppliers,
      expenses,
      returns,
      daySessions,
      transfers,
      customers,
      customerPayments,
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
    { key: "showBillTag", label: "Title under the rule" },
    { key: "showLogo", label: "Logo" },
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
            <Button variant="outline" onClick={exportBackup}>
              <Download className="h-4 w-4 mr-1.5" />
              Export backup
            </Button>
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
            <Building2 className="h-4 w-4 mr-1.5" />
            Business
          </TabsTrigger>
          <TabsTrigger value="receipt">
            <ReceiptIcon className="h-4 w-4 mr-1.5" />
            Receipt
          </TabsTrigger>
          <TabsTrigger value="bill">
            <FileText className="h-4 w-4 mr-1.5" />
            Bill
          </TabsTrigger>
        </TabsList>

        {/* No preview here — none of these fields has a shape, and a half-empty
            rail beside them only narrows the form. */}
        <TabsContent value="business" className="grid gap-5 max-w-3xl">
          <Section title="Business" description="Shown on receipts and exported reports.">
            <div className="grid gap-4 sm:grid-cols-6">
              <Field label="Business name" className="sm:col-span-4">
                <Input
                  value={settings.businessName}
                  onChange={(e) => updateSettings({ businessName: e.target.value })}
                />
              </Field>
              <Field label="Currency" hint="Symbol or code" className="sm:col-span-2">
                <Input
                  value={settings.currency}
                  onChange={(e) => updateSettings({ currency: e.target.value })}
                />
              </Field>
              <Field label="Address" className="sm:col-span-4">
                <Input
                  value={settings.address}
                  onChange={(e) => updateSettings({ address: e.target.value })}
                />
              </Field>
              <Field label="Phone" className="sm:col-span-2">
                <Input
                  value={settings.phone}
                  onChange={(e) => updateSettings({ phone: e.target.value })}
                />
              </Field>
              <Field
                label="Tax / NTN number"
                hint="Printed on receipts when set."
                className="sm:col-span-4"
              >
                <Input
                  value={settings.taxNumber}
                  onChange={(e) => updateSettings({ taxNumber: e.target.value })}
                  placeholder="Optional"
                />
              </Field>
              <Field label="Invoice prefix" hint="e.g. INV-S1-000123" className="sm:col-span-2">
                <Input
                  value={settings.invoicePrefix}
                  onChange={(e) => updateSettings({ invoicePrefix: e.target.value })}
                />
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
                  <Input
                    value={settings.receiptHeader}
                    onChange={(e) => updateSettings({ receiptHeader: e.target.value })}
                  />
                </Field>
                <Field label="Footer text" hint="The last line of the receipt.">
                  <Input
                    value={settings.receiptFooter}
                    onChange={(e) => updateSettings({ receiptFooter: e.target.value })}
                  />
                </Field>
              </div>
            </Section>

            <Section
              title="Receipt design"
              description="Choose what prints and how it's laid out. The preview updates as you change these."
            >
              <div className="grid gap-5 sm:grid-cols-3">
                <Field label="Paper width">
                  <Segmented
                    value={d.paperWidth}
                    onChange={(v) => updateReceiptDesign({ paperWidth: v })}
                    options={[
                      { value: "58mm", label: "58mm" },
                      { value: "80mm", label: "80mm" },
                      { value: "A4", label: "A4" },
                    ]}
                  />
                </Field>
                <Field label="Font size">
                  <Segmented
                    value={d.fontSize}
                    onChange={(v) => updateReceiptDesign({ fontSize: v })}
                    options={[
                      { value: "sm", label: "Small" },
                      { value: "md", label: "Medium" },
                      { value: "lg", label: "Large" },
                    ]}
                  />
                </Field>
                <Field label="Alignment">
                  <Segmented
                    value={d.align}
                    onChange={(v) => updateReceiptDesign({ align: v })}
                    options={[
                      { value: "left", label: "Left" },
                      { value: "center", label: "Centred" },
                    ]}
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
            {/*
              Which outlet's paperwork is being designed.

              A group with four shops usually wants one design everywhere, so the
              business default comes first and is what opens. A branch is only
              listed as "customised" once it actually holds an override, which
              makes it obvious at a glance where the exceptions are.
            */}
            <Card className="p-4 sm:p-5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Designing bills for
              </Label>
              {/*
                Wrapping, and capped in height. Eleven buttons — the business
                default plus ten shops — is a tall block in a 22rem column, and
                pushed the design controls below the fold on a laptop.
              */}
              <div className="flex flex-wrap gap-2 mt-2 max-h-48 overflow-y-auto">
                <button
                  onClick={() => setBillShopId("")}
                  className={cn(
                    "h-9 px-3 rounded-md border text-sm font-medium transition-colors cursor-pointer",
                    !billShop
                      ? "bg-primary text-primary-foreground border-primary"
                      : "hover:bg-muted",
                  )}
                >
                  All shops (business default)
                </button>
                {shops
                  .filter((x) => x.active)
                  .map((x) => (
                    <button
                      key={x.id}
                      onClick={() => setBillShopId(x.id)}
                      className={cn(
                        "h-9 px-3 rounded-md border text-sm font-medium transition-colors cursor-pointer",
                        billShopId === x.id
                          ? "bg-primary text-primary-foreground border-primary"
                          : "hover:bg-muted",
                      )}
                    >
                      {x.name}
                      {(x.bill || x.logo) && (
                        <span className="ml-1.5 text-[10px] uppercase tracking-wide opacity-70">
                          customised
                        </span>
                      )}
                    </button>
                  ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2.5">
                {billShop
                  ? `Changes below apply to ${billShop.name} only. Anything left untouched follows the business design.`
                  : "Changes below apply to every shop that has not been customised."}
              </p>
              {billShop && (billShop.bill || billShop.logo) && (
                <Button variant="outline" className="h-8 mt-3" onClick={resetShop}>
                  Reset {billShop.name} to the business design
                </Button>
              )}
            </Card>

            <Section
              title="Bill text"
              description="The lines printed on a bill, above the items and under the totals."
            >
              <div className="grid gap-4">
                <Field
                  label="Note above the items"
                  hint="Order reference, delivery terms - left blank on most bills."
                >
                  <Input
                    value={effective.invoiceNote}
                    placeholder="e.g. Against order dated 12/08"
                    onChange={(e) => setText({ invoiceNote: e.target.value })}
                  />
                </Field>
                <Field label="Terms" hint="The small print beside the signature.">
                  <Input
                    value={effective.invoiceTerms}
                    onChange={(e) => setText({ invoiceTerms: e.target.value })}
                  />
                </Field>
                <Field
                  label="Title in the tab"
                  hint="Some shops send a delivery challan rather than a bill."
                >
                  <Input
                    value={effective.invoiceTitle}
                    placeholder="INVOICE / BILL"
                    onChange={(e) => setText({ invoiceTitle: e.target.value })}
                  />
                </Field>
                <Field label="Under the signature line">
                  <Input
                    value={effective.invoiceSignatory}
                    placeholder="Authorised signature"
                    onChange={(e) => setText({ invoiceSignatory: e.target.value })}
                  />
                </Field>
                <Field
                  label="Copy stamp"
                  hint="Shown in the corner when the stamp is switched on below."
                >
                  <Input
                    value={effective.invoiceCopyLabel}
                    placeholder="ORIGINAL"
                    onChange={(e) => setText({ invoiceCopyLabel: e.target.value })}
                  />
                </Field>
              </div>
            </Section>

            <Section
              title="Logo"
              description="Printed in the top right of every bill, on screen and in the PDF."
            >
              <LogoPicker
                value={billShop ? (billShop.logo ?? "") : settings.invoiceLogo}
                onChange={(logo) =>
                  billShop
                    ? updateShop({ ...billShop, logo: logo || undefined })
                    : updateSettings({ invoiceLogo: logo })
                }
                label={billShop ? `${billShop.name} logo` : "Business logo"}
              />
              <p className="text-xs text-muted-foreground mt-3">
                Used on every shop&apos;s bills. A branch that needs its own mark can override this
                on the Shops page.
              </p>
            </Section>

            <Section
              title="Bill design"
              description="What appears on a printed or downloaded bill. The preview updates as you change these."
            >
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
                <Field label="Paper size">
                  <Segmented
                    value={b.paperSize}
                    onChange={(v) => setDesign({ paperSize: v })}
                    options={[
                      { value: "A4", label: "A4" },
                      { value: "A5", label: "A5" },
                    ]}
                  />
                </Field>
                <Field label="Font size">
                  <Segmented
                    value={b.fontSize}
                    onChange={(v) => setDesign({ fontSize: v })}
                    options={[
                      { value: "sm", label: "Small" },
                      { value: "md", label: "Medium" },
                      { value: "lg", label: "Large" },
                    ]}
                  />
                </Field>
                <Field
                  label="Table heading"
                  hint="Solid matches a printed bill book; plain saves toner."
                >
                  <Segmented
                    value={b.accent}
                    onChange={(v) => setDesign({ accent: v })}
                    options={[
                      { value: "ink", label: "Solid" },
                      { value: "plain", label: "Plain" },
                    ]}
                  />
                </Field>
                <Field label="Logo size" hint="How large the mark prints in the top right.">
                  <Segmented
                    value={b.logoSize}
                    onChange={(v) => setDesign({ logoSize: v })}
                    options={[
                      { value: "sm", label: "Small" },
                      { value: "md", label: "Medium" },
                      { value: "lg", label: "Large" },
                    ]}
                  />
                </Field>
                <Field label="Row height" hint="Compact fits about a third more items on a sheet.">
                  <Segmented
                    value={b.density}
                    onChange={(v) => setDesign({ density: v })}
                    options={[
                      { value: "normal", label: "Normal" },
                      { value: "compact", label: "Compact" },
                    ]}
                  />
                </Field>

                {/*
                Four inks rather than a colour picker: these are the ones that
                still read as white type on a mono laser, which is what most of
                these bills are actually printed on. A free picker invites yellow.
              */}
                <Field label="Ink" hint="Colours the heading band and the title tab.">
                  <div className="flex gap-2">
                    {(Object.keys(INVOICE_ACCENTS) as (keyof typeof INVOICE_ACCENTS)[]).map(
                      (key) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setDesign({ accentColor: key })}
                          title={INVOICE_ACCENTS[key].label}
                          aria-label={INVOICE_ACCENTS[key].label}
                          aria-pressed={b.accentColor === key}
                          className={`h-9 w-9 rounded-md border-2 transition-all cursor-pointer ${
                            b.accentColor === key
                              ? "border-ring scale-105"
                              : "border-transparent hover:scale-105"
                          }`}
                          style={{ backgroundColor: INVOICE_ACCENTS[key].hex }}
                        />
                      ),
                    )}
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
                    onChange={(e) => setDesign({ ruledRowCount: Number(e.target.value) })}
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
                    onChange={(v) => setDesign({ [t.key]: v } as Partial<InvoiceDesign>)}
                  />
                ))}
              </div>
            </Section>
          </div>

          <Card className="p-4 sm:p-6 lg:sticky lg:top-0 min-w-0 bg-muted/30">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold">Bill preview{billShop ? ` — ${billShop.name}` : ""}</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              A trade order carrying a balance forward — the same layout that prints and downloads.
            </p>
            <Separator className="my-4" />
            {/* At its own size, centred, with nothing clipping it. The sheet is
                capped at A4's width and simply narrows on a smaller screen. */}
            <div className="mx-auto w-full max-w-[820px]">
              <InvoiceView
                data={{ ...SAMPLE_BILL, shopName: billShop?.name ?? SAMPLE_BILL.shopName }}
                settings={effective}
                className="shadow-sm"
              />
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
