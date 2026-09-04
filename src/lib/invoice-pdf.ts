/**
 * The bill as an actual PDF file.
 *
 * Drawn directly with jsPDF's text and line primitives rather than screenshotted
 * from the DOM. Two reasons, both of which were the ask:
 *
 *  1. Pressing Download downloads. No print dialog to steer, no preview window
 *     to dismiss — the file lands in the downloads folder.
 *  2. Nothing overlaps and no blank page comes out the back. Every string is
 *     measured and wrapped against the column it sits in, every row knows its
 *     own height, and a page break can only happen where a row would not fit —
 *     so the last page ends with the signature rather than being followed by an
 *     empty one, which is what an HTML-to-canvas capture does at the slightest
 *     overhang.
 *
 * The trade-off is that this layout and the on-screen `<Invoice>` are two
 * implementations of one design. They are kept honest by both reading the same
 * `InvoiceDesign` toggles and the same `InvoiceData` — if a block is switched
 * off in Settings it disappears from both.
 */
import type { InvoiceData } from "@/components/Invoice";
import { accountRows, amountInWords, billDate, billNumber } from "./bill-format";
import { INVOICE_ACCENTS, type Settings } from "./store-types";
import { invoiceFileName } from "./invoice";

/** mm. A4 and A5 portrait, with the same generous margin a bill book leaves. */
const PAGE = { A4: { w: 210, h: 297 }, A5: { w: 148, h: 210 } };
const MARGIN = 14;

const BASE_SIZE = { sm: 9, md: 10, lg: 11 } as const;

// The same formatter the on-screen bill uses, so the printed and the downloaded
// copy of one sale can never show a total differently.
const num = billNumber;

/**
 * jsPDF's built-in fonts are WinAnsi, and the characters this app's own product
 * names lean on hardest are exactly the ones it drops silently — an em dash in
 * "Cotton Kurti — Medium" came out as a gap, not as a missing-glyph box, so it
 * would have shipped unnoticed. Folded to their ASCII equivalents instead.
 */
function ascii(value: string) {
  return (
    String(value)
      // U+2212 is the real minus sign the account rows are written with, and
      // it is NOT in the dash block beside it - left out, jsPDF fell back to a
      // multi-byte encoding and printed "- 32,000" as spaced-out gibberish.
      .replace(/[\u2012-\u2015\u2212\uFF0D]/g, "-")
      .replace(/[\u2018\u2019\u201B]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/\u2026/g, "...")
      // Non-breaking and thin spaces: written as escapes because a literal
      // one in the source is indistinguishable from an ordinary space.
      .replace(/[\u00A0\u2007\u202F]/g, " ")
      .replace(/[\u2022\u00B7]/g, "-")
  );
}

