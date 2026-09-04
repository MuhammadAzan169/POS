import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useRef, useEffect } from "react";
import {
  useStore,
  formatRs,
  discountAmountFor,
  openSessionFor,
  priceFor,
  shopKind,
  WALK_IN,
  shortDay,
  matchProduct,
  customerBalance,
  creditHeadroom,
  type Product,
  type Sale,
} from "@/lib/store";
import { Receipt as ReceiptView, type ReceiptData } from "@/components/Receipt";
import { BillDialog } from "@/components/BillDialog";
import { PageHeader } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Minus, X, FileText, ScanLine, CheckCircle2, Sunrise, Warehouse, ShoppingCart, Trash2, PackageSearch } from "lucide-react";
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
  /**
   * A name typed straight onto the receipt for a shopper with no account.
   *
   * Empty by default rather than pre-filled with "Walk-in": most shoppers give
   * no name, and a pre-filled field made the common case the one you had to
   * clear before you could type. Blank is saved as WALK_IN, so a sale is always
   * a complete record either way.
   */
  const [customer, setCustomer] = useState("");
  /** Set when the buyer was picked from the saved list rather than typed. */
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [newCustomer, setNewCustomer] = useState<{ name: string; phone: string } | null>(null);
  const [payment, setPayment] = useState<Sale["payment"]>("Cash");
  /**
   * A discount the cashier decides on at the counter, on top of whatever the
   * Discounts rules already took off. Kept as the typed figure plus the unit it
   * was typed in, so switching between "10%" and "Rs 10" re-reads the same box
   * rather than silently converting one into the other.
   */
  /** The walk-in receipt name is asked for rarely, so it stays folded away
      until someone wants it — it used to cost a permanent row. */
  const [receiptNameOpen, setReceiptNameOpen] = useState(false);
  const [manualMode, setManualMode] = useState<"amount" | "percent">("amount");
  const [manualInput, setManualInput] = useState(0);
  const [tendered, setTendered] = useState(0);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [lastSale, setLastSale] = useState<ReceiptData | null>(null);
  /** The sale itself, kept alongside the receipt so a bill can be raised for
      it without going and finding it again on the Sales page. */
  const [lastSaleRecord, setLastSaleRecord] = useState<Sale | null>(null);
  const [billFor, setBillFor] = useState<Sale | null>(null);
  // Below lg the checkout panel is a bottom sheet reached from the sticky total
  // bar, rather than a column the cashier has to scroll past the catalogue for.
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  /**
   * The tile just added, ringed for a moment so the tap is visibly acknowledged.
   * A plain id rather than an animation: at a till the next tap comes fast, and
   * anything that has to finish playing first gets in the way.
   */
  const [flashId, setFlashId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!flashId) return;
    const t = window.setTimeout(() => setFlashId(null), 600);
    return () => window.clearTimeout(t);
  }, [flashId]);

  useEffect(() => { searchRef.current?.focus(); }, []);

  // Declared before `filtered`, which calls it during render — a const arrow
  // defined below would be in its temporal dead zone and throw.
  /** Units physically on the shelf at this shop, before anything is reserved. */
  const stockFor = (pid: string) => inventory.find((r) => r.productId === pid && r.shopId === shopId)?.qty ?? 0;

  /** How many of a product the cashier has already put in this cart. */
  const cartQtyFor = (pid: string) => cart.find((l) => l.product.id === pid)?.qty ?? 0;

  /**
   * What is still sellable: the shelf count minus what the cart has already
   * claimed. Stock only leaves inventory when the sale completes, so a tile that
   * kept advertising "8 in stock" while 8 sat in the cart invited the cashier to
   * promise units that were already spoken for. Removing the line, or stepping
   * the quantity back down, hands them straight back.
   */
  const availableFor = (pid: string) => Math.max(0, stockFor(pid) - cartQtyFor(pid));

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
    if (availableFor(p.id) === 0) {
      toast.error(`All ${stock} of ${p.name} are already in the cart`);
      return;
    }
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
    setFlashId(p.id);
    setQ("");
    searchRef.current?.focus();
  };

  /**
   * Move one cart line by ±1, or drop it when the last unit goes.
   *
   * Shared by the cart list and the product tile so a product's count can be
   * changed from wherever the cashier happens to be looking, and both places
   * enforce the same shelf limit.
   */
  const stepLine = (i: number, by: 1 | -1) => {
    setCart((prev) => {
      const line = prev[i];
      if (!line) return prev;
      if (by === -1) {
        return line.qty === 1
          ? prev.filter((_, j) => j !== i)
          : prev.map((x, j) => (j === i ? { ...x, qty: x.qty - 1 } : x));
      }
      const stock = stockFor(line.product.id);
      if (line.qty >= stock) {
        toast.error(`Only ${stock} of ${line.product.name} in stock`);
        return prev;
      }
      return prev.map((x, j) => (j === i ? { ...x, qty: x.qty + 1 } : x));
    });
  };

  const removeLine = (i: number) => setCart((prev) => prev.filter((_, j) => j !== i));

  // Barcode scanners type the code then send Enter — without this, scanning did nothing.
  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    // Barcode first (whitespace-insensitive, shared with purchases and
    // transfers); failing that, a search that has narrowed to exactly one
    // product is unambiguous enough to ring up.
    const match = matchProduct(products, term) ?? (filtered.length === 1 ? filtered[0] : undefined);
    if (match) addToCart(match);
    else toast.error(`No product matches “${term}”`);
  };

  const cartUnits = cart.reduce((a, l) => a + l.qty, 0);
  const subtotal = cart.reduce((a, l) => a + l.qty * unitPrice(l.product), 0);
  // Discounts come from the Discounts tab: a product's own rate, else the overall rate.
  const autoDiscount = cart.reduce((a, l) => a + discountAmountFor(l.product.id, unitPrice(l.product), l.qty, discounts), 0);
  /**
   * The counter discount applies to what is left AFTER the automatic rules, so
   * "10%" never quietly takes ten percent of a figure the customer was never
   * charged. It is capped at that remainder: a bill cannot go below zero, and
   * letting it try would produce change owed on a sale nobody paid for.
   */
  const afterAuto = Math.max(0, subtotal - autoDiscount);
  const manualDiscount =
    manualMode === "percent"
      ? Math.round((afterAuto * Math.min(100, Math.max(0, manualInput))) / 100)
      : Math.min(afterAuto, Math.max(0, Math.round(manualInput)));
  const discount = autoDiscount + manualDiscount;
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
    if (id === "__walkin__") { setCustomerId(null); setCustomer(""); return; }
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
      customer: selectedCustomer?.name ?? (customer.trim() || WALK_IN),
      customerId: selectedCustomer?.id,
      cashier: user?.name ?? "Shop",
      // The open session decides the trading day, so a sale rung up at 01:30
      // still counts towards the day the shop opened.
      businessDate: session?.businessDate,
      sessionId: session?.id,
      lines, subtotal, discount, total, profit, payment, status: "Completed",
    });
    setLastSaleRecord(sale);
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
    setManualInput(0);
    setCustomer("");
    setCustomerId(null);
    setReceiptNameOpen(false);
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


  /* ------------------------------------------------------------- cart panel */

  /**
   * The running sale. This used to sit UNDER the product grid, which meant the
   * cashier scrolled past a dozen tiles to see what they had rung up and again
   * to reach the total. It is now the right-hand column on desktop and never
   * moves: products scroll inside their own pane, the sale does not.
   */
  const cartHeader = (extra?: string) => (
    <div className={cn("px-4 py-3 border-b flex items-center justify-between gap-3 shrink-0", extra)}>
      <div className="min-w-0">
        <h3 className="font-semibold flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-primary" />
          Current sale
        </h3>
        <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
          {cartUnits === 0
            ? "No items yet"
            : `${cartUnits} item${cartUnits === 1 ? "" : "s"} · ${cart.length} line${cart.length === 1 ? "" : "s"}`}
        </p>
      </div>
      {cart.length > 0 && (
        <Confirm
          title="Clear the cart?"
          description={`All ${cart.length} line${cart.length === 1 ? "" : "s"} will be removed. This can't be undone.`}
          confirmLabel="Clear cart"
          destructive
          onConfirm={() => { setCart([]); setTendered(0); toast.success("Cart cleared"); }}
          trigger={
            <Button variant="ghost" size="sm" className="shrink-0 text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />Clear
            </Button>
          }
        />
      )}
    </div>
  );

  const cartLines =
    cart.length === 0 ? (
      <div className="px-6 py-10 text-center">
        <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
          <ShoppingCart className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium">Your cart is empty</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-[15rem] mx-auto">
          Scan a barcode, or tap <strong>Add to cart</strong> on a product to start this sale.
        </p>
      </div>
    ) : (
      <ul className="divide-y">
        {cart.map((l, i) => (
          <li key={l.product.id} className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium leading-snug break-words">{l.product.name}</div>
                <div className="text-xs text-muted-foreground tabular-nums mt-0.5">
                  {formatRs(unitPrice(l.product), settings.currency)} each
                  {l.discount > 0 && (
                    <span className="ml-1.5 text-success-strong">− {formatRs(l.discount, settings.currency)}</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => removeLine(i)}
                aria-label={`Remove ${l.product.name}`}
                className="h-7 w-7 -mt-1 -mr-1 shrink-0 rounded-md flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex items-center justify-between gap-3 mt-2">
              <Stepper
                qty={l.qty}
                onDecrease={() => stepLine(i, -1)}
                onIncrease={() => stepLine(i, 1)}
                canIncrease={availableFor(l.product.id) > 0}
                name={l.product.name}
              />
              <div className="font-semibold tabular-nums text-right">
                {formatRs(l.qty * unitPrice(l.product) - l.discount, settings.currency)}
              </div>
            </div>
          </li>
        ))}
      </ul>
    );

  /* --------------------------------------------------- who, and any discount */

  /**
   * Who the sale is for, and anything knocked off at the counter.
   *
   * Pinned above the totals rather than sitting at the end of the cart list:
   * as a scrolling item it was only reachable after paging past every line, so
   * on a long sale the customer picker was effectively invisible. Everything
   * optional here is folded away, so the resting state is a single row.
   */
  const customerBlock = (
    <div className="px-3 py-2 space-y-2 border-t bg-muted/20 shrink-0">
      <div className="flex items-center gap-2">
        {!customersUnavailable && (
        <Select value={customerId ?? "__walkin__"} onValueChange={pickCustomer}>
          <SelectTrigger className="h-9 flex-1 min-w-0"><SelectValue /></SelectTrigger>
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

        {/* The counter discount belongs on the same row as the customer: both
            are things decided once per sale, and neither earns its own band. */}
        <div className="flex rounded-md border bg-card p-0.5 shrink-0">
          {(["amount", "percent"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setManualMode(m)}
              className={cn(
                "px-2.5 h-8 text-sm rounded-[5px] transition-colors tabular-nums",
                manualMode === m ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted",
              )}
            >
              {m === "amount" ? settings.currency : "%"}
            </button>
          ))}
        </div>
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          max={manualMode === "percent" ? 100 : undefined}
          value={manualInput || ""}
          placeholder="Off"
          aria-label="Counter discount"
          onChange={(e) => setManualInput(Math.max(0, Number(e.target.value) || 0))}
          className="tabular-nums h-9 w-20 shrink-0"
        />
        {manualInput > 0 && (
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={() => setManualInput(0)}
            aria-label="Clear discount"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* An untracked walk-in can still have a name printed on the receipt —
          asked for seldom enough that it stays behind a link. */}
      {!selectedCustomer &&
        (receiptNameOpen || customer ? (
          <Input
            autoFocus={receiptNameOpen}
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            placeholder={`${WALK_IN} — name for the receipt`}
            className="h-9"
          />
        ) : (
          <button
            type="button"
            onClick={() => setReceiptNameOpen(true)}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            + Name for the receipt
          </button>
        ))}

      {selectedCustomer && balance && (
        <div className="text-xs text-muted-foreground">
          {balance.outstanding > 0 ? (
            <>
              Already owes{" "}
              <span className="text-warning-strong font-medium">
                {formatRs(balance.outstanding, settings.currency)}
              </span>
              {selectedCustomer.creditLimit > 0 && ` of ${formatRs(selectedCustomer.creditLimit, settings.currency)}`}
            </>
          ) : (
            "Account settled"
          )}
        </div>
      )}

      {/* Inline rather than a nested dialog: a second Dialog portals outside this
          one, so clicking in it counts as an outside click and dismisses the sale. */}
      {newCustomer && (
        <div className="border rounded-lg p-3 space-y-2 bg-card">
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

      {manualMode === "percent" && (
        <div className="grid grid-cols-4 gap-1.5">
          {[5, 10, 15, 20].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setManualInput(n)}
              className="text-xs py-1.5 rounded-md border bg-card hover:bg-muted transition-colors tabular-nums"
            >
              {n}%
            </button>
          ))}
        </div>
      )}
      {manualMode === "amount" && Math.round(manualInput) > manualDiscount && (
        <p className="text-xs text-warning-strong">Capped at the bill total.</p>
      )}
    </div>
  );

  /* ------------------------------------------------------- totals & payment */

  /**
   * The closing block: what is owed, how it is being paid, and the button.
   *
   * Pinned to the bottom of the panel rather than scrolling with the cart — a
   * total the cashier has to scroll to find is a total they read out wrong.
   */
  const checkoutFooter = (
    <div className="border-t bg-card shrink-0">
      <div className="p-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="tabular-nums">{formatRs(subtotal, settings.currency)}</span>
        </div>
        {discounts.enabled && autoDiscount > 0 && (
          <div className="flex justify-between text-success-strong">
            <span>Discount</span>
            <span className="tabular-nums">− {formatRs(autoDiscount, settings.currency)}</span>
          </div>
        )}
        {manualDiscount > 0 && (
          <div className="flex justify-between text-success-strong">
            <span>
              Counter discount
              {manualMode === "percent" && (
                <span className="text-muted-foreground"> ({Math.min(100, Math.max(0, manualInput))}%)</span>
              )}
            </span>
            <span className="tabular-nums">− {formatRs(manualDiscount, settings.currency)}</span>
          </div>
        )}

        {/*
          The one number the cashier and the customer both look at. It gets its
          own band and the largest type on the page — nothing else in the panel
          should be able to be mistaken for it.
        */}
        <div className="flex items-baseline justify-between gap-3 rounded-lg bg-primary/10 px-3 py-2.5 mt-1">
          <span className="text-xs uppercase tracking-wider font-semibold text-primary">Total</span>
          <span className="font-display text-3xl font-bold tabular-nums leading-none text-primary">
            {formatRs(total, settings.currency)}
          </span>
        </div>
      </div>

      <div className="px-4 pb-4 space-y-3">
        <div className="space-y-1.5">
          <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
            Payment method
          </label>
          <PaymentPicker
            value={payment}
            onChange={setPayment}
            allowCredit={Boolean(selectedCustomer) && !customersUnavailable}
            creditDisabledReason={creditBlockedReason}
          />
        </div>

        {payment === "Cash" && (
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
              Cash received
            </label>
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

        {payment === "Cash" && tendered > 0 && (
          <div
            className={cn(
              "flex justify-between items-baseline rounded-lg px-3 py-2 font-medium",
              tendered >= total ? "bg-success/10 text-success-strong" : "bg-destructive/10 text-destructive",
            )}
          >
            <span className="text-sm">{tendered >= total ? "Change due" : "Short by"}</span>
            <span className="text-lg tabular-nums">
              {formatRs(tendered >= total ? change : total - tendered, settings.currency)}
            </span>
          </div>
        )}

        {payment === "Credit" && selectedCustomer && balance && (
          <div className="rounded-md bg-warning/10 border border-warning/40 p-2.5 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Owes now</span>
              <span className="tabular-nums">{formatRs(balance.outstanding, settings.currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">This sale</span>
              <span className="tabular-nums">+ {formatRs(total, settings.currency)}</span>
            </div>
            <div className="flex justify-between font-semibold border-t border-warning/30 pt-1">
              <span>Will owe</span>
              <span className="tabular-nums">{formatRs(balance.outstanding + total, settings.currency)}</span>
            </div>
          </div>
        )}

        <Button className="w-full h-14 text-base font-semibold" onClick={complete} disabled={cart.length === 0}>
          <CheckCircle2 className="h-5 w-5 mr-2" />
          {cart.length === 0 ? "Add items to sell" : "Complete sale"}
        </Button>
        <p className="text-[11px] text-muted-foreground text-center">
          Press <kbd className="px-1 py-0.5 rounded border bg-muted font-mono text-[10px]">F9</kbd> to complete ·
          selling price only
        </p>
      </div>
    </div>
  );

  return (
    // A till, not a document: the page fills the shell and the two panes scroll
    // independently, so the sale is on screen the whole time. pb clears the
    // mobile summary bar, which sits above the app's own bottom nav.
    <div className="flex flex-col lg:flex-1 lg:min-h-0 pb-28 lg:pb-0">
      <PageHeader
        title={isWholesale ? "New wholesale sale" : "New sale"}
        subtitle="Scan a barcode or search to add items. F9 to complete."
        actions={
          <>
            {/*
              The cart used to be discoverable only by noticing the panel on the right — items were
              added and then hunted for. This is the one control that is always in the same place,
              carries the running count and total, and opens the sale at any width.
            */}
            <Button
              variant={cart.length === 0 ? "outline" : "default"}
              className="h-10 gap-2 px-3"
              disabled={cart.length === 0}
              onClick={() => setCheckoutOpen(true)}
            >
              <ShoppingCart className="h-4 w-4" />
              {/* The count rides inside the button rather than as a corner badge:
                  a badge hung outside the border was clipped by the header. */}
              {cartUnits > 0 && (
                <span className="min-w-5 h-5 px-1.5 rounded-full bg-primary-foreground/20 text-[11px] font-bold grid place-items-center tabular-nums">
                  {cartUnits}
                </span>
              )}
              <span>{cart.length === 0 ? "Cart empty" : "View cart"}</span>
              {cart.length > 0 && (
                <span className="font-semibold tabular-nums border-l border-primary-foreground/25 pl-2">
                  {formatRs(total, settings.currency)}
                </span>
              )}
            </Button>
            {session ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-full border bg-success/10 text-success-strong border-success/30">
              <Sunrise className="h-3.5 w-3.5" />
              Day open · {shortDay(session.businessDate)}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-full border bg-warning/15 text-warning-strong border-warning/40">
              <Sunrise className="h-3.5 w-3.5" />
              Day book off
            </span>
            )}
          </>
        }
      />

      {dayBookUnavailable && (
        <Card className="p-3 mb-4 flex items-start gap-2.5 border-warning/40 bg-warning/10 text-sm shrink-0">
          <Sunrise className="h-4 w-4 shrink-0 mt-0.5 text-warning-strong" />
          <span>
            Selling without a trading day — sales are booked to today's calendar date, so anything
            rung up after midnight lands on the next day. Run the pending database update to turn the
            day book on.
          </span>
        </Card>
      )}

      {isWholesale && (
        <Card className="p-3 mb-4 flex items-center gap-2.5 border-accent/40 bg-accent/5 text-sm shrink-0">
          <Warehouse className="h-4 w-4 shrink-0 text-accent-strong" />
          <span>
            Trade counter — items are priced at their <strong>wholesale rate</strong>, not the shelf price.
          </span>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_23rem] xl:grid-cols-[minmax(0,1fr)_25rem] lg:flex-1 lg:min-h-0">
        {/* ------------------------------------------------- left: catalogue */}
        <Card className="flex flex-col min-w-0 lg:min-h-0 overflow-hidden">
          {/* Search and categories stay put; only the grid under them scrolls. */}
          <div className="p-3 sm:p-4 border-b shrink-0">
            <div className="relative">
              <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                ref={searchRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onSearchKeyDown}
                placeholder="Scan barcode or search by name…"
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
                        ? "bg-primary text-primary-foreground border-primary font-medium"
                        : "hover:bg-muted text-muted-foreground",
                    )}
                  >
                    {c === "all" ? "All items" : c}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex-1 lg:min-h-0 lg:overflow-y-auto p-3 sm:p-4">
            {/*
              Column count follows the width the CATALOGUE actually gets, not the
              window: at lg both the sidebar and the sale panel appear at once and
              take roughly 660px between them, so the grid steps back down to two
              rather than shrinking cards until "Add to cart" wraps.
            */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
              {filtered.map((p) => {
                // The badge counts what is still SELLABLE, so it ticks down as
                // the cashier taps and back up when a line is removed.
                const inCart = cartQtyFor(p.id);
                const left = availableFor(p.id);
                const out = left === 0;
                const low = !out && left <= p.lowAlert;
                const lineIndex = cart.findIndex((l) => l.product.id === p.id);
                return (
                  <div
                    key={p.id}
                    className={cn(
                      "group relative rounded-xl border bg-card flex flex-col transition-all duration-150",
                      inCart > 0 ? "border-primary ring-1 ring-primary/30" : "hover:border-primary/50 hover:shadow-md",
                      out && inCart === 0 && "opacity-60",
                      // A brief ring on the tile just added: confirmation the tap
                      // landed, without an animation that costs the next tap.
                      flashId === p.id && "ring-2 ring-success/70 border-success",
                    )}
                  >
                    {/*
                      The information half. Clicking it adds too — a cashier
                      going at speed aims at the tile, not the button — but the
                      button below is the affordance that says so, and it is
                      never hidden behind a hover.
                    */}
                    <button
                      type="button"
                      onClick={() => addToCart(p)}
                      disabled={out}
                      className="text-left p-3 pb-2 flex-1 disabled:cursor-not-allowed"
                      aria-label={`Add ${p.name} to cart`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium truncate">
                          {p.category || "General"}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full border tabular-nums whitespace-nowrap",
                            out
                              ? "bg-destructive/10 text-destructive border-destructive/30"
                              : low
                                ? "bg-warning/15 text-warning-strong border-warning/40"
                                : "bg-muted text-muted-foreground border-transparent",
                          )}
                        >
                          {/* "Out of stock" means the shelf is empty; "0 left"
                              means the cart already holds every unit there is.
                              Different problems, different fixes. */}
                          {out
                            ? stockFor(p.id) === 0 ? "OUT OF STOCK" : "0 left"
                            : low ? `${left} left` : `${left} in stock`}
                        </span>
                      </div>

                      <div className="font-medium text-sm leading-snug line-clamp-2 mt-1.5 min-h-[2.5rem]">
                        {p.name}
                      </div>

                      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5">
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

                    {/*
                      The action half: always drawn, never on hover. Once the
                      product is in the cart the button becomes the stepper for
                      that line, so the count and the way to change it are on the
                      tile the cashier is already looking at.
                    */}
                    <div className="p-2 pt-0">
                      {inCart > 0 ? (
                        <div className="flex items-center justify-between gap-1 rounded-lg border border-primary/40 bg-primary/5 p-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 shrink-0 hover:bg-primary/15"
                            aria-label={inCart === 1 ? `Remove ${p.name}` : `One less ${p.name}`}
                            onClick={() => stepLine(lineIndex, -1)}
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                          <span className="text-sm font-semibold tabular-nums text-primary whitespace-nowrap">
                            {inCart} in cart
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 shrink-0 hover:bg-primary/15"
                            aria-label={`One more ${p.name}`}
                            disabled={out}
                            onClick={() => stepLine(lineIndex, 1)}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          className="w-full h-10 font-semibold"
                          disabled={out}
                          onClick={() => addToCart(p)}
                        >
                          <Plus className="h-4 w-4 mr-1.5" />
                          {out ? "Out of stock" : "Add to cart"}
                        </Button>
                      )}
                    </div>
                  </div>
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
          </div>
        </Card>

        {/* ---------------------------------------- right: the sale, pinned */}
        <Card className="hidden lg:flex flex-col min-h-0 overflow-hidden">
          {cartHeader()}
          {/* Only this middle band scrolls, so the header above and the total
              and button below are on screen for the whole sale. */}
          <div className="flex-1 min-h-0 overflow-y-auto">{cartLines}</div>
          {customerBlock}
          {checkoutFooter}
        </Card>
      </div>

      {/*
        Mobile / tablet: a sticky summary bar with one button into a bottom
        sheet holding the same sale. Sitting the panel under a 12-tile catalogue
        meant scrolling the length of the page for every single sale.
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
          <Button
            className="ml-auto h-12 px-6 text-base"
            disabled={cart.length === 0}
            onClick={() => setCheckoutOpen(true)}
          >
            <ShoppingCart className="h-5 w-5 mr-2" /> View sale
          </Button>
        </div>
      </div>

      <Sheet open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        {/* p-0/gap-0 at every width, and overflow owned here rather than by the
            sheet, so the total and the button stay pinned exactly as they are on
            desktop instead of scrolling away with the cart. */}
        {/* Constrained and centred: stretched edge to edge on a desktop the sale
            read as a full-screen takeover, with 2,000px of empty row per item. */}
        <SheetContent
          side="bottom"
          className="p-0 sm:p-0 gap-0 overflow-y-hidden flex flex-col max-h-[85dvh] mx-auto w-full sm:max-w-lg sm:bottom-4 sm:rounded-2xl sm:border"
        >
          <SheetHeader className="sr-only"><SheetTitle>Current sale</SheetTitle></SheetHeader>
          {cartHeader("pr-12")}
          <div className="flex-1 min-h-0 overflow-y-auto">{cartLines}</div>
          {customerBlock}
          {checkoutFooter}
        </SheetContent>
      </Sheet>

      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader data-print="hide"><DialogTitle>Sale complete</DialogTitle></DialogHeader>
          {lastSale && (
            <div data-print="only" className="max-h-[55dvh] overflow-y-auto">
              <ReceiptView data={lastSale} settings={settings} />
            </div>
          )}
          <DialogFooter data-print="hide" className="flex-col-reverse gap-2 sm:flex-row sm:!justify-between">
            <Button variant="outline" onClick={() => setReceiptOpen(false)}>New sale</Button>
            <div className="flex gap-2">
              {/* A trade order leaves with paperwork, not a till slip — so the
                  bill is offered here rather than only from the Sales page,
                  which is where it was always needed a minute later anyway. */}
              {lastSaleRecord && (
                <Button
                  variant="outline"
                  onClick={() => { setBillFor(lastSaleRecord); setReceiptOpen(false); }}
                >
                  <FileText className="h-4 w-4 mr-1.5" />Bill / PDF
                </Button>
              )}
              <Button onClick={() => { window.print(); }}>Print receipt</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BillDialog sale={billFor} onClose={() => setBillFor(null)} />
    </div>
  );
}

/**
 * The − n + control, identical on a product tile and on a cart line so the
 * gesture is the same wherever the cashier reaches for it.
 */
function Stepper({
  qty,
  onDecrease,
  onIncrease,
  canIncrease,
  name,
}: {
  qty: number;
  onDecrease: () => void;
  onIncrease: () => void;
  canIncrease: boolean;
  name: string;
}) {
  return (
    <div className="flex items-center gap-1">
      {/*
        Minus on the last unit drops the line rather than sticking at 1: tapping
        down to nothing is how a cashier says "not this one after all", and
        stopping short left them hunting for a separate remove button.
      */}
      <Button
        variant="outline"
        size="icon"
        aria-label={qty === 1 ? `Remove ${name}` : `Decrease quantity of ${name}`}
        className="h-9 w-9"
        onClick={onDecrease}
      >
        <Minus className="h-3.5 w-3.5" />
      </Button>
      <div className="w-9 text-center font-semibold tabular-nums">{qty}</div>
      <Button
        variant="outline"
        size="icon"
        aria-label={`Increase quantity of ${name}`}
        className="h-9 w-9"
        disabled={!canIncrease}
        onClick={onIncrease}
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
