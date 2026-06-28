import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
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
  LogOut,
  Wifi,
  WifiOff,
  RefreshCw,
  Search,
  User as UserIcon,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: ReactNode };

const ADMIN_NAV: NavItem[] = [
  { to: "/app/dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
  { to: "/app/sales", label: "Sales", icon: <Receipt className="h-4 w-4" /> },
  { to: "/app/purchases", label: "Purchases", icon: <Package className="h-4 w-4" /> },
  { to: "/app/products", label: "Products", icon: <ScanLine className="h-4 w-4" /> },
  { to: "/app/inventory", label: "Inventory", icon: <Boxes className="h-4 w-4" /> },
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

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout, online, setOnline, shops } = useStore();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!user) navigate({ to: "/" });
  }, [user, navigate]);

  if (!user) return null;

  const nav = user.role === "admin" ? ADMIN_NAV : SHOP_NAV;
  const shop = user.shopId ? shops.find((s) => s.id === user.shopId) : null;

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
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
            const active = location.pathname === item.to || (item.to !== "/app/dashboard" && location.pathname.startsWith(item.to));
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
          <button
            onClick={() => { logout(); navigate({ to: "/" }); }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 border-b bg-card flex items-center px-4 md:px-6 gap-4 sticky top-0 z-10">
          <div className="md:hidden">
            <div className="h-8 w-8 rounded-md bg-primary text-primary-foreground flex items-center justify-center font-bold">A</div>
          </div>
          <div className="hidden md:flex flex-1 max-w-md relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search products, invoices, customers…"
              className="w-full pl-9 pr-3 py-2 text-sm bg-muted/60 border border-transparent rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:bg-background"
            />
          </div>
          <div className="flex-1 md:hidden" />
          <button
            onClick={() => setOnline(!online)}
            className={cn(
              "flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-full border transition-colors",
              online
                ? "bg-success/10 text-success border-success/30"
                : "bg-warning/15 text-warning-foreground border-warning/40",
            )}
            title="Toggle online/offline (demo)"
          >
            {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            <span>{online ? "Online" : "Offline"}</span>
          </button>
          <button className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Synced</span>
          </button>
          <div className="flex items-center gap-2 pl-3 border-l">
            <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold">
              {user.name.charAt(0)}
            </div>
            <div className="hidden sm:block leading-tight">
              <div className="text-sm font-medium">{user.name}</div>
              <div className="text-xs text-muted-foreground">
                {user.role === "admin" ? "Administrator" : shop?.name ?? "Shop"}
              </div>
            </div>
          </div>
        </header>

        {/* Mobile nav */}
        <div className="md:hidden border-b bg-card overflow-x-auto">
          <div className="flex gap-1 p-2">
            {nav.map((item) => {
              const active = location.pathname === item.to;
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

        <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-[1600px] w-full mx-auto">{children}</main>
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
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}