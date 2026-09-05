/**
 * The reporting scope: which days, and which shop.
 *
 * Before this existed the dashboard summed every sale ever recorded while
 * labelling the chart "Last 14 days" — the numbers looked plausible only because
 * the demo data happened to be 14 days old. One provider now owns the answer to
 * "which period am I looking at", and every screen reads it, so the dashboard,
 * reports and sales list can never disagree about what "this month" means.
 *
 * The scope is deliberately NOT in the URL: it is a viewing preference that
 * should survive navigating between pages, which a per-route search param would
 * not. It is persisted so reopening the app lands on the same view.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { daysAgoISO, daysBetween, shiftDay, startOfMonth, todayISO } from "./dates";

export type RangeKey = "today" | "yesterday" | "7d" | "30d" | "month" | "all" | "custom";

export interface DateRange {
  from: string;
  to: string;
}

/** The presets offered in the scope bar, in the order they appear. */
export const RANGE_PRESETS: {
  key: Exclude<RangeKey, "custom">;
  label: string;
  range: () => DateRange;
}[] = [
  { key: "today", label: "Today", range: () => ({ from: todayISO(), to: todayISO() }) },
  {
    key: "yesterday",
    label: "Yesterday",
    range: () => ({ from: daysAgoISO(1), to: daysAgoISO(1) }),
  },
  { key: "7d", label: "Last 7 days", range: () => ({ from: daysAgoISO(6), to: todayISO() }) },
  { key: "30d", label: "Last 30 days", range: () => ({ from: daysAgoISO(29), to: todayISO() }) },
  { key: "month", label: "This month", range: () => ({ from: startOfMonth(), to: todayISO() }) },
  // "All time" still needs concrete bounds so every consumer can use one code
  // path; 2000-01-01 is comfortably before any record this app will hold.
  { key: "all", label: "All time", range: () => ({ from: "2000-01-01", to: todayISO() }) },
];

interface ScopeState {
  rangeKey: RangeKey;
  range: DateRange;
  /** The equally long period immediately before `range`, for "vs. previous" deltas. */
  previous: DateRange;
  /** Human label for the current range, e.g. "Last 7 days". */
  rangeLabel: string;
  setPreset: (key: Exclude<RangeKey, "custom">) => void;
  setCustom: (range: DateRange) => void;
  /** Admin-only shop filter. "all" means every shop. */
  shopScope: string;
  setShopScope: (shopId: string) => void;
  /** True when the range covers everything, so "vs previous" is meaningless. */
  isAllTime: boolean;
}

const ScopeContext = createContext<ScopeState | null>(null);

const LS_SCOPE = "apos.scope";

/** The period of equal length ending the day before `range` starts. */
export function previousRange(range: DateRange): DateRange {
  const span = daysBetween(range.from, range.to);
  const to = shiftDay(range.from, -1);
  return { from: shiftDay(to, -(span - 1)), to };
}

/** Does a YYYY-MM-DD day fall inside the range? */
export function inRange(day: string, range: DateRange) {
  return day >= range.from && day <= range.to;
}

export function ScopeProvider({ children }: { children: ReactNode }) {
  const [rangeKey, setRangeKey] = useState<RangeKey>("30d");
  const [custom, setCustomRange] = useState<DateRange>(() => ({
    from: daysAgoISO(29),
    to: todayISO(),
  }));
  const [shopScope, setShopScope] = useState("all");

  // Restored in an effect rather than in useState so the server-rendered markup
  // and the first client render agree; localStorage does not exist during SSR.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LS_SCOPE);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<{
        rangeKey: RangeKey;
        custom: DateRange;
        shopScope: string;
      }>;
      if (saved.rangeKey) setRangeKey(saved.rangeKey);
      if (saved.custom?.from && saved.custom?.to) setCustomRange(saved.custom);
      if (saved.shopScope) setShopScope(saved.shopScope);
    } catch {
      /* corrupt entry — keep the defaults */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(LS_SCOPE, JSON.stringify({ rangeKey, custom, shopScope }));
    } catch {
      /* private mode / quota — the scope just won't persist */
    }
  }, [rangeKey, custom, shopScope]);

  const value = useMemo<ScopeState>(() => {
    const preset = RANGE_PRESETS.find((p) => p.key === rangeKey);
    const range = preset ? preset.range() : custom;
    return {
      rangeKey,
      range,
      previous: previousRange(range),
      rangeLabel: preset?.label ?? `${range.from} → ${range.to}`,
      isAllTime: rangeKey === "all",
      setPreset: (key) => setRangeKey(key),
      setCustom: (r) => {
        // A backwards range silently matched nothing; swapping is what the user meant.
        const ordered = r.from <= r.to ? r : { from: r.to, to: r.from };
        setCustomRange(ordered);
        setRangeKey("custom");
      },
      shopScope,
      setShopScope,
    };
  }, [rangeKey, custom, shopScope]);

  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

export function useScope() {
  const ctx = useContext(ScopeContext);
  if (!ctx) throw new Error("useScope must be used within ScopeProvider");
  return ctx;
}

/**
 * Percentage change between two periods, plus how to render it.
 * `null` when the previous period had nothing to compare against — showing
 * "+100%" against a zero baseline is noise, not information.
 */
export function delta(current: number, prior: number) {
  if (prior === 0) return null;
  const pct = Math.round(((current - prior) / Math.abs(prior)) * 100);
  return { pct, up: pct > 0, flat: pct === 0 };
}
