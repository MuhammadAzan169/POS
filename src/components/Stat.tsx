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
  };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border", map[status] ?? "bg-muted text-muted-foreground border-border")}>
      {status}
    </span>
  );
}