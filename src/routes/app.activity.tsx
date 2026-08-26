import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  useStore, formatRs, shortDay, isRestorable, ENTITY_LABELS,
  type Activity, type ActivityEntity,
} from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { StatCard, StatusPill } from "@/components/Stat";
import { MobileCards, ListCard, TableWrap } from "@/components/DataList";
import { Confirm } from "@/components/Confirm";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  Search, History, Undo2, Trash2, AlertTriangle, MessagesSquare, ShieldCheck, Download,
} from "lucide-react";
import { downloadCsv } from "@/lib/export";
import { toast } from "sonner";

export const Route = createFileRoute("/app/activity")({ component: ActivityPage });

/** How recent counts as "worth looking at now". */
const RECENT_DAYS = 7;

/**
 * What was deleted, by whom, and how to get it back.
 *
 * The gap this fills: a shopkeeper could delete an invoice and the owner would
 * never know. The sale stopped existing — no gap in the numbering anyone would
 * notice, nothing in the day book, and the takings quietly lower. Every route to
 * a deletion now records the whole row before it goes, so this page can both
 * report it and undo it.
 *
 * Admin-only. The point of the page is that somebody is answerable to somebody
 * else; showing it to the person being asked would defeat it.
 */
function ActivityPage() {
  const { user, activity, shops, settings, restoreDeleted, pendingMigration } = useStore();

  const isAdmin = user?.role === "admin";
  const money = (n: number) => formatRs(n, settings.currency);

  const [q, setQ] = useState("");
  const [entity, setEntity] = useState<"all" | ActivityEntity>("all");
  const [who, setWho] = useState<"all" | "shop" | "admin">("all");
  const [detail, setDetail] = useState<Activity | null>(null);

  /**
   * Without the table nothing has been recorded, so the page would report a
   * clean history that simply is not true. Saying so is the honest answer.
   */
  const unavailable = Boolean(pendingMigration?.includes("activity_log"));

  const shopName = (id?: string) => (id ? shops.find((s) => s.id === id)?.name ?? "a shop" : "Head office");

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return activity
      .filter((a) => (entity === "all" ? true : a.entity === entity))
      .filter((a) => (who === "all" ? true : a.byRole === who))
      .filter((a) =>
        term
          ? a.label.toLowerCase().includes(term) ||
            a.byName.toLowerCase().includes(term) ||
            ENTITY_LABELS[a.entity].includes(term)
          : true,
      )
      .sort((a, b) => b.at.localeCompare(a.at));
  }, [activity, q, entity, who]);

  const stats = useMemo(() => {
    const cutoff = new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString();
    const recent = activity.filter((a) => a.at >= cutoff && a.action === "deleted");
    return {
      recent: recent.length,
      // What the deletions were worth, which is the figure that decides whether
      // this is housekeeping or something to ask about.
      recentValue: recent.reduce((t, a) => t + a.amount, 0),
      byShops: recent.filter((a) => a.byRole === "shop").length,
      awaiting: activity.filter(isRestorable).length,
    };
  }, [activity]);

  const exportCsv = () => {
    if (rows.length === 0) { toast.error("Nothing to export"); return; }
    downloadCsv(
      `activity-${new Date().toISOString().slice(0, 10)}.csv`,
      ["When", "Action", "Record", "Reference", "Amount", "Shop", "By", "Role", "Put back"],
      rows.map((a) => [
        a.at, a.action, ENTITY_LABELS[a.entity], a.label, a.amount,
        shopName(a.shopId), a.byName, a.byRole, a.restoredAt ?? "",
      ]),
    );
    toast.success("Activity exported");
  };

  const restore = (a: Activity) => {
    const ok = restoreDeleted(a.id);
    if (ok) {
      toast.success(`${a.label} put back exactly as it was`);
      setDetail(null);
    } else {
      // The usual cause is that the same record already exists again.
      toast.error("That record could not be put back — it may already be there");
    }
  };

  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="Activity" subtitle="What was deleted, and by whom." />
        <Card className="p-10 text-center text-sm text-muted-foreground">
          Admins only.
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Activity"
        subtitle="Every deleted invoice, bill and payment — who removed it, and a way to put it back."
        actions={
          <Button variant="outline" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-1.5" />Export
          </Button>
        }
      />

      {unavailable && (
        <Card className="p-4 mb-4 border-warning/40 bg-warning/10 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-warning-strong" />
          <div className="text-sm">
            <div className="font-medium text-warning-strong">Nothing is being recorded yet</div>
            <p className="text-muted-foreground mt-1">
              This page is empty because the history table does not exist — not because nothing has been
              deleted. Run{" "}
              <code className="px-1 py-0.5 rounded bg-muted font-mono text-xs break-all">
                supabase/migrations/007_activity_log.sql
              </code>{" "}
              in the Supabase SQL Editor, then reload. Deletions from before that point cannot be recovered.
            </p>
          </div>
        </Card>
      )}

      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4 mb-4">
        <StatCard
          label={`Deleted in ${RECENT_DAYS} days`}
          value={String(stats.recent)}
          sub={stats.recent > 0 ? `worth ${money(stats.recentValue)}` : "nothing removed"}
          icon={<Trash2 className="h-5 w-5" />}
          tone={stats.recent > 0 ? "warning" : "default"}
        />
        <StatCard
          label="By shop staff"
          value={String(stats.byShops)}
          sub={stats.byShops > 0 ? "worth asking about" : "none"}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone={stats.byShops > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Can be put back"
          value={String(stats.awaiting)}
          sub={stats.awaiting > 0 ? "still recoverable" : "nothing pending"}
          icon={<Undo2 className="h-5 w-5" />}
          tone={stats.awaiting > 0 ? "primary" : "default"}
        />
        <StatCard
          label="Entries kept"
          value={String(activity.length)}
          sub="most recent 500"
          icon={<History className="h-5 w-5" />}
        />
      </div>

      <Card className="p-3 sm:p-4 mb-4 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
        <div className="space-y-1.5 col-span-2 sm:col-auto">
          <Label className="text-xs">Search</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Invoice, bill or person…"
              className="pl-9 w-full sm:w-60"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Record</Label>
          <Select value={entity} onValueChange={(v) => setEntity(v as typeof entity)}>
            <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everything</SelectItem>
              {(Object.keys(ENTITY_LABELS) as ActivityEntity[]).map((k) => (
                <SelectItem key={k} value={k} className="capitalize">{ENTITY_LABELS[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Done by</Label>
          <Select value={who} onValueChange={(v) => setWho(v as typeof who)}>
            <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Anyone</SelectItem>
              <SelectItem value="shop">Shop staff</SelectItem>
              <SelectItem value="admin">You</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="col-span-2 text-xs text-muted-foreground sm:ml-auto">
          Tap an entry to see the whole record as it was.
        </p>
      </Card>

      <Card className="overflow-hidden">
        <MobileCards
          items={rows}
          keyOf={(a) => a.id}
          empty={unavailable ? "Nothing recorded yet." : "Nothing has been deleted."}
          render={(a) => (
            <ListCard
              onClick={() => setDetail(a)}
              title={<span className="font-mono">{a.label}</span>}
              subtitle={`${ENTITY_LABELS[a.entity]} · ${shortDay(a.at.slice(0, 10))}`}
              right={money(a.amount)}
              badges={
                <>
                  <StatusPill status={a.restoredAt ? "Put back" : "Deleted"} />
                  {a.byRole === "shop" && <StatusPill status="By shop" />}
                </>
              }
              fields={[
                { label: "By", value: a.byName || "Not recorded" },
                { label: "Shop", value: shopName(a.shopId) },
              ]}
              actions={
                isRestorable(a) ? (
                  <Confirm
                    title={`Put ${a.label} back?`}
                    description={restoreWarning(a, ENTITY_LABELS[a.entity])}
                    confirmLabel="Put it back"
                    onConfirm={() => restore(a)}
                    trigger={
                      <Button size="sm" variant="outline">
                        <Undo2 className="h-3.5 w-3.5 mr-1.5" />Restore
                      </Button>
                    }
                  />
                ) : null
              }
            />
          )}
        />
        <TableWrap>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0 z-10">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">What</th>
                <th className="px-4 py-3 font-medium">Reference</th>
                <th className="px-4 py-3 font-medium">Shop</th>
                <th className="px-4 py-3 font-medium">By</th>
                <th className="px-4 py-3 font-medium text-right">Value</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr
                  key={a.id}
                  className="border-t hover:bg-muted/40 cursor-pointer"
                  onClick={() => setDetail(a)}
                >
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    <div>{shortDay(a.at.slice(0, 10))}</div>
                    <div className="text-xs">{new Date(a.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</div>
                  </td>
                  <td className="px-4 py-3 capitalize">{ENTITY_LABELS[a.entity]}</td>
                  <td className="px-4 py-3 font-mono text-xs">{a.label || "Not recorded"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{shopName(a.shopId)}</td>
                  <td className="px-4 py-3">
                    {a.byName || "Not recorded"}
                    {a.byRole === "shop" && (
                      <span className="ml-1.5 text-xs px-1.5 py-0.5 bg-muted rounded-full">shop</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{money(a.amount)}</td>
                  <td className="px-4 py-3">
                    <StatusPill status={a.restoredAt ? "Put back" : "Deleted"} />
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    {isRestorable(a) ? (
                      <Confirm
                        title={`Put ${a.label} back?`}
                        description={restoreWarning(a, ENTITY_LABELS[a.entity])}
                        confirmLabel="Put it back"
                        onConfirm={() => restore(a)}
                        trigger={
                          <Button size="sm" variant="ghost" aria-label={`Restore ${a.label}`}>
                            <Undo2 className="h-3.5 w-3.5" />
                          </Button>
                        }
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {a.restoredAt ? "Already back" : "Not recoverable"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  {unavailable ? "Nothing recorded yet." : "Nothing has been deleted."}
                </td></tr>
              )}
            </tbody>
          </table>
        </TableWrap>
      </Card>

      {/* ------------------------------------------------ the record itself */}
      <Sheet open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {detail && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <History className="h-4 w-4 text-muted-foreground" />
                  {detail.label}
                </SheetTitle>
                <SheetDescription className="capitalize">
                  {ENTITY_LABELS[detail.entity]} · {detail.action}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-5">
                <div className="rounded-lg border p-3 space-y-2 text-sm">
                  <Row label="Removed by" value={`${detail.byName} (${detail.byRole === "admin" ? "owner" : "shop staff"})`} />
                  <Row label="When" value={new Date(detail.at).toLocaleString()} />
                  <Row label="Shop" value={shopName(detail.shopId)} />
                  <Row label="Value" value={money(detail.amount)} />
                  {detail.restoredAt && (
                    <Row
                      label="Put back"
                      value={`${new Date(detail.restoredAt).toLocaleString()} by ${detail.restoredBy ?? "someone"}`}
                    />
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {isRestorable(detail) && (
                    <Confirm
                      title={`Put ${detail.label} back?`}
                      description={restoreWarning(detail, ENTITY_LABELS[detail.entity])}
                      confirmLabel="Put it back"
                      onConfirm={() => restore(detail)}
                      trigger={
                        <Button size="sm">
                          <Undo2 className="h-3.5 w-3.5 mr-1.5" />Put it back
                        </Button>
                      }
                    />
                  )}
                  {/* The other half of the answer: sometimes the right move is
                      not to undo it but to ask why it happened. */}
                  {detail.byRole === "shop" && detail.shopId && (
                    <Button size="sm" variant="outline" asChild>
                      <Link to="/app/messages">
                        <MessagesSquare className="h-3.5 w-3.5 mr-1.5" />
                        Ask {shopName(detail.shopId)}
                      </Link>
                    </Button>
                  )}
                </div>

                {/*
                  The whole row as it stood. Shown raw rather than prettified:
                  this is the evidence, and a formatted summary would be one
                  more place for the display to disagree with the record.
                */}
                <section>
                  <h4 className="font-semibold text-sm mb-2 flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    The record as it was
                  </h4>
                  <pre className="rounded-lg border bg-muted/30 p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all">
                    {JSON.stringify(detail.snapshot, null, 2)}
                  </pre>
                </section>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/**
 * What putting this record back will actually do.
 *
 * Restoring is not always harmless — a sale takes stock off the shelf again,
 * a bill puts it back on — so the confirmation names the side effect rather
 * than asking "are you sure?" about an unspecified thing.
 */
function restoreWarning(a: Activity, label: string) {
  const effects: Partial<Record<ActivityEntity, string>> = {
    sale: "The invoice comes back with its original number, and the items come off the shelf again.",
    purchase: "The bill comes back, and the stock it delivered goes back onto the shelf.",
    return: "The return comes back, and the stock moves again the way it did originally.",
    transfer: "The movement comes back, and the stock moves between the two shops again.",
    "day-session": "The trading day comes back, along with its cash count.",
  };
  const effect = effects[a.entity] ?? `The ${label} comes back and the balance it affected moves with it.`;
  return `${effect} Everything is restored under its original id, so nothing is renumbered.`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right font-medium break-words">{value}</span>
    </div>
  );
}
