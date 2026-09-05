import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  useStore,
  formatRs,
  todayISO,
  shortDay,
  customerLedger,
  supplierLedger,
  partyPositions,
  openBills,
  type Customer,
  type PartyPosition,
  type Supplier,
  type SupplierPayment,
} from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { StatCard, StatusPill } from "@/components/Stat";
import { MobileCards, ListCard, TableWrap } from "@/components/DataList";
import { LedgerTable } from "@/components/LedgerTable";
import { SupplierPaymentDialog } from "@/components/SupplierPaymentDialog";
import { CustomerPaymentDialog } from "@/components/CustomerPaymentDialog";
import { SetOffDialog } from "@/components/SetOffDialog";
import { AdjustBalanceDialog } from "@/components/AdjustBalanceDialog";
import { Confirm } from "@/components/Confirm";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Search,
  Download,
  Wallet,
  HandCoins,
  ArrowLeftRight,
  AlertTriangle,
  Trash2,
  PiggyBank,
  Scale,
} from "lucide-react";
import { downloadCsv } from "@/lib/export";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/app/ledger")({ component: LedgerPage });

/**
 * The money side of every trade relationship, in one place.
 *
 * Until now the two halves of the same story lived apart: what customers owed
 * you was on the Customers tab, what you owed suppliers was nowhere at all, and
 * a partner who sat on both sides appeared twice with nothing connecting the
 * rows. The owner's actual question — "who owes me, who do I owe, and what can
 * simply be cancelled?" — could not be answered from any single screen.
 *
 * Admin-only on purpose. A shopkeeper needs their own shop's credit, which they
 * have on Customers and on the Purchases "Still to pay" tab; the whole-business
 * position across every outlet is the owner's view.
 */
