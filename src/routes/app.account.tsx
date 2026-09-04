import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useState } from "react";
import { PasswordInput } from "@/components/PasswordInput";
import { changePassword } from "@/lib/auth";

export const Route = createFileRoute("/app/account")({ component: AccountPage });

function AccountPage() {
  const { user, shops } = useStore();
  const [current, setCurrent] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [saving, setSaving] = useState(false);
  if (!user) return null;
  const isAdmin = user.role === "admin";
  const shop = user.shopId ? shops.find((s) => s.id === user.shopId) : null;

  const submitPassword = async () => {
    // Checked here as well as by the browser, because `minLength` only applies
    // to a real form submit and this is a button.
    if (pw.length < 8) return toast.error("The new password must be at least 8 characters");
    if (pw !== pw2) return toast.error("The two new passwords do not match");

    setSaving(true);
    const { error } = await changePassword(current, pw);
    setSaving(false);
    if (error) return toast.error(error);

    toast.success("Password updated");
    setCurrent("");
    setPw("");
    setPw2("");
  };

  return (
    <div>
      <PageHeader
        title="Account"
        subtitle={isAdmin ? "Your profile and password." : "Your profile."}
      />
      <div className="grid gap-6 max-w-2xl">
        <Card className="p-6">
          <h3 className="font-semibold mb-4">Profile</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={user.name} readOnly />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={user.email} readOnly />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Input value={user.role} readOnly />
            </div>
            {shop && (
              <div className="space-y-1.5">
                <Label>Shop</Label>
                <Input value={shop.name} readOnly />
              </div>
            )}
          </div>
        </Card>
        {/*
          Anyone signed in can change their own password, cashier included.
          Changing your own needs no email — only the old password — so the
          reason this used to be owner-only has gone. The owner resetting a
          worker's password from the Users screen stays as the way back in for
          someone who has forgotten theirs entirely.

          The old version of this card was a toast and nothing else: it said
          "Password updated" and changed nothing, which is worse than not
          offering it at all.
        */}
        <Card className="p-6">
          <h3 className="font-semibold mb-1">Change password</h3>
          <p className="text-sm text-muted-foreground mb-4">
            You will use the new one the next time you sign in.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Current password</Label>
              <PasswordInput
                value={current}
                onChange={setCurrent}
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-1.5">
              <Label>New password</Label>
              <PasswordInput
                value={pw}
                onChange={setPw}
                autoComplete="new-password"
                minLength={8}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Confirm</Label>
              <PasswordInput value={pw2} onChange={setPw2} autoComplete="new-password" />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 mt-4 flex-wrap">
            <p className="text-xs text-muted-foreground">At least 8 characters.</p>
            <Button disabled={!current || !pw || !pw2 || saving} onClick={submitPassword}>
              {saving ? "Updating…" : "Update password"}
            </Button>
          </div>
        </Card>

        {!isAdmin && (
          <p className="text-xs text-muted-foreground">
            Forgotten it completely? The owner can set you a new one from the Users screen.
          </p>
        )}
      </div>
    </div>
  );
}
