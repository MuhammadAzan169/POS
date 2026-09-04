/**
 * How a bill's numbers, dates and account lines are written.
 *
 * Pure functions over plain data, kept out of `Invoice.tsx` so both renderers —
 * the React bill on screen and the jsPDF one that downloads — can import them
 * without either pulling in the other. A figure formatted in two places is a
 * figure that eventually disagrees with itself, and on a bill that is the
 * customer's copy against yours.
 */
import type { InvoiceData } from "@/components/Invoice";

/**
 * Every figure on a bill, formatted one way.
 *
 * Exported because the PDF renderer needs the identical output — the two were
 * each calling `toLocaleString` with their own arguments, which is exactly how
 * a printed copy and a downloaded one start disagreeing about a total.
 *
 * The grouping is fixed rather than taken from the visitor's browser on
 * purpose: a bill is a document about one shop's money, and the same bill
 * opened in another country must not regroup its digits.
 */
export const billNumber = (n: number) =>
  Math.round(n).toLocaleString("en-PK", { maximumFractionDigits: 0 });

/** Day-first, as every bill book in the region is written. */
export const billDate = (at: Date) =>
  at.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });

/**
 * The currency as a word, for the amount written out in full.
 *
 * Rupees are what this is for, but the currency is a Settings field, so a shop
 * running in anything else must not have a bill that says "rupees" underneath a
 * total in dirhams.
 */
function currencyWord(currency: string) {
  return /^(rs\.?|pkr|inr|₨|₹)$/i.test(currency.trim()) ? "rupees" : currency.trim();
}

/**
 * The account block, as rows.
 *
 * Shared with the PDF renderer so the two documents can never disagree about a
 * customer's balance — which is the one number on a bill worth arguing over.
 */
export function accountRows(
  data: InvoiceData,
): { label: string; value: string; strong?: boolean }[] {
  const a = data.account;
  if (!a) return [];
  const n = (v: number) => billNumber(Math.abs(v));
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

const ONES = [
  "",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/**
 * Rupees in words on the South Asian scale — lakh and crore, not million.
 * A bill that says "one hundred twenty thousand" to a Lahore trader is a bill
 * that gets read twice.
 */
export function amountInWords(n: number, currency = "Rs"): string {
  const unit = currencyWord(currency);
  const value = Math.max(0, Math.round(n));
  if (value === 0) return `Zero ${unit} only`;

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
  return `${words.charAt(0).toUpperCase()}${words.slice(1)} ${unit} only`;
}