export async function downloadInvoicePdf(data: InvoiceData, settings: Settings) {
  // Loaded on demand: the till and every other screen should not carry a PDF
  // engine in their bundle for a button most sales never press.
  const { jsPDF } = await import("jspdf");

  const d = settings.invoice;
  const page = PAGE[d.paperSize];
  const doc = new jsPDF({ unit: "mm", format: [page.w, page.h], orientation: "portrait" });

  // Folded once, at the door, rather than at fifteen call sites — every string
  // that reaches the page goes through `text` or `splitTextToSize`.
  const drawText = doc.text.bind(doc);
  doc.text = ((value: string | string[], x: number, ty: number, options?: object) =>
    drawText(
      Array.isArray(value) ? value.map(ascii) : ascii(value),
      x,
      ty,
      options,
    )) as typeof doc.text;
  const splitText = doc.splitTextToSize.bind(doc);
  doc.splitTextToSize = ((value: string, size: number, options?: object) =>
    splitText(ascii(value), size, options)) as typeof doc.splitTextToSize;

  const accent = INVOICE_ACCENTS[d.accentColor] ?? INVOICE_ACCENTS.navy;

  const base = BASE_SIZE[d.fontSize];
  const left = MARGIN;
  const right = page.w - MARGIN;
  const width = right - left;
  /** Space kept at the foot of every page for the words/terms/signature block. */
  const FOOTER_RESERVE = 42;

  let y = MARGIN;

  const text = (
    s: string,
    x: number,
    opts: {
      size?: number;
      bold?: boolean;
      align?: "left" | "center" | "right";
      grey?: boolean;
    } = {},
  ) => {
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(opts.size ?? base);
    doc.setTextColor(opts.grey ? 110 : 20);
    doc.text(s, x, y, { align: opts.align ?? "left" });
  };

  /* ------------------------------------------------------------- the header */

  if (d.showCopyLabel && settings.invoiceCopyLabel) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(base - 2);
    doc.setTextColor(110);
    doc.setDrawColor(160);
    const label = settings.invoiceCopyLabel;
    const w = doc.getTextWidth(label) + 6;
    doc.rect(right - w, y - 1, w, 5.5);
    doc.text(label, right - w / 2, y + 2.8, { align: "center" });
    y += 8;
  }

  if (data.status === "Returned") {
    doc.setDrawColor(190, 30, 45);
    doc.setTextColor(190, 30, 45);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(base);
    doc.rect(left, y - 1, width, 7);
    doc.text("RETURNED - CANCELLED", page.w / 2, y + 3.8, { align: "center" });
    y += 12;
  }

  /*
   * The letterhead: who is sending it down the left, the shop's mark in the
   * right corner, a rule under both, the document's name centred beneath.
   */
  const headTop = y;

  if (d.showBusinessName) {
    // Advance by the type's own height rather than a guessed constant: at 21pt
    // the old figure left a visible hole between the name and the branch.
    const size = base + 6;
    text(settings.businessName, left, { size, bold: true });
    y += size * 0.36 + 1.8;
  }
  if (d.showShopName && data.shopName) {
    text(data.shopName, left, { size: base + 1, bold: true });
    y += 4.8;
  }
  for (const line of [
    d.showAddress && settings.address ? settings.address : "",
    d.showPhone && settings.phone ? `Phone no.: ${settings.phone}` : "",
    d.showTaxNumber && settings.taxNumber ? `NTN No.: ${settings.taxNumber}` : "",
  ].filter(Boolean)) {
    text(line, left, { size: base - 1 });
    y += 4.4;
  }

  if (d.showLogo && settings.invoiceLogo) {
    /*
     * Fitted inside a fixed box rather than placed at its own size: a logo is
     * whatever pixels someone uploaded, and one 2,000px wide would otherwise be
     * drawn two metres across. The aspect ratio is read from the image so a
     * wide mark and a square one are both contained rather than squashed.
     *
     * Wrapped because a corrupt or unsupported data URL throws inside jsPDF,
     * and a bill that cannot be produced at all is far worse than one printed
     * without its logo.
     */
    try {
      const boxW = 34;
      const boxH = 18;
      const props = doc.getImageProperties(settings.invoiceLogo);
      const scale = Math.min(boxW / props.width, boxH / props.height);
      const w = props.width * scale;
      const h = props.height * scale;
      doc.addImage(settings.invoiceLogo, right - w, headTop, w, h, undefined, "FAST");
      y = Math.max(y, headTop + h + 1);
    } catch {
      // Printed without it.
    }
  }

  y += 3;
  doc.setDrawColor(...accent.rgb);
  doc.setLineWidth(0.4);
  doc.line(left, y, right, y);
  doc.setLineWidth(0.2);
  y += 7;

  if (d.showBillTag && settings.invoiceTitle) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(base + 4);
    doc.setTextColor(...accent.rgb);
    doc.text(settings.invoiceTitle, page.w / 2, y, { align: "center" });
    y += 7;
  }

  /* ----------------------------------------------- who the bill is for, when */

  const metaTop = y;
  const field = (label: string, value: string, x: number, align: "left" | "right") => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(base - 0.5);
    doc.setTextColor(110);
    const labelText = `${label}  `;
    if (align === "left") {
      doc.text(labelText, x, y);
      const w = doc.getTextWidth(labelText);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(20);
      // Clipped to its half of the row so a long trade name can never run into
      // the date on the other side.
      doc.text(clip(doc, value, width / 2 - w - 4), x + w, y);
    } else {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(20);
      doc.text(value, x, y, { align: "right" });
      const w = doc.getTextWidth(value);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(110);
      doc.text(labelText, x - w - 2, y, { align: "right" });
    }
    y += 5.5;
  };

  if (d.showInvoiceNo) field("S.No.", data.invoice, left, "left");
  if (d.showCustomer) field("M/s", data.customer, left, "left");
  if (d.showCustomerPhone && data.customerPhone) field("Phone", data.customerPhone, left, "left");

  const metaLeftEnd = y;
  y = metaTop;
  if (d.showDate) field("Date", billDate(data.at), right, "right");
  if (d.showCashier) field("By", data.cashier, right, "right");
  y = Math.max(metaLeftEnd, y) + 2;

  if (settings.invoiceNote) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(base - 1);
    doc.setTextColor(110);
    for (const line of doc.splitTextToSize(settings.invoiceNote, width) as string[]) {
      doc.text(line, left, y);
      y += 4.2;
    }
    y += 1;
  }

  /* ------------------------------------------------------------- the table */

  const cols = columnsFor(d, width, left, settings.currency);
  // Density: compact fits about a third more rows on a sheet, which is what a
  // long wholesale order needs to stay on one page.
  const rowPad = d.density === "compact" ? 1.4 : 2.2;
  const minRow = d.density === "compact" ? 6 : 7.5;
  const lineHeight = base * 0.42 + 1.6;

  const drawHead = () => {
    const h = lineHeight + rowPad * 2;
    if (d.accent === "ink") {
      doc.setFillColor(...accent.rgb);
      doc.rect(left, y, width, h, "F");
      doc.setTextColor(255);
    } else {
      doc.setFillColor(238, 240, 244);
      doc.rect(left, y, width, h, "F");
      doc.setTextColor(20);
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(base - 0.5);
    for (const c of cols) {
      doc.text(c.title, cellAnchor(c), y + h - rowPad - 0.8, { align: c.align });
    }
    doc.setDrawColor(150);
    doc.rect(left, y, width, h);
    for (const c of cols.slice(1)) doc.line(c.x, y, c.x, y + h);
    y += h;
  };

  /** A break can only land between rows, so nothing is ever cut in half. */
  const ensureRoom = (needed: number) => {
    if (y + needed <= page.h - MARGIN - FOOTER_RESERVE) return;
    doc.addPage();
    y = MARGIN;
    drawHead();
  };

  const drawRow = (cells: string[], opts: { bold?: boolean; height?: number } = {}) => {
    const particulars = cols.findIndex((c) => c.key === "name");
    const wrapped =
      particulars >= 0 && cells[particulars]
        ? (doc.splitTextToSize(cells[particulars], cols[particulars].w - 4) as string[])
        : [""];
    const h = opts.height ?? Math.max(lineHeight * wrapped.length + rowPad * 2, minRow);
    ensureRoom(h);

    doc.setDrawColor(150);
    doc.rect(left, y, width, h);
    for (const c of cols.slice(1)) doc.line(c.x, y, c.x, y + h);

    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(base);
    doc.setTextColor(20);
    // One baseline for the whole row. The particulars column used to compute its
    // own, which put a product name a millimetre above the figures beside it —
    // invisible on screen, obvious on paper.
    const baseline = y + rowPad + lineHeight * 0.75 + 0.4;
    cols.forEach((c, i) => {
      const value = cells[i] ?? "";
      if (!value) return;
      if (i === particulars) {
        wrapped.forEach((l, n) => doc.text(l, c.x + 2, baseline + lineHeight * n));
      } else {
        doc.text(value, cellAnchor(c), baseline, { align: c.align });
      }
    });
    y += h;
  };

  drawHead();

  data.lines.forEach((l, i) => {
    drawRow(
      cols.map((c) => {
        switch (c.key) {
          case "n":
            return String(i + 1);
          case "qty":
            return String(l.qty).padStart(2, "0");
          case "name":
            return l.name;
          case "rate":
            return num(l.rate);
          case "amount":
            return num(l.qty * l.rate);
        }
      }),
    );
  });

  if (d.ruledRows) {
    // Padded to a full-looking page, but never onto a page of their own: blank
    // rows are decoration, and a second sheet of them is the "extra page" that
    // makes a bill look broken.
    const blanks = Math.max(0, d.ruledRowCount - data.lines.length);
    for (let i = 0; i < blanks; i++) {
      if (y + minRow > page.h - MARGIN - FOOTER_RESERVE) break;
      drawRow(
        cols.map(() => ""),
        { height: minRow },
      );
    }
  }

  /* --------------------------------------------------------- what is owed */

  const summary = (label: string, value: string, strong = false) => {
    const h = minRow;
    ensureRoom(h);
    const amount = cols[cols.length - 1];
    doc.setDrawColor(150);
    doc.rect(left, y, width, h);
    doc.line(amount.x, y, amount.x, y + h);
    doc.setFont("helvetica", strong ? "bold" : "normal");
    doc.setFontSize(strong ? base + 0.5 : base);
    doc.setTextColor(20);
    doc.text(label, amount.x - 3, y + h - 2.3, { align: "right" });
    doc.text(value, right - 2, y + h - 2.3, { align: "right" });
    y += h;
  };

  if (data.discount > 0) {
    summary("Total", num(data.subtotal));
    summary("Less discount", `- ${num(data.discount)}`);
  }
  summary(data.discount > 0 ? "Net total" : "Total", num(data.total), true);

  if (d.showAccountBlock && data.account) {
    // Built by the same function the on-screen bill uses, so a figure can never
    // differ between what was previewed and what was sent.
    for (const row of accountRows(data)) summary(row.label, row.value, row.strong);
  }

  /* ------------------------------------------------- words, terms, signature */

  y += 5;
  if (d.showAmountInWords) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(base - 1);
    doc.setTextColor(80);
    for (const line of doc.splitTextToSize(
      `Amount in words: ${amountInWords(Math.abs(data.account?.closingBalance ?? data.total), settings.currency)}`,
      width,
    ) as string[]) {
      doc.text(line, left, y);
      y += 4.4;
    }
  }

  y += 6;
  const blockTop = y;
  if (d.showTerms && settings.invoiceTerms) {
    doc.setFontSize(base - 1.5);
    doc.setTextColor(110);
    // Held to 55% of the width so it can never reach the signature rule.
    for (const line of doc.splitTextToSize(settings.invoiceTerms, width * 0.55) as string[]) {
      doc.text(line, left, y);
      y += 4;
    }
  }
  if (d.showSignature) {
    const sigY = Math.max(blockTop + 10, y - 2);
    doc.setDrawColor(120);
    doc.line(right - 50, sigY, right, sigY);
    doc.setFontSize(base - 1.5);
    doc.setTextColor(110);
    doc.text(settings.invoiceSignatory, right - 25, sigY + 4.5, { align: "center" });
    y = Math.max(y, sigY + 6);
  }

  doc.save(`${invoiceFileName(data)}.pdf`);
}

