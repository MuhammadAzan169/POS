import { customerNameOf, isWalkIn, WALK_IN, type Sale } from "@/lib/store";
import { UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Who a sale was made to, drawn the same way on every screen.
 *
 * A retail till takes most of its money from people who never give a name, so
 * an unnamed sale is the ordinary case rather than an incomplete record. Left
 * as a bare string it rendered as either an empty cell or the word "Walk-in"
 * sitting in the same weight as a real name, which reads as a customer actually
 * called that. Here it is set in muted text behind a person icon: present,
 * clearly deliberate, and never mistaken for a name the cashier forgot to fill
 * in.
 */
export function CustomerName({
  sale,
  className,
}: {
  sale: Pick<Sale, "customer" | "customerId">;
  className?: string;
}) {
  if (!isWalkIn(sale)) return <span className={className}>{customerNameOf(sale)}</span>;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-muted-foreground", className)}>
      <UserRound className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {WALK_IN}
    </span>
  );
}