function LedgerPage() {
  const {
    user,
    customers,
    suppliers,
    sales,
    customerPayments,
    purchases,
    supplierPayments,
    returns,
    setOffs,
    adjustments,
    shops,
    settings,
    deleteSetOff,
    deleteSupplierPayment,
    deleteAdjustment,
  } = useStore();

  const isAdmin = user?.role === "admin";
  const currency = settings.currency;
  const money = (n: number) => formatRs(n, currency);

  const [q, setQ] = useState("");
  // Controlled rather than uncontrolled so the summary cards above can open the
  // tab that explains them: a card stating "you owe 84,000" is only half an
  // answer until it puts the list of who behind one click.
  const [tab, setTab] = useState("parties");
  /** The party whose statement is open in the side sheet. */
  const [detail, setDetail] = useState<PartyPosition | null>(null);
  const [payFor, setPayFor] = useState<Supplier | null>(null);
  /** The account money is being collected against — the receivable side's "Pay". */
  const [collectFrom, setCollectFrom] = useState<Customer | null>(null);
  const [payEditing, setPayEditing] = useState<SupplierPayment | null>(null);
  const [settleFor, setSettleFor] = useState<{ customer: Customer; supplier: Supplier } | null>(
    null,
  );
  /** The party whose balance the owner is moving by hand, and which side of it. */
  const [adjustFor, setAdjustFor] = useState<{ customer?: Customer; supplier?: Supplier } | null>(
    null,
  );

  const data = useMemo(
    () => ({ sales, customerPayments, purchases, supplierPayments, returns, setOffs, adjustments }),
    [sales, customerPayments, purchases, supplierPayments, returns, setOffs, adjustments],
  );

  const parties = useMemo(
    () => partyPositions(customers, suppliers, data),
    [customers, suppliers, data],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return parties;
    return parties.filter((p) => p.name.toLowerCase().includes(term));
  }, [parties, q]);

  const totals = useMemo(() => {
    const receivable = parties.reduce((a, p) => a + p.receivable, 0);
    const payable = parties.reduce((a, p) => a + p.payable, 0);
    return {
      receivable,
      payable,
      // What the business is actually worth on credit terms once both
      // directions are taken into account.
      net: receivable - payable,
      advanceHeld: parties.reduce((a, p) => a + p.advanceHeld, 0),
      advancePlaced: parties.reduce((a, p) => a + p.advancePlaced, 0),
      // Money that needs no cheque at all, only an agreement.
      settleable: parties.reduce((a, p) => a + p.settleable, 0),
    };
  }, [parties]);

  const bills = useMemo(() => openBills(data, todayISO()), [data]);
  const overdue = bills.filter((b) => b.overdueDays > 0);

  /**
   * Every sale put on a buyer's account, newest first.
   *
   * The other half of "Credit purchases": that tab shows what the business
   * bought on credit, this one what it sold on credit. Both were only reachable
   * before by opening one party at a time, so "what went out on account this
   * week" was a question the owner could not ask.
   *
   * There is deliberately no per-invoice balance. Receipts are taken against
   * the account as a whole, not against a numbered invoice, so an "owed" column
   * here would be inventing an allocation the business never made — the party's
   * standing balance is shown instead.
   */
  const creditSales = useMemo(
    () =>
      sales
        .filter((s) => s.payment === "Credit" && s.status !== "Returned")
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((sale) => ({
          sale,
          shop: shops.find((sh) => sh.id === sale.shopId),
          position: sale.customerId
            ? parties.find((p) => p.customer?.id === sale.customerId)
            : undefined,
        })),
    [sales, shops, parties],
  );
  const creditSalesTotal = creditSales.reduce((a, r) => a + r.sale.total, 0);

  // The two directions named the way the owner asks for them. `receivable` is
  // only ever the customer side of a party and `payable` only the supplier
  // side, so these filters are exact — no party lands in the wrong list.
  const toCollect = useMemo(() => parties.filter((p) => p.receivable > 0), [parties]);
  const toPay = useMemo(() => parties.filter((p) => p.payable > 0), [parties]);

  const setOffRows = useMemo(
    () =>
      [...setOffs]
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((x) => ({
          setOff: x,
          customer: customers.find((c) => c.id === x.customerId),
          supplier: suppliers.find((s) => s.id === x.supplierId),
        })),
    [setOffs, customers, suppliers],
  );

  const payments = useMemo(
    () =>
      [...supplierPayments]
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((p) => ({ payment: p, supplier: suppliers.find((s) => s.id === p.supplierId) })),
    [supplierPayments, suppliers],
  );

  /**
   * Every hand-made change to a balance, newest first.
   *
   * Worth its own tab rather than being buried in each party's statement: these
   * are the only figures in the app with no document behind them, so they are
   * the ones somebody will want to audit as a list.
   */
  const adjustmentRows = useMemo(
    () =>
      [...adjustments]
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((a) => ({
          adjustment: a,
          party: a.customerId
            ? customers.find((c) => c.id === a.customerId)
            : suppliers.find((sp) => sp.id === a.supplierId),
          side: a.customerId ? "customer" : "supplier",
        })),
    [adjustments, customers, suppliers],
  );

  const writtenOff = adjustments.filter((a) => a.amount < 0).reduce((t, a) => t + -a.amount, 0);

  /* ------------------------------------------------------------- detail */

  const detailCustomer = detail?.customer ?? null;
  const detailSupplier = detail?.supplier ?? null;
  const detailCustomerEntries = detailCustomer ? customerLedger(detailCustomer, data) : [];
  const detailSupplierEntries = detailSupplier ? supplierLedger(detailSupplier, data) : [];

  /* -------------------------------------------------------------- export */

  const exportParties = () => {
    if (parties.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    downloadCsv(
      `ledgers-${todayISO()}.csv`,
      [
        "Party",
        "Receivables",
        "Payables",
        "Can be set off",
        "Net",
        "Advance held",
        "Advance placed",
        "Both sides",
      ],
      parties.map((p) => [
        p.name,
        p.receivable,
        p.payable,
        p.settleable,
        p.net,
        p.advanceHeld,
        p.advancePlaced,
        p.customer && p.supplier ? "yes" : "no",
      ]),
    );
    toast.success("Ledgers exported");
  };

  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="Ledgers" subtitle="Who owes you, and who you owe." />
        <Card className="p-10 text-center text-sm text-muted-foreground">
          Admins only. Your own shop&apos;s credit is on the{" "}
          <span className="font-medium">Customers</span> tab, and what you still owe suppliers is
          under <span className="font-medium">Purchases → Still to pay</span>.
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Ledgers"
        subtitle="Everyone you deal with on credit, in both directions — customers, vendors, and the ones who are both."
        actions={
          <Button variant="outline" onClick={exportParties}>
            <Download className="h-4 w-4 mr-1.5" />
            Export
          </Button>
        }
      />

      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4 mb-4">
        <StatCard
          onClick={() => setTab("receivable")}
          label="Receivables"
          value={money(totals.receivable)}
          sub="across every customer"
          icon={<HandCoins className="h-5 w-5" />}
          tone="warning"
        />
        <StatCard
          onClick={() => setTab("payable")}
          label="Payables"
          value={money(totals.payable)}
          sub={
            overdue.length > 0
              ? `${overdue.length} bill${overdue.length === 1 ? "" : "s"} overdue`
              : "nothing overdue"
          }
          icon={<Wallet className="h-5 w-5" />}
          tone={overdue.length > 0 ? "warning" : "default"}
        />
        <StatCard
          onClick={() => setTab("parties")}
          label="Net position"
          value={money(Math.abs(totals.net))}
          sub={totals.net >= 0 ? "in your favour" : "against you"}
          icon={<Scale className="h-5 w-5" />}
          tone={totals.net >= 0 ? "success" : "warning"}
        />
        <StatCard
          onClick={() => setTab("parties")}
          label="Can be set off"
          value={money(totals.settleable)}
          sub={totals.settleable > 0 ? "no money need change hands" : "no mutual debts"}
          icon={<ArrowLeftRight className="h-5 w-5" />}
          tone={totals.settleable > 0 ? "primary" : "default"}
        />
      </div>

      {/*
        The headline finding, stated rather than left to be worked out: money
        owed in both directions with the same person cancels, and until the app
        said so it was two debts nobody thought to compare.
      */}
      {totals.settleable > 0 && (
        <Card className="p-4 mb-4 border-accent/40 bg-accent/5 flex items-start gap-3">
          <ArrowLeftRight className="h-4 w-4 mt-0.5 shrink-0 text-accent-strong" />
          <div className="text-sm">
            <div className="font-medium">
              {money(totals.settleable)} is owed in both directions and could simply be cancelled
            </div>
            <p className="text-muted-foreground mt-1">
              {parties
                .filter((p) => p.settleable > 0)
                .map((p) => p.name)
                .join(", ")}{" "}
              both buy from you and sell to you. Open one below and record a set-off — both balances
              come down together and only the difference is left to settle.
            </p>
          </div>
        </Card>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="parties">Everyone ({parties.length})</TabsTrigger>
          <TabsTrigger value="receivable">
            Customers to collect from ({toCollect.length})
          </TabsTrigger>
          <TabsTrigger value="payable">Suppliers to pay ({toPay.length})</TabsTrigger>
          <TabsTrigger value="creditsales">Credit sales ({creditSales.length})</TabsTrigger>
          <TabsTrigger value="bills">Credit purchases ({bills.length})</TabsTrigger>
          <TabsTrigger value="payments">Payments out ({payments.length})</TabsTrigger>
          <TabsTrigger value="setoffs">Set-offs ({setOffRows.length})</TabsTrigger>
          <TabsTrigger value="adjustments">Adjustments ({adjustmentRows.length})</TabsTrigger>
        </TabsList>

        {/* ------------------------------------------------------ parties */}
        {(["parties", "receivable", "payable"] as const).map((pane) => (
          <TabsContent key={pane} value={pane} className="mt-4">
            {/*
              Each direction says what it is in words before it shows a table.
              "Receivable" and "payable" are the accountant's names for these;
              the owner's question is "who still has to pay me" and "who am I
              behind with", so that is what the heading answers.
            */}
            {pane !== "parties" && (
              <Card
                className={cn(
                  "p-4 mb-4 flex flex-wrap items-center justify-between gap-3",
                  pane === "receivable"
                    ? "border-warning/40 bg-warning/5"
                    : "border-destructive/30 bg-destructive/5",
                )}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
                      pane === "receivable"
                        ? "bg-warning/20 text-warning-strong"
                        : "bg-destructive/15 text-destructive",
                    )}
                  >
                    {pane === "receivable" ? (
                      <HandCoins className="h-5 w-5" />
                    ) : (
                      <Wallet className="h-5 w-5" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">
                      {pane === "receivable"
                        ? "Customers who still have to pay me"
                        : "Suppliers I still have to pay"}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5 max-w-prose">
                      {pane === "receivable"
                        ? `${toCollect.length} account${toCollect.length === 1 ? "" : "s"} with money outstanding. Open one to see every invoice and receipt behind the figure, then record what comes in on the Customers page.`
                        : `${toPay.length} supplier${toPay.length === 1 ? " has" : "s have"} money still on their bills${overdue.length > 0 ? `, ${overdue.length} of which ${overdue.length === 1 ? "is" : "are"} past the agreed date` : ""}. Open one to see the bills, or use Pay to record a payment.`}
                    </p>
                  </div>
                </div>
                <div
                  className={cn(
                    "font-display text-2xl font-bold tabular-nums",
                    pane === "receivable" ? "text-warning-strong" : "text-destructive",
                  )}
                >
                  {money(pane === "receivable" ? totals.receivable : totals.payable)}
                </div>
              </Card>
            )}

            <Card className="p-3 sm:p-4 mb-4 flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Search</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="Party name…"
                    className="pl-9 w-full sm:w-64"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground sm:ml-auto">
                Tap a party for their full statement, both directions.
              </p>
            </Card>

            <PartyList
              parties={filtered.filter((p) =>
                pane === "receivable"
                  ? p.receivable > 0
                  : pane === "payable"
                    ? p.payable > 0
                    : true,
              )}
              currency={currency}
              onOpen={setDetail}
              onPay={(sup) => {
                setPayEditing(null);
                setPayFor(sup);
              }}
              onReceive={setCollectFrom}
              onSettle={(c, sup) => setSettleFor({ customer: c, supplier: sup })}
            />
          </TabsContent>
        ))}

        {/* ------------------------------------------------ credit sales */}
        <TabsContent value="creditsales" className="mt-4">
          <Card className="p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-sm">Sold on account</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Every invoice handed over without payment, across all shops. Receipts are taken
                against the account rather than a single invoice, so the balance shown is the
                customer's whole position.
              </p>
            </div>
            <div className="font-display text-2xl font-bold text-warning-strong tabular-nums">
              {money(creditSalesTotal)}
            </div>
          </Card>

          <Card className="overflow-hidden">
            <MobileCards
              items={creditSales}
              keyOf={(r) => r.sale.id}
              empty="Nothing has been sold on credit."
              render={(r) => (
                <ListCard
                  title={<span className="font-mono">{r.sale.invoice}</span>}
                  subtitle={`${r.sale.customer} · ${shortDay(r.sale.date)}`}
                  right={money(r.sale.total)}
                  rightSub="on account"
                  fields={[
                    { label: "Shop", value: r.shop?.name ?? "—" },
                    { label: "Items", value: String(r.sale.lines.length) },
                    {
                      label: "They now owe",
                      value: r.position ? money(r.position.receivable) : "—",
                    },
                  ]}
                />
              )}
            />
            <TableWrap>
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0 z-10">
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Invoice</th>
                    <th className="px-4 py-3 font-medium">Customer</th>
                    <th className="px-4 py-3 font-medium">Shop</th>
                    <th className="px-4 py-3 font-medium">Dated</th>
                    <th className="px-4 py-3 font-medium text-right">Items</th>
                    <th className="px-4 py-3 font-medium text-right">On account</th>
                    <th className="px-4 py-3 font-medium text-right">They now owe</th>
                    <th className="px-4 py-3 font-medium text-right">Collect</th>
                  </tr>
                </thead>
                <tbody>
                  {creditSales.map((r) => (
                    <tr
                      key={r.sale.id}
                      className={cn("border-t", r.position && "hover:bg-muted/40 cursor-pointer")}
                      onClick={() => r.position && setDetail(r.position)}
                    >
                      <td className="px-4 py-3 font-mono text-xs">{r.sale.invoice}</td>
                      <td className="px-4 py-3">{r.sale.customer}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.shop?.name ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{shortDay(r.sale.date)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {r.sale.lines.length}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{money(r.sale.total)}</td>
                      <td className="px-4 py-3 text-right text-warning-strong">
                        {r.position ? money(r.position.receivable) : "—"}
                      </td>
                      <td
                        className="px-4 py-3 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {r.position?.customer && r.position.receivable > 0 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-warning-strong hover:text-warning-strong"
                            onClick={() => setCollectFrom(r.position!.customer!)}
                            title={`Record money received from ${r.sale.customer}`}
                          >
                            <HandCoins className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {creditSales.length === 0 && (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-4 py-12 text-center text-sm text-muted-foreground"
                      >
                        Nothing has been sold on credit.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </TableWrap>
          </Card>
        </TabsContent>

        {/* --------------------------------------------- credit purchases */}
        <TabsContent value="bills" className="mt-4">
          {overdue.length > 0 && (
            <Card className="p-4 mb-4 border-destructive/40 bg-destructive/5 flex items-start gap-3">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
              <div className="text-sm">
                <div className="font-medium text-destructive">
                  {overdue.length} bill{overdue.length === 1 ? " is" : "s are"} past the date you
                  agreed
                </div>
                <p className="text-muted-foreground mt-1">
                  {money(overdue.reduce((a, b) => a + b.balance, 0))} in total, the oldest{" "}
                  {Math.max(...overdue.map((b) => b.overdueDays))} days over.
                </p>
              </div>
            </Card>
          )}

          <Card className="overflow-hidden">
            <MobileCards
              items={bills}
              keyOf={(b) => b.purchase.id}
              empty="Every bill is settled."
              render={(b) => (
                <ListCard
                  title={<span className="font-mono">{b.purchase.billNo}</span>}
                  subtitle={`${b.purchase.supplier} · ${b.purchase.date}`}
                  right={money(b.balance)}
                  rightSub="still owed"
                  badges={
                    <>
                      <StatusPill status={b.status} />
                      {b.overdueDays > 0 && <StatusPill status="Overdue" />}
                    </>
                  }
                  fields={[
                    { label: "Bill total", value: money(b.purchase.total) },
                    { label: "Paid", value: money(b.paid) },
                    { label: "Due", value: b.purchase.dueDate || "No date agreed" },
                  ]}
                />
              )}
            />
            <TableWrap>
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0 z-10">
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Bill</th>
                    <th className="px-4 py-3 font-medium">Supplier</th>
                    <th className="px-4 py-3 font-medium">Dated</th>
                    <th className="px-4 py-3 font-medium">Due</th>
                    <th className="px-4 py-3 font-medium text-right">Total</th>
                    <th className="px-4 py-3 font-medium text-right">Paid</th>
                    <th className="px-4 py-3 font-medium text-right">Owed</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map((b) => (
                    <tr key={b.purchase.id} className="border-t hover:bg-muted/40">
                      <td className="px-4 py-3 font-mono text-xs">{b.purchase.billNo}</td>
                      <td className="px-4 py-3">{b.purchase.supplier}</td>
                      <td className="px-4 py-3 text-muted-foreground">{b.purchase.date}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {b.purchase.dueDate || "No date agreed"}
                        {b.overdueDays > 0 && (
                          <span className="ml-1.5 text-xs text-destructive">
                            {b.overdueDays}d over
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">{money(b.purchase.total)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {money(b.paid)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-warning-strong">
                        {money(b.balance)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={b.overdueDays > 0 ? "Overdue" : b.status} />
                      </td>
                    </tr>
                  ))}
                  {bills.length === 0 && (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-4 py-12 text-center text-sm text-muted-foreground"
                      >
                        Every bill is settled.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </TableWrap>
          </Card>
        </TabsContent>

        {/* ----------------------------------------------- payments out */}
        <TabsContent value="payments" className="mt-4">
          <Card className="overflow-hidden">
            <MobileCards
              items={payments}
              keyOf={(r) => r.payment.id}
              empty="No payments to suppliers recorded yet."
              render={({ payment: p, supplier }) => (
                <ListCard
                  title={supplier?.name ?? "Unknown supplier"}
                  subtitle={`${p.date} · ${p.method}`}
                  right={money(p.amount)}
                  fields={[
                    {
                      label: "Paid from",
                      value: p.shopId
                        ? (shops.find((s) => s.id === p.shopId)?.name ?? "a shop")
                        : "Head office",
                    },
                    { label: "Recorded by", value: p.paidBy || "Not recorded" },
                    { label: "Note", value: p.note || "None" },
                  ]}
                />
              )}
            />
            <TableWrap>
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0 z-10">
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Supplier</th>
                    <th className="px-4 py-3 font-medium">Method</th>
                    <th className="px-4 py-3 font-medium">Paid from</th>
                    <th className="px-4 py-3 font-medium">Note</th>
                    <th className="px-4 py-3 font-medium text-right">Amount</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map(({ payment: p, supplier }) => (
                    <tr key={p.id} className="border-t hover:bg-muted/40">
                      <td className="px-4 py-3 text-muted-foreground">{shortDay(p.date)}</td>
                      <td className="px-4 py-3 font-medium">{supplier?.name ?? "Unknown"}</td>
                      <td className="px-4 py-3">
                        <StatusPill status={p.method} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {p.shopId
                          ? (shops.find((s) => s.id === p.shopId)?.name ?? "a shop")
                          : "Head office"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{p.note || "No note"}</td>
                      <td className="px-4 py-3 text-right font-medium">{money(p.amount)}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Confirm
                          title="Delete this payment?"
                          description={`${money(p.amount)} paid on ${p.date} will be removed, and what you owe ${
                            supplier?.name ?? "this supplier"
                          } goes back up by that much.`}
                          confirmLabel="Delete payment"
                          destructive
                          onConfirm={() => {
                            deleteSupplierPayment(p.id);
                            toast.success("Payment deleted");
                          }}
                          trigger={
                            <Button size="sm" variant="ghost" aria-label="Delete this payment">
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          }
                        />
                      </td>
                    </tr>
                  ))}
                  {payments.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-12 text-center text-sm text-muted-foreground"
                      >
                        No payments to suppliers recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </TableWrap>
          </Card>
        </TabsContent>

        {/* -------------------------------------------------- set-offs */}
        <TabsContent value="setoffs" className="mt-4">
          <Card className="p-4 mb-4 text-sm text-muted-foreground">
            A set-off cancels what someone owes you against what you owe them. No money moves, so
            nothing here touches a till or a day&apos;s cash count — only the two balances come down
            together.
          </Card>

          <Card className="overflow-hidden">
            <MobileCards
              items={setOffRows}
              keyOf={(r) => r.setOff.id}
              empty="No set-offs recorded."
              render={({ setOff: x, customer, supplier }) => (
                <ListCard
                  title={customer?.name ?? "Unknown"}
                  subtitle={`${x.date} · against ${supplier?.name ?? "unknown supplier"}`}
                  right={money(x.amount)}
                  fields={[
                    { label: "Recorded by", value: x.createdBy || "Not recorded" },
                    { label: "Note", value: x.note || "None" },
                  ]}
                />
              )}
            />
            <TableWrap>
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0 z-10">
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Party</th>
                    <th className="px-4 py-3 font-medium">Against</th>
                    <th className="px-4 py-3 font-medium">Note</th>
                    <th className="px-4 py-3 font-medium">Recorded by</th>
                    <th className="px-4 py-3 font-medium text-right">Cancelled</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {setOffRows.map(({ setOff: x, customer, supplier }) => (
                    <tr key={x.id} className="border-t hover:bg-muted/40">
                      <td className="px-4 py-3 text-muted-foreground">{shortDay(x.date)}</td>
                      <td className="px-4 py-3 font-medium">{customer?.name ?? "Unknown"}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {supplier?.name ?? "Unknown"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{x.note || "No note"}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {x.createdBy || "Not recorded"}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{money(x.amount)}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Confirm
                          title="Undo this set-off?"
                          description={`Both balances go back up by ${money(x.amount)}: ${
                            customer?.name ?? "the customer"
                          } will owe you that much again, and you will owe ${supplier?.name ?? "the supplier"} the same.`}
                          confirmLabel="Undo set-off"
                          destructive
                          onConfirm={() => {
                            deleteSetOff(x.id);
                            toast.success("Set-off undone");
                          }}
                          trigger={
                            <Button size="sm" variant="ghost" aria-label="Undo this set-off">
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          }
                        />
                      </td>
                    </tr>
                  ))}
                  {setOffRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-12 text-center text-sm text-muted-foreground"
                      >
                        No set-offs recorded.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </TableWrap>
          </Card>
        </TabsContent>
        {/* ---------------------------------------------- adjustments */}
        <TabsContent value="adjustments" className="mt-4">
          <Card className="p-4 mb-4 text-sm text-muted-foreground">
            The only figures in the app with no invoice or bill behind them: a debt written off, a
            balance carried in from before you started, or a correction you agreed. No money moves,
            so nothing here touches a till or a day&apos;s cash count. Undo one and the balance goes
            back exactly as it was.
            {writtenOff > 0 && (
              <span className="mt-2 block font-medium text-foreground">
                {money(writtenOff)} has been written off in total.
              </span>
            )}
          </Card>

          <Card className="overflow-hidden">
            <MobileCards
              items={adjustmentRows}
              keyOf={(r) => r.adjustment.id}
              empty="No balances have been adjusted by hand."
              render={({ adjustment: a, party, side }) => (
                <ListCard
                  title={party?.name ?? "Unknown"}
                  subtitle={`${a.date} · ${side === "customer" ? "what they owe you" : "what you owe them"}`}
                  right={`${a.amount < 0 ? "−" : "+"} ${money(Math.abs(a.amount))}`}
                  badges={[
                    <StatusPill key="k" status={a.amount < 0 ? "Written off" : "Increased"} />,
                  ]}
                  fields={[
                    { label: "Reason", value: a.reason || "Not given" },
                    { label: "Recorded by", value: a.createdBy || "Not recorded" },
                  ]}
                />
              )}
            />
            <TableWrap>
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0 z-10">
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Party</th>
                    <th className="px-4 py-3 font-medium">Side</th>
                    <th className="px-4 py-3 font-medium">Reason</th>
                    <th className="px-4 py-3 font-medium">Recorded by</th>
                    <th className="px-4 py-3 font-medium text-right">Change</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {adjustmentRows.map(({ adjustment: a, party, side }) => (
                    <tr key={a.id} className="border-t hover:bg-muted/40">
                      <td className="px-4 py-3 text-muted-foreground">{shortDay(a.date)}</td>
                      <td className="px-4 py-3 font-medium">{party?.name ?? "Unknown"}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {side === "customer" ? "Receivables" : "Payables"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{a.reason || "Not given"}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {a.createdBy || "Not recorded"}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-medium ${a.amount < 0 ? "text-success-strong" : "text-warning-strong"}`}
                      >
                        {a.amount < 0 ? "−" : "+"} {money(Math.abs(a.amount))}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Confirm
                          title="Undo this adjustment?"
                          description={`${money(Math.abs(a.amount))} goes back onto ${
                            party?.name ?? "this party"
                          }'s balance, exactly as it was before.`}
                          confirmLabel="Undo adjustment"
                          destructive
                          onConfirm={() => {
                            deleteAdjustment(a.id);
                            toast.success("Adjustment undone");
                          }}
                          trigger={
                            <Button size="sm" variant="ghost" aria-label="Undo this adjustment">
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          }
                        />
                      </td>
                    </tr>
                  ))}
                  {adjustmentRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-12 text-center text-sm text-muted-foreground"
                      >
                        No balances have been adjusted by hand.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </TableWrap>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ---------------------------------------------------- statement */}
      <Sheet open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {detail && (
            <>
              <SheetHeader>
                <SheetTitle>{detail.name}</SheetTitle>
                <SheetDescription>
                  {detail.customer && detail.supplier
                    ? "Buys from you and sells to you — both statements below."
                    : detail.customer
                      ? "A customer. Everything they have taken on account."
                      : "A supplier. Everything they have billed you."}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border p-3">
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      Receivables
                    </div>
                    <div
                      className={`font-semibold text-lg mt-1 ${detail.receivable > 0 ? "text-warning-strong" : ""}`}
                    >
                      {money(detail.receivable)}
                    </div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      Payables
                    </div>
                    <div
                      className={`font-semibold text-lg mt-1 ${detail.payable > 0 ? "text-destructive" : ""}`}
                    >
                      {money(detail.payable)}
                    </div>
                  </div>
                </div>

                {(detail.advanceHeld > 0 || detail.advancePlaced > 0) && (
                  <div className="rounded-lg border p-3 text-sm space-y-1.5">
                    {detail.advanceHeld > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <PiggyBank className="h-3.5 w-3.5" />
                          Advance you are holding for them
                        </span>
                        <span className="font-medium">{money(detail.advanceHeld)}</span>
                      </div>
                    )}
                    {detail.advancePlaced > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <PiggyBank className="h-3.5 w-3.5" />
                          Advance you have placed with them
                        </span>
                        <span className="font-medium">{money(detail.advancePlaced)}</span>
                      </div>
                    )}
                  </div>
                )}

                {/*
                  The number the owner actually acts on: after cancelling what
                  can be cancelled, who writes the cheque and for how much.
                */}
                {detail.settleable > 0 && (
                  <div className="rounded-lg border border-accent/40 bg-accent/5 p-3 text-sm">
                    <div className="font-medium flex items-center gap-2">
                      <ArrowLeftRight className="h-4 w-4" />
                      {money(detail.settleable)} can be cancelled
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {detail.net > 0
                        ? `Afterwards they would still owe you ${money(detail.net)}.`
                        : detail.net < 0
                          ? `Afterwards you would still owe them ${money(-detail.net)}.`
                          : "Afterwards both sides would be square."}
                    </p>
                    <Button
                      size="sm"
                      className="mt-2"
                      onClick={() => {
                        if (detail.customer && detail.supplier) {
                          setDetail(null);
                          setSettleFor({ customer: detail.customer, supplier: detail.supplier });
                        }
                      }}
                    >
                      Record set-off
                    </Button>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {detail.supplier && (
                    <Button
                      size="sm"
                      onClick={() => {
                        const sup = detail.supplier!;
                        setDetail(null);
                        setPayEditing(null);
                        setPayFor(sup);
                      }}
                    >
                      <Wallet className="h-3.5 w-3.5 mr-1.5" />
                      Pay them
                    </Button>
                  )}
                  {detail.customer && detail.receivable > 0 && (
                    <Button
                      size="sm"
                      onClick={() => {
                        const c = detail.customer!;
                        setDetail(null);
                        setCollectFrom(c);
                      }}
                    >
                      <HandCoins className="h-3.5 w-3.5 mr-1.5" />
                      Receive payment
                    </Button>
                  )}
                  {/* A party on both sides gets a button per side: the two
                      balances are separate debts and are written off separately. */}
                  {detail.customer && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const c = detail.customer!;
                        setDetail(null);
                        setAdjustFor({ customer: c });
                      }}
                    >
                      <Scale className="h-3.5 w-3.5 mr-1.5" />
                      {detail.supplier ? "Adjust what they owe" : "Adjust balance"}
                    </Button>
                  )}
                  {detail.supplier && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const sup = detail.supplier!;
                        setDetail(null);
                        setAdjustFor({ supplier: sup });
                      }}
                    >
                      <Scale className="h-3.5 w-3.5 mr-1.5" />
                      {detail.customer ? "Adjust what you owe" : "Adjust balance"}
                    </Button>
                  )}
                </div>

                {detailCustomer && (
                  <section>
                    <h4 className="font-semibold text-sm mb-2">
                      As a customer — what they have taken
                    </h4>
                    <LedgerTable
                      entries={detailCustomerEntries}
                      debitLabel="Taken on account"
                      creditLabel="Paid / set off"
                      balanceLabel="Receivables"
                      empty="Nothing on account."
                    />
                  </section>
                )}

                {detailSupplier && (
                  <section>
                    <h4 className="font-semibold text-sm mb-2">
                      As a supplier — what they have billed
                    </h4>
                    <LedgerTable
                      entries={detailSupplierEntries}
                      debitLabel="Billed"
                      creditLabel="Paid / credited"
                      balanceLabel="Payables"
                      empty="No bills recorded."
                    />
                  </section>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <CustomerPaymentDialog customer={collectFrom} onClose={() => setCollectFrom(null)} />

      <SupplierPaymentDialog
        supplier={payFor}
        editing={payEditing}
        onClose={() => {
          setPayFor(null);
          setPayEditing(null);
        }}
      />
      <SetOffDialog
        customer={settleFor?.customer ?? null}
        supplier={settleFor?.supplier ?? null}
        onClose={() => setSettleFor(null)}
      />
      <AdjustBalanceDialog
        customer={adjustFor?.customer ?? null}
        supplier={adjustFor?.supplier ?? null}
        onClose={() => setAdjustFor(null)}
      />
    </div>
  );
}

/**
 * The party list, shared by the three balance tabs.
 *
 * One component rather than three copies of the same table: the tabs differ
 * only in which rows they are given, and a column added to one of them should
 * never be missing from the other two.
 */
function PartyList({
  parties,
  currency,
  onOpen,
  onPay,
  onReceive,
  onSettle,
}: {
  parties: PartyPosition[];
  currency: string;
  onOpen: (p: PartyPosition) => void;
  onPay: (s: Supplier) => void;
  onReceive: (c: Customer) => void;
  onSettle: (c: Customer, s: Supplier) => void;
}) {
  const money = (n: number) => formatRs(n, currency);

  return (
    <Card className="overflow-hidden">
      <MobileCards
        items={parties}
        keyOf={(p) => `${p.customer?.id ?? ""}-${p.supplier?.id ?? ""}`}
        empty="Nobody has anything outstanding."
        render={(p) => (
          <ListCard
            onClick={() => onOpen(p)}
            title={p.name}
            subtitle={
              p.customer && p.supplier
                ? "Buys from you and sells to you"
                : p.customer
                  ? "Customer"
                  : "Supplier"
            }
            right={money(Math.abs(p.net))}
            rightSub={p.net > 0 ? "owed to you" : p.net < 0 ? "you owe" : "square"}
            badges={
              <>
                {p.receivable > 0 && <StatusPill status="Receivables" />}
                {p.payable > 0 && <StatusPill status="Payables" />}
                {p.settleable > 0 && <StatusPill status="Settled" />}
              </>
            }
            fields={[
              { label: "Receivables", value: money(p.receivable) },
              { label: "Payables", value: money(p.payable) },
              {
                label: "Can cancel",
                value: p.settleable > 0 ? money(p.settleable) : "Nothing to cancel",
              },
            ]}
            actions={
              <>
                {/* One button per direction the money can move, shown only when
                    there is money to move that way. */}
                {p.customer && p.receivable > 0 && (
                  <Button size="sm" onClick={() => onReceive(p.customer!)}>
                    <HandCoins className="h-3.5 w-3.5 mr-1.5" />
                    Receive
                  </Button>
                )}
                {p.supplier && (
                  <Button size="sm" variant="outline" onClick={() => onPay(p.supplier!)}>
                    <Wallet className="h-3.5 w-3.5 mr-1.5" />
                    Pay
                  </Button>
                )}
                {p.customer && p.supplier && p.settleable > 0 && (
                  <Button size="sm" onClick={() => onSettle(p.customer!, p.supplier!)}>
                    <ArrowLeftRight className="h-3.5 w-3.5 mr-1.5" />
                    Set off
                  </Button>
                )}
              </>
            }
          />
        )}
      />
      <TableWrap>
        <table className="w-full text-sm">
          <thead className="bg-muted/50 sticky top-0 z-10">
            <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3 font-medium">Party</th>
              <th className="px-4 py-3 font-medium">Relationship</th>
              <th className="px-4 py-3 font-medium text-right">Receivables</th>
              <th className="px-4 py-3 font-medium text-right">Payables</th>
              <th className="px-4 py-3 font-medium text-right">Can be set off</th>
              <th className="px-4 py-3 font-medium text-right">Net</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {parties.map((p) => (
              <tr
                key={`${p.customer?.id ?? ""}-${p.supplier?.id ?? ""}`}
                className="border-t hover:bg-muted/40 cursor-pointer"
                onClick={() => onOpen(p)}
              >
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {p.customer && p.supplier ? (
                    <span className="inline-flex items-center gap-1.5">
                      <ArrowLeftRight className="h-3.5 w-3.5" />
                      Both ways
                    </span>
                  ) : p.customer ? (
                    "Customer"
                  ) : (
                    "Supplier"
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {p.receivable > 0 ? (
                    <span className="font-medium text-warning-strong">{money(p.receivable)}</span>
                  ) : p.advanceHeld > 0 ? (
                    <span className="text-accent-strong">{money(p.advanceHeld)} in advance</span>
                  ) : (
                    <span className="text-muted-foreground">Nothing owed</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {p.payable > 0 ? (
                    <span className="font-medium text-destructive">{money(p.payable)}</span>
                  ) : p.advancePlaced > 0 ? (
                    <span className="text-accent-strong">{money(p.advancePlaced)} ahead</span>
                  ) : (
                    <span className="text-muted-foreground">Nothing owed</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {p.settleable > 0 ? (
                    <span className="font-medium text-accent-strong">{money(p.settleable)}</span>
                  ) : (
                    <span className="text-muted-foreground">Nothing to cancel</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-semibold">
                  {p.net === 0 ? (
                    <span className="text-muted-foreground">Square</span>
                  ) : (
                    <>
                      {money(Math.abs(p.net))}
                      <div className="text-xs font-normal text-muted-foreground">
                        {p.net > 0 ? "to you" : "from you"}
                      </div>
                    </>
                  )}
                </td>
                <td
                  className="px-4 py-3 text-right whitespace-nowrap"
                  onClick={(e) => e.stopPropagation()}
                >
                  {p.customer && p.receivable > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-warning-strong hover:text-warning-strong"
                      onClick={() => onReceive(p.customer!)}
                      title="Record money received from them"
                    >
                      <HandCoins className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {p.supplier && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onPay(p.supplier!)}
                      title="Record a payment"
                    >
                      <Wallet className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {p.customer && p.supplier && p.settleable > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onSettle(p.customer!, p.supplier!)}
                      title="Cancel the two debts against each other"
                    >
                      <ArrowLeftRight className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {parties.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  Nobody has anything outstanding.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableWrap>
    </Card>
  );
}
