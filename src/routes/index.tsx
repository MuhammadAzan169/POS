/**
 * The shop counter's door.
 *
 * A cashier types a username, not an email: staff are not given mailboxes, and
 * asking someone to type `shop1@staff.apos.pk` at the start of every shift is a
 * typo waiting to happen. The address is assembled from the username by
 * `staffEmail`, which is also what the owner's "create staff" function uses, so
 * the two can never disagree about who an account belongs to.
 *
 * The owner signs in at /admin instead — see the note there about why the two
 * doors are separate pages.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { SignInLayout } from "@/components/SignInLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/PasswordInput";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Store } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "A-POS — Sign in" },
      {
        name: "description",
        content: "A-POS retail point of sale: multi-shop inventory, sales, and profit reporting.",
      },
      { property: "og:title", content: "A-POS — Retail Point of Sale" },
      {
        property: "og:description",
        content: "Multi-shop POS with inventory, purchases, and profit reporting.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const { user, ready, signIn } = useStore();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (ready && user) navigate({ to: "/app/dashboard" });
  }, [ready, user, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const result = await signIn(username, password, "staff");
    setLoading(false);

    if (!result.user) {
      toast.error(result.error ?? "Wrong username or password");
      return;
    }
    toast.success(`Welcome, ${result.user.name}`);
    navigate({ to: "/app/dashboard" });
  };

  return (
    <SignInLayout
      title="Shop sign in"
      subtitle="Use the username and password your owner gave you."
      eyebrow={
        <div className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border bg-accent/15 text-accent-strong border-accent/30 mb-4">
          <Store className="h-3.5 w-3.5" />
          Shop counter
        </div>
      }
      footer={
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-muted-foreground">
            Forgotten your password? Ask the owner to reset it.
          </span>
          <Link to="/admin" className="font-medium text-primary hover:underline shrink-0">
            Owner sign in →
          </Link>
        </div>
      }
    >
      <form onSubmit={submit} className="mt-6 sm:mt-8 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="username">Username</Label>
          {/* Phone keyboards capitalise and autocorrect the first word, which
              quietly turns "shop1" into "Shop1" and fails the sign-in. */}
          <Input
            id="username"
            autoComplete="username"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="e.g. shop1"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            value={password}
            onChange={setPassword}
            required
          />
        </div>
        <Button type="submit" className="w-full h-11" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </SignInLayout>
  );
}
