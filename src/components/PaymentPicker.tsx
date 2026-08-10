import type { Sale } from "@/lib/store";

const PAYMENT_METHODS = ["Cash", "Card", "Online"] as const;

/**
 * The three payment buttons, shared by checkout and the sale editor.
 *
 * Both screens had their own copy, so adding "Online" meant changing the same
 * markup twice — exactly the kind of drift that leaves one screen behind.
 */
export function PaymentPicker({
  value,
  onChange,
}: {
  value: Sale["payment"];
  onChange: (p: Sale["payment"]) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {PAYMENT_METHODS.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={`py-2 rounded-md border text-sm transition-colors ${
            value === p ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
          }`}
        >
          {p}
        </button>
      ))}
    </div>
  );
}
