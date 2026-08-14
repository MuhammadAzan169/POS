import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useRef, useEffect } from "react";
import {
  useStore,
  formatRs,
  discountAmountFor,
  openSessionFor,
  priceFor,
  shopKind,
  shortDay,
  customerBalance,
  creditHeadroom,
  type Product,
  type Sale,
} from "@/lib/store";
import { Receipt as ReceiptView, type ReceiptData } from "@/components/Receipt";
import { PageHeader } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Minus, X, ScanLine, CheckCircle2, Sunrise, Warehouse, ShoppingCart, Trash2, PackageSearch } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Confirm } from "@/components/Confirm";
import { PaymentPicker } from "@/components/PaymentPicker";

export const Route = createFileRoute("/app/pos")({ component: POS });

interface CartLine { product: Product; qty: number; discount: number; }


function POS() {
  const {
    user, products, inventory, addSale, settings, shops, discounts, daySessions, pendingMigration,
    customers, customerPayments, sales, addCustomer,
  } = useStore();
  const shopId = user?.shopId ?? shops[0]?.id ?? "";
  const shop = shops.find((s) => s.id === shopId);
  const kind = shopKind(shop);
  const isWholesale = kind === "wholesale";
  // No open day means no till: sales would have no trading day to belong to and
  // no cash count to reconcile against, so the screen is blocked rather than
  // silently booking them to whatever the calendar says.
  const session = openSessionFor(daySessions, shopId);

  /**
   * A database that hasn't run the day-book migration can't store sessions, so
   * one can never be opened. Blocking the till on that would stop the shop
   * selling over a pending upgrade, so the day book is bypassed and sales fall
   * back to the calendar date — exactly how the app behaved before day sessions
   * existed. The banner in the shell says what to run to turn it on.
   */
  const dayBookUnavailable = Boolean(pendingMigration?.includes("day_sessions"));

  /**
   * Same reasoning for customers: without the table a new customer would live in
   * this browser only, and any credit booked against them would vanish on
   * reload — losing the record of a real debt. The picker falls back to a plain
   * name field until the migration is run.
   */
  const customersUnavailable = Boolean(pendingMigration?.includes("customers"));

  /** A wholesale counter sells at trade rates; a retail shop at the shelf price. */
  const unitPrice = (p: Product) => priceFor(p, kind);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState("Walk-in");
  /** Set when the buyer was picked from the saved list rather than typed. */
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [newCustomer, setNewCustomer] = useState<{ name: string; phone: string } | null>(null);
  const [payment, setPayment] = useState<Sale["payment"]>("Cash");
  const [tendered, setTendered] = useState(0);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [lastSale, setLastSale] = useState<ReceiptData | null>(null);
  // Below lg the checkout panel is a bottom sheet reached from the sticky total
  // bar, rather than a column the cashier has to scroll past the catalogue for.
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { searchRef.current?.focus(); }, []);

  // Declared before `filtered`, which calls it during render — a const arrow
  // defined below would be in its temporal dead zone and throw.
  const stockFor = (pid: string) => inventory.find((r) => r.productId === pid && r.shopId === shopId)?.qty ?? 0;

  /** Category chips, in the order the catalogue happens to list them. */
  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort(),
    [products],
  );

  const filtered = useMemo(() => {
    const lo = q.trim().toLowerCase();
    return products
      .filter((p) => p.active !== false)
      .filter((p) => (category === "all" ? true : p.category === category))
      .filter((p) => (lo ? p.name.toLowerCase().includes(lo) || p.barcode.includes(q.trim()) : true))
      // Out-of-stock sinks to the bottom rather than occupying prime grid space
      // that a cashier's thumb is aiming for.
      .sort((a, b) => {
        const sa = stockFor(a.id) === 0 ? 1 : 0;
        const sb = stockFor(b.id) === 0 ? 1 : 0;
        return sa - sb || a.name.localeCompare(b.name);
      })
      .slice(0, 40);
  }, [products, q, category, inventory, shopId]);

  const addToCart = (p: Product) => {
    const stock = stockFor(p.id);
    if (stock === 0) { toast.error(`${p.name} is out of stock`); return; }
    setCart((prev) => {
      const i = prev.findIndex((l) => l.product.id === p.id);
      if (i >= 0) {
        // Never let the cart exceed what this shop actually has on hand.
        if (prev[i].qty >= stock) { toast.error(`Only ${stock} in stock`); return prev; }
        const next = [...prev];
        next[i] = { ...next[i], qty: next[i].qty + 1 };
        return next;
      }
      return [...prev, { product: p, qty: 1, discount: 0 }];
    });
    setQ("");
    searchRef.current?.focus();
  };

  // Barcode scanners type the code then send Enter — without this, scanning did nothing.
  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    const exact = products.find((p) => p.barcode === term);
    const match = exact ?? (filtered.length === 1 ? filtered[0] : undefined);
    if (match) addToCart(match);
    else toast.error(`No product matches “${term}”`);
  };

  const cartUnits = cart.reduce((a, l) => a + l.qty, 0);
  const subtotal = cart.reduce((a, l) => a + l.qty * unitPrice(l.product), 0);
  // Discounts come from the Discounts tab: a product's own rate, else the overall rate.
  const discount = cart.reduce((a, l) => a + discountAmountFor(l.product.id, unitPrice(l.product), l.qty, discounts), 0);
  const total = Math.max(0, subtotal - discount);
  const change = Math.max(0, tendered - total);

  /* ------------------------------------------------------------ credit */

  const ledger = useMemo(() => ({ sales, customerPayments }), [sales, customerPayments]);
  const selectedCustomer = customers.find((c) => c.id === customerId) ?? null;
  const balance = selectedCustomer ? customerBalance(selectedCustomer, ledger) : null;
  const headroom = selectedCustomer ? creditHeadroom(selectedCustomer, ledger) : 0;

  /**
   * Credit needs someone to owe the money, so it is only offered once a saved
   * customer is chosen. Anonymous debt is not a thing you can chase.
   */
  const creditBlockedReason = !selectedCustomer
    ? undefined
    : total > headroom
      ? `Only ${formatRs(headroom, settings.currency)} of credit left on this account.`
      : undefined;

  // Switching back to a walk-in must not leave "Credit" selected behind it, or
  // the sale would be booked as debt owed by nobody.
  useEffect(() => {
    if (!selectedCustomer && payment === "Credit") setPayment("Cash");
  }, [selectedCustomer, payment]);

  const pickCustomer = (id: string) => {
    if (id === "__walkin__") { setCustomerId(null); setCustomer("Walk-in"); return; }
    if (id === "__new__") { setNewCustomer({ name: "", phone: "" }); return; }
    const c = customers.find((x) => x.id === id);
    if (!c) return;
    setCustomerId(c.id);
    setCustomer(c.name);
  };

  const saveNewCustomer = () => {
    const name = newCustomer?.name.trim();
    if (!name) { toast.error("Customer name required"); return; }
    if (customers.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      toast.error(`“${name}” already exists`);
      return;
    }
    const created = addCustomer({
      name,
      contact: "",
      phone: newCustomer?.phone.trim() ?? "",
      address: "",
      notes: "",
      // Created at a wholesale counter, so it's a trade buyer by default.
      kind: isWholesale ? "wholesale" : "retail",
      creditLimit: 0,
      active: true,
    });
    setCustomerId(created.id);
    setCustomer(created.name);
    setNewCustomer(null);
    toast.success(`${name} added`);
  };

  const complete = () => {
    if (receiptOpen) return;
    if (cart.length === 0) { toast.error("Cart is empty"); return; }
    // Re-checked at the moment of sale, not just when the button was rendered:
    // the cart may have grown since the customer was picked.
    if (payment === "Credit") {
      if (!selectedCustomer) { toast.error("Pick a customer before selling on credit"); return; }
      if (total > headroom) {
        toast.error(`${selectedCustomer.name} only has ${formatRs(headroom, settings.currency)} of credit left`);
        return;
      }
    }
    const lines = cart.map((l) => ({
      productId: l.product.id, name: l.product.name, qty: l.qty, price: unitPrice(l.product), cost: l.product.cost,
      discount: discountAmountFor(l.product.id, unitPrice(l.product), l.qty, discounts),
    }));
    const profit = lines.reduce((a, l) => a + l.qty * (l.price - l.cost), 0) - discount;
    const sale = addSale({
      shopId, date: new Date().toISOString(),
      customer: selectedCustomer?.name ?? (customer.trim() || "Walk-in"),
      customerId: selectedCustomer?.id,
      cashier: user?.name ?? "Shop",
      // The open session decides the trading day, so a sale rung up at 01:30
      // still counts towards the day the shop opened.
      businessDate: session?.businessDate,
      sessionId: session?.id,
      lines, subtotal, discount, total, profit, payment, status: "Completed",
    });
    setLastSale({
      invoice: sale.invoice,
      total,
      // Nothing was handed over on a credit sale, so printing a tendered amount
      // and change due would be a receipt for a payment that never happened.
      change: payment === "Credit" ? 0 : change,
      subtotal,
      discount,
      payment,
      customer: sale.customer,
      tendered: payment === "Credit" ? 0 : tendered,
      at: new Date(),
      cashier: user?.name ?? "Shop",
      shopName: shops.find((s) => s.id === shopId)?.name,
      lines: cart.map((l) => ({ name: l.product.name, qty: l.qty, price: unitPrice(l.product), barcode: l.product.barcode })),
    });
    if (payment === "Credit" && selectedCustomer) {
      toast.warning(`${formatRs(total, settings.currency)} added to ${selectedCustomer.name}'s account`);
    }
    setReceiptOpen(true);
    setCheckoutOpen(false);
    setCart([]);
    setTendered(0);
    setCustomer("Walk-in");
    setCustomerId(null);
    setPayment("Cash");
  };

  // The page header promises "F9 to complete" — keep that promise.
  const completeRef = useRef(complete);
  completeRef.current = complete;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "F9") return;
      e.preventDefault();
      completeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Gated only after every hook above has run: an early return before them
  // would change the hook count between "day open" and "day closed" renders.
  if (!session && !dayBookUnavailable) {
    return (
      <div>
        <PageHeader title="New sale" subtitle="The till is closed." />
        <Card className="p-8 sm:p-12 text-center max-w-lg mx-auto">
          <div className="mx-auto h-12 w-12 rounded-full bg-warning/15 text-warning-strong flex items-center justify-center mb-4">
            <Sunrise className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-semibold">Start your day first</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Open the day at <strong>{shop?.name ?? "your shop"}</strong> and count the cash in the
            drawer before selling. Every sale is then booked to today's trading day — right through
            to whenever you lock up, even after midnight.
          </p>
          <Button className="mt-6" asChild>
            <Link to="/app/daybook"><Sunrise className="h-4 w-4 mr-1.5" />Go to the day book</Link>
          </Button>
        </Card>
      </div>
    );
  }

  // The checkout form is identical in the desktop column and the mobile sheet.
  const checkoutFields = (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Customer</label>
        {!customersUnavailable && (
          <Select value={customerId ?? "__walkin__"} onValueChange={pickCustomer}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__walkin__">Walk-in (no account)</SelectItem>
              {/* Trade buyers first at a wholesale counter — they're who you serve. */}
              {[...customers]
                .filter((c) => c.active)
                .sort((a, b) =>
                  isWholesale && a.kind !== b.kind
                    ? a.kind === "wholesale" ? -1 : 1
                    : a.name.localeCompare(b.name),
                )
                .map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              <SelectItem value="__new__">+ Add new customer…</SelectItem>
            </SelectContent>
          </Select>
        )}

        {/* An untracked walk-in can still have a name printed on the receipt. */}
        {!selectedCustomer && (
          <Input
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            placeholder="Name for the receipt (optional)"
          />
        )}

        {selectedCustomer && balance && (
          <div className="text-xs text-muted-foreground">
            {balance.outstanding > 0 ? (
              <>
                Already owes <span className="text-warning-strong font-medium">{formatRs(balance.outstanding, settings.currency)}</span>
                {selectedCustomer.creditLimit > 0 && ` of ${formatRs(selectedCustomer.creditLimit, settings.currency)}`}
              </>
            ) : (
              "Account settled"
            )}
          </div>
        )}
      </div>

      {/* Inline rather than a nested dialog: a second Dialog portals outside this
          one, so clicking in it counts as an outside click and dismisses the sale. */}
      {newCustomer && (
        <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
          <div className="text-sm font-medium">New customer</div>
          <Input
            autoFocus
            value={newCustomer.name}
            onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveNewCustomer(); } }}
            placeholder="Name, e.g. Bilal Traders"
          />
          <Input
            value={newCustomer.phone}
            onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
            placeholder="Phone (optional)"
          />
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" onClick={() => setNewCustomer(null)}>Cancel</Button>
            <Button size="sm" onClick={saveNewCustomer}>Add</Button>
          </div>
          <p className="text-xs text-muted-foreground">
            A credit limit can be set later on the Customers page.
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Payment</label>
        <PaymentPicker
          value={payment}
          onChange={setPayment}
          allowCredit={Boolean(selectedCustomer) && !customersUnavailable}
          creditDisabledReason={creditBlockedReason}
        />
      </div>

      {payment === "Cash" && (
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Cash received</label>
          <Input
            type="number"
            inputMode="decimal"
            value={tendered || ""}
            placeholder="0"
            onChange={(e) => setTendered(Number(e.target.value) || 0)}
            className="text-lg font-semibold tabular-nums h-11"
          />
          {/* Counting out change from a note is the commonest thing that happens
              at a till, so the common notes are one tap instead of typing. */}
          <div className="grid grid-cols-4 gap-1.5">
            <button
              type="button"
              onClick={() => setTendered(total)}
              disabled={total <= 0}
              className="text-xs py-1.5 rounded-md border hover:bg-muted disabled:opacity-40 transition-colors"
            >
              Exact
            </button>
            {[500, 1000, 5000].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setTendered((t) => t + n)}
                className="text-xs py-1.5 rounded-md border hover:bg-muted transition-colors tabular-nums"
              >
                +{n.toLocaleString()}
              </button>
            ))}
          </div>
        </div>
      )}

      {payment === "Credit" && selectedCustomer && balance && (
        <div className="rounded-md bg-warning/10 border border-warning/40 p-2.5 text-xs space-y-1">
          <div className="flex justify-between"><span className="text-muted-foreground">Owes now</span><span>{formatRs(balance.outstanding, settings.currency)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">This sale</span><span>+ {formatRs(total, settings.currency)}</span></div>
          <div className="flex justify-between font-semibold border-t border-warning/30 pt-1">
            <span>Will owe</span><span>{formatRs(balance.outstanding + total, settings.currency)}</span>
          </div>
        </div>
      )}
    </div>
  );

  const totals = (
    <div className="space-y-2 text-sm">
      <div className="flex justify-between">
        <span className="text-muted-foreground">Subtotal</span>
        <span className="tabular-nums">{formatRs(subtotal, settings.currency)}</span>
      </div>
      {discounts.enabled && discount > 0 && (
        <div className="flex justify-between text-success-strong">
          <span>Discount</span>
          <span className="tabular-nums">− {formatRs(discount, settings.currency)}</span>
        </div>
      )}
      {cartUnits > 0 && (
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Items</span>
          <span className="tabular-nums">{cartUnits}</span>
        </div>
      )}
      {/*
        The total is the one number the cashier and the customer both look at,
        so it gets its own band rather than being one more row in a list.
      */}
      <div className="flex items-baseline justify-between gap-3 mt-3 pt-3 border-t">
        <span className="text-sm font-medium text-muted-foreground">Total</span>
        <span className="font-display text-3xl font-bold tabular-nums leading-none">
          {formatRs(total, settings.currency)}
        </span>
      </div>
      {payment === "Cash" && tendered > 0 && (
        <div
          className={cn(
            "flex justify-between items-baseline rounded-lg px-3 py-2 mt-2 font-medium",
            tendered >= total ? "bg-success/10 text-success-strong" : "bg-destructive/10 text-destructive",
          )}
        >
          <span className="text-sm">{tendered >= total ? "Change due" : "Short by"}</span>
          <span className="text-lg tabular-nums">
            {formatRs(tendered >= total ? change : total - tendered, settings.currency)}
          </span>
        </div>
      )}
    </div>
  );

  return (
    // pb clears the sticky total bar on phones/tablets, which sits above the app's
    // own bottom nav.
    <div className="pb-28 lg:pb-0">
      <PageHeader
        title={isWholesale ? "New wholesale sale" : "New sale"}
        subtitle="Scan a barcode or search to add items. F9 to complete."
        actions={
          session ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-full border bg-success/10 text-success-strong border-success/30">
              <Sunrise className="h-3.5 w-3.5" />
              Day open · {shortDay(session.businessDate)}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-full border bg-warning/15 text-warning-strong border-warning/40">
              <Sunrise className="h-3.5 w-3.5" />
              Day book off
            </span>
          )
        }
      />

      {dayBookUnavailable && (
        <Card className="p-3 mb-4 flex items-start gap-2.5 border-warning/40 bg-warning/10 text-sm">
          <Sunrise className="h-4 w-4 shrink-0 mt-0.5 text-warning-strong" />
          <span>
            Selling without a trading day — sales are booked to today's calendar date, so anything
            rung up after midnight lands on the next day. Run the pending database update to turn the
            day book on.
          </span>
        </Card>
      )}

      {isWholesale && (
        <Card className="p-3 mb-4 flex items-center gap-2.5 border-accent/40 bg-accent/5 text-sm">
          <Warehouse className="h-4 w-4 shrink-0 text-accent-strong" />
          <span>
            Trade counter — items are priced at their <strong>wholesale rate</strong>, not the shelf price.
          </span>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
        {/* Left: catalog + cart */}
        <div className="space-y-4 min-w-0">
          <Card className="p-3 sm:p-4">
            <div className="relative">
              <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                ref={searchRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onSearchKeyDown}
                placeholder="Scan barcode or search product…"
                // enterKeyHint labels the on-screen keyboard's action key "Go",
                // which is what pressing it actually does here.
                enterKeyHint="go"
                autoCapitalize="off"
                autoCorrect="off"
                className="pl-11 h-12 text-base rounded-xl"
              />
              {q && (
                <button
                  onClick={() => { setQ(""); searchRef.current?.focus(); }}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {/* Category chips: on a busy till, tapping "Cosmetics" beats typing.
                Scrolls sideways on a phone rather than wrapping into three rows. */}
            {categories.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar mt-3 -mx-3 px-3 sm:mx-0 sm:px-0 sm:flex-wrap sm:overflow-visible">
                {["all", ...categories].map((c) => (
                  <button
                    key={c}
                    onClick={() => setCategory(c)}
                    className={cn(
                      "shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors",
                      category === c
                        ? "bg-primary text-primary-foreground border-primary"
                        : "hover:bg-muted text-muted-foreground",
                    )}
                  >
                    {c === "all" ? "All items" : c}
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5 mt-4">
              {filtered.map((p) => {
                const s = stockFor(p.id);
                const out = s === 0;
                const low = !out && s <= p.lowAlert;
                return (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    disabled={out}
                    className={cn(
                      "group relative text-left p-3 min-h-[6.5rem] rounded-xl border bg-card flex flex-col",
                      "transition-all duration-150",
                      out
                        ? "opacity-55 cursor-not-allowed"
                        : "hover:border-primary hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:shadow-sm",
                    )}
                  >
                    {/* Stock sits top-right as a badge rather than competing with
                        the price on the bottom line, which is what the cashier
                        is actually reading. */}
                    <span
                      className={cn(
                        "absolute top-2 right-2 text-[10px] font-medium px-1.5 py-0.5 rounded-full border tabular-nums",
                        out
                          ? "bg-destructive/10 text-destructive border-destructive/30"
                          : low
                            ? "bg-warning/15 text-warning-strong border-warning/40"
                            : "bg-muted text-muted-foreground border-transparent",
                      )}
                    >
                      {out ? "Out" : s}
                    </span>

                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground pr-10">
                      {p.category || "—"}
                    </div>
                    <div className="font-medium text-sm leading-snug line-clamp-2 mt-1 pr-2">{p.name}</div>

                    <div className="mt-auto pt-2 flex items-baseline gap-1.5">
                      <span className="font-display text-lg font-bold tabular-nums">
                        {formatRs(unitPrice(p), settings.currency)}
                      </span>
                      {/* Retail price struck through makes it obvious the trade
                          rate is in force, not a mispriced product. */}
                      {isWholesale && unitPrice(p) !== p.price && (
                        <span className="text-xs text-muted-foreground line-through tabular-nums">
                          {formatRs(p.price, settings.currency)}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}

              {filtered.length === 0 && (
                <div className="col-span-full py-12 text-center">
                  <PackageSearch className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm font-medium">No products found</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {q ? `Nothing matches “${q}”.` : "This category is empty."}
                  </p>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <div className="p-4 border-b flex items-center justify-between gap-3">
              <h3 className="font-semibold flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                Cart
                {cartUnits > 0 && (
                  <span className="text-xs font-normal text-muted-foreground tabular-nums">
                    {cartUnits} item{cartUnits === 1 ? "" : "s"}
                  </span>
                )}
              </h3>
              {cart.length > 0 && (
                <Confirm
                  title="Clear the cart?"
                  description={`All ${cart.length} line${cart.length === 1 ? "" : "s"} will be removed. This can't be undone.`}
                  confirmLabel="Clear cart"
                  destructive
                  onConfirm={() => { setCart([]); toast.success("Cart cleared"); }}
                  trigger={
                    <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />Clear
                    </Button>
                  }
                />
              )}
            </div>
            {cart.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <div className="mx-auto h-11 w-11 rounded-full bg-muted flex items-center justify-center mb-3">
                  <ScanLine className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">Nothing in the cart yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Scan a barcode, or tap a product above to add it.
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {/*
                  Name, stepper, line total and remove used to share one row.
                  At 360px that gave the product name about 90px and squeezed
                  the stepper into a target you couldn't hit. On phones the row
                  becomes two lines: name over controls; from sm it's one line
                  again.
                */}
                {cart.map((l, i) => (
                  <div key={i} className="p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                    <div className="flex items-start justify-between gap-2 sm:flex-1 sm:min-w-0 sm:items-center">
                      <div className="min-w-0">
                        <div className="text-sm font-medium break-words sm:truncate">{l.product.name}</div>
                        <div className="text-xs text-muted-foreground tabular-nums">
                          {formatRs(unitPrice(l.product), settings.currency)} × {l.qty}
                          {l.discount > 0 && (
                            <span className="ml-1.5 text-success-strong">
                              − {formatRs(l.discount, settings.currency)}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => setCart((prev) => prev.filter((_, j) => j !== i))}
                        aria-label={`Remove ${l.product.name}`}
                        className="sm:hidden h-9 w-9 shrink-0 -mr-1 -mt-1 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:justify-start">
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="icon" aria-label="Decrease quantity" className="h-9 w-9 sm:h-8 sm:w-8" onClick={() => setCart((prev) => prev.map((x, j) => j === i ? { ...x, qty: Math.max(1, x.qty - 1) } : x))}><Minus className="h-3.5 w-3.5" /></Button>
                        <div className="w-10 text-center font-medium">{l.qty}</div>
                        <Button variant="outline" size="icon" aria-label="Increase quantity" className="h-9 w-9 sm:h-8 sm:w-8" onClick={() => setCart((prev) => prev.map((x, j) => j === i ? { ...x, qty: Math.min(stockFor(x.product.id), x.qty + 1) } : x))}><Plus className="h-3.5 w-3.5" /></Button>
                      </div>
                      <div className="font-semibold tabular-nums sm:w-24 sm:text-right">{formatRs(l.qty * unitPrice(l.product) - l.discount, settings.currency)}</div>
                      <button
                        onClick={() => setCart((prev) => prev.filter((_, j) => j !== i))}
                        aria-label={`Remove ${l.product.name}`}
                        className="hidden sm:block text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right: checkout — a real column only where there's room for one. */}
        <Card className="hidden lg:flex flex-col p-5 h-fit lg:sticky lg:top-0 max-h-[calc(100dvh-3rem)]">
          <h3 className="font-semibold mb-4 shrink-0">Checkout</h3>
          {/* The fields scroll; the total and the action stay put, so the button
              never drifts below the fold on a long cart. */}
          <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">{checkoutFields}</div>
          <div className="mt-5 pt-4 border-t shrink-0">{totals}</div>
          <Button
            className="w-full mt-4 h-12 text-base shrink-0"
            onClick={complete}
            disabled={cart.length === 0}
          >
            <CheckCircle2 className="h-5 w-5 mr-2" />
            {cart.length === 0 ? "Add items to sell" : "Complete sale"}
          </Button>
          <p className="text-xs text-muted-foreground text-center mt-3 shrink-0">
            Press <kbd className="px-1 py-0.5 rounded border bg-muted font-mono text-[10px]">F9</kbd> to complete ·
            selling price only
          </p>
        </Card>
      </div>

      {/*
        Mobile / tablet checkout: a sticky bar showing the running total with one
        button into a bottom sheet. Sitting the checkout panel under a 12-tile
        catalogue meant the cashier scrolled the length of the page for every
        single sale.
      */}
      <div
        data-print="hide"
        className="lg:hidden fixed inset-x-0 z-30 border-t bg-card/95 backdrop-blur px-safe above-bottom-nav"
      >
        <div className="flex items-center gap-3 p-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground tabular-nums">
              {cartUnits} item{cartUnits === 1 ? "" : "s"}
            </div>
            <div className="font-display text-xl font-bold leading-tight tabular-nums">
              {formatRs(total, settings.currency)}
            </div>
          </div>
          <Button className="ml-auto h-12 px-6 text-base" disabled={cart.length === 0} onClick={() => setCheckoutOpen(true)}>
            <CheckCircle2 className="h-5 w-5 mr-2" /> Charge
          </Button>
        </div>
      </div>

      <Sheet open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <SheetContent side="bottom" className="space-y-4">
          <SheetHeader><SheetTitle>Checkout</SheetTitle></SheetHeader>
          {checkoutFields}
          <div className="pt-4 border-t">{totals}</div>
          <Button className="w-full h-12 text-base" onClick={complete} disabled={cart.length === 0}>
            <CheckCircle2 className="h-5 w-5 mr-2" /> Complete sale
          </Button>
          <p className="text-xs text-muted-foreground text-center">Selling price only. No cost or profit shown here.</p>
        </SheetContent>
      </Sheet>

      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader data-print="hide"><DialogTitle>Sale complete</DialogTitle></DialogHeader>
          {lastSale && (
            <div data-print="only" className="max-h-[55dvh] overflow-y-auto">
              <ReceiptView data={lastSale} settings={settings} />
            </div>
          )}
          <DialogFooter data-print="hide" className="flex-col-reverse gap-2 sm:flex-row sm:!justify-between">
            <Button variant="outline" onClick={() => setReceiptOpen(false)}>New sale</Button>
            <Button onClick={() => { window.print(); }}>Print receipt</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}