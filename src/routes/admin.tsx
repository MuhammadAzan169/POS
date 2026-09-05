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
import { useCallback, useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import {
  claimAsOwner,
  hasOwner,
  onPasswordRecovery,
  requestPasswordReset,
  resetPasswordWithCode,
  setNewPassword,
} from "@/lib/auth";
import { SignInLayout } from "@/components/SignInLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/PasswordInput";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { ArrowLeft, KeyRound, ShieldCheck, Sparkles } from "lucide-react";

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
  const { user, ready, signIn, createOwner, logout } = useStore();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [loading, setLoading] = useState(false);
  /*
   * What this page is for, decided by the database and nothing else.
   *
   *   null       still asking
   *   true       no owner exists -> the ONLY thing on offer is signing up
   *   false      an owner exists -> the only thing on offer is signing in
   *   "unknown"  the check failed -> say so, rather than guess and show the
   *              wrong form to someone who cannot tell it is the wrong one
   */
  const [firstRun, setFirstRun] = useState<boolean | null | "unknown">(null);

  /*
   * The reset runs in the same page rather than a separate route.
   *
   * A code arrives on a phone while the form sits open on a laptop, and a link
   * would have to be opened on whichever device received it. Typing six digits
   * back into the screen already in front of you works from any device, and
   * needs no redirect URL registered anywhere.
   */
  const [mode, setMode] = useState<"signIn" | "forgot" | "recovering">("signIn");
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");

  useEffect(() => {
    if (ready && user?.role === "admin") navigate({ to: "/app/dashboard" });
  }, [ready, user, navigate]);

  const checkForOwner = useCallback(() => {
    setFirstRun(null);
    void hasOwner().then((exists) => setFirstRun(exists === "unknown" ? "unknown" : !exists));
  }, []);

  useEffect(checkForOwner, [checkForOwner]);

  /*
   * Arriving from the link in a reset email. The session is already valid by
   * the time this runs, so the only thing left to collect is the new password.
   */
  useEffect(() => onPasswordRecovery(() => setMode("recovering")), []);

  /** Setting up is the only meaning of "no owner yet"; nothing else counts. */
  const isSetup = firstRun === true;

  const sendCode = async () => {
    if (!email.trim()) return toast.error("Enter your email address first");
    setLoading(true);
    const { error } = await requestPasswordReset(email);
    setLoading(false);
    if (error) return toast.error(error);
    setCodeSent(true);
    // Said the same way whether or not the address exists, so this cannot be
    // used to find out which addresses are registered.
    toast.success("If that address has an account, an email is on its way");
  };

  const applyLinkPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return toast.error("Use at least 8 characters");
    setLoading(true);
    const result = await setNewPassword(password);
    setLoading(false);
    if (!result.user) return toast.error(result.error ?? "Could not set the password");
    toast.success("Password changed");
    navigate({ to: "/app/dashboard" });
  };

  const applyNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const result = await resetPasswordWithCode(email, code, password);
    setLoading(false);
    if (!result.user) return toast.error(result.error ?? "Could not reset the password");
    toast.success("Password changed");
    navigate({ to: "/app/dashboard" });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    if (isSetup) {
      // Checked here rather than left to the database, so the message names the
      // field rather than reporting a constraint.
      if (password.length < 8) {
        setLoading(false);
        return toast.error("Use a password of at least 8 characters");
      }
      if (password !== confirm) {
        setLoading(false);
        return toast.error("The two passwords do not match");
      }
    }

    const result = isSetup
      ? await createOwner({ name, phone, email, password, businessName })
      : await signIn(email, password, "owner");
    setLoading(false);

    /*
     * A login that exists without a profile, on a system with no owner yet, is
     * a setup that stopped halfway. Rather than a dead end, finish the claim
     * with what was typed — the alternative is telling someone their own brand
     * new account has no access.
     */
    if (!result.user && !isSetup && /no access/i.test(result.error ?? "")) {
      const claimed = await claimAsOwner(name || email.split("@")[0], phone);
      if (claimed.user) {
        toast.success("Setup finished");
        return navigate({ to: "/app/dashboard" });
      }
    }

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
    toast.success(isSetup ? "Owner account created" : `Welcome back, ${result.user.name}`);
    navigate({ to: "/app/dashboard" });
  };

  if (firstRun === "unknown") {
    return (
      <SignInLayout
        title="Could not reach the system"
        subtitle="Nothing is wrong with your details — the app could not ask the database whether an owner account exists yet."
        eyebrow={
          <div className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border bg-destructive/10 text-destructive border-destructive/30 mb-4">
            <ShieldCheck className="h-3.5 w-3.5" />
            Not checked
          </div>
        }
        footer={
          <div className="text-xs text-muted-foreground border rounded-md p-3 bg-muted/40">
            If this keeps happening, the database connection settings are wrong or the project is
            paused. Signing in is deliberately not offered until this can be answered — showing the
            wrong form here is how someone ends up trying to sign in to an account that was never
            created.
          </div>
        }
      >
        <Button className="w-full h-11 mt-6" onClick={checkForOwner}>
          Try again
        </Button>
      </SignInLayout>
    );
  }

  if (mode === "recovering") {
    return (
      <SignInLayout
        title="Choose a new password"
        subtitle="Opening the link proved the account is yours. Pick a password and you are in."
        eyebrow={
          <div className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border bg-muted text-muted-foreground mb-4">
            <KeyRound className="h-3.5 w-3.5" />
            Password reset
          </div>
        }
      >
        <form onSubmit={applyLinkPassword} className="mt-6 sm:mt-8 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="link-password">New password</Label>
            <PasswordInput
              id="link-password"
              autoComplete="new-password"
              minLength={8}
              required
              autoFocus
              value={password}
              onChange={setPassword}
            />
            <p className="text-xs text-muted-foreground">At least 8 characters.</p>
          </div>
          <Button type="submit" className="w-full h-11" disabled={loading}>
            {loading ? "Saving…" : "Set password and sign in"}
          </Button>
        </form>
      </SignInLayout>
    );
  }

  if (mode === "forgot") {
    return (
      <SignInLayout
        title="Reset your password"
        subtitle={
          codeSent
            ? "Open the link we emailed you. If your email contained a code instead, enter it below."
            : "We will email you a link to prove the account is yours."
        }
        eyebrow={
          <div className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border bg-muted text-muted-foreground mb-4">
            <KeyRound className="h-3.5 w-3.5" />
            Owner account
          </div>
        }
        footer={
          <button
            type="button"
            onClick={() => {
              setMode("signIn");
              setCodeSent(false);
              setCode("");
              setPassword("");
            }}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to sign in
          </button>
        }
      >
        <form onSubmit={applyNewPassword} className="mt-6 sm:mt-8 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reset-email">Email</Label>
            <Input
              id="reset-email"
              type="email"
              inputMode="email"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={codeSent}
              required
            />
          </div>

          {!codeSent ? (
            <Button type="button" className="w-full h-11" onClick={sendCode} disabled={loading}>
              {loading ? "Sending…" : "Email me a reset link"}
            </Button>
          ) : (
            <>
              <div className="space-y-2">
                {/* The length is a project setting (Authentication -> Email ->
                    Email OTP length), so the field does not claim a number. */}
                {/* Only projects with custom SMTP can switch the template from
                    a link to a code, so this is the secondary path — kept
                    because it costs nothing and becomes the better one the day
                    SMTP is connected. */}
                <Label htmlFor="reset-code">Or paste a code, if you got one</Label>
                <Input
                  id="reset-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="Code"
                  className="tracking-[0.3em] text-center font-medium"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reset-password">New password</Label>
                <PasswordInput
                  id="reset-password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={password}
                  onChange={setPassword}
                />
                <p className="text-xs text-muted-foreground">At least 8 characters.</p>
              </div>
              <Button type="submit" className="w-full h-11" disabled={loading || !code.trim()}>
                {loading ? "Saving…" : "Set new password"}
              </Button>
              <button
                type="button"
                onClick={sendCode}
                disabled={loading}
                className="w-full text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Didn&apos;t arrive? Send it again
              </button>
            </>
          )}
        </form>
      </SignInLayout>
    );
  }

  return (
    <SignInLayout
      wide={isSetup}
      title={isSetup ? "Set up your business" : "Owner sign in"}
      subtitle={
        isSetup
          ? "One account runs the whole system. It can only be created once, and it is yours."
          : "For the business owner. Shop staff sign in on the main page."
      }
      eyebrow={
        <div className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border bg-primary/10 text-primary border-primary/30 mb-4">
          {isSetup ? <Sparkles className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          {isSetup ? "First run" : "Administrator"}
        </div>
      }
      footer={
        isSetup ? (
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
        {isSetup && (
          <>
            {/* Grouped: who you are, then how the business is known. Two
                columns from `sm` up, because six stacked fields on a laptop
                reads as a long form rather than a short one. */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="owner-name">Your name</Label>
                <Input
                  id="owner-name"
                  autoComplete="name"
                  placeholder="e.g. Khadija Bibi"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="owner-phone">Phone</Label>
                <Input
                  id="owner-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="e.g. 0300-1234567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="owner-business">Business name</Label>
              <Input
                id="owner-business"
                placeholder="e.g. Khadija Fashion"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Printed at the top of every bill and receipt. You can change it later in Settings.
              </p>
            </div>

            <Separator />
          </>
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
          {isSetup && (
            <p className="text-xs text-muted-foreground">
              Used to sign in, and to reset your password if you ever forget it. Use one you can
              actually read.
            </p>
          )}
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="admin-password">Password</Label>
            {!isSetup && (
              <button
                type="button"
                onClick={() => setMode("forgot")}
                className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Forgot password?
              </button>
            )}
          </div>
          <PasswordInput
            id="admin-password"
            autoComplete={isSetup ? "new-password" : "current-password"}
            value={password}
            onChange={setPassword}
            required
            minLength={isSetup ? 8 : undefined}
          />
          {isSetup && (
            <p className="text-xs text-muted-foreground">
              At least 8 characters. Nothing is emailed — this is only used to sign in.
            </p>
          )}
        </div>

        {isSetup && (
          <div className="space-y-2">
            <Label htmlFor="admin-confirm">Confirm password</Label>
            <PasswordInput
              id="admin-confirm"
              autoComplete="new-password"
              value={confirm}
              onChange={setConfirm}
              required
            />
            {confirm.length > 0 && confirm !== password && (
              <p className="text-xs text-destructive">The two passwords do not match.</p>
            )}
          </div>
        )}
        <Button type="submit" className="w-full h-11" disabled={loading || firstRun === null}>
          {loading
            ? isSetup
              ? "Creating your account…"
              : "Signing in…"
            : isSetup
              ? "Create account and continue"
              : "Sign in"}
        </Button>
      </form>
    </SignInLayout>
  );
}