type Col = {
  key: "n" | "qty" | "name" | "rate" | "amount";
  title: string;
  x: number;
  w: number;
  align: "left" | "center" | "right";
};

/** Column widths, resolved once so every row and rule agrees on them. */
function columnsFor(d: Settings["invoice"], width: number, left: number, currency: string): Col[] {
  const fixed: Omit<Col, "x">[] = [];
  if (d.showLineNumbers) fixed.push({ key: "n", title: "#", w: 9, align: "center" });
  fixed.push({ key: "qty", title: "Qty", w: 15, align: "center" });
  fixed.push({ key: "name", title: "Particulars", w: 0, align: "left" });
  if (d.showUnitRate) fixed.push({ key: "rate", title: "Rate", w: 24, align: "right" });
  fixed.push({ key: "amount", title: `Amount (${currency})`, w: 30, align: "right" });

  // Particulars takes whatever the fixed columns leave, so the grid always adds
  // up to the page width exactly — no sliver of unruled paper on the right.
  const used = fixed.reduce((a, c) => a + c.w, 0);
  const flexible = fixed.find((c) => c.key === "name");
  if (flexible) flexible.w = width - used;

  let x = left;
  return fixed.map((c) => {
    const col = { ...c, x } as Col;
    x += c.w;
    return col;
  });
}

const cellAnchor = (c: Col) =>
  c.align === "left" ? c.x + 2 : c.align === "right" ? c.x + c.w - 2 : c.x + c.w / 2;

/** Trims a value to the space it has, so two fields can never print on top of each other. */
function clip(doc: { getTextWidth: (s: string) => number }, value: string, max: number) {
  if (doc.getTextWidth(value) <= max) return value;
  let out = value;
  while (out.length > 1 && doc.getTextWidth(`${out}…`) > max) out = out.slice(0, -1);
  return `${out}…`;
}
