import { formatRs, WALK_IN, type ReceiptDesign, type Settings } from "@/lib/store";

export interface ReceiptData {
  invoice: string;
  at: Date;
  shopName?: string;
  cashier: string;
  customer: string;
  payment: string;
  tendered: number;
  change: number;
  subtotal: number;
  discount: number;
  total: number;
  lines: { name: string; qty: number; price: number; barcode?: string }[];
}

const WIDTHS: Record<ReceiptDesign["paperWidth"], string> = {
  "58mm": "max-w-[230px]",
  "80mm": "max-w-[320px]",
  A4: "max-w-full",
};

const SIZES: Record<ReceiptDesign["fontSize"], string> = {
  sm: "text-[10px]",
  md: "text-xs",
  lg: "text-sm",
};

/**
 * One renderer for every receipt in the app, driven by the design settings,
 * so the Settings preview and what actually prints can't drift apart.
 */
export function Receipt({
  data,
  settings,
  className = "",
}: {
  data: ReceiptData;
  settings: Settings;
  className?: string;
}) {
  const d = settings.receipt;
  const currency = settings.currency;
  const money = (n: number) => formatRs(n, currency);

  return (
    <div
      className={`font-mono ${SIZES[d.fontSize]} ${WIDTHS[d.paperWidth]} ${d.align === "center" ? "text-center" : "text-left"} mx-auto bg-muted/40 border rounded-lg p-4 ${className}`}
    >
      {(d.showBusinessName ||
        d.showShopName ||
        d.showAddress ||
        d.showPhone ||
        d.showHeaderText) && (
        <div className="text-center space-y-0.5">
          {d.showBusinessName && (
            <div className="font-bold text-[1.2em]">{settings.businessName}</div>
          )}
          {d.showShopName && data.shopName && (
            <div className="text-muted-foreground">{data.shopName}</div>
          )}
          {d.showAddress && settings.address && (
            <div className="text-muted-foreground">{settings.address}</div>
          )}
          {d.showPhone && settings.phone && (
            <div className="text-muted-foreground">{settings.phone}</div>
          )}
          {settings.taxNumber && (
            <div className="text-muted-foreground">NTN: {settings.taxNumber}</div>
          )}
          {d.showHeaderText && settings.receiptHeader && (
            <div className="mt-1.5">{settings.receiptHeader}</div>
          )}
        </div>
      )}

      {d.showThankYouDivider && <div className="my-2 border-t border-dashed" />}

      {(d.showInvoiceNo || d.showDateTime || d.showCustomer || d.showCashier) && (
        <div className="space-y-0.5 text-left">
          {d.showInvoiceNo && <Row label="Invoice" value={data.invoice} />}
          {d.showDateTime && <Row label="Date" value={data.at.toLocaleString()} />}
          {d.showCustomer && <Row label="Customer" value={data.customer?.trim() || WALK_IN} />}
          {d.showCashier && <Row label="Cashier" value={data.cashier} />}
        </div>
      )}

      {d.showThankYouDivider && <div className="my-2 border-t border-dashed" />}

      <div className="space-y-1 text-left">
        {data.lines.map((l, i) => (
          <div key={i}>
            <div className="flex justify-between gap-2">
              <span className="min-w-0 truncate">
                {l.qty} × {l.name}
              </span>
              <span className="shrink-0">{money(l.qty * l.price)}</span>
            </div>
            {(d.showUnitPrice || (d.showItemBarcodes && l.barcode)) && (
              <div className="text-muted-foreground flex gap-2 pl-3">
                {d.showUnitPrice && <span>@ {money(l.price)}</span>}
                {d.showItemBarcodes && l.barcode && <span>{l.barcode}</span>}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="my-2 border-t border-dashed" />

      <div className="space-y-0.5 text-left">
        <Row label="Subtotal" value={money(data.subtotal)} />
        {data.discount > 0 && <Row label="Discount" value={`− ${money(data.discount)}`} />}
      </div>
      <div className="flex justify-between font-bold text-[1.2em] mt-1.5">
        <span>TOTAL</span>
        <span>{money(data.total)}</span>
      </div>

      {d.showPaymentLine && (
        <div className="space-y-0.5 mt-1 text-left">
          <Row
            label={`Paid (${data.payment})`}
            value={money(data.payment === "Cash" && data.tendered > 0 ? data.tendered : data.total)}
          />
          {data.change > 0 && <Row label="Change" value={money(data.change)} />}
        </div>
      )}

      {d.showFooterText && settings.receiptFooter && (
        <div className="mt-3 text-center">{settings.receiptFooter}</div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span>{label}</span>
      <span className="truncate">{value}</span>
    </div>
  );
}
