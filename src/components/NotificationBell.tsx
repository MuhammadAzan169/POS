import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bell, AlertTriangle, AlertCircle, Info, CheckCheck, Inbox } from "lucide-react";
import { useStore } from "@/lib/store";
import { useNotifications, NOTIFICATION_GROUPS, type AppNotification } from "@/lib/notifications";
import { cn } from "@/lib/utils";

/** How long ago, in the shortest form that is still unambiguous. */
function ago(iso?: string) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const TONE_ICON = {
  critical: AlertCircle,
  warning: AlertTriangle,
  info: Info,
} as const;

const TONE_CLASS = {
  critical: "text-destructive bg-destructive/10",
  warning: "text-warning-strong bg-warning/15",
  info: "text-primary bg-primary/10",
} as const;

/**
 * The header bell.
 *
 * Everything in the list is derived from live data (see notifications.ts), so a
 * notice can never outlive the condition that raised it: fix the empty shelf and
 * the notice is gone on the next render, read or not.
 *
 * Every row is a link to the screen that can fix the thing — a notification you
 * have to go and find the page for is a notification you ignore.
 */
export function NotificationBell({ className }: { className?: string }) {
  const {
    user, shops, products, inventory, sales, expenses, returns,
    daySessions, customers, customerPayments, messages, pendingMigration,
  } = useStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // A stable object identity keeps the derivation from re-running on every
  // unrelated render of the shell.
  const source = useMemo(
    () => ({
      user, shops, products, inventory, sales, expenses, returns,
      daySessions, customers, customerPayments, messages, pendingMigration,
    }),
    [user, shops, products, inventory, sales, expenses, returns, daySessions, customers, customerPayments, messages, pendingMigration],
  );

  const { items, unreadCount, isRead, markRead, markAllRead } = useNotifications(source);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;

  const go = (n: AppNotification) => {
    markRead(n.id);
    setOpen(false);
    // `as never` only satisfies the router's typed-route union; the paths here
    // are all real routes and are exercised by the links in the sidebar.
    navigate({ to: n.to, search: n.search } as never);
  };

  const grouped = NOTIFICATION_GROUPS
    .map((group) => ({ group, rows: items.filter((n) => n.group === group) }))
    .filter((g) => g.rows.length > 0);

  return (
    <div ref={boxRef} className={cn("relative shrink-0", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={open}
        title="Notifications"
        className={cn(
          "relative h-9 w-9 rounded-md flex items-center justify-center text-muted-foreground",
          "hover:bg-muted hover:text-foreground transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          open && "bg-muted text-foreground",
        )}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          // Sits half outside the button so it reads as a badge on the bell
          // rather than a number crammed inside it.
          <span className="absolute -top-0.5 -right-0.5 min-w-[1.05rem] h-[1.05rem] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold leading-none flex items-center justify-center tabular-nums">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className={cn(
            // Anchored to the right edge on desktop; on a phone it spans the
            // viewport with a margin, because a 20rem panel hung off a bell near
            // the right edge would run off the screen.
            "absolute right-0 top-full mt-2 z-50 rounded-lg border bg-popover text-popover-foreground shadow-lg overflow-hidden",
            "w-[min(22rem,calc(100vw-1.5rem))]",
          )}
        >
          <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b">
            <div className="font-semibold text-sm">
              Notifications
              {unreadCount > 0 && (
                <span className="ml-1.5 text-xs font-normal text-muted-foreground tabular-nums">
                  {unreadCount} new
                </span>
              )}
            </div>
            {items.length > 0 && unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[min(28rem,70dvh)] overflow-y-auto overscroll-contain">
            {grouped.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <div className="mx-auto h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-3">
                  <Inbox className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">Nothing needs you</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Days are open, shelves are stocked and the tills add up.
                </p>
              </div>
            ) : (
              grouped.map(({ group, rows }) => (
                <div key={group}>
                  <div className="px-3 py-1.5 bg-muted/50 text-[10px] uppercase tracking-wider font-medium text-muted-foreground sticky top-0">
                    {group}
                  </div>
                  {rows.map((n) => {
                    const Icon = TONE_ICON[n.tone];
                    const unread = !isRead(n.id);
                    return (
                      <button
                        key={n.id}
                        onClick={() => go(n)}
                        className={cn(
                          "w-full text-left px-3 py-2.5 flex items-start gap-2.5 border-b last:border-b-0 transition-colors hover:bg-muted/60",
                          unread && "bg-primary/[0.04]",
                        )}
                      >
                        <span className={cn("mt-0.5 h-6 w-6 shrink-0 rounded-full flex items-center justify-center", TONE_CLASS[n.tone])}>
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-2">
                            <span className={cn("text-sm leading-snug", unread ? "font-medium" : "text-foreground/80")}>
                              {n.title}
                            </span>
                            {/* An unread dot as well as the tint: the tint alone
                                disappears against some wallpapers on a phone. */}
                            {unread && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                          </span>
                          <span className="block text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.detail}</span>
                          {n.at && <span className="block text-[11px] text-muted-foreground/80 mt-1">{ago(n.at)}</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
