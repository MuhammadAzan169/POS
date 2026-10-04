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
      {/*
       * Six presets, laid out two rows of three on a phone.
       *
       * They used to scroll sideways, which hid whichever ones ran past the
       * edge — and since "Last 30 days" is the default, the chip showing the
       * CURRENT selection was the one clipped in half. A fixed set this small
       * should simply all be visible; a grid also makes every chip the same
       * comfortable width instead of sizing each to its own label.
       */}
      <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
        {RANGE_PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPreset(p.key)}
            className={cn(
              // h-10 on phones: these were 30px tall, under every tap-target
              // guideline, on the control a shopkeeper reaches for most.
              "text-xs px-2 sm:px-3 h-10 sm:h-8 inline-flex items-center justify-center text-center rounded-full border transition-colors",
              rangeKey === p.key
                ? "bg-primary text-primary-foreground border-primary font-medium"
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
