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
  sub?: string;
  icon?: ReactNode;
  tone?: "default" | "success" | "warning" | "accent" | "primary";
}) {
  const toneStyles: Record<string, string> = {
    default: "bg-muted/60 text-foreground",
    success: "bg-success/15 text-success",
    warning: "bg-warning/20 text-warning-foreground",
    accent: "bg-accent/20 text-accent-foreground",
    primary: "bg-primary/10 text-primary",
  };
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
          <div className="font-display text-2xl md:text-3xl font-bold mt-2">{value}</div>
          {sub && <div className="text-xs text-muted-foreground mt-1.5">{sub}</div>}
        </div>
        {icon && (
          <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center shrink-0", toneStyles[tone])}>
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    Completed: "bg-success/15 text-success border-success/30",
    Returned: "bg-destructive/10 text-destructive border-destructive/30",
    Partial: "bg-warning/20 text-warning-foreground border-warning/40",
    OK: "bg-success/15 text-success border-success/30",
    LOW: "bg-warning/20 text-warning-foreground border-warning/40",
    OUT: "bg-destructive/10 text-destructive border-destructive/30",
    Synced: "bg-success/15 text-success border-success/30",
    Pending: "bg-warning/20 text-warning-foreground border-warning/40",
    Active: "bg-success/15 text-success border-success/30",
    Disabled: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border", map[status] ?? "bg-muted text-muted-foreground border-border")}>
      {status}
    </span>
  );
}