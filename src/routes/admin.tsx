/**
 * The owner's door, at /admin.
 *
 * Two states, decided by the database rather than by anything in the browser:
 *
 *   First run — no owner has been claimed, so this offers to create one.
 *   Ever after — an owner exists, so this only signs in.
 *
 * The switch is not a setting anyone has to remember to turn off. `claim_owner`
 * refuses once a single admin row exists, and a unique index means two people
 * pressing the button at the same moment cannot both succeed. So the door
 * closes itself, permanently, the moment the client claims their account.
 *
 * Being on /admin is convenience, not security: the anon key ships inside this
 * bundle, so anything that actually matters is enforced by row-level security.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { hasOwner } from "@/lib/auth";
import { SignInLayout } from "@/components/SignInLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ShieldCheck, Sparkles } from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "A-POS — Owner sign in" },
      // Keeps the owner's door out of search results.
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminSignIn,
});

function AdminSignIn() {
  const { user, ready, signIn, createOwner, logout, usingSupabase } = useStore();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  /** null while we are still asking the database. */
  const [firstRun, setFirstRun] = useState<boolean | null>(null);

  useEffect(() => {
    if (ready && user?.role === "admin") navigate({ to: "/app/dashboard" });
  }, [ready, user, navigate]);

  useEffect(() => {
    // Demo mode has its seeded owner, so it never offers to create one.
    if (!usingSupabase) return setFirstRun(false);
    void hasOwner().then((exists) => setFirstRun(!exists));
  }, [usingSupabase]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const result = firstRun
      ? await createOwner(email, password, name)
      : await signIn(email, password, "owner");
    setLoading(false);

    if (!result.user) {
      toast.error(result.error ?? "Could not sign in");
      return;
    }
    /*
     * A shop account reaching this page is signed straight back out rather than
     * quietly let through: the two doors lead to different places, and a
     * cashier who ends up here should be told where to go, not admitted.
     */
    if (result.user.role !== "admin") {
      logout();
      toast.error("That is a shop account — sign in on the main page");
      return;
    }
    toast.success(firstRun ? "Owner account created" : `Welcome back, ${result.user.name}`);
    navigate({ to: "/app/dashboard" });
  };

  return (
    <SignInLayout
      title={firstRun ? "Create the owner account" : "Owner sign in"}
      subtitle={
        firstRun
          ? "This is the first account, and it can only be created once."
          : "For the business owner. Shop staff sign in on the main page."
      }
      eyebrow={
        <div className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border bg-primary/10 text-primary border-primary/30 mb-4">
          {firstRun ? (
            <Sparkles className="h-3.5 w-3.5" />
          ) : (
            <ShieldCheck className="h-3.5 w-3.5" />
          )}
          {firstRun ? "First run" : "Administrator"}
        </div>
      }
      footer={
        firstRun ? (
          <div className="text-xs text-muted-foreground border rounded-md p-3 bg-warning/10 border-warning/40">
            <strong className="text-warning-strong">
              Do this now, before anyone else opens the app.
            </strong>{" "}
            The first account created here becomes the owner, and after that this screen only signs
            in — nobody can claim it a second time.
          </div>
        ) : (
          <div className="text-xs text-muted-foreground border rounded-md p-3 bg-muted/40">
            Only the owner can create accounts. Shop staff are given a username and password from
            the Users page — there is no way to sign yourself up.
          </div>
        )
      }
    >
      <form onSubmit={submit} className="mt-6 sm:mt-8 space-y-4">
        {firstRun && (
          <div className="space-y-2">
            <Label htmlFor="owner-name">Your name</Label>
            <Input
              id="owner-name"
              autoComplete="name"
              placeholder="e.g. Khadija"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="admin-email">Email</Label>
          <Input
            id="admin-email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="owner@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="admin-password">Password</Label>
          <Input
            id="admin-password"
            type="password"
            autoComplete={firstRun ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={firstRun ? 8 : undefined}
          />
          {firstRun && (
            <p className="text-xs text-muted-foreground">
              At least 8 characters. Nothing is emailed — this is only used to sign in.
            </p>
          )}
        </div>
        <Button type="submit" className="w-full h-11" disabled={loading || firstRun === null}>
          {loading
            ? firstRun
              ? "Creating…"
              : "Signing in…"
            : firstRun
              ? "Create owner account"
              : "Sign in"}
        </Button>
      </form>
    </SignInLayout>
  );
}
