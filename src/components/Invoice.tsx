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
  WALK_IN,
  type InvoiceDesign,
  type PaymentMethod,
  type Sale,
  type Settings,
} from "@/lib/store";

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

/** Minimum ruled rows in the table, so a three-line bill still reads as a bill. */
const MIN_ROWS = 8;

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

  // A hand-written book has ruled rows whether or not there is anything to
  // write on them; without the padding a short bill floats in white space.
  const blanks = d.ruledRows ? Math.max(0, MIN_ROWS - data.lines.length) : 0;

  const cellBorder = "border border-foreground/25";
  const headCell = `${cellBorder} px-2 py-1.5 font-semibold ${ink ? "bg-foreground text-background" : "bg-muted"}`;

  return (
    <div
      className={`${SIZES[d.fontSize]} ${PAPER[d.paperSize]} mx-auto bg-card text-foreground border rounded-lg p-5 sm:p-7 print:border-0 print:rounded-none ${className}`}
    >
      {/* A returned sale keeps its bill — the goods came back and the paperwork
          has to say so, or the copy in the buyer's file still reads as a debt. */}
      {data.status === "Returned" && (
        <div className="mb-3 text-center border border-destructive text-destructive rounded-md py-1 text-[0.9em] font-bold tracking-[0.15em]">
          RETURNED — CANCELLED
        </div>
      )}

      {/* ------------------------------------------------------------ header */}
      {d.showBillTag && (
        <div className="flex justify-center mb-2">
          <span
            className={`text-[0.75em] tracking-[0.2em] font-semibold px-4 py-1 rounded-full ${ink ? "bg-foreground text-background" : "border"}`}
          >
            INVOICE / BILL
          </span>
        </div>
      )}

      <div className="text-center">
        {d.showBusinessName && (
          <div className="font-display text-[2.1em] font-bold leading-tight tracking-tight">
            {settings.businessName}
          </div>
        )}
        {/* Which outlet the goods actually left from. On a multi-shop business
            this is the difference between a bill you can trace and one you
            can't, so it is set in the same ink as the business name. */}
        {d.showShopName && data.shopName && (
          <div className="text-[1em] font-semibold">{data.shopName}</div>
        )}
        <div className="text-[0.85em] text-muted-foreground">
          {[d.showAddress && settings.address, d.showPhone && settings.phone]
            .filter(Boolean)
            .join("  ·  ")}
        </div>
        {d.showTaxNumber && settings.taxNumber && (
          <div className="text-[0.85em] text-muted-foreground">NTN: {settings.taxNumber}</div>
        )}
      </div>

      {/* ----------------------------------------------- who, and which bill */}
      <div className="mt-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="space-y-1 min-w-0 max-w-[60%]">
          {d.showInvoiceNo && (
            <Written label="S.No." value={data.invoice} className="font-semibold" />
          )}
          {d.showCustomer && (
            <Written
              label="M/s"
              value={data.customer?.trim() || WALK_IN}
              className="font-semibold"
              wide
            />
          )}
          {d.showCustomerPhone && data.customerPhone && (
            <Written label="Phone" value={data.customerPhone} />
          )}
        </div>
        <div className="space-y-1 text-right shrink-0">
          {d.showDate && (
            <Written
              label="Date"
              value={data.at.toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              })}
            />
          )}
          {d.showCashier && <Written label="By" value={data.cashier} />}
        </div>
      </div>

      {settings.invoiceNote && (
        <p className="mt-3 text-[0.85em] text-muted-foreground">{settings.invoiceNote}</p>
      )}

      {/* ------------------------------------------------------- items table */}
      <table className="w-full table-fixed mt-4 border-collapse tabular-nums">
        <thead>
          <tr className="text-center">
            {d.showLineNumbers && <th className={`${headCell} w-10`}>#</th>}
            <th className={`${headCell} w-16`}>Qty</th>
            <th className={headCell}>Particulars</th>
            {d.showUnitRate && <th className={`${headCell} w-24`}>Rate</th>}
            <th className={`${headCell} w-28`}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {data.lines.map((l, i) => (
            <tr key={i}>
              {d.showLineNumbers && (
                <td className={`${cellBorder} px-2 py-1.5 text-center text-muted-foreground`}>
                  {i + 1}
                </td>
              )}
              <td className={`${cellBorder} px-2 py-1.5 text-center`}>
                {String(l.qty).padStart(2, "0")}
              </td>
              <td className={`${cellBorder} px-2 py-1.5 break-words`}>{l.name}</td>
              {d.showUnitRate && (
                <td className={`${cellBorder} px-2 py-1.5 text-right`}>
                  {l.rate.toLocaleString("en-PK")}
                </td>
              )}
              <td className={`${cellBorder} px-2 py-1.5 text-right font-medium`}>
                {(l.qty * l.rate).toLocaleString("en-PK")}
              </td>
            </tr>
          ))}
          {Array.from({ length: blanks }).map((_, i) => (
            <tr key={`blank-${i}`}>
              {d.showLineNumbers && <td className={`${cellBorder} px-2 py-1.5`}>&nbsp;</td>}
              <td className={`${cellBorder} px-2 py-1.5`}>&nbsp;</td>
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
              <SummaryRow
                design={d}
                label="Total"
                value={data.subtotal.toLocaleString("en-PK")}
              />
              <SummaryRow
                design={d}
                label="Less discount"
                value={`− ${data.discount.toLocaleString("en-PK")}`}
              />
            </>
          )}
          <SummaryRow
            design={d}
            label={data.discount > 0 ? "Net total" : "Total"}
            value={data.total.toLocaleString("en-PK")}
            strong
          />

          {d.showAccountBlock &&
            data.account &&
            accountRows(data).map((r) => (
              <SummaryRow key={r.label} design={d} label={r.label} value={r.value} strong={r.strong} />
            ))}
        </tbody>
      </table>

      {/* The one figure read aloud on the phone, spelled out in words as well —
          "one lakh twenty" and "120,000" disagreeing is how bills get disputed. */}
      <div className="mt-2 text-[0.85em] text-muted-foreground">
        Amount in words: <span className="text-foreground">{amountInWords(data.account?.closingBalance ?? data.total)}</span>
      </div>

      <div className="mt-5 flex items-end justify-between gap-6">
        <div className="text-[0.85em] text-muted-foreground max-w-[60%]">
          {d.showTerms && settings.invoiceTerms}
        </div>
        {d.showSignature && (
          <div className="text-center shrink-0">
            <div className="w-40 border-b border-foreground/40 h-8" />
            <div className="text-[0.8em] text-muted-foreground mt-1">Authorised signature</div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The account block, as rows.
 *
 * Shared with the PDF renderer so the two documents can never disagree about a
 * customer's balance — which is the one number on a bill worth arguing over.
 */
export function accountRows(data: InvoiceData): { label: string; value: string; strong?: boolean }[] {
  const a = data.account;
  if (!a) return [];
  const n = (v: number) => Math.abs(v).toLocaleString("en-PK");
  const rows: { label: string; value: string; strong?: boolean }[] = [];

  rows.push({ label: "Previous balance", value: n(a.previousBalance) });

  if (a.onAccount > 0) {
    rows.push({ label: "Balance", value: n(a.previousBalance + a.onAccount) });
  } else if (data.status !== "Returned" && data.payment && data.payment !== "Credit") {
    // Paid at the counter, so this bill never joined the account. Saying so is
    // the difference between a settled delivery and one the buyer thinks is
    // still outstanding because the balance below did not move.
    rows.push({ label: `Paid by ${data.payment.toLowerCase()}`, value: n(data.total) });
  }

  if (a.received > 0) rows.push({ label: "Received", value: `− ${n(a.received)}` });

  rows.push({
    // A negative balance is money of theirs you are holding, not a debt.
    label: a.closingBalance < 0 ? "Advance in hand" : "Closing balance",
    value: n(a.closingBalance),
    strong: true,
  });
  return rows;
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
      <span className="text-muted-foreground shrink-0">{label}</span>
      {/* One width class, not two: `min-w-0` alongside `min-w-[14rem]` left the
          winner up to stylesheet order, and a trade name that overflowed its
          rule ran straight into the date on the other side of the row. */}
      <span
        className={`border-b border-dotted border-foreground/40 truncate ${wide ? "basis-56" : "basis-24"} ${className}`}
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
  const border = "border border-foreground/25";
  const span =
    (design.showLineNumbers ? 1 : 0) + (design.showUnitRate ? 1 : 0) + 2; // qty + particulars
  return (
    <tr>
      <td
        colSpan={span}
        className={`${border} px-2 py-1.5 text-right ${strong ? "font-bold" : "font-medium"}`}
      >
        {label}
      </td>
      <td
        className={`${border} px-2 py-1.5 text-right tabular-nums ${strong ? "font-bold text-[1.05em]" : ""}`}
      >
        {value}
      </td>
    </tr>
  );
}

const ONES = [
  "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen",
  "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/**
 * Rupees in words on the South Asian scale — lakh and crore, not million.
 * A bill that says "one hundred twenty thousand" to a Lahore trader is a bill
 * that gets read twice.
 */
export function amountInWords(n: number): string {
  const value = Math.max(0, Math.round(n));
  if (value === 0) return "Zero rupees only";

  const under1000 = (x: number): string => {
    if (x === 0) return "";
    if (x < 20) return ONES[x];
    if (x < 100) return `${TENS[Math.floor(x / 10)]}${x % 10 ? `-${ONES[x % 10]}` : ""}`;
    return `${ONES[Math.floor(x / 100)]} hundred${x % 100 ? ` ${under1000(x % 100)}` : ""}`;
  };

  const parts: string[] = [];
  const units: [number, string][] = [
    [10000000, "crore"],
    [100000, "lakh"],
    [1000, "thousand"],
  ];
  let rest = value;
  for (const [size, name] of units) {
    const count = Math.floor(rest / size);
    if (count > 0) {
      parts.push(`${under1000(count)} ${name}`);
      rest %= size;
    }
  }
  if (rest > 0) parts.push(under1000(rest));

  const words = parts.join(" ");
  return `${words.charAt(0).toUpperCase()}${words.slice(1)} rupees only`;
}
