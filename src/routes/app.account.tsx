import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useState } from "react";
import { Confirm } from "@/components/Confirm";

export const Route = createFileRoute("/app/account")({ component: AccountPage });

function AccountPage() {
  const { user, shops } = useStore();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  if (!user) return null;
  const isAdmin = user.role === "admin";
  const shop = user.shopId ? shops.find((s) => s.id === user.shopId) : null;

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
            <div className="space-y-1.5"><Label>Name</Label><Input value={user.name} readOnly /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input value={user.email} readOnly /></div>
            <div className="space-y-1.5"><Label>Role</Label><Input value={user.role} readOnly /></div>
            {shop && <div className="space-y-1.5"><Label>Shop</Label><Input value={shop.name} readOnly /></div>}
          </div>
        </Card>
        {/* Cashiers cannot change their own password — an admin resets it for
            them from the Users tab, so a shared till can't be locked out. */}
        {isAdmin ? (
          <Card className="p-6">
            <h3 className="font-semibold mb-4">Change password</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>New password</Label><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Confirm</Label><Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
            </div>
            <div className="flex justify-end mt-4">
              {/* Previously accepted a 1-character password and left both fields filled. */}
              <Confirm
                title="Update your password?"
                description="You'll use the new password the next time you sign in."
                confirmLabel="Update password"
                disabled={!pw || !pw2}
                onConfirm={() => {
                  if (pw.length < 6) { toast.error("Password must be at least 6 characters"); return; }
                  if (pw !== pw2) { toast.error("Passwords don't match"); return; }
                  toast.success("Password updated");
                  setPw("");
                  setPw2("");
                }}
                trigger={
                  <Button disabled={!pw || !pw2}>Update password</Button>
                }
              />
            </div>
          </Card>
        ) : (
          <Card className="p-6">
            <h3 className="font-semibold mb-1">Password</h3>
            <p className="text-sm text-muted-foreground">
              Ask the owner to reset your password from the Users screen.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}