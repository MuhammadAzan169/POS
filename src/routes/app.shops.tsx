import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useStore, shopKind, formatRs, type Shop, type ShopKind } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { LogoPicker } from "@/components/LogoPicker";
import { PasswordInput } from "@/components/PasswordInput";
import { Separator } from "@/components/ui/separator";
import { accessToken } from "@/lib/auth";
import { createStaffAccount, resetStaffPassword } from "@/lib/staff-admin";
import { StatusPill } from "@/components/Stat";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Store, Warehouse } from "lucide-react";
import { Confirm } from "@/components/Confirm";
import { toast } from "sonner";

export const Route = createFileRoute("/app/shops")({ component: ShopsPage });

const EMPTY = {
  name: "",
  kind: "retail" as ShopKind,
  address: "",
  phone: "",
  logo: "",
  /* The counter's own login, created with the shop rather than afterwards on a
     different screen — a shop nobody can sign in to is not a working shop. */
  username: "",
  password: "",
  email: "",
};

/** What each shop type actually does differently, shown while you pick one. */
const KIND_BLURB: Record<ShopKind, string> = {
  retail:
    "Sells to walk-in customers at the shelf price. Runs a day book: the shopkeeper starts and ends each trading day and hands over the cash.",
  wholesale:
    "Sells in bulk to outside buyers — other shopkeepers, or anyone buying in quantity — at the wholesale rate instead of the shelf price. Runs a day book like any other outlet.",
};

