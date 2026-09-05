import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore, isUnreadFor, shopKind, type Shop } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/Confirm";
import { cn } from "@/lib/utils";
import {
  Send,
  MessagesSquare,
  ArrowLeft,
  Store,
  Radio,
  AlertTriangle,
  Trash2,
  Check,
  CheckCheck,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/messages")({ component: MessagesPage });

/** Clock time for a bubble; the date itself is carried by the day divider. */
const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/** "Today" / "Yesterday" / a written date, for the divider between days. */
function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (same(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function MessagesPage() {
  const {
    user,
    shops,
    messages,
    sendMessage,
    markThreadRead,
    deleteMessage,
    clearThread,
    usingSupabase,
    pendingMigration,
  } = useStore();
  const isAdmin = user?.role === "admin";

  /**
   * Without the table a message would live in this browser only: the shop would
   * never receive it, and the owner would believe it had been sent. Better to
   * say so plainly than to fake a conversation.
   */
  const cannotSave = Boolean(pendingMigration?.includes("messages"));

  // An owner picks a shop; a shopkeeper only ever has their own thread.
  const [picked, setPicked] = useState<string | null>(null);
  const shopId = isAdmin ? picked : (user?.shopId ?? null);
  const shop = shops.find((s) => s.id === shopId);

  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const thread = useMemo(
    () => (shopId ? messages.filter((m) => m.shopId === shopId) : []),
    [messages, shopId],
  );

  /** Per-shop summary for the owner's thread list. */
  const threads = useMemo(
    () =>
      shops
        .filter((s) => s.active)
        .map((s) => {
          const mine = messages.filter((m) => m.shopId === s.id);
          return {
            shop: s,
            last: mine[mine.length - 1],
            unread: user ? mine.filter((m) => isUnreadFor(m, user.role)).length : 0,
          };
        })
        // Shops waiting on a reply come first, then whoever spoke most recently.
        .sort(
          (a, b) =>
            b.unread - a.unread ||
            (b.last?.createdAt ?? "").localeCompare(a.last?.createdAt ?? "") ||
            a.shop.name.localeCompare(b.shop.name),
        ),
    [shops, messages, user],
  );

  // Opening a thread is what "reading" means, so the receipts go out here rather
  // than behind a button nobody would press.
  useEffect(() => {
    if (shopId) markThreadRead(shopId);
  }, [shopId, messages, markThreadRead]);

  // Stick to the bottom as the conversation grows — including when a message
  // arrives over the socket while you are looking at it.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [thread.length, shopId]);

  const send = () => {
    const body = draft.trim();
    if (!body) return;
    if (!shopId) {
      toast.error("Pick a shop to message");
      return;
    }
    if (cannotSave) {
      toast.error("Messages can't be sent until the database is updated");
      return;
    }
    const sent = sendMessage({ shopId, body });
    if (!sent) {
      toast.error("Could not send that message");
      return;
    }
    setDraft("");
    inputRef.current?.focus();
  };

  const shopLabel = (s: Shop) => `${s.name}${shopKind(s) === "wholesale" ? " · wholesale" : ""}`;

  /**
   * Clears the open conversation.
   *
   * A thread belongs to the shop rather than to either person in it, so this is
   * deliberately not a "delete for me only" — that would leave the two screens
   * telling different stories about what was said. The confirmation says so.
   */
  const deleteChat = () => {
    if (!shopId) return;
    const gone = clearThread(shopId);
    if (gone === 0) {
      toast.info("There's nothing in this conversation yet");
      return;
    }
    toast.success(`Conversation cleared — ${gone} message${gone === 1 ? "" : "s"} deleted`);
    // The owner drops back to the shop list; a shopkeeper has nowhere else to go.
    if (isAdmin) setPicked(null);
  };

  /* ------------------------------------------------------------ the thread */

  const conversation = (
    <Card className="flex flex-col min-h-0 flex-1 overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center gap-3 shrink-0">
        {/* On a phone the list and the conversation are one column, so the
            thread needs its own way back. */}
        {isAdmin && (
          <button
            onClick={() => setPicked(null)}
            aria-label="Back to all shops"
            className="lg:hidden h-9 w-9 -ml-1 shrink-0 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <div className="h-9 w-9 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center">
          <Store className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm truncate">
            {isAdmin ? (shop?.name ?? "Pick a shop") : "Head office"}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {isAdmin
              ? shop
                ? `${shopKind(shop) === "wholesale" ? "Wholesale counter" : "Retail shop"}${shop.phone ? ` · ${shop.phone}` : ""}`
                : "No shop selected"
              : `Messaging the owner as ${shop?.name ?? "your shop"}`}
          </div>
        </div>

        {/* Only offered once there is actually something to clear. */}
        {thread.length > 0 && (
          <Confirm
            title="Delete this conversation?"
            description={
              <>
                All <strong>{thread.length}</strong> message
                {thread.length === 1 ? "" : "s"} between{" "}
                {isAdmin ? <strong>{shop?.name ?? "this shop"}</strong> : "you"} and{" "}
                {isAdmin ? "head office" : "the owner"} are deleted <strong>for both sides</strong>{" "}
                — this is one shared conversation, not two copies. It can't be undone.
              </>
            }
            confirmLabel="Delete conversation"
            destructive
            onConfirm={deleteChat}
            trigger={
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete this conversation"
                title="Delete conversation"
                className="shrink-0 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            }
          />
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-3">
        {thread.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-10">
            <div className="h-11 w-11 rounded-full bg-muted flex items-center justify-center mb-3">
              <MessagesSquare className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No messages yet</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              {isAdmin
                ? "Send an instruction, a price change or a reminder — it appears on their screen straight away."
                : "Ask the owner about stock, prices or anything at the till."}
            </p>
          </div>
        ) : (
          thread.map((m, i) => {
            const mine = m.fromRole === user?.role;
            const showDay = i === 0 || dayLabel(thread[i - 1].createdAt) !== dayLabel(m.createdAt);
            // The other side has seen it once their read flag is set.
            const seen = m.fromRole === "admin" ? m.readByShop : m.readByAdmin;
            return (
              <div key={m.id}>
                {showDay && (
                  <div className="flex items-center gap-3 my-4 first:mt-0">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      {dayLabel(m.createdAt)}
                    </span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                )}
                <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
                  <div className={cn("group max-w-[85%] sm:max-w-[70%] min-w-0")}>
                    <div
                      className={cn(
                        "rounded-2xl px-3.5 py-2 text-sm break-words whitespace-pre-wrap",
                        mine
                          ? "bg-primary text-primary-foreground rounded-br-sm"
                          : "bg-muted text-foreground rounded-bl-sm",
                      )}
                    >
                      {!mine && (
                        <div className="text-[11px] font-medium opacity-70 mb-0.5">
                          {m.fromName}
                        </div>
                      )}
                      {m.body}
                    </div>
                    <div
                      className={cn(
                        "flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground",
                        mine ? "justify-end" : "justify-start",
                      )}
                    >
                      <span>{clock(m.createdAt)}</span>
                      {mine && (
                        <span title={seen ? "Seen" : "Sent"}>
                          {seen ? (
                            <CheckCheck className="h-3.5 w-3.5 text-primary" />
                          ) : (
                            <Check className="h-3.5 w-3.5" />
                          )}
                        </span>
                      )}
                      {/* You can withdraw your own message; you can't rewrite
                          what the other side said. */}
                      {mine && (
                        <Confirm
                          title="Delete this message?"
                          description="It disappears for both sides of the conversation. This can't be undone."
                          confirmLabel="Delete"
                          destructive
                          onConfirm={() => {
                            deleteMessage(m.id);
                            toast.success("Message deleted");
                          }}
                          trigger={
                            <button
                              aria-label="Delete message"
                              className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          }
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t p-3 shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter breaks the line — what every chat does,
              // and the hint under the box says so.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={isAdmin ? `Message ${shop?.name ?? "the shop"}…` : "Message the owner…"}
            disabled={!shopId || cannotSave}
            // text-base below sm stops iOS zooming the page on focus.
            className="flex-1 min-h-11 max-h-40 resize-y rounded-md border bg-background px-3 py-2.5 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
          />
          <Button
            onClick={send}
            disabled={!draft.trim() || !shopId || cannotSave}
            className="h-11 px-4 shrink-0"
          >
            <Send className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Send</span>
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1.5">
          Enter sends · Shift+Enter starts a new line
        </p>
      </div>
    </Card>
  );

  /* ------------------------------------------------------- the shop list */

  const list = (
    <Card className="flex flex-col min-h-0 overflow-hidden lg:max-h-full">
      <div className="px-4 py-3 border-b shrink-0">
        <div className="font-semibold text-sm">Shops</div>
        <div className="text-xs text-muted-foreground">One thread per shop</div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto divide-y">
        {threads.map(({ shop: s, last, unread }) => (
          <button
            key={s.id}
            onClick={() => setPicked(s.id)}
            className={cn(
              "w-full text-left px-4 py-3 flex items-start gap-3 transition-colors hover:bg-muted/60",
              picked === s.id && "bg-muted",
            )}
          >
            <div className="h-9 w-9 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold">
              {s.name.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium truncate">{shopLabel(s)}</span>
                {last && (
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    {clock(last.createdAt)}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <span className="text-xs text-muted-foreground truncate">
                  {last
                    ? `${last.fromRole === "admin" ? "You" : last.fromName}: ${last.body}`
                    : "No messages yet"}
                </span>
                {unread > 0 && (
                  <span className="shrink-0 min-w-[1.15rem] h-[1.15rem] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center tabular-nums">
                    {unread}
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
        {threads.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            No active shops.
          </div>
        )}
      </div>
    </Card>
  );

  return (
    // h-full + min-h-0 so the two panels scroll internally instead of pushing
    // the composer off the bottom of a long conversation.
    <div className="flex flex-col h-full min-h-0">
      <PageHeader
        title="Messages"
        subtitle={
          isAdmin
            ? "Talk to each shop. Messages arrive on their screen as you send them."
            : "Talk to the owner. Replies arrive here as they're sent."
        }
        actions={
          <span
            className={cn(
              "inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-full border",
              usingSupabase && !cannotSave
                ? "bg-success/10 text-success-strong border-success/30"
                : "bg-warning/15 text-warning-strong border-warning/40",
            )}
            title={
              usingSupabase && !cannotSave
                ? "Connected — messages are delivered as they're sent"
                : "Not connected to the database: messages stay in this browser"
            }
          >
            <Radio className="h-3.5 w-3.5" />
            {usingSupabase && !cannotSave ? "Live" : "Not live"}
          </span>
        }
      />

      {cannotSave && (
        <Card className="p-4 mb-4 border-warning/40 bg-warning/10 flex items-start gap-3 shrink-0">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-warning-strong" />
          <div className="text-sm">
            <div className="font-medium text-warning-strong">
              Messaging is off until the database is updated
            </div>
            <p className="text-muted-foreground mt-1">
              A message sent now would stay in this browser and never reach the other side. Run{" "}
              <code className="px-1 py-0.5 rounded bg-muted font-mono text-xs break-all">
                supabase/migrations/004_messages.sql
              </code>{" "}
              in the Supabase SQL Editor, then reload.
            </p>
          </div>
        </Card>
      )}

      {!usingSupabase && !cannotSave && (
        <Card className="p-3 mb-4 border-warning/40 bg-warning/10 text-sm flex items-start gap-2.5 shrink-0">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-warning-strong" />
          <span>
            Running on demo data, so this conversation lives in this browser only. Connect Supabase
            to deliver messages between the owner and the shops for real.
          </span>
        </Card>
      )}

      {isAdmin ? (
        // One column on phones — the list, or the thread once a shop is picked.
        // Two columns from lg, where both fit without squeezing either.
        <div className="flex-1 min-h-0 grid gap-4 lg:grid-cols-[20rem_1fr]">
          <div className={cn("min-h-0", picked && "hidden lg:flex lg:flex-col")}>{list}</div>
          <div className={cn("min-h-0 flex flex-col", !picked && "hidden lg:flex")}>
            {picked ? (
              conversation
            ) : (
              <Card className="hidden lg:flex flex-1 items-center justify-center text-center p-10">
                <div>
                  <div className="mx-auto h-11 w-11 rounded-full bg-muted flex items-center justify-center mb-3">
                    <MessagesSquare className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium">Pick a shop to open the conversation</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Shops waiting on a reply are listed first.
                  </p>
                </div>
              </Card>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col">{conversation}</div>
      )}
    </div>
  );
}
