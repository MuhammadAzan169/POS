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
} from "lucide-react";
import { useStore, formatRs } from "@/lib/store";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Confirm } from "@/components/Confirm";
import { toast } from "sonner";

type NavItem = { to: string; label: string; icon: ReactNode };

const ADMIN_NAV: NavItem[] = [
  { to: "/app/dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
  { to: "/app/ai", label: "AI Assistant", icon: <Sparkles className="h-4 w-4" /> },
  { to: "/app/sales", label: "Sales", icon: <Receipt className="h-4 w-4" /> },
  { to: "/app/purchases", label: "Purchases", icon: <Package className="h-4 w-4" /> },
  { to: "/app/suppliers", label: "Suppliers", icon: <Truck className="h-4 w-4" /> },
  { to: "/app/products", label: "Products", icon: <ScanLine className="h-4 w-4" /> },
  { to: "/app/inventory", label: "Inventory", icon: <Boxes className="h-4 w-4" /> },
  { to: "/app/alerts", label: "Stock Alerts", icon: <BellRing className="h-4 w-4" /> },
  { to: "/app/discounts", label: "Discounts", icon: <Percent className="h-4 w-4" /> },
  { to: "/app/returns", label: "Returns", icon: <Undo2 className="h-4 w-4" /> },
  { to: "/app/expenses", label: "Expenses", icon: <Wallet className="h-4 w-4" /> },
  { to: "/app/reports", label: "Reports", icon: <BarChart3 className="h-4 w-4" /> },
  { to: "/app/shops", label: "Shops", icon: <Store className="h-4 w-4" /> },
  { to: "/app/users", label: "Users", icon: <Users className="h-4 w-4" /> },
  { to: "/app/settings", label: "Settings", icon: <SettingsIcon className="h-4 w-4" /> },
];

const SHOP_NAV: NavItem[] = [
  { to: "/app/dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
  { to: "/app/pos", label: "New Sale", icon: <ShoppingCart className="h-4 w-4" /> },
  { to: "/app/sales", label: "Sales", icon: <Receipt className="h-4 w-4" /> },
  { to: "/app/returns", label: "Returns", icon: <Undo2 className="h-4 w-4" /> },
  { to: "/app/inventory", label: "Inventory", icon: <Boxes className="h-4 w-4" /> },
  { to: "/app/expenses", label: "Expenses", icon: <Wallet className="h-4 w-4" /> },
  { to: "/app/account", label: "Account", icon: <UserIcon className="h-4 w-4" /> },
];

/**
 * The header search box used to be a plain <input> wired to nothing — typing in
 * it did absolutely nothing. It now searches products and invoices and routes to
 * the matching page with the query pre-applied.
 */
function GlobalSearch() {
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
        .filter((s) => s.invoice.toLowerCase().includes(term) || s.customer.toLowerCase().includes(term))
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
    navigate({ to, search: { q: term } });
  };

  return (
    <div ref={boxRef} className="hidden md:block flex-1 max-w-md relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <input
        type="text"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setOpen(false); return; }
          if (e.key !== "Enter" || !q.trim()) return;
          if (results.products.length) go("/app/products", q.trim());
          else if (results.sales.length) go("/app/sales", q.trim());
          else toast.info(`Nothing matches “${q.trim()}”`);
        }}
        placeholder="Search products, invoices, customers…"
        className="w-full pl-9 pr-3 py-2 text-sm bg-muted/60 border border-transparent rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:bg-background"
      />
      {open && q.trim() && (
        <div className="absolute left-0 right-0 top-full mt-1.5 rounded-md border bg-popover text-popover-foreground shadow-lg overflow-hidden z-50">
          {!hasResults && <div className="px-3 py-4 text-sm text-muted-foreground">No matches.</div>}
          {results.products.length > 0 && (
            <div className="py-1">
              <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Products</div>
              {results.products.map((p) => (
                <button
                  key={p.id}
                  onClick={() => go("/app/products", p.name)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between gap-3"
                >
                  <span className="truncate">{p.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{formatRs(p.price)}</span>
                </button>
              ))}
            </div>
          )}
          {results.sales.length > 0 && (
            <div className="py-1 border-t">
              <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Invoices</div>
              {results.sales.map((s) => (
                <button
                  key={s.id}
                  onClick={() => go("/app/sales", s.invoice)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between gap-3"
                >
                  <span className="font-mono text-xs truncate">{s.invoice}</span>
                  <span className="text-xs text-muted-foreground shrink-0 truncate">{s.customer}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Tells you at a glance whether data is coming from Supabase or the demo set. */
function DataSourceBadge() {
  const { usingSupabase, dbError } = useStore();
  if (usingSupabase && !dbError) return null;

  const title = dbError
    ? `Supabase problem: ${dbError}`
    : "Running on built-in demo data. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env to use Supabase.";

  return (
    <span
      title={title}
      className={cn(
        "hidden lg:inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-full border shrink-0",
        dbError
          ? "bg-destructive/10 text-destructive border-destructive/30"
          : "bg-warning/15 text-warning-strong border-warning/40",
      )}
    >
      <Database className="h-3.5 w-3.5" />
      <span>{dbError ? "Database error" : "Demo data"}</span>
    </span>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, ready, logout, online, setOnline, shops } = useStore();
  const navigate = useNavigate();
  const location = useLocation();

  // The session is restored in an effect, so `user` is null for the first render
  // of any hard load. Redirecting on that null sent every deep link and every
  // refresh to "/", which then bounced to the dashboard — you could never land
  // on or reload a page other than the dashboard.
  useEffect(() => {
    if (ready && !user) navigate({ to: "/" });
  }, [ready, user, navigate]);

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
  // Shared by the sidebar and the mobile strip so a sub-route highlights the
  // same item in both — the mobile strip used to only match the exact path.
  const isActive = (to: string) =>
    location.pathname === to || (to !== "/app/dashboard" && location.pathname.startsWith(`${to}/`));

  return (
    <div data-app-shell className="flex h-dvh overflow-hidden bg-background">
      {/* Sidebar */}
      <aside data-print="hide" className="hidden md:flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <div className="px-5 py-5 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-sidebar-primary flex items-center justify-center text-sidebar-primary-foreground font-bold">
              A
            </div>
            <div>
              <div className="font-display font-bold text-lg leading-none">A-POS</div>
              <div className="text-xs text-sidebar-foreground/60 mt-1">Retail Suite</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {nav.map((item) => {
            const active = isActive(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border">
          <Confirm
            title="Sign out?"
            description="You'll be returned to the sign-in screen. Any sale still in the cart will be lost."
            confirmLabel="Sign out"
            onConfirm={() => { logout(); navigate({ to: "/" }); }}
            trigger={
              <button
                className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-colors"
              >
                <LogOut className="h-4 w-4" />
                <span>Sign out</span>
              </button>
            }
          />
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header data-print="hide" className="h-16 shrink-0 border-b bg-card flex items-center px-4 md:px-6 gap-3 md:gap-4 z-20">
          <div className="md:hidden">
            <div className="h-8 w-8 rounded-md bg-primary text-primary-foreground flex items-center justify-center font-bold">A</div>
          </div>
          <GlobalSearch />
          <DataSourceBadge />
          <button
            onClick={() => setOnline(!online)}
            className={cn(
              // ml-auto anchors this whole trailing cluster to the right edge. The
              // search box is capped at max-w-md, so without it everything after
              // the search sits bunched beside it with dead space to the right.
              "ml-auto flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-full border transition-colors shrink-0",
              online
                ? "bg-success/10 text-success-strong border-success/30"
                : "bg-warning/15 text-warning-strong border-warning/40",
            )}
            title="Toggle online/offline (demo)"
          >
            {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            <span>{online ? "Online" : "Offline"}</span>
          </button>
          <button
            onClick={() =>
              online
                ? toast.success("All data is up to date")
                : toast.warning("Offline — changes will sync when reconnected")
            }
            className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>{online ? "Synced" : "Pending"}</span>
          </button>
          <ThemeToggle />
          <div className="flex items-center gap-2 pl-3 border-l shrink-0">
            <div className="h-8 w-8 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold">
              {user.name.charAt(0)}
            </div>
            <div className="hidden sm:block leading-tight">
              <div className="text-sm font-medium">{user.name}</div>
              <div className="text-xs text-muted-foreground">
                {user.role === "admin" ? "Administrator" : shop?.name ?? "Shop"}
              </div>
            </div>
          </div>
          {/* The sidebar (and its sign-out) is hidden below md, which left mobile
              users with no way to sign out at all. */}
          <Confirm
            title="Sign out?"
            description="You'll be returned to the sign-in screen. Any sale still in the cart will be lost."
            confirmLabel="Sign out"
            onConfirm={() => { logout(); navigate({ to: "/" }); }}
            trigger={
              <button
                aria-label="Sign out"
                title="Sign out"
                className="md:hidden h-9 w-9 shrink-0 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <LogOut className="h-4 w-4" />
              </button>
            }
          />
        </header>

        {/* Mobile nav */}
        <div data-print="hide" className="md:hidden shrink-0 border-b bg-card overflow-x-auto">
          <div className="flex gap-1 p-2">
            {nav.map((item) => {
              const active = isActive(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs whitespace-nowrap",
                    active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {item.icon}
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>

        {/* min-h-full + flex lets a page opt into filling the viewport (the AI chat
            does, via flex-1) while ordinary pages keep their natural height. */}
        <main data-app-main className="flex-1 overflow-y-auto">
          <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] w-full mx-auto min-h-full flex flex-col">{children}</div>
        </main>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {actions && <div data-print="hide" className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}