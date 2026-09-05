import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { StatusPill } from "@/components/Stat";
import { PasswordInput } from "@/components/PasswordInput";
import { accessToken } from "@/lib/auth";
import { staffEmail } from "@/lib/auth-identity";
import { createStaffAccount, resetStaffPassword } from "@/lib/staff-admin";
import { MobileCards, ListCard, TableWrap } from "@/components/DataList";
import { Plus, Pencil, KeyRound } from "lucide-react";
import { Confirm } from "@/components/Confirm";
import { toast } from "sonner";
import type { User } from "@/lib/store";

export const Route = createFileRoute("/app/users")({ component: UsersPage });

function UsersPage() {
  const { user, users, shops, addUser, updateUser } = useStore();
  const [open, setOpen] = useState(false);
  /*
   * A username and a password, because that is what a shop worker signs in
   * with. The old form asked for an email and wrote a row into a `users` table
   * — which looked like an account on this page and could not be signed into.
   */
  const [form, setForm] = useState({
    name: "",
    username: "",
    password: "",
    shopId: shops[0]?.id ?? "",
  });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [resetting, setResetting] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const [editForm, setEditForm] = useState({ name: "", email: "", shopId: "" });

  if (user?.role !== "admin") {
    return (
      <div>
        <PageHeader title="Users" subtitle="Manage owner & shop logins." />
        <Card className="p-10 text-center text-sm text-muted-foreground">Admins only.</Card>
      </div>
    );
  }

  const save = async () => {
    if (!form.name.trim()) return toast.error("Name required");
    if (form.username.trim().length < 3) return toast.error("Username needs at least 3 characters");
    if (form.password.length < 8) return toast.error("Password needs at least 8 characters");
    if (!form.shopId) return toast.error("Pick which shop this account is for");

    setCreating(true);
    const token = await accessToken();
    const result = token
      ? await createStaffAccount({
          data: {
            token,
            username: form.username,
            password: form.password,
            name: form.name,
            shopId: form.shopId,
          },
        })
      : { ok: false, error: "Sign in again first", staffId: undefined };
    setCreating(false);

    if (!result.ok || !result.staffId) {
      return toast.error(result.error ?? "Could not create the account");
    }

    // Added to the list here so the page reflects it without a reload; the row
    // itself was written by the server, which is the only thing that can.
    addUser({
      id: result.staffId,
      name: form.name.trim(),
      email: staffEmail(form.username),
      role: "shop",
      shopId: form.shopId,
      active: true,
    });
    toast.success(`${form.username.trim()} can now sign in`);
    setOpen(false);
    setForm({ name: "", username: "", password: "", shopId: shops[0]?.id ?? "" });
  };

  const openEdit = (u: User) => {
    setEditing(u);
    setEditForm({ name: u.name, email: u.email, shopId: u.shopId ?? "" });
  };

  const saveEdit = () => {
    if (!editing) return;
    const name = editForm.name.trim();
    const email = editForm.email.trim();
    if (!name || !email) {
      toast.error("Name and email required");
      return;
    }
    if (users.some((u) => u.email.toLowerCase() === email.toLowerCase() && u.id !== editing.id)) {
      toast.error("That email is already used by another login");
      return;
    }
    updateUser({
      ...editing,
      name,
      email,
      shopId: editing.role === "admin" ? undefined : editForm.shopId,
    });
    toast.success("Login updated");
    setEditing(null);
  };

  /**
   * Deactivating is the closest thing to deleting a login: their sales history
   * has to stay attached to a real user, so the account is disabled rather than
   * removed. The owner's own account is excluded — locking yourself out of the
   * only admin login is not a recoverable mistake.
   */
  const toggleActive = (u: User) => {
    updateUser({ ...u, active: !u.active });
    toast.success(u.active ? `${u.name} deactivated` : `${u.name} reactivated`);
  };

  /*
   * Resetting a cashier's password is the owner's job and only the owner's: a
   * staff address receives no mail, so there is no "forgot password" link that
   * could ever reach them. This is the way back in.
   */

  const applyReset = async () => {
    if (!resetting) return;
    if (newPassword.length < 8) return toast.error("Use at least 8 characters");

    setSavingPassword(true);
    const token = await accessToken();
    const result = token
      ? await resetStaffPassword({ data: { token, staffId: resetting.id, password: newPassword } })
      : { ok: false, error: "Sign in again first" };
    setSavingPassword(false);

    if (!result.ok) return toast.error(result.error ?? "Could not reset the password");
    toast.success(`${resetting.name} can sign in with the new password`);
    setResetting(null);
    setNewPassword("");
  };

  const userActions = (u: User) => (
    <>
      <Button variant="outline" size="sm" onClick={() => openEdit(u)}>
        <Pencil className="h-3.5 w-3.5 mr-1.5" />
        Edit
      </Button>
      {u.role === "shop" && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setResetting(u);
            setNewPassword("");
          }}
        >
          <KeyRound className="h-3.5 w-3.5 mr-1.5" />
          Password
        </Button>
      )}
      {u.id === user.id ? (
        <Button
          variant="outline"
          size="sm"
          disabled
          title="You can't deactivate the account you're signed in with"
        >
          Your account
        </Button>
      ) : u.active ? (
        <Confirm
          title={`Deactivate ${u.name}?`}
          description={
            <>
              <strong>{u.email}</strong> will no longer be able to sign in. Their sales history is
              kept and you can reactivate the login at any time.
            </>
          }
          confirmLabel="Deactivate"
          destructive
          onConfirm={() => toggleActive(u)}
          trigger={
            <Button variant="outline" size="sm">
              Deactivate
            </Button>
          }
        />
      ) : (
        <Button variant="outline" size="sm" onClick={() => toggleActive(u)}>
          Reactivate
        </Button>
      )}
    </>
  );

  const resetDialog = (
    <Dialog open={Boolean(resetting)} onOpenChange={(v) => !v && setResetting(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New password for {resetting?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Password</Label>
            <PasswordInput
              autoComplete="new-password"
              value={newPassword}
              onChange={setNewPassword}
              minLength={8}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              At least 8 characters. Tell it to them yourself — nothing is emailed, because a shop
              login has no mailbox.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setResetting(null)}>
            Cancel
          </Button>
          <Button onClick={applyReset} disabled={savingPassword || newPassword.length < 8}>
            {savingPassword ? "Saving…" : "Set password"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return (
    <div>
      {resetDialog}
      <PageHeader
        title="Users"
        subtitle="Manage owner & shop logins."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-1.5" />
                Add shop login
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New shop login</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Shop 4 Cashier"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Username</Label>
                  <Input
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    placeholder="e.g. gulberg"
                  />
                  <p className="text-xs text-muted-foreground">
                    What they type to sign in. No email needed.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Password</Label>
                  <PasswordInput
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(password) => setForm({ ...form, password })}
                  />
                  <p className="text-xs text-muted-foreground">
                    At least 8 characters. Tell it to them yourself — nothing is emailed.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Shop</Label>
                  <Select
                    value={form.shopId}
                    onValueChange={(v) => setForm({ ...form, shopId: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {shops.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={save} disabled={creating}>
                  {creating ? "Creating…" : "Create login"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />
      <Card className="overflow-hidden">
        <MobileCards
          items={users}
          keyOf={(u) => u.id}
          empty="No users yet."
          render={(u) => (
            <ListCard
              title={
                <span className="flex items-center gap-2">
                  <span className="h-7 w-7 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
                    {u.name.charAt(0)}
                  </span>
                  {u.name}
                </span>
              }
              subtitle={u.email}
              badges={
                <>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${u.role === "admin" ? "bg-primary/15 text-primary" : "bg-accent/20 text-accent-strong"}`}
                  >
                    {u.role}
                  </span>
                  <StatusPill status={u.active ? "Active" : "Disabled"} />
                </>
              }
              fields={[
                {
                  label: "Shop",
                  value: u.shopId
                    ? (shops.find((s) => s.id === u.shopId)?.name ?? "Unknown shop")
                    : "All shops",
                },
                { label: "Last login", value: u.lastLogin ?? "Never signed in" },
              ]}
              actions={userActions(u)}
            />
          )}
        />
        <TableWrap>
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Shop</th>
                <th className="px-4 py-3 font-medium">Last login</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  className={`border-t hover:bg-muted/40 ${u.active ? "" : "opacity-60"}`}
                >
                  <td className="px-4 py-3 font-medium">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
                        {u.name.charAt(0)}
                      </div>
                      {u.name}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${u.role === "admin" ? "bg-primary/15 text-primary" : "bg-accent/20 text-accent-strong"}`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {u.shopId ? shops.find((s) => s.id === u.shopId)?.name : "All shops"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {u.lastLogin ?? "Never signed in"}
                  </td>
                  {/* Was "OK"/"OUT" — stock-level wording on a user account. */}
                  <td className="px-4 py-3">
                    <StatusPill status={u.active ? "Active" : "Disabled"} />
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="flex gap-2 justify-end">{userActions(u)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit login</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                autoFocus
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              />
            </div>
            {/* The owner isn't tied to one shop, so the picker only applies to
                shop logins — showing it for an admin would imply otherwise. */}
            {editing?.role === "shop" && (
              <div className="space-y-1.5">
                <Label>Shop</Label>
                <Select
                  value={editForm.shopId}
                  onValueChange={(v) => setEditForm({ ...editForm, shopId: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {shops.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Moving a cashier to another shop changes which till and stock they see. Sales they
                  already rang up stay with the shop they were sold at.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={saveEdit}>Save changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
