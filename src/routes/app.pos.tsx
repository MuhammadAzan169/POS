import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useRef, useEffect } from "react";
import { useStore, formatRs, discountPctFor, discountAmountFor, type Product } from "@/lib/store";
import { Receipt as ReceiptView, type ReceiptData } from "@/components/Receipt";
import { PageHeader } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Minus, X, ScanLine, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Confirm } from "@/components/Confirm";

export const Route = createFileRoute("/app/pos")({ component: POS });

interface CartLine { product: Product; qty: number; discount: number; }


function POS() {
  const { user, products, inventory, addSale, settings, shops, discounts } = useStore();
  const shopId = user?.shopId ?? shops[0]?.id ?? "";
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState("Walk-in");
  const [payment, setPayment] = useState<"Cash" | "Card" | "Other">("Cash");
  const [tendered, setTendered] = useState(0);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [lastSale, setLastSale] = useState<ReceiptData | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { searchRef.current?.focus(); }, []);

  const filtered = useMemo(() => {
    if (!q) return products.slice(0, 12);
    const lo = q.toLowerCase();
    return products.filter((p) => p.name.toLowerCase().includes(lo) || p.barcode.includes(q)).slice(0, 12);
  }, [products, q]);

  const stockFor = (pid: string) => inventory.find((r) => r.productId === pid && r.shopId === shopId)?.qty ?? 0;

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

  const subtotal = cart.reduce((a, l) => a + l.qty * l.product.price, 0);
  // Discounts come from the Discounts tab: a product's own rate, else the overall rate.
  const discount = cart.reduce((a, l) => a + discountAmountFor(l.product.id, l.product.price, l.qty, discounts), 0);
  const total = Math.max(0, subtotal - discount);
  const change = Math.max(0, tendered - total);

  const complete = () => {
    if (receiptOpen) return;
    if (cart.length === 0) { toast.error("Cart is empty"); return; }
    const lines = cart.map((l) => ({
      productId: l.product.id, name: l.product.name, qty: l.qty, price: l.product.price, cost: l.product.cost,
      discount: discountAmountFor(l.product.id, l.product.price, l.qty, discounts),
    }));
    const profit = lines.reduce((a, l) => a + l.qty * (l.price - l.cost), 0) - discount;
    const sale = addSale({
      shopId, date: new Date().toISOString(), customer, cashier: user?.name ?? "Shop",
      lines, subtotal, discount, total, profit, payment, status: "Completed",
    });
    setLastSale({
      invoice: sale.invoice,
      total,
      change,
      subtotal,
      discount,
      payment,
      customer,
      tendered,
      at: new Date(),
      cashier: user?.name ?? "Shop",
      shopName: shops.find((s) => s.id === shopId)?.name,
      lines: cart.map((l) => ({ name: l.product.name, qty: l.qty, price: l.product.price, barcode: l.product.barcode })),
    });
    setReceiptOpen(true);
    setCart([]);
    setTendered(0);
    setCustomer("Walk-in");
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

  return (
    <div>
      <PageHeader title="New sale" subtitle="Scan a barcode or search to add items. F9 to complete." />

      <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
        {/* Left: catalog + cart */}
        <div className="space-y-4 min-w-0">
          <Card className="p-4">
            <div className="relative">
              <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onSearchKeyDown} placeholder="Scan barcode or search product…" className="pl-10 h-12 text-base" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mt-4">
              {filtered.map((p) => {
                const s = stockFor(p.id);
                return (
                  <button key={p.id} onClick={() => addToCart(p)} className="text-left p-3 border rounded-lg hover:border-primary hover:bg-muted/40 transition-colors disabled:opacity-50" disabled={s === 0}>
                    <div className="text-xs text-muted-foreground">{p.category}</div>
                    <div className="font-medium text-sm line-clamp-2 mt-0.5">{p.name}</div>
                    <div className="flex justify-between items-end mt-2">
                      <div className="font-semibold">{formatRs(p.price)}</div>
                      <div className={`text-xs ${s === 0 ? "text-destructive" : s <= p.lowAlert ? "text-warning-strong" : "text-muted-foreground"}`}>
                        {s === 0 ? "Out" : `${s} left`}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card>
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold">Cart ({cart.length})</h3>
              {cart.length > 0 && (
                <Confirm
                  title="Clear the cart?"
                  description={`All ${cart.length} item${cart.length === 1 ? "" : "s"} will be removed. This can't be undone.`}
                  confirmLabel="Clear cart"
                  destructive
                  onConfirm={() => { setCart([]); toast.success("Cart cleared"); }}
                  trigger={<Button variant="ghost" size="sm">Clear</Button>}
                />
              )}
            </div>
            {cart.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">Cart is empty.</div>
            ) : (
              <div className="divide-y">
                {cart.map((l, i) => (
                  <div key={i} className="p-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{l.product.name}</div>
                      <div className="text-xs text-muted-foreground">{formatRs(l.product.price)} × {l.qty}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCart((prev) => prev.map((x, j) => j === i ? { ...x, qty: Math.max(1, x.qty - 1) } : x))}><Minus className="h-3.5 w-3.5" /></Button>
                      <div className="w-10 text-center font-medium">{l.qty}</div>
                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCart((prev) => prev.map((x, j) => j === i ? { ...x, qty: Math.min(stockFor(x.product.id), x.qty + 1) } : x))}><Plus className="h-3.5 w-3.5" /></Button>
                    </div>
                    <div className="w-24 text-right font-semibold">{formatRs(l.qty * l.product.price - l.discount)}</div>
                    <button onClick={() => setCart((prev) => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right: checkout */}
        <Card className="p-5 h-fit lg:sticky lg:top-0">
          <h3 className="font-semibold mb-4">Checkout</h3>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Customer</label>
              <Input value={customer} onChange={(e) => setCustomer(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Payment</label>
              <div className="grid grid-cols-3 gap-2">
                {(["Cash", "Card", "Other"] as const).map((p) => (
                  <button key={p} onClick={() => setPayment(p)} className={`py-2 rounded-md border text-sm ${payment === p ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}>{p}</button>
                ))}
              </div>
            </div>
            {payment === "Cash" && (
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Tendered</label>
                <Input type="number" value={tendered} onChange={(e) => setTendered(Number(e.target.value))} />
              </div>
            )}
          </div>
          <div className="mt-5 pt-4 border-t space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatRs(subtotal)}</span></div>
            {discounts.enabled && discount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>− {formatRs(discount)}</span></div>}
            <div className="flex justify-between text-xl font-bold pt-2 border-t"><span>Total</span><span>{formatRs(total)}</span></div>
            {payment === "Cash" && tendered > 0 && (
              <div className="flex justify-between text-success-strong font-medium"><span>Change due</span><span>{formatRs(change)}</span></div>
            )}
          </div>
          <Button className="w-full mt-5 h-12 text-base" onClick={complete}>
            <CheckCircle2 className="h-5 w-5 mr-2" /> Complete sale
          </Button>
          <p className="text-xs text-muted-foreground text-center mt-3">Selling price only. No cost or profit shown here.</p>
        </Card>
      </div>

      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader data-print="hide"><DialogTitle>Sale complete</DialogTitle></DialogHeader>
          {lastSale && (
            <div data-print="only" className="max-h-[60vh] overflow-y-auto">
              <ReceiptView data={lastSale} settings={settings} />
            </div>
          )}
          <DialogFooter data-print="hide" className="!justify-between">
            <Button variant="outline" onClick={() => setReceiptOpen(false)}>New sale</Button>
            <Button onClick={() => { window.print(); }}>Print receipt</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}