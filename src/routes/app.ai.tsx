import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore, formatRs } from "@/lib/store";
import { computeInsights, buildBrief } from "@/lib/insights";
import { MarkdownView } from "@/components/MarkdownView";
import { askAssistant, aiStatus } from "@/lib/ai";
import { PageHeader } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Sparkles, Send, TriangleAlert, RotateCcw, Bot, User as UserIcon, Cpu } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/ai")({ component: AIPage });

interface Msg {
  role: "user" | "assistant";
  content: string;
  model?: string;
  failed?: boolean;
}

/** One-tap questions covering what an owner usually wants to know. */
const QUICK_ASKS = [
  { label: "How is business?", q: "Give me an overall health check of the business right now." },
  { label: "What should I reorder?", q: "What stock is running low and what exactly should I reorder, with estimated cost?" },
  { label: "Best sellers", q: "What are my best selling and most profitable items in the last 30 days?" },
  { label: "What isn't selling?", q: "Which products are not selling and how much money is tied up in them?" },
  { label: "Compare my shops", q: "Compare my shops on revenue, profit, expenses and net. Which one needs attention?" },
  { label: "Pricing problems", q: "Are any products priced badly — low margin, below cost, or over-discounted?" },
  { label: "Where is money going?", q: "Break down my expenses and tell me if anything looks out of line." },
  { label: "This week vs last", q: "How does this week compare with last week, and what changed?" },
];

