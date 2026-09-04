/**
 * The bill that goes out with the goods.
 *
 * Deliberately the shape of the carbon-copy bill book a wholesaler already
 * writes by hand — a ruled Qty / Particulars / Rate / Amount table, the total,
 * then the account: what was owed before, what came in, what is left. Trade
 * buyers read that block first and everything else second, so it is the part
 * that never moves.
 *
 * One renderer for every bill in the app, driven by the design settings, so the
 * Settings preview and what actually prints can't drift apart — the same
 * arrangement `Receipt` uses.
 */
import {
  INVOICE_ACCENTS,
  WALK_IN,
  type InvoiceDesign,
  type PaymentMethod,
  type Sale,
  type Settings,
} from "@/lib/store";
import { accountRows, amountInWords, billDate, billNumber } from "@/lib/bill-format";

export interface InvoiceLine {
  name: string;
  qty: number;
  /** Price per unit, as written in the Rate column. */
  rate: number;
}

export interface InvoiceData {
  /** The bill number — `S.No.` on a printed book. */
  invoice: string;
  at: Date;
  shopName?: string;
  cashier: string;
  customer: string;
  customerPhone?: string;
  /** How this bill was settled. "Credit" is the one that joins the account. */
  payment?: PaymentMethod;
  /** A returned sale still has a bill; it must not look like a live one. */
  status?: Sale["status"];
  /**
   * The mark to print, already resolved: this shop's own logo when it has one,
   * otherwise the business-wide one. Resolved by `buildInvoice` rather than
   * here, so the screen and the PDF cannot disagree about which logo a
   * particular outlet's bill carries.
   */
  logo?: string;
  lines: InvoiceLine[];
  subtotal: number;
  discount: number;
  /** This bill on its own, after any discount. */
  total: number;
  /**
   * The account, when the buyer has one. Omitted for a walk-in, where there is
   * no running balance and the block would just print three zeroes.
   *
   * All four figures are signed in the direction of what is owed, so a negative
   * closing balance is an advance being held for the customer.
   */
  account?: {
    /** Owed the moment before this bill was raised. */
    previousBalance: number;
    /** What this bill added to the account: its total on credit, else nothing. */
    onAccount: number;
    /** Payments, set-offs and write-offs since — the "Cash received" line. */
    received: number;
    /** Owed now, this bill and everything after it included. */
    closingBalance: number;
  };
}

const PAPER: Record<InvoiceDesign["paperSize"], string> = {
  A4: "max-w-[820px]",
  A5: "max-w-[580px]",
};

const SIZES: Record<InvoiceDesign["fontSize"], string> = {
  sm: "text-[11px]",
  md: "text-[13px]",
  lg: "text-[15px]",
};

/**
 * The box a logo is fitted into, per size. Height leads, because that is what a
 * square emblem fills; the width cap only bites on a wide wordmark.
 */
const LOGO_BOX: Record<InvoiceDesign["logoSize"], string> = {
  sm: "h-20 max-w-[11rem]",
  md: "h-28 max-w-[15rem]",
  lg: "h-36 max-w-[19rem]",
};

/** Row padding, per density. Compact fits about a third more on a sheet. */
const ROW_PAD: Record<InvoiceDesign["density"], string> = {
  compact: "px-2 py-1",
  normal: "px-2 py-1.5",
};