function ShopsPage() {
  const { user, shops, users, sales, inventory, products, addShop, updateShop, settings } =
    useStore();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Shop | null>(null);
  /*
   * A shop that was saved while its login was not.
   *
   * This state exists because of a real failure in front of a client: the shop
   * was created, the login silently was not (the server was missing its key),
   * and the only warning was a toast that had vanished by the time anyone
   * looked. The dialog now stays open, says so in place, and retries the login
   * alone — the shop is already saved and must not be created twice.
   */
  const [loginPending, setLoginPending] = useState<{ shopId: string; error: string } | null>(null);

  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  if (user?.role !== "admin") {
    return (
      <div>
        <PageHeader title="Shops" subtitle="Manage outlet locations." />
        <Card className="p-10 text-center text-sm text-muted-foreground">Admins only.</Card>
      </div>
    );
  }

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  };
  const openEdit = (s: Shop) => {
    setEditing(s);
    setForm({
      ...EMPTY,
      name: s.name,
      kind: shopKind(s),
      address: s.address,
      phone: s.phone,
      logo: s.logo ?? "",
    });
    setOpen(true);
  };

  const createLoginFor = async (shopId: string, shopName: string) => {
    const token = await accessToken();
    if (!token) return { ok: false, error: "Sign in again before creating a login" };
    return createStaffAccount({
      data: {
        token,
        username: form.username,
        password: form.password,
        name: `${shopName.trim()} counter`,
        shopId,
        email: form.email,
      },
    });
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Shop name required");
      return;
    }

    /*
     * A new shop needs a way in, and these are REQUIRED rather than optional.
     *
     * They were optional, and a shop was created without them in front of a
     * client: the form said "Shop added", nothing was wrong on screen, and the
     * problem surfaced days later as a cashier being told their password was
     * wrong for an account that had never existed. A shop nobody can open is
     * not a shop, so the form no longer accepts one.
     */
    if (!editing) {
      if (form.username.trim().length < 3) {
        toast.error("Give this shop a username of at least 3 characters");
        return;
      }
      if (form.password.length < 8) {
        toast.error("Give this shop a password of at least 8 characters");
        return;
      }
    }

    setSaving(true);

    // Retrying after a login failure: the shop exists, only the account is
    // missing, so nothing else is touched.
    if (loginPending) {
      const retry = await createLoginFor(loginPending.shopId, form.name);
      setSaving(false);
      if (!retry.ok) {
        setLoginPending({ shopId: loginPending.shopId, error: retry.error ?? "Unknown error" });
        return;
      }
      toast.success(`${form.username.trim()} can now sign in`);
      setLoginPending(null);
      setOpen(false);
      return;
    }

    if (editing) {
      updateShop({ ...editing, ...form, logo: form.logo || undefined });
      toast.success("Shop updated");
    } else {
      const shop = addShop({ ...form, logo: form.logo || undefined, active: true });

      {
        const result = await createLoginFor(shop?.id ?? "", form.name);
        if (!result.ok) {
          /*
           * The shop is saved; the login is not. Holding the dialog open is the
           * point — a toast here disappears, and the next person to find out is
           * the cashier standing at the till being told their password is wrong.
           */
          setSaving(false);
          setLoginPending({ shopId: shop?.id ?? "", error: result.error ?? "Unknown error" });
          return;
        }
        toast.success(`${form.name} added, and ${form.username.trim()} can sign in`);
      }
    }
    setSaving(false);
    setOpen(false);
  };

  const toggleActive = (s: Shop) => {
    updateShop({ ...s, active: !s.active });
    toast.success(s.active ? `${s.name} deactivated` : `${s.name} activated`);
  };

  return (
    <div>
      <PageHeader
        title="Shops"
        subtitle="Retail branches and wholesale counters. The type decides how a shop prices and sells."
        actions={
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add shop
          </Button>
        }
      />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {shops.map((s) => {
          const linked = users.find((u) => u.shopId === s.id);
          const kind = shopKind(s);
          const wholesale = kind === "wholesale";
          const takings = sales
            .filter((x) => x.shopId === s.id && x.status !== "Returned")
            .reduce((a, x) => a + x.total, 0);
          const stockValue = inventory
            .filter((r) => r.shopId === s.id)
            .reduce(
              (a, r) => a + (products.find((p) => p.id === r.productId)?.cost ?? 0) * r.qty,
              0,
            );
          return (
            <Card key={s.id} className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div
                  className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                    wholesale ? "bg-accent/20 text-accent-strong" : "bg-primary/10 text-primary"
                  }`}
                >
                  {wholesale ? <Warehouse className="h-5 w-5" /> : <Store className="h-5 w-5" />}
                </div>
                <div className="flex flex-wrap justify-end gap-1.5">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                      wholesale
                        ? "bg-accent/15 text-accent-strong border-accent/30"
                        : "bg-muted text-muted-foreground border-border"
                    }`}
                  >
                    {wholesale ? "Wholesale" : "Retail"}
                  </span>
                  <StatusPill status={s.active ? "Active" : "Disabled"} />
                  {/* Shops created before the login became compulsory, or whose
                      login failed to be created, are called out here — the
                      alternative is finding out at the counter. */}
                  {!users.some((u) => u.shopId === s.id && u.active) && (
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full border bg-destructive/10 text-destructive border-destructive/30">
                      No login
                    </span>
                  )}
                </div>
              </div>
              <h3 className="font-semibold mt-4">{s.name}</h3>
              <div className="text-sm text-muted-foreground mt-1">{s.address}</div>
              <div className="text-sm text-muted-foreground">{s.phone}</div>
              <dl className="mt-4 pt-4 border-t grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Takings
                  </dt>
                  <dd className="font-medium mt-0.5">{formatRs(takings, settings.currency)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Stock at cost
                  </dt>
                  <dd className="font-medium mt-0.5">{formatRs(stockValue, settings.currency)}</dd>
                </div>
              </dl>
              <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
                Linked login:{" "}
                <span className="text-foreground font-medium">
                  {linked?.email ?? "No login yet"}
                </span>
              </div>
              <div className="flex gap-2 mt-4">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(s)}>
                  Edit
                </Button>
                {s.active ? (
                  <Confirm
                    title={`Deactivate ${s.name}?`}
                    description="The outlet stops appearing as an active location. Its sales history and stock are kept, and you can reactivate it at any time."
                    confirmLabel="Deactivate"
                    destructive
                    onConfirm={() => toggleActive(s)}
                    trigger={
                      <Button variant="outline" size="sm" className="flex-1">
                        Deactivate
                      </Button>
                    }
                  />
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => toggleActive(s)}
                  >
                    Activate
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit shop" : "Add shop"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Shop name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Gulberg Outlet"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Shop type</Label>
              <Select
                value={form.kind}
                onValueChange={(v) => setForm({ ...form, kind: v as ShopKind })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="retail">Retail branch</SelectItem>
                  <SelectItem value="wholesale">Wholesale counter</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{KIND_BLURB[form.kind]}</p>
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            {/*
              Optional, and worth saying so: most branches trade under one name
              and should simply inherit the business logo set in Settings. This
              is for the outlet that has its own.
            */}
            <div className="space-y-1.5">
              <Label>Shop logo</Label>
              <LogoPicker
                value={form.logo}
                onChange={(logo) => setForm({ ...form, logo })}
                label="Shop logo"
              />
              <p className="text-xs text-muted-foreground">
                Used as this shop&apos;s picture across the app, and printed on its bills. Left
                empty, its bills fall back to the business logo in Settings.
              </p>
            </div>

            <Separator />

            {/*
              A shop and the login that opens it are made together. Splitting
              them across two screens is how a shop ends up existing with nobody
              able to sign into it — and nothing on this page would have said so.
            */}
            {editing ? (
              <div className="space-y-1.5">
                <Label>Counter login</Label>
                <p className="text-xs text-muted-foreground">
                  Manage this shop&apos;s username and password on the Users page.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Counter login</Label>
                  <p className="text-xs text-muted-foreground">
                    What the staff at this shop type to sign in. Required — a shop without a login
                    is a shop nobody can open.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="shop-username">Username</Label>
                    <Input
                      id="shop-username"
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                      placeholder="e.g. gulberg"
                      value={form.username}
                      onChange={(e) => setForm({ ...form, username: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="shop-password">Password</Label>
                    <PasswordInput
                      id="shop-password"
                      autoComplete="new-password"
                      value={form.password}
                      onChange={(password) => setForm({ ...form, password })}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="shop-email">Email (optional)</Label>
                  <Input
                    id="shop-email"
                    type="email"
                    inputMode="email"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="Kept for contact only"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Not used to sign in — staff sign in with the username above. Stored for when you
                    need to reach this shop.
                  </p>
                </div>
              </div>
            )}
          </div>
          {loginPending && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <p className="font-semibold text-destructive">
                The shop was saved, but its login was not created.
              </p>
              <p className="text-muted-foreground mt-1">{loginPending.error}</p>
              <p className="text-muted-foreground mt-2">
                Staff cannot sign in until this succeeds. Fix the cause, then press
                <strong> Create login</strong> — the shop will not be added again.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving
                ? "Saving…"
                : loginPending
                  ? "Create login"
                  : editing
                    ? "Save changes"
                    : "Add shop"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
