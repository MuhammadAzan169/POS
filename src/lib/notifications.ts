/**
 * What the app needs to tell you about, right now.
 *
 * Nothing here is stored. Every notification is DERIVED from records the store
 * already holds — an unstarted day, an empty shelf, a till that came up short —
 * so a notification can never contradict the screen it points at, and there is
 * no queue to keep in step with reality.
 *
 * What IS stored is which ones you have seen: each notification carries a
 * stable id, and dismissing it writes that id to localStorage. Ids are built so
 * that the same condition on the same day is the same notification (seeing it
 * once is enough) while a genuinely new event — tomorrow's unstarted day, the
 * next message — gets a fresh id and lights the bell again.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { dayOf, todayISO } from "./dates";
import { customerBalance, openSessionFor, summarizeSession } from "./day-book";
import { isUnreadFor } from "./store-types";
import type {
  Customer,
  CustomerPayment,
  DaySession,
  Expense,
  InventoryRow,
  Message,
  Product,
  ReturnRec,
  Role,
  Sale,
  Shop,
  User,
} from "./store-types";

/** How loudly a notification asks for attention. */
export type NotificationTone = "critical" | "warning" | "info";

/** The sections the bell groups its list into, in the order they appear. */
export const NOTIFICATION_GROUPS = ["Messages", "Day book", "Stock", "Money", "System"] as const;
export type NotificationGroup = (typeof NOTIFICATION_GROUPS)[number];

export interface AppNotification {
  /** Stable per condition-per-day; what the read state is keyed on. */
  id: string;
  group: NotificationGroup;
  tone: NotificationTone;
  title: string;
  detail: string;
  /** Where tapping it takes you — always the screen that can fix the problem. */
  to: string;
  /** Search params for routes that take them (e.g. the sales filter). */
  search?: Record<string, unknown>;
  /** When it happened, for the ones that have a moment attached. */
  at?: string;
}

interface Source {
  user: User | null;
  shops: Shop[];
  products: Product[];
  inventory: InventoryRow[];
  sales: Sale[];
  expenses: Expense[];
  returns: ReturnRec[];
  daySessions: DaySession[];
  customers: Customer[];
  customerPayments: CustomerPayment[];
  messages: Message[];
  pendingMigration: string[] | null;
}

const LS_READ = "apos.notifications.read";
/** Ids are kept only so a dismissed notice stays dismissed; the tail is dead weight. */
const MAX_REMEMBERED = 300;

