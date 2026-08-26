import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function StatCard({
  label,
  value,
  sub,
  icon,
  tone = "default",
}: {
  label: string;
  value: string;
  /** ReactNode, not string, so a card can carry a "vs previous period" badge. */
  sub?: ReactNode;
  icon?: ReactNode;
  tone?: "default" | "success" | "warning" | "accent" | "primary";
}) {
  const toneStyles: Record<string, string> = {
    default: "bg-muted/60 text-foreground",
    success: "bg-success/15 text-success-strong",
    warning: "bg-warning/20 text-warning-strong",
    accent: "bg-accent/20 text-accent-strong",
    primary: "bg-primary/10 text-primary",
  };
  return (
    // Two of these sit side by side on a phone, so the padding, the figure and
    // the icon all step down a size below sm; min-w-0 + break-words stop a long
    // amount ("Rs 1,234,567") from forcing the card wider than its grid column.
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <div className="min-w-0">
          <div className="text-[11px] sm:text-xs uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
          <div className="font-display text-xl sm:text-2xl md:text-3xl font-bold mt-1.5 sm:mt-2 break-words">{value}</div>
          {sub && <div className="text-xs text-muted-foreground mt-1.5">{sub}</div>}
        </div>
        {icon && (
          <div className={cn("h-9 w-9 sm:h-10 sm:w-10 rounded-lg flex items-center justify-center shrink-0", toneStyles[tone])}>
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    Completed: "bg-success/15 text-success-strong border-success/30",
    Returned: "bg-destructive/10 text-destructive border-destructive/30",
    Partial: "bg-warning/20 text-warning-strong border-warning/40",
    OK: "bg-success/15 text-success-strong border-success/30",
    LOW: "bg-warning/20 text-warning-strong border-warning/40",
    OUT: "bg-destructive/10 text-destructive border-destructive/30",
    Synced: "bg-success/15 text-success-strong border-success/30",
    Pending: "bg-warning/20 text-warning-strong border-warning/40",
    Active: "bg-success/15 text-success-strong border-success/30",
    Disabled: "bg-muted text-muted-foreground border-border",
    Trade: "bg-accent/15 text-accent-strong border-accent/30",
    Retail: "bg-muted text-muted-foreground border-border",
    // Payment methods. Credit is the only one that means money is still owed,
    // so it's the only one tinted — the rest are settled and unremarkable.
    Credit: "bg-warning/20 text-warning-strong border-warning/40",
    Cash: "bg-muted text-muted-foreground border-border",
    Card: "bg-muted text-muted-foreground border-border",
    Online: "bg-muted text-muted-foreground border-border",
    // Where a supplier bill stands. Same three-step scale as stock levels, so
    // the colours mean the same thing wherever they appear.
    Paid: "bg-success/15 text-success-strong border-success/30",
    "Part paid": "bg-warning/20 text-warning-strong border-warning/40",
    Unpaid: "bg-destructive/10 text-destructive border-destructive/30",
    Overdue: "bg-destructive/10 text-destructive border-destructive/30",
    // Which way a party balance points. "Advance" is money you are holding for
    // someone, which is a liability, not a win — hence the neutral tint.
    Owes: "bg-warning/20 text-warning-strong border-warning/40",
    "You owe": "bg-destructive/10 text-destructive border-destructive/30",
    Advance: "bg-accent/15 text-accent-strong border-accent/30",
    Settled: "bg-success/15 text-success-strong border-success/30",
    // A balance moved by hand. Writing debt off is the safe direction, so it is
    // tinted like a settlement; adding to one is the direction worth noticing.
    "Written off": "bg-success/15 text-success-strong border-success/30",
    Increased: "bg-warning/20 text-warning-strong border-warning/40",
    // The activity log. A deletion is the thing worth noticing; a record that
    // has been put back is resolved and reads as such.
    Deleted: "bg-destructive/10 text-destructive border-destructive/30",
    "Put back": "bg-success/15 text-success-strong border-success/30",
    "By shop": "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border", map[status] ?? "bg-muted text-muted-foreground border-border")}>
      {status}
    </span>
  );
}