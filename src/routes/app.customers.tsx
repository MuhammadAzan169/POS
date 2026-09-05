import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  useStore,
  formatRs,
  todayISO,
  customerBalance,
  totalOutstanding,
  totalAdvances,
  customerLedger,
  linkedSupplier,
  businessDayOf,
  shortDay,
  type Customer,
  type CustomerPayment,
  type SettledMethod,
} from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { StatCard, StatusPill } from "@/components/Stat";
import { MobileCards, ListCard, TableWrap } from "@/components/DataList";
import { CustomerPaymentDialog } from "@/components/CustomerPaymentDialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { LedgerTable } from "@/components/LedgerTable";
import { SetOffDialog } from "@/components/SetOffDialog";
import { AdjustBalanceDialog } from "@/components/AdjustBalanceDialog";
import {
  Plus,
  Search,
  Download,
  Users,
  Wallet,
  HandCoins,
  Pencil,
  Phone,
  AlertTriangle,
  Trash2,
  PiggyBank,
  ArrowLeftRight,
  Scale,
} from "lucide-react";
import { Confirm } from "@/components/Confirm";
import { downloadCsv } from "@/lib/export";
import { toast } from "sonner";

export const Route = createFileRoute("/app/customers")({ component: CustomersPage });

const EMPTY = {
  name: "",
  contact: "",
  phone: "",
  address: "",
  notes: "",
  kind: "wholesale" as Customer["kind"],
  creditLimit: 0,
  /** "" means this customer is not also one of your suppliers. */
  linkedSupplierId: "",
};

