import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useState } from "react";

export const Route = createFileRoute("/app/account")({ component: AccountPage });

function AccountPage() {
  const { user, shops } = useStore();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  if (!user) return null;
  const shop = user.shopId ? shops.find((s) => s.id === user.shopId) : null;

  return (
    <div>
      <PageHeader title="Account" subtitle="Your profile and password." />
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
        <Card className="p-6">
          <h3 className="font-semibold mb-4">Change password</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>New password</Label><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Confirm</Label><Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
          </div>
          <div className="flex justify-end mt-4">
            <Button onClick={() => { if (pw && pw === pw2) toast.success("Password updated"); else toast.error("Passwords don't match"); }}>Update password</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}