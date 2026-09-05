import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  ShoppingCart,
  Receipt,
  Package,
  Boxes,
  Undo2,
  Wallet,
  BarChart3,
  Store,
  Users,
  Settings as SettingsIcon,
  ScanLine,
  BellRing,
  Percent,
  Truck,
  Database,
  Sparkles,
  LogOut,
  Wifi,
  WifiOff,
  RefreshCw,
  Search,
  User as UserIcon,
  Menu,
  MoreHorizontal,
  X,
  Sunrise,
  Moon,
  ArrowLeftRight,
  CalendarClock,
  Contact,
  MessagesSquare,
  Scale,
  History,
} from "lucide-react";
import { useStore, formatRs, openSessionFor, shortDay, isUnreadFor } from "@/lib/store";
import { migrationFilesFor, migrationFeaturesFor } from "@/lib/notifications";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationBell } from "@/components/NotificationBell";
import { Confirm } from "@/components/Confirm";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { toast } from "sonner";

type NavItem = { to: string; label: string; icon: ReactNode };

const ADMIN_NAV: NavItem[] = [
  { to: "/app/dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
  { to: "/app/daybook", label: "Day Book", icon: <CalendarClock className="h-4 w-4" /> },
  { to: "/app/messages", label: "Messages", icon: <MessagesSquare className="h-4 w-4" /> },
  { to: "/app/ai", label: "AI Assistant", icon: <Sparkles className="h-4 w-4" /> },
  { to: "/app/sales", label: "Sales", icon: <Receipt className="h-4 w-4" /> },
  { to: "/app/purchases", label: "Purchases", icon: <Package className="h-4 w-4" /> },
  { to: "/app/transfers", label: "Transfers", icon: <ArrowLeftRight className="h-4 w-4" /> },
  { to: "/app/customers", label: "Customers", icon: <Contact className="h-4 w-4" /> },
  { to: "/app/suppliers", label: "Suppliers", icon: <Truck className="h-4 w-4" /> },
  // Credit runs in both directions, and the two halves used to live on
  // different tabs with nothing tying them together. This is the whole
  // position: who owes you, who you owe, and what simply cancels out.
  { to: "/app/ledger", label: "Ledgers", icon: <Scale className="h-4 w-4" /> },
  { to: "/app/products", label: "Products", icon: <ScanLine className="h-4 w-4" /> },
  { to: "/app/inventory", label: "Inventory", icon: <Boxes className="h-4 w-4" /> },
  { to: "/app/alerts", label: "Stock Alerts", icon: <BellRing className="h-4 w-4" /> },
  { to: "/app/discounts", label: "Discounts", icon: <Percent className="h-4 w-4" /> },
  { to: "/app/returns", label: "Returns", icon: <Undo2 className="h-4 w-4" /> },
  { to: "/app/expenses", label: "Expenses", icon: <Wallet className="h-4 w-4" /> },
  { to: "/app/reports", label: "Reports", icon: <BarChart3 className="h-4 w-4" /> },
  { to: "/app/shops", label: "Shops", icon: <Store className="h-4 w-4" /> },
  { to: "/app/users", label: "Users", icon: <Users className="h-4 w-4" /> },
  // Who deleted what, and how to get it back. Owner-only by design: the point
  // is that somebody is answerable to somebody else.
  { to: "/app/activity", label: "Activity", icon: <History className="h-4 w-4" /> },
  { to: "/app/settings", label: "Settings", icon: <SettingsIcon className="h-4 w-4" /> },
];

// Shopkeepers now get Day Book (start/end their trading day), Purchases (buying
// stock in for their own shop) and Transfers (stock moving in from wholesale).
const SHOP_NAV: NavItem[] = [
  { to: "/app/dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
  { to: "/app/daybook", label: "Day Book", icon: <CalendarClock className="h-4 w-4" /> },
  { to: "/app/pos", label: "New Sale", icon: <ShoppingCart className="h-4 w-4" /> },
  { to: "/app/messages", label: "Messages", icon: <MessagesSquare className="h-4 w-4" /> },
  { to: "/app/sales", label: "Sales", icon: <Receipt className="h-4 w-4" /> },
  { to: "/app/customers", label: "Customers", icon: <Contact className="h-4 w-4" /> },
  { to: "/app/purchases", label: "Purchases", icon: <Package className="h-4 w-4" /> },
  { to: "/app/transfers", label: "Transfers", icon: <ArrowLeftRight className="h-4 w-4" /> },
  { to: "/app/returns", label: "Returns", icon: <Undo2 className="h-4 w-4" /> },
  { to: "/app/inventory", label: "Inventory", icon: <Boxes className="h-4 w-4" /> },
  { to: "/app/expenses", label: "Expenses", icon: <Wallet className="h-4 w-4" /> },
  { to: "/app/account", label: "Account", icon: <UserIcon className="h-4 w-4" /> },
];

/**
 * The four destinations that get a permanent home on the phone's bottom bar.
 * Everything else lives one tap away behind "More", which opens the same drawer
 * as the header's hamburger.
 */
const ADMIN_BOTTOM = ["/app/dashboard", "/app/daybook", "/app/sales", "/app/inventory"];
const SHOP_BOTTOM = ["/app/dashboard", "/app/pos", "/app/daybook", "/app/sales"];

/**
 * The header search box used to be a plain <input> wired to nothing — typing in
 * it did absolutely nothing. It now searches products and invoices and routes to
 * the matching page with the query pre-applied.
 */
function GlobalSearch({ autoFocus, onDone }: { autoFocus?: boolean; onDone?: () => void }) {
  const { user, products, sales } = useStore();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const isAdmin = user?.role === "admin";

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return { products: [], sales: [] };
    const visibleSales = sales.filter((s) => (isAdmin ? true : s.shopId === user?.shopId));
    return {
      products: products
        .filter((p) => p.name.toLowerCase().includes(term) || p.barcode.includes(term))
        .slice(0, 4),
      sales: visibleSales
        .filter(
          (s) => s.invoice.toLowerCase().includes(term) || s.customer.toLowerCase().includes(term),
        )
        .slice(0, 4),
    };
  }, [q, products, sales, isAdmin, user?.shopId]);

  const hasResults = results.products.length > 0 || results.sales.length > 0;

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const go = (to: "/app/products" | "/app/sales", term: string) => {
    setOpen(false);
    setQ("");
    onDone?.();
    navigate({ to, search: { q: term } });
  };

  return (
    <div ref={boxRef} className="relative w-full">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <input
        type="text"
        autoFocus={autoFocus}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            onDone?.();
            return;
          }
          if (e.key !== "Enter" || !q.trim()) return;
          if (results.products.length) go("/app/products", q.trim());
          else if (results.sales.length) go("/app/sales", q.trim());
          else toast.info(`Nothing matches “${q.trim()}”`);
        }}
        placeholder="Search products, invoices, customers…"
        // text-base below sm stops iOS zooming the whole shell on focus.
        className="w-full h-10 sm:h-9 pl-9 pr-3 text-base sm:text-sm bg-muted/60 border border-transparent rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:bg-background"
      />
      {open && q.trim() && (
        <div className="absolute left-0 right-0 top-full mt-1.5 rounded-md border bg-popover text-popover-foreground shadow-lg overflow-hidden z-50">
          {!hasResults && (
            <div className="px-3 py-4 text-sm text-muted-foreground">No matches.</div>
          )}
          {results.products.length > 0 && (
            <div className="py-1">
              <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                Products
              </div>
              {results.products.map((p) => (
                <button
                  key={p.id}
                  onClick={() => go("/app/products", p.name)}
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted flex items-center justify-between gap-3"
                >
                  <span className="truncate">{p.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatRs(p.price)}
                  </span>
                </button>
              ))}
            </div>
          )}
          {results.sales.length > 0 && (
            <div className="py-1 border-t">
              <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                Invoices
              </div>
              {results.sales.map((s) => (
                <button
                  key={s.id}
                  onClick={() => go("/app/sales", s.invoice)}
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted flex items-center justify-between gap-3"
                >
                  <span className="font-mono text-xs truncate">{s.invoice}</span>
                  <span className="text-xs text-muted-foreground shrink-0 truncate">
                    {s.customer}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Whether this shop's trading day is open, always visible in the header.
 *
 * A shopkeeper who forgets to start the day finds the till blocked; one who
 * forgets to END it silently books tomorrow's sales onto today. Both mistakes
 * are cheap to make and expensive to unpick, so the state is never more than a
 * glance away — and the pill is a link straight to the day book.
 */
function DayStatusPill() {
  const { user, daySessions, shops } = useStore();

  // Admins aren't tied to one till; their per-shop view is on the dashboard.
  if (!user || user.role === "admin" || !user.shopId) return null;

  const session = openSessionFor(daySessions, user.shopId);
  const shop = shops.find((s) => s.id === user.shopId);

  return (
    <Link
      to="/app/daybook"
      title={
        session
          ? `Trading day of ${shortDay(session.businessDate)} is open at ${shop?.name ?? "your shop"}`
          : "No day is open — start the day before selling"
      }
      className={cn(
        "flex items-center gap-1.5 text-xs font-medium px-2 sm:px-2.5 py-1.5 rounded-full border transition-colors shrink-0",
        session
          ? "bg-success/10 text-success-strong border-success/30 hover:bg-success/20"
          : "bg-warning/15 text-warning-strong border-warning/40 hover:bg-warning/25",
      )}
    >
      {session ? <Sunrise className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
      <span className="hidden xs:inline">
        {session ? shortDay(session.businessDate) : "Day closed"}
      </span>
    </Link>
  );
}

/** Tells you at a glance whether the app is talking to its database. */
function DataSourceBadge() {
  const { usingSupabase, dbError } = useStore();
  if (usingSupabase && !dbError) return null;

  const title = dbError
    ? `Supabase problem: ${dbError}`
    : "Not connected to a database. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.";

  return (
    <span
      title={title}
      className={cn(
        // Shown at every width: a database problem is not a detail to hide on
        // small screens, which is exactly where a shopkeeper is working.
        "inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-full border shrink-0",
        dbError
          ? "bg-destructive/10 text-destructive border-destructive/30"
          : "bg-warning/15 text-warning-strong border-warning/40",
      )}
    >
      <Database className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{dbError ? "Database error" : "Not connected"}</span>
    </span>
  );
}

/**
 * The banner shown when the database is reachable but out of date.
 *
 * A tooltip on a small red pill was the only clue about what had gone wrong,
 * and it named a Postgres relation rather than the one command that fixes it.
 * This states the remedy in full and can be dismissed for the session.
 */
function MigrationNotice() {
  const { pendingMigration } = useStore();
  const [hidden, setHidden] = useState(false);

  if (!pendingMigration || pendingMigration.length === 0 || hidden) return null;

  const files = migrationFilesFor(pendingMigration);
  const features = migrationFeaturesFor(pendingMigration);

  return (
    <div
      data-print="hide"
      className="mb-4 rounded-lg border border-warning/40 bg-warning/10 p-3 sm:p-4 flex items-start gap-3"
    >
      <Database className="h-4 w-4 mt-0.5 shrink-0 text-warning-strong" />
      <div className="min-w-0 flex-1 text-sm">
        <div className="font-medium text-warning-strong">
          Your database needs {files.length === 1 ? "one update" : `${files.length} updates`}
        </div>
        <p className="text-muted-foreground mt-1">
          Everything else is working on your real data, but{" "}
          <span className="text-foreground">{pendingMigration.join(", ")}</span>{" "}
          {pendingMigration.length === 1 ? "is" : "are"} missing, so {features} can't save yet. In
          the Supabase dashboard open{" "}
          <span className="font-medium text-foreground">SQL Editor → New query</span>, then paste
          and run {files.length === 1 ? "this file" : "these files, in order"}:
        </p>
        {/* Named individually rather than as one sentence: these get copied into
            a SQL editor, and a filename buried in prose is a filename mistyped. */}
        <ul className="mt-2 space-y-1">
          {files.map((f) => (
            <li key={f}>
              <code className="px-1 py-0.5 rounded bg-muted font-mono text-xs break-all">
                supabase/migrations/{f}
              </code>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground mt-2">Then reload this page.</p>
      </div>
      <button
        onClick={() => setHidden(true)}
        aria-label="Dismiss"
        className="h-8 w-8 shrink-0 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * How many messages are waiting for whoever is signed in.
 *
 * Shared by the sidebar row and the drawer so the two can never show different
 * numbers, and read straight from the store, which the realtime subscription
 * keeps current without a reload.
 */
function useUnreadMessages() {
  const { user, messages } = useStore();
  return useMemo(() => {
    if (!user) return 0;
    const mine =
      user.role === "admin" ? messages : messages.filter((m) => m.shopId === user.shopId);
    return mine.filter((m) => isUnreadFor(m, user.role)).length;
  }, [user, messages]);
}

/** The nav list, shared by the desktop sidebar and the mobile drawer. */
function NavLinks({
  nav,
  isActive,
  onNavigate,
}: {
  nav: NavItem[];
  isActive: (to: string) => boolean;
  onNavigate?: () => void;
}) {
  const unreadMessages = useUnreadMessages();

  return (
    <>
      {nav.map((item) => {
        const active = isActive(item.to);
        const badge = item.to === "/app/messages" ? unreadMessages : 0;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              // min-h-11 gives every drawer row a comfortable touch target.
              "flex min-h-11 items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
            )}
          >
            {item.icon}
            <span>{item.label}</span>
            {badge > 0 && (
              <span className="ml-auto min-w-[1.15rem] h-[1.15rem] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center tabular-nums">
                {badge > 9 ? "9+" : badge}
              </span>
            )}
          </Link>
        );
      })}
    </>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, ready, logout, online, shops } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawer, setDrawer] = useState(false);
  const [mobileSearch, setMobileSearch] = useState(false);

  // The session is restored in an effect, so `user` is null for the first render
  // of any hard load. Redirecting on that null sent every deep link and every
  // refresh to "/", which then bounced to the dashboard — you could never land
  // on or reload a page other than the dashboard.
  useEffect(() => {
    if (ready && !user) navigate({ to: "/" });
  }, [ready, user, navigate]);

  // A route change closes both overlays, so tapping a drawer link (or a search
  // result) never leaves them hanging over the page you just landed on.
  useEffect(() => {
    setDrawer(false);
    setMobileSearch(false);
  }, [location.pathname]);

  // Growing past the lg breakpoint brings the permanent sidebar back. Hiding the
  // drawer with a `lg:hidden` class alone would leave its full-screen overlay
  // behind, swallowing every click on a page that looks perfectly normal — so
  // the drawer is actually closed instead.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => {
      if (mq.matches) setDrawer(false);
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  if (!ready) {
    return (
      <div className="h-dvh flex items-center justify-center bg-background text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!user) return null;

  const nav = user.role === "admin" ? ADMIN_NAV : SHOP_NAV;
  const shop = user.shopId ? shops.find((s) => s.id === user.shopId) : null;
  // Shared by the sidebar, drawer and bottom bar so a sub-route highlights the
  // same item everywhere — the old mobile strip only matched the exact path.
  const isActive = (to: string) =>
    location.pathname === to || (to !== "/app/dashboard" && location.pathname.startsWith(`${to}/`));

  const bottomPaths = user.role === "admin" ? ADMIN_BOTTOM : SHOP_BOTTOM;
  const bottomNav = bottomPaths
    .map((p) => nav.find((n) => n.to === p))
    .filter((n): n is NavItem => Boolean(n));

  const signOut = (
    <Confirm
      title="Sign out?"
      description="You'll be returned to the sign-in screen. Any sale still in the cart will be lost."
      confirmLabel="Sign out"
      onConfirm={() => {
        logout();
        navigate({ to: "/" });
      }}
      trigger={
        <button className="w-full flex min-h-11 items-center gap-3 px-3 py-2 rounded-md text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-colors">
          <LogOut className="h-4 w-4" />
          <span>Sign out</span>
        </button>
      }
    />
  );

  const brand = (
    <div className="flex items-center gap-2">
      <div className="h-9 w-9 rounded-lg bg-sidebar-primary flex items-center justify-center text-sidebar-primary-foreground font-bold">
        A
      </div>
      <div>
        <div className="font-display font-bold text-lg leading-none">A-POS</div>
        <div className="text-xs text-sidebar-foreground/60 mt-1">Retail Suite</div>
      </div>
    </div>
  );

  return (
    <div data-app-shell className="flex h-dvh overflow-hidden bg-background">
      {/*
        Sidebar. Shown from lg (1024px) rather than md: at 768px a fixed 256px
        rail left barely 500px for a data screen, so tablets get the drawer too.
      */}
      <aside
        data-print="hide"
        className="hidden lg:flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border"
      >
        <div className="px-5 py-5 border-b border-sidebar-border">{brand}</div>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          <NavLinks nav={nav} isActive={isActive} />
        </nav>
        <div className="p-3 border-t border-sidebar-border">{signOut}</div>
      </aside>

      {/* Mobile / tablet drawer — the same nav, one tap from the hamburger. */}
      <Sheet open={drawer} onOpenChange={setDrawer}>
        <SheetContent
          side="left"
          data-print="hide"
          className="w-[min(19rem,85vw)] max-w-none p-0 bg-sidebar text-sidebar-foreground border-sidebar-border flex flex-col [&>button]:text-sidebar-foreground [&>button]:bg-transparent [&>button]:hover:bg-sidebar-accent"
        >
          <div className="px-5 py-5 border-b border-sidebar-border">{brand}</div>
          <div className="px-5 py-3 border-b border-sidebar-border flex items-center gap-3">
            {shop?.logo && (
              <img
                src={shop.logo}
                alt=""
                className="h-9 w-9 shrink-0 rounded-full object-contain bg-white border"
              />
            )}
            <div className="min-w-0">
              <div className="text-sm font-medium">{user.name}</div>
              <div className="text-xs text-sidebar-foreground/60">
                {user.role === "admin" ? "Administrator" : (shop?.name ?? "Shop")}
              </div>
            </div>
          </div>
          <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto overscroll-contain">
            <NavLinks nav={nav} isActive={isActive} onNavigate={() => setDrawer(false)} />
          </nav>
          <div className="p-3 border-t border-sidebar-border">{signOut}</div>
        </SheetContent>
      </Sheet>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header data-print="hide" className="shrink-0 border-b bg-card z-20 px-safe">
          <div className="h-14 sm:h-16 flex items-center px-3 sm:px-4 md:px-6 gap-2 sm:gap-3 md:gap-4">
            <button
              onClick={() => setDrawer(true)}
              aria-label="Open menu"
              className="lg:hidden h-10 w-10 shrink-0 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="lg:hidden h-8 w-8 shrink-0 rounded-md bg-primary text-primary-foreground flex items-center justify-center font-bold">
              A
            </div>

            {/* Full search inline from md; a toggle button below that. */}
            <div className="hidden md:block flex-1 max-w-md">
              <GlobalSearch />
            </div>

            <button
              onClick={() => setMobileSearch((v) => !v)}
              aria-label={mobileSearch ? "Close search" : "Search"}
              aria-expanded={mobileSearch}
              className="md:hidden ml-auto h-10 w-10 shrink-0 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              {mobileSearch ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
            </button>

            <DataSourceBadge />

            {/* ml-auto here rather than on the online pill: on a phone the day
                status is the first item in the trailing cluster. */}
            <div className="md:ml-auto flex items-center gap-2 shrink-0">
              <DayStatusPill />
            </div>

            {/*
              A readout, not a control. It was a button that flipped the state by
              hand — so it could be clicked into saying Offline while the shop was
              connected, and it drew a focus ring around a thing nothing happens
              when you press. It now reports what the browser reports.
            */}
            <span
              role="status"
              aria-live="polite"
              className={cn(
                "flex items-center gap-1.5 text-xs font-medium px-2 sm:px-2.5 py-1.5 rounded-full border shrink-0",
                online
                  ? "bg-success/10 text-success-strong border-success/30"
                  : "bg-warning/15 text-warning-strong border-warning/40",
              )}
              title={
                online ? "Connected" : "No internet connection — changes are kept on this device"
              }
            >
              {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              {/* The label costs more than it's worth on a 360px header. */}
              <span className="hidden xs:inline">{online ? "Online" : "Offline"}</span>
            </span>

            <span
              role="status"
              className="hidden lg:flex items-center gap-1.5 text-xs text-muted-foreground shrink-0"
              title={
                online
                  ? "All data is up to date"
                  : "Changes will sync when the connection comes back"
              }
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>{online ? "Synced" : "Pending"}</span>
            </span>

            <NotificationBell />

            <ThemeToggle />

            {/* The drawer carries the name, shop and sign-out on small screens. */}
            <div className="hidden lg:flex items-center gap-2 pl-3 border-l shrink-0">
              {/* A shop's own logo IS its picture: the person at that counter
                  recognises their branch by its mark long before they read a
                  name, and the owner keeps an initial because a business-wide
                  logo would say nothing about which account is signed in. */}
              {shop?.logo ? (
                <img
                  src={shop.logo}
                  alt=""
                  className="h-8 w-8 shrink-0 rounded-full object-contain bg-white border"
                />
              ) : (
                <div className="h-8 w-8 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold">
                  {user.name.charAt(0)}
                </div>
              )}
              <div className="leading-tight">
                <div className="text-sm font-medium">{user.name}</div>
                <div className="text-xs text-muted-foreground">
                  {user.role === "admin" ? "Administrator" : (shop?.name ?? "Shop")}
                </div>
              </div>
            </div>
          </div>

          {mobileSearch && (
            <div className="md:hidden px-3 pb-3">
              <GlobalSearch autoFocus onDone={() => setMobileSearch(false)} />
            </div>
          )}
        </header>

        {/*
          h-full, not min-h-full: a minimum lets the container grow with its
          content, so a `flex-1` child (the AI chat) had nothing to size against
          and expanded past the viewport. A definite height gives flex-1 a real
          limit; longer pages simply overflow and <main> scrolls as before.
        */}
        <main data-app-main className="flex-1 overflow-y-auto overscroll-contain px-safe">
          {/* pb-24 on phones clears the fixed bottom bar; md+ has no bar. */}
          <div className="p-4 pb-24 md:p-6 md:pb-6 lg:p-8 max-w-[1600px] w-full mx-auto h-full flex flex-col">
            <MigrationNotice />
            {children}
          </div>
        </main>

        {/*
          Bottom tab bar (phones only). The old mobile nav was a horizontally
          scrolling strip of up to 15 chips pinned under the header — you had to
          scroll it to reach half the app, and it ate vertical space on every
          page. Four thumb-reachable destinations plus "More" replaces it.
        */}
        <nav
          data-print="hide"
          className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t bg-card/95 backdrop-blur pb-safe px-safe"
        >
          <div className="flex items-stretch">
            {bottomNav.map((item) => {
              const active = isActive(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex-1 flex flex-col items-center justify-center gap-1 py-2 min-h-14 text-[11px] transition-colors",
                    active ? "text-primary font-medium" : "text-muted-foreground",
                  )}
                >
                  {item.icon}
                  <span className="truncate max-w-full px-0.5">{item.label}</span>
                </Link>
              );
            })}
            <button
              onClick={() => setDrawer(true)}
              aria-label="More"
              className="flex-1 flex flex-col items-center justify-center gap-1 py-2 min-h-14 text-[11px] text-muted-foreground"
            >
              <MoreHorizontal className="h-4 w-4" />
              <span>More</span>
            </button>
          </div>
        </nav>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4 sm:mb-6">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-xs sm:text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {/*
        On a phone the actions become a full-width row of equal buttons rather
        than wrapping into ragged half-lines — [&>*]:flex-1 makes "Export CSV"
        and "Add supplier" share the width evenly.
      */}
      {actions && (
        <div
          data-print="hide"
          className="flex flex-wrap gap-2 shrink-0 [&>*]:flex-1 sm:[&>*]:flex-none"
        >
          {actions}
        </div>
      )}
    </div>
  );
}