function loadRead(): string[] {
  try {
    const raw = typeof window === "undefined" ? null : window.localStorage.getItem(LS_READ);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function saveRead(ids: string[]) {
  try {
    window.localStorage.setItem(LS_READ, JSON.stringify(ids.slice(-MAX_REMEMBERED)));
  } catch {
    /* private mode — notifications simply reappear next session */
  }
}

/**
 * Builds the list for whoever is signed in.
 *
 * An owner is told about every shop; a shopkeeper only about their own, because
 * a notification you cannot act on is just noise on a busy till.
 */
export function buildNotifications(s: Source): AppNotification[] {
  const { user } = s;
  if (!user) return [];

  const isAdmin = user.role === "admin";
  const role: Role = user.role;
  const today = todayISO();
  const out: AppNotification[] = [];

  /** The shops this person is answerable for. */
  const scope = isAdmin
    ? s.shops.filter((x) => x.active)
    : s.shops.filter((x) => x.id === user.shopId);
  const shopName = (id: string) => s.shops.find((x) => x.id === id)?.name ?? "a shop";

  /* --------------------------------------------------------------- messages */

  // Grouped per thread rather than per message: forty messages from one shop is
  // one conversation to open, not forty things to read in a dropdown.
  const visibleMessages = s.messages.filter((m) => (isAdmin ? true : m.shopId === user.shopId));
  const threads = new Map<string, Message[]>();
  visibleMessages
    .filter((m) => isUnreadFor(m, role))
    .forEach((m) => threads.set(m.shopId, [...(threads.get(m.shopId) ?? []), m]));

  threads.forEach((unread, shopId) => {
    const last = unread[unread.length - 1];
    out.push({
      // Keyed on the newest unread message, so a further reply re-lights the bell.
      id: `msg:${last.id}`,
      group: "Messages",
      tone: "info",
      title: isAdmin
        ? `${unread.length} new message${unread.length === 1 ? "" : "s"} from ${shopName(shopId)}`
        : `${unread.length} new message${unread.length === 1 ? "" : "s"} from the owner`,
      detail: `${last.fromName}: ${last.body}`,
      to: "/app/messages",
      at: last.createdAt,
    });
  });

  /* --------------------------------------------------------------- day book */

  scope.forEach((shop) => {
    const open = openSessionFor(s.daySessions, shop.id);
    const startedToday = s.daySessions.some((x) => x.shopId === shop.id && x.businessDate === today);

    // A day left open on an earlier trading date is the expensive one: every
    // sale rung up today is still being booked onto that old day.
    if (open && open.businessDate < today) {
      out.push({
        id: `day-stale:${open.id}:${today}`,
        group: "Day book",
        tone: "critical",
        title: isAdmin ? `${shop.name} never closed ${open.businessDate}` : `Your day of ${open.businessDate} is still open`,
        detail: "Today's sales are still being booked onto that trading day. End it and start today.",
        to: "/app/daybook",
        at: open.openedAt,
      });
      return;
    }

    if (!startedToday) {
      out.push({
        id: `day-not-started:${shop.id}:${today}`,
        group: "Day book",
        tone: "warning",
        title: isAdmin ? `${shop.name} hasn't started today` : "Start your day",
        detail: isAdmin
          ? "No trading day is open there, so takings won't reconcile against a cash count."
          : "The till is blocked until the day is open and the drawer counted.",
        to: "/app/daybook",
      });
    }
  });

  // A till that came up short is worth knowing about the same week, not at the
  // end of the month when nobody remembers the evening in question.
  const recent = (d: string) => d >= addDays(today, -7);
  s.daySessions
    .filter((x) => x.status === "closed" && scope.some((sh) => sh.id === x.shopId) && recent(x.businessDate))
    .forEach((session) => {
      const cash = summarizeSession(session, {
        sales: s.sales,
        expenses: s.expenses,
        returns: s.returns,
        customerPayments: s.customerPayments,
      });
      if (cash.variance === null || cash.variance >= 0) return;
      out.push({
        id: `variance:${session.id}`,
        group: "Money",
        tone: "critical",
        title: `Till was short on ${session.businessDate}`,
        detail: `${shopName(session.shopId)} counted ${Math.abs(cash.variance).toLocaleString()} less than the sales account for.`,
        to: "/app/daybook",
        at: session.closedAt,
      });
    });

  /* ------------------------------------------------------------------ stock */

  const scopedStock = s.inventory.filter((r) => scope.some((sh) => sh.id === r.shopId));
  const withProduct = scopedStock
    .map((r) => ({ row: r, product: s.products.find((p) => p.id === r.productId) }))
    .filter((x): x is { row: InventoryRow; product: Product } => Boolean(x.product && x.product.active !== false));

  const outOfStock = withProduct.filter((x) => x.row.qty === 0);
  const lowStock = withProduct.filter((x) => x.row.qty > 0 && x.row.qty <= x.product.lowAlert);

  if (outOfStock.length > 0) {
    out.push({
      // Once per day: an empty shelf is still empty an hour later, and saying so
      // every render would bury everything else.
      id: `stock-out:${today}:${outOfStock.length}`,
      group: "Stock",
      tone: "critical",
      title: `${outOfStock.length} item${outOfStock.length === 1 ? " is" : "s are"} out of stock`,
      detail: outOfStock.slice(0, 3).map((x) => x.product.name).join(", ") + (outOfStock.length > 3 ? "…" : ""),
      to: isAdmin ? "/app/alerts" : "/app/inventory",
    });
  }

  if (lowStock.length > 0) {
    out.push({
      id: `stock-low:${today}:${lowStock.length}`,
      group: "Stock",
      tone: "warning",
      title: `${lowStock.length} item${lowStock.length === 1 ? " is" : "s are"} running low`,
      detail: lowStock.slice(0, 3).map((x) => `${x.product.name} (${x.row.qty} left)`).join(", ") + (lowStock.length > 3 ? "…" : ""),
      to: isAdmin ? "/app/alerts" : "/app/inventory",
    });
  }

  /* ------------------------------------------------------------------ money */

  const ledger = { sales: s.sales, customerPayments: s.customerPayments };
  s.customers
    .filter((c) => c.active && c.creditLimit > 0)
    .forEach((c) => {
      const balance = customerBalance(c, ledger);
      if (!balance.overLimit) return;
      out.push({
        // Not day-scoped: an over-limit account stays over limit until it is
        // paid down, and re-announcing it every morning would train people to
        // ignore the bell.
        id: `credit-over:${c.id}:${balance.outstanding}`,
        group: "Money",
        tone: "warning",
        title: `${c.name} is at their credit limit`,
        detail: `Owes ${balance.outstanding.toLocaleString()} of ${c.creditLimit.toLocaleString()}. The till will refuse further credit.`,
        to: "/app/customers",
        at: balance.lastPurchase,
      });
    });

  // Unpaid supplier bills are the owner's problem, not the shop's.
  if (isAdmin) {
    const salesToday = s.sales.filter((x) => dayOf(x.date) === today && x.status === "Returned");
    if (salesToday.length > 0) {
      out.push({
        id: `returns-today:${today}:${salesToday.length}`,
        group: "Money",
        tone: "info",
        title: `${salesToday.length} invoice${salesToday.length === 1 ? " was" : "s were"} returned today`,
        detail: "Refunds come out of the drawer, so tonight's cash count will be lower.",
        to: "/app/returns",
      });
    }
  }

  /* ----------------------------------------------------------------- system */

  if (s.pendingMigration && s.pendingMigration.length > 0) {
    out.push({
      id: `migration:${s.pendingMigration.join(",")}`,
      group: "System",
      tone: "critical",
      title: "The database is missing an update",
      detail: `${s.pendingMigration.join(", ")} — run the files in supabase/migrations/, then reload.`,
      to: "/app/settings",
    });
  }

  // Critical first, then by recency: a short till outranks a low-stock nudge
  // however long ago it happened.
  const rank: Record<NotificationTone, number> = { critical: 0, warning: 1, info: 2 };
  return out.sort((a, b) => rank[a.tone] - rank[b.tone] || (b.at ?? "").localeCompare(a.at ?? ""));
}

/** `days` before or after an ISO date, as a plain YYYY-MM-DD string. */
function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The notification list plus its read state.
 *
 * Kept as a hook rather than a context: it is pure derivation over store data,
 * so two callers computing it independently can never disagree.
 */
export function useNotifications(source: Source) {
  const [read, setRead] = useState<string[]>([]);

  // localStorage is read in an effect, not in the initialiser: this component
  // renders on the server too, where `window` does not exist.
  useEffect(() => { setRead(loadRead()); }, []);

  const items = useMemo(() => buildNotifications(source), [source]);
  const readSet = useMemo(() => new Set(read), [read]);
  const unread = useMemo(() => items.filter((n) => !readSet.has(n.id)), [items, readSet]);

  const markRead = useCallback((id: string) => {
    setRead((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      saveRead(next);
      return next;
    });
  }, []);

  const markAllRead = useCallback(() => {
    setRead((prev) => {
      const next = [...new Set([...prev, ...items.map((n) => n.id)])];
      saveRead(next);
      return next;
    });
  }, [items]);

  return { items, unread, unreadCount: unread.length, isRead: (id: string) => readSet.has(id), markRead, markAllRead };
}