function AIPage() {
  const store = useStore();
  const { user, settings } = store;
  const isAdmin = user?.role === "admin";

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ configured: boolean; models: string[] } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Figures are computed locally from live data — shown as cards and sent to the model.
  const insights = useMemo(
    () =>
      computeInsights({
        shops: store.shops, products: store.products, inventory: store.inventory, sales: store.sales,
        purchases: store.purchases, suppliers: store.suppliers, expenses: store.expenses,
        returns: store.returns, settings: store.settings, discounts: store.discounts,
      }),
    [store.shops, store.products, store.inventory, store.sales, store.purchases, store.suppliers, store.expenses, store.returns, store.settings, store.discounts],
  );

  useEffect(() => {
    void aiStatus().then(setStatus).catch(() => setStatus({ configured: false, models: [] }));
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);

  const money = (n: number) => formatRs(n, settings.currency);

  const ask = async (question: string) => {
    if (!question.trim() || busy) return;
    const history: Msg[] = [...messages, { role: "user", content: question.trim() }];
    setMessages(history);
    setInput("");
    setBusy(true);

    try {
      const res = await askAssistant({
        data: {
          // Only the conversation text goes up; the brief carries the numbers.
          messages: history.map((m) => ({ role: m.role, content: m.content })),
          brief: buildBrief(insights),
        },
      });
      setMessages((prev) => [...prev, { role: "assistant", content: res.answer, model: res.model, failed: !res.ok }]);
      if (!res.ok) {
        toast.error("Every configured model failed — see the reply for details");
      } else if (res.attempts.length > 0) {
        // Fell through the chain: worth knowing which model is actually answering.
        toast.info(`Answered by ${res.model} after ${res.attempts.length} model(s) were unavailable`);
      }
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", failed: true, content: `Could not reach the assistant: ${e instanceof Error ? e.message : String(e)}` },
      ]);
    } finally {
      setBusy(false);
    }
  };

  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="AI Assistant" subtitle="Ask questions about your business." />
        <Card className="p-10 text-center text-sm text-muted-foreground">Admins only.</Card>
      </div>
    );
  }

  const lowCount = insights.lowStockNeedingReorder.length;
  const trend = insights.trendLast7VsPrevious7.revenueChangePct;

  return (
    // flex-1 + min-h-0 makes the chat card grow to the bottom of the viewport
    // and keeps the message list, not the page, the thing that scrolls.
    <div className="flex flex-col flex-1 min-h-0">
      <PageHeader
        title="AI Assistant"
        subtitle="Answers come from your live figures — the numbers below are calculated, not guessed."
        actions={
          messages.length > 0 ? (
            <Button variant="outline" onClick={() => setMessages([])}>
              <RotateCcw className="h-4 w-4 mr-1.5" />New chat
            </Button>
          ) : undefined
        }
      />

      {status && !status.configured && (
        <Card className="p-4 mb-4 flex items-start gap-3 border-warning/40 bg-warning/10">
          <TriangleAlert className="h-4 w-4 mt-0.5 text-warning-strong shrink-0" />
          <div className="text-sm">
            <div className="font-medium text-warning-strong">No API key configured</div>
            <div className="text-muted-foreground mt-0.5">
              Add <code className="text-xs">OPENROUTER_API_KEY</code> to <code className="text-xs">.env</code> and restart the dev server.
              The figures below still work — they are computed locally.
            </div>
          </div>
        </Card>
      )}

      {/* Locally computed snapshot: useful even if the AI is unavailable. */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-4 shrink-0">
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Last 7 days</div>
          <div className="text-2xl font-bold mt-1">{money(insights.salesByPeriod.last7Days.revenue)}</div>
          <div className={`text-xs mt-1 ${trend >= 0 ? "text-success-strong" : "text-destructive"}`}>
            {trend >= 0 ? "▲" : "▼"} {Math.abs(trend)}% vs previous 7
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Profit (7d)</div>
          <div className="text-2xl font-bold mt-1">{money(insights.salesByPeriod.last7Days.profit)}</div>
          <div className="text-xs text-muted-foreground mt-1">{insights.salesByPeriod.last7Days.invoices} invoices</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Needs reorder</div>
          <div className={`text-2xl font-bold mt-1 ${lowCount > 0 ? "text-warning-strong" : ""}`}>{lowCount}</div>
          <div className="text-xs text-muted-foreground mt-1">product/shop rows</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Stock at cost</div>
          <div className="text-2xl font-bold mt-1">{money(insights.inventoryValueAtCost)}</div>
          <div className="text-xs text-muted-foreground mt-1">{insights.catalogue.products} products</div>
        </Card>
      </div>

      <Card className="flex flex-col flex-1 min-h-0">
        <div className="p-4 border-b flex items-center gap-2 shrink-0">
          <Sparkles className="h-4 w-4 text-accent-strong" />
          <h3 className="font-semibold text-sm">Ask about your business</h3>
          {status && status.models.length > 0 && (
            <span className="ml-auto hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground" title={`Fallback order:\n${status.models.join("\n")}`}>
              <Cpu className="h-3.5 w-3.5" />
              {status.models.length} model{status.models.length === 1 ? "" : "s"} configured
            </span>
          )}
        </div>

        <div data-chat-scroll className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-6">
              <div className="inline-flex h-12 w-12 rounded-full bg-muted items-center justify-center mb-3">
                <Bot className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Ask anything about sales, stock, pricing or expenses — or start with one of these:
              </p>
              <div className="flex flex-wrap gap-2 justify-center max-w-2xl mx-auto">
                {QUICK_ASKS.map((a) => (
                  <button
                    key={a.label}
                    onClick={() => ask(a.q)}
                    disabled={busy}
                    className="text-xs px-3 py-1.5 rounded-full border hover:bg-muted hover:border-primary transition-colors disabled:opacity-50"
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
              {m.role === "assistant" && (
                <div className="h-7 w-7 rounded-full bg-accent/20 text-accent-strong flex items-center justify-center shrink-0">
                  <Bot className="h-4 w-4" />
                </div>
              )}
              <div className={`min-w-0 ${m.role === "user" ? "max-w-[85%] order-first" : "max-w-full sm:max-w-[92%]"}`}>
                <div
                  className={`rounded-lg px-3.5 py-2.5 ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : m.failed
                        ? "bg-destructive/10 border border-destructive/30"
                        : "bg-muted/60 border"
                  }`}
                >
                  {m.role === "user" ? <p className="text-sm">{m.content}</p> : <MarkdownView text={m.content} />}
                </div>
                {m.model && (
                  <div className="text-[11px] text-muted-foreground mt-1 px-1">answered by {m.model}</div>
                )}
              </div>
              {m.role === "user" && (
                <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <UserIcon className="h-4 w-4" />
                </div>
              )}
            </div>
          ))}

          {busy && (
            <div className="flex gap-3">
              <div className="h-7 w-7 rounded-full bg-accent/20 text-accent-strong flex items-center justify-center shrink-0">
                <Bot className="h-4 w-4" />
              </div>
              <div className="rounded-lg px-3.5 py-2.5 bg-muted/60 border text-sm text-muted-foreground">
                Reading your figures…
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <Separator />
        <div className="p-3 shrink-0">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(input); } }}
              placeholder="e.g. Which shop made the most profit this week?"
              disabled={busy}
            />
            <Button onClick={() => void ask(input)} disabled={busy || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
          {messages.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {QUICK_ASKS.slice(0, 4).map((a) => (
                <button
                  key={a.label}
                  onClick={() => ask(a.q)}
                  disabled={busy}
                  className="text-[11px] px-2 py-1 rounded-full border text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
