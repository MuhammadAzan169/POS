import { createFileRoute } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ShieldCheck, Store, Sparkles } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "A-POS — Sign in" },
      { name: "description", content: "A-POS retail point of sale: multi-shop inventory, sales, and profit reporting." },
      { property: "og:title", content: "A-POS — Retail Point of Sale" },
      { property: "og:description", content: "Multi-shop POS with inventory, purchases, and profit reporting." },
    ],
  }),
  component: Index,
});

function Index() {
  const { user, ready, login } = useStore();
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@apos.pk");
  const [password, setPassword] = useState("demo");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (ready && user) navigate({ to: "/app/dashboard" });
  }, [ready, user, navigate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      const u = login(email, password);
      setLoading(false);
      if (u) {
        toast.success(`Welcome, ${u.name}`);
        navigate({ to: "/app/dashboard" });
      } else {
        toast.error("Invalid credentials");
      }
    }, 250);
  };

  const quick = (e: string) => { setEmail(e); setPassword("demo"); };

  return (
    <div className="min-h-dvh grid lg:grid-cols-2 bg-background">
      {/* Left brand panel */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-sidebar text-sidebar-foreground relative overflow-hidden">
        <div className="absolute inset-0 opacity-30 pointer-events-none"
             style={{ background: "radial-gradient(circle at 20% 20%, oklch(0.78 0.14 75 / 0.25), transparent 60%), radial-gradient(circle at 80% 80%, oklch(0.5 0.15 260 / 0.4), transparent 55%)" }} />
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center font-bold text-lg">A</div>
            <div>
              <div className="font-display font-bold text-2xl">A-POS</div>
              <div className="text-xs text-sidebar-foreground/60">Retail Operating System</div>
            </div>
          </div>
        </div>
        <div className="relative space-y-8">
          <div>
            <h2 className="font-display text-4xl font-bold leading-tight">
              Run every shop<br/>like the owner's<br/>in the room.
            </h2>
            <p className="mt-4 text-sidebar-foreground/70 max-w-md">
              Multi-shop inventory, fast offline-ready checkout, and the only place
              your real profit numbers are kept private — by design.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 max-w-md">
            {[
              { k: "3", v: "Shops" },
              { k: "24/7", v: "Offline POS" },
              { k: "100%", v: "Cost private" },
            ].map((s) => (
              <div key={s.v} className="bg-sidebar-accent/40 rounded-lg p-3 border border-sidebar-border">
                <div className="font-display font-bold text-xl text-sidebar-primary">{s.k}</div>
                <div className="text-xs text-sidebar-foreground/70 mt-0.5">{s.v}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="relative text-xs text-sidebar-foreground/50">© {new Date().getFullYear()} A-POS · Built for retail</div>
      </div>

      {/* Right login */}
      <div className="flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="h-10 w-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold">A</div>
            <div className="font-display font-bold text-xl">A-POS</div>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Sign in</h1>
          <p className="text-muted-foreground mt-2 text-sm">Use one of the demo logins below to explore the system.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="password">Password</Label>
                <button type="button" onClick={() => toast.info("Demo mode — any password works. Just pick an account below.")} className="text-xs text-muted-foreground hover:text-foreground">Forgot password?</button>
              </div>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <div className="mt-8">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3 font-medium">Quick demo accounts</div>
            <div className="grid gap-2">
              <button onClick={() => quick("admin@apos.pk")} className="flex items-center gap-3 p-3 border rounded-lg hover:border-primary hover:bg-muted/40 transition-colors text-left">
                <div className="h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center"><ShieldCheck className="h-4 w-4" /></div>
                <div className="flex-1">
                  <div className="text-sm font-medium">Owner / Admin</div>
                  <div className="text-xs text-muted-foreground">admin@apos.pk · sees all shops, cost & profit</div>
                </div>
              </button>
              {["shop1", "shop2", "shop3"].map((s, i) => (
                <button key={s} onClick={() => quick(`${s}@apos.pk`)} className="flex items-center gap-3 p-3 border rounded-lg hover:border-primary hover:bg-muted/40 transition-colors text-left">
                  <div className="h-9 w-9 rounded-md bg-accent/20 text-accent-foreground flex items-center justify-center"><Store className="h-4 w-4" /></div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">Shop {i + 1} cashier</div>
                    <div className="text-xs text-muted-foreground">{s}@apos.pk · own shop only, no profit</div>
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-4 flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 border rounded-md p-3">
              <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0 text-accent" />
              Demo mode — any password works. Data lives in your browser only.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
