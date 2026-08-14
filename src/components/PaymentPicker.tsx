import { SETTLED_METHODS, type PaymentMethod } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * The payment buttons, shared by checkout and the sale editor.
 *
 * Both screens had their own copy, so adding a method meant changing the same
 * markup twice — exactly the kind of drift that leaves one screen behind.
 *
 * "Credit" is offered separately and only when it is actually allowed: it needs
 * a named customer to owe the money, so it stays hidden for a walk-in rather
 * than appearing as a button that silently fails.
 */
export function PaymentPicker({
  value,
  onChange,
  allowCredit = false,
  creditDisabledReason,
}: {
  value: PaymentMethod;
  onChange: (p: PaymentMethod) => void;
  /** Show the Credit option at all (i.e. a saved customer is selected). */
  allowCredit?: boolean;
  /** When set, Credit is shown but blocked, and this explains why. */
  creditDisabledReason?: string;
}) {
  const blocked = Boolean(creditDisabledReason);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {SETTLED_METHODS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={cn(
              "py-2 rounded-md border text-sm transition-colors",
              value === p ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted",
            )}
          >
            {p}
          </button>
        ))}
      </div>

      {allowCredit && (
        <>
          <button
            type="button"
            disabled={blocked}
            onClick={() => onChange("Credit")}
            title={creditDisabledReason}
            className={cn(
              "w-full py-2 rounded-md border text-sm transition-colors",
              value === "Credit"
                ? "bg-warning text-warning-foreground border-warning"
                : "hover:bg-muted",
              blocked && "opacity-50 cursor-not-allowed hover:bg-transparent",
            )}
          >
            Credit — pay later
          </button>
          {creditDisabledReason && (
            <p className="text-xs text-destructive">{creditDisabledReason}</p>
          )}
        </>
      )}
    </div>
  );
}