export function Invoice({
  data,
  settings,
  className = "",
}: {
  data: InvoiceData;
  settings: Settings;
  className?: string;
}) {
  const d = settings.invoice;
  const ink = d.accent === "ink";
  const accent = INVOICE_ACCENTS[d.accentColor]?.hex ?? INVOICE_ACCENTS.navy.hex;
  const pad = ROW_PAD[d.density];

  // A hand-written book has ruled rows whether or not there is anything to
  // write on them; without the padding a short bill floats in white space.
  const blanks = d.ruledRows ? Math.max(0, d.ruledRowCount - data.lines.length) : 0;

  const cellBorder = "border border-neutral-300";
  const headCell = `${cellBorder} ${pad} font-semibold ${ink ? "text-white" : "bg-neutral-100"}`;
  const headStyle = ink ? { backgroundColor: accent } : undefined;
  const muted = "text-neutral-500";
  // A bill built by `buildInvoice` arrives with its logo already chosen; the
  // Settings preview passes none and gets the business-wide one.
  // `||`, not `??`: an empty string is not nullish, and a shop saved with a
  // blank logo would otherwise print no mark instead of the business one.
  const logo = data.logo || settings.invoiceLogo;

  return (
    /*
     * Always paper: white ground, dark ink, fixed neutrals — never the app's
     * theme tokens. In dark mode this used to render as a dark sheet with pale
     * type, which is not what any printer does, so the preview stopped
     * predicting the printout exactly when someone was designing against it.
     */
    <div
      className={`${SIZES[d.fontSize]} ${PAPER[d.paperSize]} mx-auto bg-white text-neutral-900 border border-neutral-200 rounded-lg p-5 sm:p-7 print:border-0 print:rounded-none ${className}`}
    >
      {d.showCopyLabel && settings.invoiceCopyLabel && (
        <div className="flex justify-end -mt-1 mb-1">
          <span className="text-[0.7em] tracking-[0.18em] font-semibold border border-neutral-400 rounded px-2 py-0.5 text-neutral-600">
            {settings.invoiceCopyLabel}
          </span>
        </div>
      )}

      {/* A returned sale keeps its bill — the goods came back and the paperwork
          has to say so, or the copy in the buyer's file still reads as a debt. */}
      {data.status === "Returned" && (
        <div className="mb-3 text-center border border-red-600 text-red-700 rounded-md py-1 text-[0.9em] font-bold tracking-[0.15em]">
          RETURNED — CANCELLED
        </div>
      )}

      {/*
        ------------------------------------------------------------ header

        One arrangement, the one a printed invoice actually uses: who is sending
        it down the left in labelled lines, the shop's mark in the right corner,
        a rule under both, and the document's name centred beneath that. It was
        briefly a choice of three, which only ever produced two worse bills.
      */}
      {/* items-center, not items-start: whichever half is taller, the two sit
          level with each other rather than one hanging past the other. */}
      <div className="flex items-center justify-between gap-6">
        <div className="min-w-0">
          {d.showBusinessName && (
            <div className="font-display text-[1.6em] font-bold leading-none tracking-tight">
              {settings.businessName}
            </div>
          )}
          {/* Which outlet the goods actually left from. On a multi-shop business
              this is the difference between a bill you can trace and one you
              can't. */}
          {d.showShopName && data.shopName && (
            <div className="text-[0.95em] font-semibold mt-1">{data.shopName}</div>
          )}
          {/* One labelled line each, as a letterhead is written — not a run-on
              line with separators, which is a caption. */}
          <div className="mt-1 space-y-0.5 text-[0.82em] text-neutral-600">
            {d.showAddress && settings.address && <div>{settings.address}</div>}
            {d.showPhone && settings.phone && <div>Phone no.: {settings.phone}</div>}
            {d.showTaxNumber && settings.taxNumber && <div>NTN No.: {settings.taxNumber}</div>}
          </div>
        </div>

        {d.showLogo && logo && (
          // Bounded, never stretched: a wide mark and a square one both have to
          // sit in this corner without pushing the address block around.
          <img
            src={logo}
            alt=""
            className={`shrink-0 w-auto object-contain ${LOGO_BOX[d.logoSize] ?? LOGO_BOX.md}`}
          />
        )}
      </div>

      <div className="mt-3 border-t-2" style={{ borderColor: accent }} />

      {d.showBillTag && settings.invoiceTitle && (
        <div
          className="text-center font-bold text-[1.3em] mt-2 tracking-wide"
          style={{ color: accent }}
        >
          {settings.invoiceTitle}
        </div>
      )}

      {settings.invoiceNote && (
        <p className={`mt-3 text-[0.85em] ${muted}`}>{settings.invoiceNote}</p>
      )}

      {/*
        ------------------------------------------------------- items table

        Five ruled columns cannot be squeezed into a 360px phone and stay
        legible, so the table scrolls inside its own box rather than pushing the
        page sideways — which is what it did, taking the header and the totals
        with it. The min-width is the narrowest the grid still reads at.
      */}
      <div className="mt-4 -mx-1 overflow-x-auto">
        <table className="w-full min-w-[30rem] table-fixed border-collapse tabular-nums">
          <thead>
            <tr className="text-center">
              {d.showLineNumbers && (
                <th className={`${headCell} w-10`} style={headStyle}>
                  #
                </th>
              )}
              <th className={`${headCell} w-16`} style={headStyle}>
                Qty
              </th>
              <th className={headCell} style={headStyle}>
                Particulars
              </th>
              {d.showUnitRate && (
                <th className={`${headCell} w-24`} style={headStyle}>
                  Rate
                </th>
              )}
              {/* The one place the currency is named, so a bill is never a page of
                bare numbers — and never says Rs when Settings says otherwise. */}
              <th className={`${headCell} w-28`} style={headStyle}>
                Amount ({settings.currency})
              </th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((l, i) => (
              <tr key={i}>
                {d.showLineNumbers && (
                  <td className={`${cellBorder} ${pad} text-center ${muted}`}>{i + 1}</td>
                )}
                <td className={`${cellBorder} ${pad} text-center`}>
                  {String(l.qty).padStart(2, "0")}
                </td>
                <td className={`${cellBorder} ${pad} break-words`}>{l.name}</td>
                {d.showUnitRate && (
                  <td className={`${cellBorder} ${pad} text-right`}>{billNumber(l.rate)}</td>
                )}
                <td className={`${cellBorder} ${pad} text-right font-medium`}>
                  {billNumber(l.qty * l.rate)}
                </td>
              </tr>
            ))}
            {Array.from({ length: blanks }).map((_, i) => (
              <tr key={`blank-${i}`}>
                {d.showLineNumbers && <td className={`${cellBorder} ${pad}`}>&nbsp;</td>}
                <td className={`${cellBorder} ${pad}`}>&nbsp;</td>
                <td className={cellBorder}>&nbsp;</td>
                {d.showUnitRate && <td className={cellBorder}>&nbsp;</td>}
                <td className={cellBorder}>&nbsp;</td>
              </tr>
            ))}

            {/*
            The totals sit inside the same ruled grid rather than in a block
            underneath it — on a bill book they are written on the next line
            down, and keeping the rules unbroken is what makes a printed bill
            read as one document instead of a table with a caption.
          */}
            {data.discount > 0 && (
              <>
                <SummaryRow design={d} label="Total" value={billNumber(data.subtotal)} />
                <SummaryRow
                  design={d}
                  label="Less discount"
                  value={`− ${billNumber(data.discount)}`}
                />
              </>
            )}
            <SummaryRow
              design={d}
              label={data.discount > 0 ? "Net total" : "Total"}
              value={billNumber(data.total)}
              strong
            />

            {d.showAccountBlock &&
              data.account &&
              accountRows(data).map((r) => (
                <SummaryRow
                  key={r.label}
                  design={d}
                  label={r.label}
                  value={r.value}
                  strong={r.strong}
                />
              ))}
          </tbody>
        </table>
      </div>

      {/* The one figure read aloud on the phone, spelled out in words as well —
          "one lakh twenty" and "120,000" disagreeing is how bills get disputed. */}
      {d.showAmountInWords && (
        <div className={`mt-2 text-[0.85em] ${muted}`}>
          Amount in words:{" "}
          <span className="text-neutral-900">
            {amountInWords(Math.abs(data.account?.closingBalance ?? data.total), settings.currency)}
          </span>
        </div>
      )}

      <div className="mt-5 flex items-end justify-between gap-6">
        <div className={`text-[0.85em] ${muted} max-w-[60%]`}>
          {d.showTerms && settings.invoiceTerms}
        </div>
        {d.showSignature && (
          <div className="text-center shrink-0">
            <div className="w-40 border-b border-neutral-400 h-8" />
            <div className={`text-[0.8em] ${muted} mt-1`}>{settings.invoiceSignatory}</div>
          </div>
        )}
      </div>
    </div>
  );
}

