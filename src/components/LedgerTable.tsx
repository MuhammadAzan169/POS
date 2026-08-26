import { useStore, formatRs, type LedgerEntry } from "@/lib/store";

/**
 * A running statement, oldest first.
 *
 * Shared by the customer sheet, the supplier sheet and the Ledgers page so all
 * three read identically — the whole value of a statement is that it looks the
 * same every time, and someone can point at a line and say "that one".
 *
 * `debitLabel` / `creditLabel` change per side: on a customer statement the
 * columns are "Taken" and "Paid", on a supplier statement "Billed" and "Paid".
 * The arithmetic is the same either way.
 */
export function LedgerTable({
  entries,
  debitLabel,
  creditLabel,
  balanceLabel,
  empty,
}: {
  entries: LedgerEntry[];
  debitLabel: string;
  creditLabel: string;
  balanceLabel: string;
  empty: string;
}) {
  const { settings } = useStore();
  const money = (n: number) => formatRs(n, settings.currency);

  if (entries.length === 0) {
    return <p className="py-4 text-sm text-muted-foreground">{empty}</p>;
  }

  return (
    <div className="rounded-lg border overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Date</th>
            <th className="px-3 py-2 text-left font-medium">Document</th>
            <th className="px-3 py-2 text-right font-medium">{debitLabel}</th>
            <th className="px-3 py-2 text-right font-medium">{creditLabel}</th>
            <th className="px-3 py-2 text-right font-medium">{balanceLabel}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={`${e.kind}-${e.id}`} className="border-t">
              <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{e.date}</td>
              <td className="px-3 py-2">
                <div className="font-mono text-xs">{e.ref}</div>
                {e.note && <div className="text-xs text-muted-foreground">{e.note}</div>}
              </td>
              <td className="px-3 py-2 text-right">{e.debit > 0 ? money(e.debit) : ""}</td>
              <td className="px-3 py-2 text-right text-success-strong">
                {e.credit > 0 ? money(e.credit) : ""}
              </td>
              <td className="px-3 py-2 text-right font-medium">{money(e.balance)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t bg-muted/30">
            <td className="px-3 py-2 font-medium" colSpan={4}>
              {balanceLabel} now
            </td>
            <td className="px-3 py-2 text-right font-semibold">
              {money(entries[entries.length - 1].balance)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
