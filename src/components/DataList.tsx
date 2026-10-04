import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Responsive list primitives.
 *
 * Every data screen in this app is a wide table. A table with 8-10 columns is
 * unusable on a phone: it either scrolls sideways forever or wraps every cell
 * into three lines. So each screen renders BOTH shapes and lets CSS pick:
 *
 *   <TableWrap>   …the existing <table>…   </TableWrap>   ← md and up
 *   <MobileCards items={rows} render={…} />               ← below md
 *
 * The two share the same already-filtered `rows`, so they can never disagree.
 */

/** Desktop/tablet table wrapper. Hidden on phones, where MobileCards takes over. */
export function TableWrap({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("hidden md:block overflow-x-auto", className)}>{children}</div>;
}

/** Renders one card per row on phones. Hidden from md up. */
export function MobileCards<T>({
  items,
  keyOf,
  render,
  empty,
  className,
}: {
  items: T[];
  keyOf: (item: T, index: number) => string;
  render: (item: T, index: number) => ReactNode;
  empty?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("md:hidden", className)}>
      {items.length === 0 ? (
        <div className="px-4 py-12 text-center text-sm text-muted-foreground">
          {empty ?? "Nothing to show."}
        </div>
      ) : (
        <ul className="divide-y">
          {items.map((item, i) => (
            <li key={keyOf(item, i)}>{render(item, i)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export type CardField = {
  label: string;
  value: ReactNode;
  /** Extra classes for the value — used for the success/warning/destructive tints. */
  className?: string;
};

/**
 * One row rendered as a card: a heading line, an optional right-aligned figure,
 * a grid of labelled values, then any actions.
 *
 * `onClick` makes the whole card tappable (matching the clickable table rows on
 * sales/suppliers). Actions sit in their own row and stop propagation so tapping
 * "Delete" never also opens the detail sheet.
 */
export function ListCard({
  title,
  subtitle,
  right,
  rightSub,
  badges,
  fields,
  actions,
  onClick,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  rightSub?: ReactNode;
  badges?: ReactNode;
  fields?: CardField[];
  actions?: ReactNode;
  onClick?: () => void;
}) {
  const shown = (fields ?? []).filter((f) => f.value !== null && f.value !== undefined);
  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={cn(
        "p-3.5 space-y-2",
        onClick && "cursor-pointer active:bg-muted/50 transition-colors",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[15px] leading-snug break-words">{title}</div>
          {subtitle && (
            <div className="text-xs text-muted-foreground mt-0.5 break-words">{subtitle}</div>
          )}
        </div>
        {(right || rightSub) && (
          <div className="text-right shrink-0">
            {right && <div className="font-semibold text-[15px] tabular-nums">{right}</div>}
            {rightSub && <div className="text-xs text-muted-foreground mt-0.5">{rightSub}</div>}
          </div>
        )}
      </div>

      {badges && <div className="flex flex-wrap items-center gap-1.5">{badges}</div>}

      {/*
       * Fields run INLINE — "Stock 13", "Brand MY" — wrapping as they fill the
       * line, rather than each one taking a labelled block of its own.
       *
       * The block layout cost about 50px a field, so a four-field row stood
       * 330px tall and a phone showed three of them. A shopkeeper looking
       * through 105 products was scrolling 35 screens. Inline pairs put the
       * same four fields on one or two lines and fit seven rows on a screen,
       * which is the difference between scanning a list and fighting it.
       */}
      {shown.length > 0 && (
        <dl className="flex flex-wrap gap-x-3 gap-y-1.5 text-sm">
          {shown.map((f) => (
            <div key={f.label} className="flex items-baseline gap-1.5 min-w-0">
              <dt className="text-xs text-muted-foreground shrink-0">{f.label}</dt>
              <dd className={cn("font-medium break-words", f.className)}>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {actions && (
        /* Thumbs, not cursors: every action in a card row is at least 40px tall. */
        <div
          className="flex flex-wrap gap-2 pt-1 [&_button]:min-h-10 [&_a]:min-h-10"
          onClick={(e) => e.stopPropagation()}
        >
          {actions}
        </div>
      )}
    </div>
  );
}