/** A label with the value written after it, the way a form is filled in by hand. */
function Written({
  label,
  value,
  className = "",
  wide = false,
}: {
  label: string;
  value: string;
  className?: string;
  wide?: boolean;
}) {
  return (
    <div className="flex items-end gap-2 min-w-0">
      <span className="text-neutral-500 shrink-0">{label}</span>
      {/* One width class, not two: `min-w-0` alongside `min-w-[14rem]` left the
          winner up to stylesheet order, and a trade name that overflowed its
          rule ran straight into the date on the other side of the row. */}
      <span
        className={`border-b border-dotted border-neutral-400 truncate ${wide ? "basis-56" : "basis-24"} ${className}`}
      >
        {value}
      </span>
    </div>
  );
}

/** A totals line that keeps the table's ruling, spanning the item columns. */
function SummaryRow({
  design,
  label,
  value,
  strong = false,
}: {
  design: InvoiceDesign;
  label: string;
  value: string;
  strong?: boolean;
}) {
  const border = "border border-neutral-300";
  const pad = ROW_PAD[design.density];
  const span = (design.showLineNumbers ? 1 : 0) + (design.showUnitRate ? 1 : 0) + 2; // qty + particulars
  return (
    <tr>
      <td
        colSpan={span}
        className={`${border} ${pad} text-right ${strong ? "font-bold" : "font-medium"}`}
      >
        {label}
      </td>
      <td
        className={`${border} ${pad} text-right tabular-nums ${strong ? "font-bold text-[1.05em]" : ""}`}
      >
        {value}
      </td>
    </tr>
  );
}
