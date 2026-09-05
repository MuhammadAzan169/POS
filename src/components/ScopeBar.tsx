import { useStore, shopKind } from "@/lib/store";
import { RANGE_PRESETS, useScope, delta } from "@/lib/scope";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

/**
 * The period + shop picker that sits at the top of every reporting screen.
 *
 * One control, one shared answer: whatever is chosen here is what Dashboard,
 * Reports and Sales all count, so the figures on those pages are always for the
 * same period.
 */
export function ScopeBar({ showShop = true }: { showShop?: boolean }) {
  const { user, shops } = useStore();
  const { rangeKey, range, setPreset, setCustom, shopScope, setShopScope } = useScope();
  const isAdmin = user?.role === "admin";

  return (
    <Card data-print="hide" className="p-3 sm:p-4 mb-4 space-y-3">
      {/* Presets scroll on a phone rather than wrapping into three ragged lines. */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-3 px-3 sm:mx-0 sm:px-0 sm:flex-wrap sm:overflow-visible">
        {RANGE_PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPreset(p.key)}
            className={cn(
              // h-9 on phones: these were 30px tall, under every tap-target
              // guideline, on the control a shopkeeper reaches for most.
              "shrink-0 text-xs px-3 h-9 sm:h-8 inline-flex items-center rounded-full border transition-colors",
              rangeKey === p.key
                ? "bg-primary text-primary-foreground border-primary"
                : "hover:bg-muted",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
        <div className="space-y-1.5">
          <Label className="text-xs">From</Label>
          <Input
            type="date"
            value={range.from}
            onChange={(e) => e.target.value && setCustom({ from: e.target.value, to: range.to })}
            className="w-full sm:w-40"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">To</Label>
          <Input
            type="date"
            value={range.to}
            onChange={(e) => e.target.value && setCustom({ from: range.from, to: e.target.value })}
            className="w-full sm:w-40"
          />
        </div>

        {/* Only owners have more than one shop to choose between. */}
        {showShop && isAdmin && (
          <div className="space-y-1.5 col-span-2 sm:col-auto">
            <Label className="text-xs">Shop</Label>
            <Select value={shopScope} onValueChange={setShopScope}>
              <SelectTrigger className="w-full sm:w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All shops</SelectItem>
                {shops.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                    {shopKind(s) === "wholesale" ? " (wholesale)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </Card>
  );
}

/**
 * "↑ 12% vs previous 7 days" under a figure.
 *
 * Renders nothing when there's no baseline to compare against — "+100% vs zero"
 * is noise dressed up as insight.
 */
export function DeltaBadge({
  current,
  prior,
  label,
}: {
  current: number;
  prior: number;
  label?: string;
}) {
  const d = delta(current, prior);
  if (!d) return null;

  const Icon = d.flat ? Minus : d.up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-medium",
        d.flat ? "text-muted-foreground" : d.up ? "text-success-strong" : "text-destructive",
      )}
    >
      <Icon className="h-3 w-3" />
      {Math.abs(d.pct)}%
      {label && <span className="text-muted-foreground font-normal ml-1">{label}</span>}
    </span>
  );
}