function CustomersPage() {
  const {
    user,
    customers,
    customerPayments,
    sales,
    shops,
    settings,
    pendingMigration,
    suppliers,
    purchases,
    supplierPayments,
    returns,
    setOffs,
    adjustments,
    addCustomer,
    updateCustomer,
    addCustomerPayment,
    updateCustomerPayment,
    deleteCustomerPayment,
  } = useStore();
  const isAdmin = user?.role === "admin";
  const currency = settings.currency;

  /**
   * Without the tables, a customer added here would exist in this browser only —
   * and any credit recorded against them would disappear on reload, losing the
   * record of a real debt. Refusing up front beats losing the money.
   */
  const cannotSave = Boolean(pendingMigration?.includes("customers"));

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "owing" | "advance" | "wholesale">("all");
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [payFor, setPayFor] = useState<Customer | null>(null);
  /** Set when the payment dialog is correcting a receipt rather than taking one. */
  const [payEditing, setPayEditing] = useState<CustomerPayment | null>(null);
  const [pay, setPay] = useState({
    amount: 0,
    method: "Cash" as SettledMethod,
    note: "",
    shopId: "",
  });

  /**
   * Everything a balance is derived from.
   *
   * Purchases and supplier payments are in here because a set-off reduces what
   * a customer owes, and the ledger helpers need both sides of the partner to
   * work out how much could be cancelled.
   */
  const ledger = useMemo(
    () => ({ sales, customerPayments, purchases, supplierPayments, returns, setOffs, adjustments }),
    [sales, customerPayments, purchases, supplierPayments, returns, setOffs, adjustments],
  );

  /** The partner whose two balances are being cancelled against each other. */
  const [settleFor, setSettleFor] = useState<Customer | null>(null);
  /** The customer whose balance the owner is moving by hand. */
  const [adjustFor, setAdjustFor] = useState<Customer | null>(null);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (
      customers
        .map((c) => ({ customer: c, balance: customerBalance(c, ledger) }))
        .filter((r) =>
          term
            ? r.customer.name.toLowerCase().includes(term) ||
              r.customer.contact.toLowerCase().includes(term) ||
              r.customer.phone.includes(term)
            : true,
        )
        .filter((r) =>
          filter === "owing"
            ? r.balance.outstanding > 0
            : filter === "advance"
              ? r.balance.advance > 0
              : filter === "wholesale"
                ? r.customer.kind === "wholesale"
                : true,
        )
        // Whoever owes the most comes first — that's the list you act on.
        .sort(
          (a, b) =>
            b.balance.outstanding - a.balance.outstanding ||
            a.customer.name.localeCompare(b.customer.name),
        )
    );
  }, [customers, ledger, q, filter]);

  const owed = useMemo(() => totalOutstanding(customers, ledger), [customers, ledger]);
  // Money in the business that belongs to somebody else until they collect the
  // goods. Worth its own tile: it flatters the cash position if you forget it.
  const advances = useMemo(() => totalAdvances(customers, ledger), [customers, ledger]);
  const owingCount = rows.filter((r) => r.balance.outstanding > 0).length;
  const overLimit = useMemo(
    () => customers.filter((c) => customerBalance(c, ledger).overLimit).length,
    [customers, ledger],
  );

  const selected = detail ? customers.find((c) => c.id === detail) : null;
  const selectedBalance = selected ? customerBalance(selected, ledger) : null;
  const selectedEntries = selected ? customerLedger(selected, ledger) : [];
  /** The supplier record for the same business, when they sit on both sides. */
  const selectedPartner = selected ? linkedSupplier(selected, suppliers) : undefined;
  const history = useMemo(() => {
    if (!selected) return { orders: [], payments: [] };
    return {
      orders: sales
        .filter((s) => s.customerId === selected.id)
        .sort((a, b) => b.date.localeCompare(a.date)),
      payments: customerPayments
        .filter((p) => p.customerId === selected.id)
        .sort((a, b) => b.date.localeCompare(a.date)),
    };
  }, [selected, sales, customerPayments]);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY);
    setFormOpen(true);
  };
  const openEdit = (c: Customer) => {
    setEditing(c);
    setForm({
      name: c.name,
      contact: c.contact,
      phone: c.phone,
      address: c.address,
      notes: c.notes,
      kind: c.kind,
      creditLimit: c.creditLimit,
      linkedSupplierId: c.linkedSupplierId ?? "",
    });
    setFormOpen(true);
  };

  const save = () => {
    const name = form.name.trim();
    if (!name) {
      toast.error("Customer name required");
      return;
    }
    if (
      customers.some((c) => c.name.toLowerCase() === name.toLowerCase() && c.id !== editing?.id)
    ) {
      toast.error(`“${name}” already exists`);
      return;
    }
    if (form.creditLimit < 0) {
      toast.error("Credit limit can't be negative");
      return;
    }
    // Stored as undefined rather than "" so the column stays null in Postgres
    // and the "is this party linked" check is a simple truthiness test.
    const linkedSupplierId = form.linkedSupplierId || undefined;
    if (editing) {
      updateCustomer({ ...editing, ...form, name, linkedSupplierId });
      toast.success("Customer updated");
    } else {
      addCustomer({ ...form, name, linkedSupplierId, active: true });
      toast.success(`${name} added`);
    }
    setFormOpen(false);
  };

  /**
   * Taking money in from a customer.
   *
   * No longer refused when nothing is outstanding: a trade buyer who hands over
   * a lump sum on the 1st and draws stock against it all month is doing exactly
   * that, and turning them away meant the shop had no way to record real money
   * it had actually received.
   */
  const openPayment = (c: Customer) => {
    const balance = customerBalance(c, ledger);
    setPayEditing(null);
    setPayFor(c);
    // Default to settling the lot; part-payments are the edit, not the norm.
    // With nothing owed it opens blank, because an advance has no obvious size.
    setPay({
      amount: balance.outstanding,
      method: "Cash",
      note: balance.outstanding > 0 ? "" : "Advance against future purchases",
      shopId: user?.shopId ?? shops[0]?.id ?? "",
    });
  };

  /** The same dialog, loaded with a receipt that was already recorded. */
  const openPaymentEdit = (c: Customer, p: CustomerPayment) => {
    setPayEditing(p);
    setPayFor(c);
    setPay({ amount: p.amount, method: p.method, note: p.note, shopId: p.shopId });
  };

  const savePayment = () => {
    if (!payFor) return;
    const balance = customerBalance(payFor, ledger);
    if (pay.amount <= 0) {
      toast.error("Enter an amount");
      return;
    }
    if (!pay.shopId) {
      toast.error("Pick which shop received the money");
      return;
    }
    // Anything over what is owed is an advance rather than an error. When
    // correcting a receipt the amount it already contributes is part of what is
    // settled, so it has to be added back before working out the excess.
    const ceiling = balance.outstanding + (payEditing?.amount ?? 0);
    const advance = Math.max(0, pay.amount - ceiling);
    if (payEditing) {
      updateCustomerPayment({
        ...payEditing,
        amount: pay.amount,
        method: pay.method,
        shopId: pay.shopId,
        note: pay.note.trim(),
      });
      toast.success("Payment corrected");
      setPayFor(null);
      setPayEditing(null);
      return;
    }
    addCustomerPayment({
      customerId: payFor.id,
      date: todayISO(),
      amount: pay.amount,
      method: pay.method,
      shopId: pay.shopId,
      note: pay.note.trim(),
      receivedBy: user?.name ?? "Unknown",
    });
    toast.success(
      advance > 0
        ? `${formatRs(pay.amount, currency)} received — ${formatRs(advance, currency)} held as an advance`
        : `${formatRs(pay.amount, currency)} received from ${payFor.name}`,
    );
    setPayFor(null);
  };

  const exportCsv = () => {
    if (rows.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    downloadCsv(
      `customers-${todayISO()}.csv`,
      [
        "Customer",
        "Contact",
        "Phone",
        "Type",
        "Orders",
        "Lifetime value",
        "On account",
        "Paid",
        "Outstanding",
        "Credit limit",
        "Last purchase",
      ],
      rows.map(({ customer: c, balance: b }) => [
        c.name,
        c.contact,
        c.phone,
        c.kind,
        b.orders,
        b.lifetime,
        b.creditSales,
        b.paid,
        b.outstanding,
        c.creditLimit || "none",
        b.lastPurchase ? businessDayOf({ date: b.lastPurchase }) : "",
      ]),
    );
    toast.success("Customers exported");
  };

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle="Buyers you deal with by name — mostly trade customers who buy in bulk and settle later."
        actions={
          <>
            <Button variant="outline" onClick={exportCsv}>
              <Download className="h-4 w-4 mr-1.5" />
              Export
            </Button>
            <Button onClick={openAdd} disabled={cannotSave}>
              <Plus className="h-4 w-4 mr-1.5" />
              Add customer
            </Button>
          </>
        }
      />

      {cannotSave && (
        <Card className="p-4 mb-4 border-warning/40 bg-warning/10 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-warning-strong" />
          <div className="text-sm">
            <div className="font-medium text-warning-strong">
              Customers are read-only until the database is updated
            </div>
            <p className="text-muted-foreground mt-1">
              Adding a customer or recording a payment now would keep it in this browser only, and
              any credit owed would be lost on reload. Run{" "}
              <code className="px-1 py-0.5 rounded bg-muted font-mono text-xs break-all">
                supabase/migrations/003_customers_and_credit.sql
              </code>{" "}
              in the Supabase SQL Editor, then reload.
            </p>
          </div>
        </Card>
      )}

      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4 mb-4">
        <StatCard
          label="Customers"
          value={String(customers.length)}
          sub={`${customers.filter((c) => c.kind === "wholesale").length} trade buyers`}
          icon={<Users className="h-5 w-5" />}
          tone="primary"
          onClick={() => setFilter("all")}
        />
        <StatCard
          label="Total receivables"
          value={formatRs(owed, currency)}
          sub={`${owingCount} still to pay you`}
          icon={<Wallet className="h-5 w-5" />}
          tone="warning"
          onClick={() => setFilter("owing")}
        />
        <StatCard
          label="Advances held"
          onClick={() => setFilter("advance")}
          value={formatRs(advances, currency)}
          sub={advances > 0 ? "paid ahead, not yet drawn" : "none held"}
          icon={<PiggyBank className="h-5 w-5" />}
          tone={advances > 0 ? "primary" : "default"}
        />
        {isAdmin && (
          <StatCard
            label="Collected"
            to="/app/ledger"
            value={formatRs(
              customerPayments.reduce((a, p) => a + p.amount, 0),
              currency,
            )}
            sub={`all time · ${overLimit} at limit`}
            icon={<HandCoins className="h-5 w-5" />}
            tone="success"
          />
        )}
      </div>

      <Card className="p-3 sm:p-4 mb-4 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
        <div className="space-y-1.5 col-span-2 sm:col-auto">
          <Label className="text-xs">Search</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Name, contact or phone…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9 w-full sm:w-64"
            />
          </div>
        </div>
        <div className="space-y-1.5 col-span-2 sm:col-auto">
          <Label className="text-xs">Show</Label>
          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All customers</SelectItem>
              <SelectItem value="owing">Owing money</SelectItem>
              <SelectItem value="advance">Paid in advance</SelectItem>
              <SelectItem value="wholesale">Trade buyers</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="col-span-2 text-xs text-muted-foreground sm:ml-auto">
          Tap a customer for their full history.
        </p>
      </Card>

      <Card className="overflow-hidden">
        <MobileCards
          items={rows}
          keyOf={(r) => r.customer.id}
          empty="No customers match."
          render={({ customer: c, balance: b }) => (
            <ListCard
              onClick={() => setDetail(c.id)}
              title={c.name}
              subtitle={c.contact || c.phone}
              right={
                b.outstanding > 0
                  ? formatRs(b.outstanding, currency)
                  : b.advance > 0
                    ? formatRs(b.advance, currency)
                    : "Settled"
              }
              rightSub={
                b.outstanding > 0 ? "outstanding" : b.advance > 0 ? "in advance" : "settled"
              }
              badges={
                <>
                  <StatusPill status={c.kind === "wholesale" ? "Trade" : "Retail"} />
                  {b.advance > 0 && <StatusPill status="Advance" />}
                  {b.overLimit && <StatusPill status="OUT" />}
                </>
              }
              fields={[
                { label: "Orders", value: b.orders },
                { label: "Lifetime", value: formatRs(b.lifetime, currency) },
                {
                  label: "Limit",
                  value: c.creditLimit ? formatRs(c.creditLimit, currency) : "none",
                },
              ]}
              actions={
                <>
                  <Button size="sm" variant="outline" onClick={() => openPayment(c)}>
                    <HandCoins className="h-3.5 w-3.5 mr-1.5" />
                    {b.outstanding > 0 ? "Receive" : "Take advance"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openEdit(c)}>
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />
                    Edit
                  </Button>
                </>
              }
            />
          )}
        />
        <TableWrap>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0 z-10">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium text-right">Orders</th>
                <th className="px-4 py-3 font-medium text-right">Lifetime</th>
                <th className="px-4 py-3 font-medium text-right">Outstanding</th>
                <th className="px-4 py-3 font-medium text-right">In advance</th>
                <th className="px-4 py-3 font-medium text-right">Limit</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ customer: c, balance: b }) => (
                <tr
                  key={c.id}
                  className="border-t hover:bg-muted/40 cursor-pointer"
                  onClick={() => setDetail(c.id)}
                >
                  <td className="px-4 py-3 font-medium">
                    {c.name}
                    {b.overLimit && (
                      <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/30">
                        at limit
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <div>{c.contact || "Not given"}</div>
                    {c.phone && <div className="text-xs font-mono">{c.phone}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={c.kind === "wholesale" ? "Trade" : "Retail"} />
                  </td>
                  <td className="px-4 py-3 text-right">{b.orders}</td>
                  <td className="px-4 py-3 text-right">{formatRs(b.lifetime, currency)}</td>
                  <td
                    className={`px-4 py-3 text-right font-semibold ${b.outstanding > 0 ? "text-warning-strong" : "text-muted-foreground"}`}
                  >
                    {b.outstanding > 0 ? formatRs(b.outstanding, currency) : "Settled"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {b.advance > 0 ? (
                      <span className="font-medium text-accent-strong">
                        {formatRs(b.advance, currency)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">None held</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {c.creditLimit ? formatRs(c.creditLimit, currency) : "none"}
                  </td>
                  <td
                    className="px-4 py-3 text-right whitespace-nowrap"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openPayment(c)}
                      title={b.outstanding > 0 ? "Receive payment" : "Take an advance"}
                    >
                      <HandCoins className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    No customers match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableWrap>
      </Card>

      {/* ------------------------------------------------- add / edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit customer" : "Add customer"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Name</Label>
              <Input
                autoFocus
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Bilal Traders"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Contact person</Label>
              <Input
                value={form.contact}
                onChange={(e) => setForm({ ...form, contact: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select
                value={form.kind}
                onValueChange={(v) => setForm({ ...form, kind: v as Customer["kind"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="wholesale">Trade buyer (bulk)</SelectItem>
                  <SelectItem value="retail">Retail customer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Credit limit ({currency})</Label>
              <Input
                type="number"
                min={0}
                value={form.creditLimit || ""}
                placeholder="0 = no limit"
                onChange={(e) =>
                  setForm({ ...form, creditLimit: Math.max(0, Number(e.target.value) || 0) })
                }
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Address</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Notes</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="e.g. Buys every Monday, pays within a week"
              />
            </div>
            {/*
              The same business on both sides of the books.

              Common in trade: he takes stock from you on account and supplies
              you on account. Linking the two records is what lets the app offer
              to cancel the debts against each other instead of two payments
              crossing in opposite directions.
            */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Do you also buy from them?</Label>
              <Select
                value={form.linkedSupplierId || "__none__"}
                onValueChange={(v) =>
                  setForm({ ...form, linkedSupplierId: v === "__none__" ? "" : v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No — they only buy from us</SelectItem>
                  {suppliers.map((sup) => (
                    <SelectItem key={sup.id} value={sup.id}>
                      Yes — they are {sup.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Link them to their supplier record and what they owe you can be cancelled against
                what you owe them, instead of both being paid in full.
              </p>
            </div>
            <p className="sm:col-span-2 text-xs text-muted-foreground">
              A credit limit stops the till putting more on this customer's account once they reach
              it. Leave it at 0 if you don't want a cap.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save}>{editing ? "Save changes" : "Add customer"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ----------------------------------------------- receive payment */}
      <CustomerPaymentDialog
        customer={payFor}
        editing={payEditing}
        onClose={() => {
          setPayFor(null);
          setPayEditing(null);
        }}
      />

      {/* --------------------------------------------------- detail sheet */}
      <Sheet open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selected && selectedBalance && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.name}</SheetTitle>
                <SheetDescription>
                  {[selected.contact, selected.phone, selected.address]
                    .filter(Boolean)
                    .join(" · ") || "No contact details"}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border p-3">
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      {selectedBalance.advance > 0 ? "Advance held" : "Outstanding"}
                    </div>
                    <div
                      className={`font-semibold text-lg mt-1 ${
                        selectedBalance.outstanding > 0
                          ? "text-warning-strong"
                          : selectedBalance.advance > 0
                            ? "text-accent-strong"
                            : ""
                      }`}
                    >
                      {formatRs(selectedBalance.outstanding || selectedBalance.advance, currency)}
                    </div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      Lifetime value
                    </div>
                    <div className="font-semibold text-lg mt-1">
                      {formatRs(selectedBalance.lifetime, currency)}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border p-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Put on account</span>
                    <span>{formatRs(selectedBalance.creditSales, currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Paid back</span>
                    <span>− {formatRs(selectedBalance.paid, currency)}</span>
                  </div>
                  {selectedBalance.setOff > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Set off against what you owe them
                      </span>
                      <span>− {formatRs(selectedBalance.setOff, currency)}</span>
                    </div>
                  )}
                  {selectedBalance.adjusted !== 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {selectedBalance.adjusted < 0
                          ? "Written off / reduced by hand"
                          : "Added by hand"}
                      </span>
                      <span>
                        {selectedBalance.adjusted < 0 ? "− " : "+ "}
                        {formatRs(Math.abs(selectedBalance.adjusted), currency)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between border-t pt-2 font-semibold">
                    <span>
                      {selectedBalance.advance > 0 ? "Advance held for them" : "Still owed"}
                    </span>
                    <span>
                      {formatRs(selectedBalance.outstanding || selectedBalance.advance, currency)}
                    </span>
                  </div>
                  {selected.creditLimit > 0 && (
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Credit limit</span>
                      <span>
                        {formatRs(selected.creditLimit, currency)}
                        {selectedBalance.overLimit ? " — reached" : ""}
                      </span>
                    </div>
                  )}
                </div>

                {selected.notes && (
                  <p className="text-sm text-muted-foreground italic">{selected.notes}</p>
                )}

                {/*
                  They buy from you and you buy from them. Surfaced here because
                  the money that can be cancelled is real money, and nobody
                  thinks to cross-check two tabs to find it.
                */}
                {selectedPartner && (
                  <div className="rounded-lg border border-accent/40 bg-accent/5 p-3 text-sm">
                    <div className="flex items-center gap-2 font-medium">
                      <ArrowLeftRight className="h-4 w-4" />
                      Also a supplier: {selectedPartner.name}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Anything owed in both directions can be cancelled instead of paid twice.
                    </p>
                    <Button
                      size="sm"
                      className="mt-2"
                      onClick={() => {
                        setDetail(null);
                        setSettleFor(selected);
                      }}
                    >
                      Set off the two balances
                    </Button>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={() => {
                      setDetail(null);
                      openPayment(selected);
                    }}
                  >
                    <HandCoins className="h-4 w-4 mr-1.5" />
                    {selectedBalance.outstanding > 0 ? "Receive payment" : "Take an advance"}
                  </Button>
                  {/* Owner-only: writing a debt off is not a decision anyone
                      standing at a till should be able to make. */}
                  {isAdmin && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setDetail(null);
                        setAdjustFor(selected);
                      }}
                      title="Write off, or correct what they owe"
                    >
                      <Scale className="h-4 w-4 mr-1.5" />
                      Adjust
                    </Button>
                  )}
                  {selected.phone && (
                    <Button variant="outline" asChild>
                      <a href={`tel:${selected.phone}`}>
                        <Phone className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                </div>

                {/*
                  The statement, oldest first — the thing you read out when
                  somebody disputes what they owe. Only credit sales appear:
                  a cash sale was never part of the account.
                */}
                <div>
                  <h4 className="font-semibold text-sm mb-2">Account statement</h4>
                  <LedgerTable
                    entries={selectedEntries}
                    debitLabel="Taken on account"
                    creditLabel="Paid / set off"
                    balanceLabel="Receivables"
                    empty="Nothing on account — every purchase was settled at the counter."
                  />
                  {selectedBalance.advance > 0 && (
                    <p className="mt-2 text-xs text-accent-strong">
                      The balance is negative because they have paid ahead:{" "}
                      {formatRs(selectedBalance.advance, currency)} is held against purchases they
                      have yet to make.
                    </p>
                  )}
                </div>

                <div>
                  <h4 className="font-semibold text-sm mb-2">Orders ({history.orders.length})</h4>
                  <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
                    {history.orders.map((s) => (
                      <div
                        key={s.id}
                        className="p-3 flex items-start justify-between gap-3 text-sm"
                      >
                        <div className="min-w-0">
                          <div className="font-mono text-xs">{s.invoice}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {shortDay(businessDayOf(s))} · {s.payment}
                            {s.status === "Returned" && " · returned"}
                          </div>
                        </div>
                        <div className="font-medium shrink-0">{formatRs(s.total, currency)}</div>
                      </div>
                    ))}
                    {history.orders.length === 0 && (
                      <div className="p-6 text-center text-sm text-muted-foreground">
                        No orders yet.
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-sm mb-2">
                    Payments ({history.payments.length})
                  </h4>
                  <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
                    {history.payments.map((p) => (
                      <div
                        key={p.id}
                        className="p-3 flex items-start justify-between gap-2 text-sm"
                      >
                        <div className="min-w-0">
                          <div>
                            {shortDay(p.date)} · {p.method}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5 truncate">
                            {shops.find((s) => s.id === p.shopId)?.name}
                            {p.note ? ` · ${p.note}` : ""}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="font-medium text-success-strong">
                            {formatRs(p.amount, currency)}
                          </span>
                          {/* A receipt entered as 5,000 instead of 500 leaves a
                              debt that looks settled, so it has to be fixable. */}
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label="Correct this payment"
                            disabled={cannotSave}
                            onClick={() => {
                              setDetail(null);
                              openPaymentEdit(selected, p);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Confirm
                            title="Delete this payment?"
                            description={
                              <>
                                {formatRs(p.amount, currency)} goes back onto {selected.name}'s
                                balance as still owed, and leaves that day's cash count. This can't
                                be undone.
                              </>
                            }
                            confirmLabel="Delete payment"
                            destructive
                            disabled={cannotSave}
                            onConfirm={() => {
                              deleteCustomerPayment(p.id);
                              toast.success("Payment deleted");
                            }}
                            trigger={
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label="Delete this payment"
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            }
                          />
                        </div>
                      </div>
                    ))}
                    {history.payments.length === 0 && (
                      <div className="p-6 text-center text-sm text-muted-foreground">
                        No payments recorded.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <SetOffDialog
        customer={settleFor}
        supplier={settleFor ? (linkedSupplier(settleFor, suppliers) ?? null) : null}
        onClose={() => setSettleFor(null)}
      />
      <AdjustBalanceDialog customer={adjustFor} onClose={() => setAdjustFor(null)} />
    </div>
  );
}
