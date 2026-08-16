import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  useStore,
  formatRs,
  carryForwardCash,
  openSessionFor,
  sessionsFor,
  todayISO,
  summarizeSession,
  shortDay,
  type DaySession,
} from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { StatCard, StatusPill } from "@/components/Stat";
import { MobileCards, ListCard, TableWrap } from "@/components/DataList";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
  Sunrise,
  Moon,
  Wallet,
  Banknote,
  CreditCard,
  Smartphone,
  Download,
  AlertTriangle,
  HandCoins,
  Pencil,
  Trash2,
  RotateCcw,
  Phone,
  CheckCircle2,
} from "lucide-react";
import { Confirm } from "@/components/Confirm";
import { downloadCsv } from "@/lib/export";
import { toast } from "sonner";

export const Route = createFileRoute("/app/daybook")({ component: DayBookPage });

/** Times are what matter here — a session can open one date and close on the next. */
const at = (iso?: string) =>
  iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—";

const timeOnly = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "—";

function DayBookPage() {
  const {
    user, shops, users, sales, expenses, returns, customerPayments, daySessions,
    openDay, closeDay, updateDaySession, reopenDay, deleteDaySession, settings, pendingMigration,
  } = useStore();
  const isAdmin = user?.role === "admin";

  /**
   * Without the `day_sessions` table a started day would live in memory only:
   * it would look fine, then vanish on reload taking the cash count with it.
   * Better to refuse up front than to lose an evening's takings silently.
   */
  const cannotSave = Boolean(pendingMigration?.includes("day_sessions"));

  // Admins pick a shop; shopkeepers only ever see their own.
  const [shopPick, setShopPick] = useState<string>(user?.shopId ?? shops[0]?.id ?? "");
  const shopId = isAdmin ? shopPick : user?.shopId ?? "";
  const shop = shops.find((s) => s.id === shopId);

  const [openDialog, setOpenDialog] = useState(false);
  const [closeDialog, setCloseDialog] = useState(false);
  const [openingCash, setOpeningCash] = useState(0);
  const [counted, setCounted] = useState(0);
  const [taken, setTaken] = useState(0);
  const [notes, setNotes] = useState("");

  const active = openSessionFor(daySessions, shopId);
  const history = useMemo(() => (shopId ? sessionsFor(daySessions, shopId) : []), [daySessions, shopId]);

  const data = useMemo(
    () => ({ sales, expenses, returns, customerPayments }),
    [sales, expenses, returns, customerPayments],
  );
  const live = active ? summarizeSession(active, data) : null;

  /** Every closed session across every shop — the owner's cash-handover ledger. */
  const allClosed = useMemo(
    () =>
      daySessions
        .filter((s) => s.status === "closed")
        .sort((a, b) => b.businessDate.localeCompare(a.businessDate))
        .map((s) => ({ session: s, cash: summarizeSession(s, data), shop: shops.find((x) => x.id === s.shopId) })),
    [daySessions, data, shops],
  );

  const startDay = () => {
    if (!shopId) { toast.error("Pick a shop first"); return; }
    const created = openDay({ shopId, openingCash, openedBy: user?.name ?? "Unknown" });
    if (!created) { toast.error("A day is already open for this shop"); return; }
    toast.success(`Day started for ${shop?.name} — opening cash ${formatRs(openingCash, settings.currency)}`);
    setOpenDialog(false);
  };

  const beginClose = () => {
    if (!live) return;
    // Pre-fill with the drawer as it should stand, so an honest till is one tap
    // to close and a discrepancy is something you have to type in deliberately.
    setCounted(live.expectedCash);
    setTaken(Math.max(0, live.expectedCash - 5000));
    setNotes("");
    setCloseDialog(true);
  };

  const leftBehind = Math.max(0, counted - taken);
  const variance = live ? counted - live.expectedCash : 0;

  const endDay = () => {
    if (!active || !live) return;
    if (counted < 0 || taken < 0) { toast.error("Cash amounts can't be negative"); return; }
    if (taken > counted) { toast.error("The owner can't take more than was counted"); return; }
    closeDay({
      sessionId: active.id,
      countedCash: counted,
      cashTakenByOwner: taken,
      cashLeftInShop: leftBehind,
      closedBy: user?.name ?? "Unknown",
      notes: notes.trim(),
    });
    toast.success(
      `Day closed. ${formatRs(taken, settings.currency)} handed over, ${formatRs(leftBehind, settings.currency)} left for tomorrow.`,
    );
    setCloseDialog(false);
  };

  /* ------------------------------------------------- corrections */

  const [editing, setEditing] = useState<DaySession | null>(null);
  const [editForm, setEditForm] = useState({ openingCash: 0, countedCash: 0, taken: 0, notes: "" });

  const beginEdit = (s: DaySession) => {
    setEditing(s);
    setEditForm({
      openingCash: s.openingCash,
      countedCash: s.countedCash ?? 0,
      taken: s.cashTakenByOwner ?? 0,
      notes: s.notes ?? "",
    });
  };

  const saveEdit = () => {
    if (!editing) return;
    const wasClosed = editing.status === "closed";
    if (editForm.openingCash < 0 || editForm.countedCash < 0 || editForm.taken < 0) {
      toast.error("Cash amounts can't be negative");
      return;
    }
    if (wasClosed && editForm.taken > editForm.countedCash) {
      toast.error("The owner can't take more than was counted");
      return;
    }
    updateDaySession({
      ...editing,
      openingCash: editForm.openingCash,
      notes: editForm.notes.trim() || undefined,
      // An open day has no count yet, so those three fields stay untouched
      // rather than being written as zeros.
      ...(wasClosed
        ? {
            countedCash: editForm.countedCash,
            cashTakenByOwner: editForm.taken,
            cashLeftInShop: Math.max(0, editForm.countedCash - editForm.taken),
          }
        : {}),
    });
    toast.success("Day book entry corrected");
    setEditing(null);
  };

  const reopen = (s: DaySession) => {
    if (reopenDay(s.id)) {
      toast.success(`${shortDay(s.businessDate)} is open again — remember to end it tonight.`);
      return;
    }
    toast.error("Another day is already open at this shop — end that one first.");
  };

  const removeSession = (s: DaySession) => {
    if (deleteDaySession(s.id)) {
      toast.success(`${shortDay(s.businessDate)} removed from the day book`);
      return;
    }
    toast.error("Sales, expenses or payments are booked to this day — it can't be deleted.");
  };

  /* --------------------------------------------- who has started today */

  /**
   * The owner's morning check: which shops have actually opened the till today.
   * Without it, a shop that forgets to start the day quietly books its takings
   * against the calendar date and nobody notices until the cash doesn't match.
   */
  const today = todayISO();
  const shopStatus = useMemo(
    () =>
      shops
        .filter((s) => s.active)
        .map((s) => ({
          shop: s,
          open: openSessionFor(daySessions, s.id),
          todays: daySessions.find((x) => x.shopId === s.id && x.businessDate === today),
          last: sessionsFor(daySessions, s.id)[0],
          keepers: users.filter((u) => u.shopId === s.id && u.active),
        })),
    [shops, daySessions, users, today],
  );
  const notStarted = shopStatus.filter((s) => !s.todays);

  const exportSessions = () => {
    const rows = isAdmin ? allClosed : history.filter((s) => s.status === "closed").map((s) => ({
      session: s, cash: summarizeSession(s, data), shop,
    }));
    if (rows.length === 0) { toast.error("No closed days to export"); return; }
    downloadCsv(
      `day-book-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Trading day", "Shop", "Opened", "Closed", "Opening cash", "Cash sales", "Card sales", "Online sales",
        "Credit sales", "Collected on credit", "Total sales", "Invoices", "Refunds", "Expenses",
        "Expected cash", "Counted cash", "Variance", "Owner took", "Left in shop", ...(isAdmin ? ["Profit"] : [])],
      rows.map(({ session: s, cash: c, shop: sh }) => [
        s.businessDate, sh?.name ?? "", at(s.openedAt), at(s.closedAt),
        c.openingCash, c.cashSales, c.cardSales, c.onlineSales, c.creditSales, c.creditCollected,
        c.totalSales, c.invoices, c.refunds, c.drawerExpenses, c.expectedCash, c.countedCash ?? "", c.variance ?? "",
        c.cashTakenByOwner, c.cashLeftInShop, ...(isAdmin ? [c.profit] : []),
      ]),
    );
    toast.success("Day book exported");
  };

  return (
    <div>
      <PageHeader
        title="Day book"
        subtitle="Start the day when you open, end it when you lock up — even if that's after midnight. Sales count towards the day you opened."
        actions={
          <>
            <Button variant="outline" onClick={exportSessions}><Download className="h-4 w-4 mr-1.5" />Export</Button>
            {active ? (
              <Button onClick={beginClose} disabled={cannotSave}><Moon className="h-4 w-4 mr-1.5" />End day</Button>
            ) : (
              <Button
                onClick={() => { setOpeningCash(carryForwardCash(daySessions, shopId)); setOpenDialog(true); }}
                disabled={!shopId || cannotSave}
              >
                <Sunrise className="h-4 w-4 mr-1.5" />Start day
              </Button>
            )}
          </>
        }
      />

      {cannotSave && (
        <Card className="p-4 mb-4 border-warning/40 bg-warning/10 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-warning-strong" />
          <div className="text-sm">
            <div className="font-medium text-warning-strong">Day book is read-only until the database is updated</div>
            <p className="text-muted-foreground mt-1">
              Starting a day now would keep it in this browser only and lose it — along with the cash
              count — the moment the page reloads. Run{" "}
              <code className="px-1 py-0.5 rounded bg-muted font-mono text-xs break-all">
                supabase/migrations/002_day_book_and_wholesale.sql
              </code>{" "}
              in the Supabase SQL Editor, then reload.
            </p>
          </div>
        </Card>
      )}

      {isAdmin && (
        <Card className="p-3 sm:p-4 mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="space-y-1.5">
            <Label className="text-xs">Shop</Label>
            <Select value={shopPick} onValueChange={setShopPick}>
              <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="Pick a shop" /></SelectTrigger>
              <SelectContent>
                {shops.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground sm:ml-auto">
            You can start or end a day on a shop's behalf — useful when a shopkeeper forgets to close.
          </p>
        </Card>
      )}

      {/*
        The owner's morning check. A shop that never starts its day still sells —
        the till just falls back to the calendar date — so nothing breaks loudly
        and nobody finds out until the cash handed over doesn't match the sheet.
        This names the shops that haven't opened, and who to ring about it.
      */}
      {isAdmin && (
        <Card className="mb-4 overflow-hidden">
          <div className="px-4 sm:px-5 py-3.5 border-b flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">Day started today · {shortDay(today)}</h3>
            <span
              className={`text-xs font-medium px-2.5 py-1 rounded-full border ${
                notStarted.length === 0
                  ? "bg-success/10 text-success-strong border-success/30"
                  : "bg-warning/15 text-warning-strong border-warning/40"
              }`}
            >
              {notStarted.length === 0
                ? "All shops have started"
                : `${notStarted.length} of ${shopStatus.length} not started`}
            </span>
          </div>
          <ul className="divide-y">
            {shopStatus.map(({ shop: sh, open, todays, last, keepers }) => (
              <li key={sh.id} className="px-4 sm:px-5 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {open ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-success-strong" />
                  ) : todays ? (
                    <Moon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 shrink-0 text-warning-strong" />
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{sh.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {open
                        ? `Trading since ${timeOnly(open.openedAt)} · opened by ${open.openedBy}`
                        : todays
                          ? `Started and already closed · ${timeOnly(todays.openedAt)} → ${timeOnly(todays.closedAt)}`
                          : last
                            ? `Not started — last traded ${shortDay(last.businessDate)}`
                            : "Not started — no trading day recorded yet"}
                    </div>
                  </div>
                </div>

                {/* Who to chase, and the number to chase them on. */}
                {!todays && (
                  <div className="text-xs text-muted-foreground min-w-0">
                    {keepers.length > 0 ? keepers.map((k) => k.name).join(", ") : "No shopkeeper assigned"}
                    {sh.phone && (
                      <a
                        href={`tel:${sh.phone}`}
                        className="ml-2 inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <Phone className="h-3 w-3" />
                        {sh.phone}
                      </a>
                    )}
                  </div>
                )}

                {!todays && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={cannotSave}
                    onClick={() => {
                      setShopPick(sh.id);
                      setOpeningCash(carryForwardCash(daySessions, sh.id));
                      setOpenDialog(true);
                    }}
                  >
                    <Sunrise className="h-3.5 w-3.5 mr-1.5" />Start for them
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ------------------------------------------------- the live day */}
      {active && live ? (
        <>
          <Card className="p-4 sm:p-5 mb-4 border-success/40 bg-success/5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-success/15 text-success-strong flex items-center justify-center">
                  <Sunrise className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-semibold">
                    Day open · {shortDay(active.businessDate)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {shop?.name} · opened {timeOnly(active.openedAt)} by {active.openedBy}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Sales so far</div>
                  <div className="font-display text-2xl font-bold">{formatRs(live.totalSales, settings.currency)}</div>
                </div>
                {/* The opening float is typed from a drawer count at 8am; getting
                    it wrong throws the evening's variance out by the same amount,
                    so it stays correctable while the day is still running. */}
                <Button variant="outline" size="sm" disabled={cannotSave} onClick={() => beginEdit(active)}>
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />Correct
                </Button>
              </div>
            </div>
          </Card>

          <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <StatCard label="Cash sales" value={formatRs(live.cashSales, settings.currency)} sub={`${live.invoices} invoices total`} icon={<Banknote className="h-5 w-5" />} tone="success" />
            <StatCard label="Card sales" value={formatRs(live.cardSales, settings.currency)} icon={<CreditCard className="h-5 w-5" />} tone="primary" />
            <StatCard label="Online sales" value={formatRs(live.onlineSales, settings.currency)} icon={<Smartphone className="h-5 w-5" />} tone="accent" />
            <StatCard
              label="On credit"
              value={formatRs(live.creditSales, settings.currency)}
              sub="goods out, unpaid"
              icon={<HandCoins className="h-5 w-5" />}
              tone="warning"
            />
            <StatCard label="Cash in drawer" value={formatRs(live.expectedCash, settings.currency)} sub="expected right now" icon={<Wallet className="h-5 w-5" />} tone="warning" />
          </div>

          <Card className="mt-4 p-4 sm:p-5">
            <h3 className="font-semibold mb-3">How the drawer got here</h3>
            <dl className="space-y-2 text-sm max-w-md">
              <Line label="Opening float (left last night)" value={live.openingCash} currency={settings.currency} />
              <Line label="Cash taken from customers" value={live.cashSales} currency={settings.currency} sign="+" />
              <Line label="Cash collected on old credit" value={live.creditCollected} currency={settings.currency} sign="+" />
              <Line label="Refunds paid out" value={-live.refunds} currency={settings.currency} sign="−" />
              <Line label="Expenses paid from the till" value={-live.drawerExpenses} currency={settings.currency} sign="−" />
              <div className="flex justify-between border-t pt-2 font-semibold">
                <dt>Cash that should be in the drawer</dt>
                <dd>{formatRs(live.expectedCash, settings.currency)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
              Card and online takings never touch the drawer, so they are excluded here — they are counted in
              sales, not in cash. Credit sales are excluded for the same reason: the goods went out but no money
              came in, so the till is not short by {formatRs(live.creditSales, settings.currency)} — it is owed.
            </p>
          </Card>
        </>
      ) : (
        <Card className="p-8 sm:p-10 text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
            <Moon className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="font-semibold">No day is open{shop ? ` at ${shop.name}` : ""}</h3>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-md mx-auto">
            Start the day to begin selling. Everything rung up afterwards is booked to today,
            right up until you end the day — even past midnight.
          </p>
          {shopId && (
            <Button
              className="mt-5"
              disabled={cannotSave}
              onClick={() => { setOpeningCash(carryForwardCash(daySessions, shopId)); setOpenDialog(true); }}
            >
              <Sunrise className="h-4 w-4 mr-1.5" />Start day
            </Button>
          )}
        </Card>
      )}

      {/* -------------------------------------------------- past days */}
      <Card className="mt-6 overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 border-b flex items-center justify-between">
          <h3 className="font-semibold">{isAdmin ? "Closed days — all shops" : "Your closed days"}</h3>
          <span className="text-xs text-muted-foreground">
            {(isAdmin ? allClosed : history.filter((s) => s.status === "closed")).length} days
          </span>
        </div>
        <ClosedDays
          rows={
            isAdmin
              ? allClosed
              : history
                  .filter((s) => s.status === "closed")
                  .map((s) => ({ session: s, cash: summarizeSession(s, data), shop }))
          }
          showShop={isAdmin}
          showProfit={isAdmin}
          currency={settings.currency}
          disabled={cannotSave}
          onEdit={beginEdit}
          onReopen={reopen}
          onDelete={removeSession}
        />
      </Card>

      {/* ------------------------------------------------ start-day dialog */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start the day{shop ? ` at ${shop.name}` : ""}</DialogTitle>
            <DialogDescription>
              Count what's already in the drawer before you open. It's pre-filled with what was
              left behind when the last day was closed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Opening cash in drawer ({settings.currency})</Label>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              autoFocus
              value={openingCash}
              onChange={(e) => setOpeningCash(Math.max(0, Number(e.target.value) || 0))}
            />
            <p className="text-xs text-muted-foreground">
              Carried forward from the last close: {formatRs(carryForwardCash(daySessions, shopId), settings.currency)}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(false)}>Cancel</Button>
            <Button onClick={startDay}><Sunrise className="h-4 w-4 mr-1.5" />Start day</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------- end-day dialog */}
      <Dialog open={closeDialog} onOpenChange={setCloseDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>End the day{shop ? ` at ${shop.name}` : ""}</DialogTitle>
            <DialogDescription>
              Count the drawer, then split it: what the owner takes away and what stays as
              tomorrow's float.
            </DialogDescription>
          </DialogHeader>

          {live && (
            <>
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
                <Line label="Opening float" value={live.openingCash} currency={settings.currency} />
                <Line label="Cash sales" value={live.cashSales} currency={settings.currency} sign="+" />
                <Line label="Collected on credit" value={live.creditCollected} currency={settings.currency} sign="+" />
                <Line label="Refunds" value={-live.refunds} currency={settings.currency} sign="−" />
                <Line label="Till expenses" value={-live.drawerExpenses} currency={settings.currency} sign="−" />
                <div className="flex justify-between border-t pt-2 font-semibold">
                  <span>Expected in drawer</span>
                  <span>{formatRs(live.expectedCash, settings.currency)}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground pt-1">
                  <span>Card {formatRs(live.cardSales, settings.currency)}</span>
                  <span>Online {formatRs(live.onlineSales, settings.currency)}</span>
                  <span>{live.invoices} invoices</span>
                </div>
                {live.creditSales > 0 && (
                  <div className="text-xs text-warning-strong border-t border-warning/30 pt-2">
                    {formatRs(live.creditSales, settings.currency)} sold on credit today — not expected in the
                    drawer, it's owed on account.
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Cash actually counted ({settings.currency})</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={counted}
                  onChange={(e) => setCounted(Math.max(0, Number(e.target.value) || 0))}
                />
                {variance !== 0 && (
                  <div className={`flex items-start gap-1.5 text-xs rounded-md p-2 ${
                    variance < 0 ? "bg-destructive/10 text-destructive" : "bg-warning/15 text-warning-strong"
                  }`}>
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>
                      {variance < 0 ? "Short by " : "Over by "}
                      <strong>{formatRs(Math.abs(variance), settings.currency)}</strong>
                      {variance < 0
                        ? " — recount, or note below why the till is light."
                        : " — more cash than the sales account for."}
                    </span>
                  </div>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Owner takes away</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={counted}
                    value={taken}
                    onChange={(e) => setTaken(Math.max(0, Number(e.target.value) || 0))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Left in shop for tomorrow</Label>
                  {/* Derived, not typed: the two halves must add up to the count,
                      and letting both be edited invited them not to. */}
                  <Input readOnly value={leftBehind} className="bg-muted/50" />
                  <p className="text-xs text-muted-foreground">Becomes tomorrow's opening float.</p>
                </div>
              </div>

              {taken > counted && (
                <p className="text-xs text-destructive">The owner can't take more than was counted.</p>
              )}

              <div className="space-y-1.5">
                <Label>Notes (optional)</Label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Rs 500 short — customer change error"
                />
              </div>
            </>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseDialog(false)}>Cancel</Button>
            <Button onClick={endDay} disabled={taken > counted}>
              <Moon className="h-4 w-4 mr-1.5" />Close the day
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------ correction dialog */}
      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Correct {editing ? shortDay(editing.businessDate) : "the day"}
              {editing && shops.find((s) => s.id === editing.shopId)
                ? ` at ${shops.find((s) => s.id === editing.shopId)!.name}`
                : ""}
            </DialogTitle>
            <DialogDescription>
              Figures get mistyped. Fixing them here re-states the day; the sales booked to it are
              untouched.
            </DialogDescription>
          </DialogHeader>

          {editing && (
            <>
              <div className="space-y-1.5">
                <Label>Opening cash in drawer ({settings.currency})</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={editForm.openingCash}
                  onChange={(e) => setEditForm({ ...editForm, openingCash: Math.max(0, Number(e.target.value) || 0) })}
                />
              </div>

              {editing.status === "closed" && (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Cash counted</Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        value={editForm.countedCash}
                        onChange={(e) => setEditForm({ ...editForm, countedCash: Math.max(0, Number(e.target.value) || 0) })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Owner took away</Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        value={editForm.taken}
                        onChange={(e) => setEditForm({ ...editForm, taken: Math.max(0, Number(e.target.value) || 0) })}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground -mt-1">
                    {formatRs(Math.max(0, editForm.countedCash - editForm.taken), settings.currency)} stays
                    behind as the next day's opening float.
                  </p>
                  {editForm.taken > editForm.countedCash && (
                    <p className="text-xs text-destructive">The owner can't take more than was counted.</p>
                  )}
                </>
              )}

              <div className="space-y-1.5">
                <Label>Notes (optional)</Label>
                <Input
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  placeholder="e.g. opening float was typed as 5,000 by mistake"
                />
              </div>
            </>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={editForm.taken > editForm.countedCash && editing?.status === "closed"}>
              Save correction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** One labelled money row in the drawer breakdown. */
function Line({ label, value, currency, sign }: { label: string; value: number; currency: string; sign?: "+" | "−" }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="shrink-0">
        {sign && value !== 0 ? `${sign} ` : ""}
        {formatRs(Math.abs(value), currency)}
      </dd>
    </div>
  );
}

type ClosedRow = { session: DaySession; cash: ReturnType<typeof summarizeSession>; shop?: { name: string } };

function ClosedDays({
  rows,
  showShop,
  showProfit,
  currency,
  disabled,
  onEdit,
  onReopen,
  onDelete,
}: {
  rows: ClosedRow[];
  showShop: boolean;
  showProfit: boolean;
  currency: string;
  disabled: boolean;
  onEdit: (s: DaySession) => void;
  onReopen: (s: DaySession) => void;
  onDelete: (s: DaySession) => void;
}) {
  const varianceTone = (v: number | null) =>
    v === null || v === 0 ? "text-muted-foreground" : v < 0 ? "text-destructive" : "text-warning-strong";

  /**
   * The three ways a closed day gets fixed, shared by the card and table layouts
   * so a phone can do everything a desktop can. `compact` drops the labels down
   * to icons for the table's action column.
   */
  const actions = (s: ClosedRow["session"], compact: boolean) => (
    <>
      <Button
        size="sm"
        variant={compact ? "ghost" : "outline"}
        disabled={disabled}
        onClick={() => onEdit(s)}
        aria-label={compact ? "Correct the cash figures" : undefined}
      >
        <Pencil className={compact ? "h-3.5 w-3.5" : "h-3.5 w-3.5 mr-1.5"} />
        {!compact && "Correct"}
      </Button>
      <Confirm
        title={`Re-open ${shortDay(s.businessDate)}?`}
        description="The cash count recorded at close is cleared, and the shop can ring up sales against this day again. Close it again at the end to settle the drawer."
        confirmLabel="Re-open the day"
        disabled={disabled}
        onConfirm={() => onReopen(s)}
        trigger={
          <Button size="sm" variant={compact ? "ghost" : "outline"} disabled={disabled} aria-label={compact ? "Re-open this day" : undefined}>
            <RotateCcw className={compact ? "h-3.5 w-3.5" : "h-3.5 w-3.5 mr-1.5"} />
            {!compact && "Re-open"}
          </Button>
        }
      />
      <Confirm
        title={`Delete ${shortDay(s.businessDate)}?`}
        description="The day disappears from the day book and from the cash handover history. Only a day with no sales, expenses or payments booked to it can be deleted."
        confirmLabel="Delete the day"
        destructive
        disabled={disabled}
        onConfirm={() => onDelete(s)}
        trigger={
          <Button
            size="sm"
            variant={compact ? "ghost" : "outline"}
            disabled={disabled}
            className="text-muted-foreground hover:text-destructive"
            aria-label={compact ? "Delete this day" : undefined}
          >
            <Trash2 className={compact ? "h-3.5 w-3.5" : "h-3.5 w-3.5 mr-1.5"} />
            {!compact && "Delete"}
          </Button>
        }
      />
    </>
  );

  return (
    <>
      <MobileCards
        items={rows}
        keyOf={(r) => r.session.id}
        empty="No days have been closed yet."
        render={({ session: s, cash: c, shop }) => (
          <ListCard
            title={shortDay(s.businessDate)}
            subtitle={showShop ? shop?.name : `${timeOnly(s.openedAt)} → ${timeOnly(s.closedAt)}`}
            right={formatRs(c.totalSales, currency)}
            rightSub={`${c.invoices} invoices`}
            badges={
              c.variance !== null && c.variance !== 0 ? (
                <StatusPill status={c.variance < 0 ? "OUT" : "LOW"} />
              ) : (
                <StatusPill status="OK" />
              )
            }
            fields={[
              { label: "Cash", value: formatRs(c.cashSales, currency) },
              { label: "Card", value: formatRs(c.cardSales, currency) },
              { label: "Online", value: formatRs(c.onlineSales, currency) },
              { label: "Owner took", value: formatRs(c.cashTakenByOwner, currency), className: "font-medium" },
              { label: "Left in shop", value: formatRs(c.cashLeftInShop, currency) },
              ...(showProfit ? [{ label: "Profit", value: formatRs(c.profit, currency), className: "text-success-strong" }] : []),
            ]}
            actions={actions(s, false)}
          />
        )}
      />
      <TableWrap>
        <table className="w-full text-sm">
          <thead className="bg-muted/50 sticky top-0 z-10">
            <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3 font-medium">Trading day</th>
              {showShop && <th className="px-4 py-3 font-medium">Shop</th>}
              <th className="px-4 py-3 font-medium">Hours</th>
              <th className="px-4 py-3 font-medium text-right">Cash</th>
              <th className="px-4 py-3 font-medium text-right">Card</th>
              <th className="px-4 py-3 font-medium text-right">Online</th>
              <th className="px-4 py-3 font-medium text-right">Credit</th>
              <th className="px-4 py-3 font-medium text-right">Total sales</th>
              {showProfit && <th className="px-4 py-3 font-medium text-right">Profit</th>}
              <th className="px-4 py-3 font-medium text-right">Counted</th>
              <th className="px-4 py-3 font-medium text-right">Over / short</th>
              <th className="px-4 py-3 font-medium text-right">Owner took</th>
              <th className="px-4 py-3 font-medium text-right">Left in shop</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ session: s, cash: c, shop }) => (
              <tr key={s.id} className="border-t hover:bg-muted/40">
                <td className="px-4 py-3 font-medium whitespace-nowrap">{shortDay(s.businessDate)}</td>
                {showShop && <td className="px-4 py-3 text-muted-foreground">{shop?.name ?? "—"}</td>}
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">
                  {timeOnly(s.openedAt)} → {timeOnly(s.closedAt)}
                </td>
                <td className="px-4 py-3 text-right">{formatRs(c.cashSales, currency)}</td>
                <td className="px-4 py-3 text-right">{formatRs(c.cardSales, currency)}</td>
                <td className="px-4 py-3 text-right">{formatRs(c.onlineSales, currency)}</td>
                <td className={`px-4 py-3 text-right ${c.creditSales > 0 ? "text-warning-strong" : "text-muted-foreground"}`}>
                  {c.creditSales > 0 ? formatRs(c.creditSales, currency) : "—"}
                </td>
                <td className="px-4 py-3 text-right font-medium">{formatRs(c.totalSales, currency)}</td>
                {showProfit && <td className="px-4 py-3 text-right text-success-strong font-medium">{formatRs(c.profit, currency)}</td>}
                <td className="px-4 py-3 text-right">{c.countedCash === null ? "—" : formatRs(c.countedCash, currency)}</td>
                <td className={`px-4 py-3 text-right ${varianceTone(c.variance)}`}>
                  {c.variance === null || c.variance === 0 ? "—" : `${c.variance > 0 ? "+" : "−"}${formatRs(Math.abs(c.variance), currency)}`}
                </td>
                <td className="px-4 py-3 text-right font-medium">{formatRs(c.cashTakenByOwner, currency)}</td>
                <td className="px-4 py-3 text-right text-muted-foreground">{formatRs(c.cashLeftInShop, currency)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">{actions(s, true)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              // The column count follows the same two optional columns the header
              // does, or the empty row overhangs the table and breaks its border.
              <tr>
                <td colSpan={12 + (showShop ? 1 : 0) + (showProfit ? 1 : 0)} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No days have been closed yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableWrap>
    </>
  );
}
