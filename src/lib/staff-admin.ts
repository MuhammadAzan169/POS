/**
 * Creating and managing shop logins — the operations only the owner may do.
 *
 * Everything inside `.handler()` runs on the server, which is the whole point:
 * making a login requires Supabase's `service_role` key, and that key bypasses
 * every row-level security policy in the database. It has no `VITE_` prefix for
 * the same reason `OPENROUTER_API_KEY` does not — a VITE_ variable is compiled
 * into the JavaScript every visitor downloads, and this one would hand them the
 * entire business.
 *
 * Every function here checks that the CALLER is an active admin before doing
 * anything. Without that check the endpoint itself would be the hole: an RPC
 * that creates accounts, reachable by anyone who opens the network tab.
 */
import { createServerFn } from "@tanstack/react-start";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { staffEmail } from "./auth-identity";

export interface NewStaffInput {
  /** The caller's access token, so the server can check who is asking. */
  token: string;
  username: string;
  password: string;
  name: string;
  shopId: string;
  /** Optional, and not used for signing in — kept for future contact. */
  email?: string;
}

export interface StaffResult {
  ok: boolean;
  error?: string;
  staffId?: string;
}

/** The service-role client, or null when the key has not been configured. */
function adminClient(): SupabaseClient | null {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Confirms the caller is an active owner.
 *
 * The token proves who they are; the `staff` table decides what they may do.
 * Both are needed — a valid session belonging to a cashier must not be able to
 * create accounts, and a token for a deactivated owner must not either.
 */
async function callerIsAdmin(admin: SupabaseClient, token: string): Promise<boolean> {
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return false;

  const { data: profile } = await admin
    .from("staff")
    .select("role, active")
    .eq("id", data.user.id)
    .maybeSingle();

  return profile?.role === "admin" && profile.active === true;
}

const MISSING_KEY =
  "Staff accounts need SUPABASE_SERVICE_ROLE_KEY set on the server. See supabase/README.md.";

/**
 * Creates a login for a shop, and the profile that gives it access.
 *
 * The account is created already confirmed: the address is synthesised from the
 * username and receives no mail, so waiting for a confirmation nobody can read
 * would leave every cashier unable to sign in.
 */
export const createStaffAccount = createServerFn({ method: "POST" })
  .validator((data: NewStaffInput) => data)
  .handler(async ({ data }): Promise<StaffResult> => {
    const admin = adminClient();
    if (!admin) return { ok: false, error: MISSING_KEY };
    if (!(await callerIsAdmin(admin, data.token))) {
      return { ok: false, error: "Only the owner can create accounts" };
    }

    const username = data.username.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,}$/.test(username)) {
      return {
        ok: false,
        error: "Usernames are at least 3 characters, letters and numbers only",
      };
    }
    if (data.password.length < 8) {
      return { ok: false, error: "Use a password of at least 8 characters" };
    }

    const { data: created, error } = await admin.auth.admin.createUser({
      email: staffEmail(username),
      password: data.password,
      email_confirm: true,
      // Kept on the login rather than the profile: it is contact information,
      // not something the app reads to decide anything.
      user_metadata: { username, contact_email: data.email?.trim() || null },
    });

    if (error || !created.user) {
      return {
        ok: false,
        error: /already/i.test(error?.message ?? "")
          ? `The username "${username}" is taken`
          : (error?.message ?? "Could not create the account"),
      };
    }

    const { error: profileError } = await admin.from("staff").insert({
      id: created.user.id,
      name: data.name.trim() || username,
      role: "shop",
      shop_id: data.shopId,
      active: true,
    });

    if (profileError) {
      // A login with no profile can sign in and see nothing, which is a
      // confusing state to leave behind — so it is removed rather than left.
      await admin.auth.admin.deleteUser(created.user.id);
      return { ok: false, error: profileError.message };
    }

    return { ok: true, staffId: created.user.id };
  });

export interface ResetStaffInput {
  token: string;
  staffId: string;
  password: string;
}

/**
 * Sets a new password for a shop account.
 *
 * The owner's way back in for a cashier who has forgotten theirs — which is the
 * only way back, because a staff address receives no mail and so can never be
 * sent a reset link.
 */
export const resetStaffPassword = createServerFn({ method: "POST" })
  .validator((data: ResetStaffInput) => data)
  .handler(async ({ data }): Promise<StaffResult> => {
    const admin = adminClient();
    if (!admin) return { ok: false, error: MISSING_KEY };
    if (!(await callerIsAdmin(admin, data.token))) {
      return { ok: false, error: "Only the owner can reset passwords" };
    }
    if (data.password.length < 8) {
      return { ok: false, error: "Use a password of at least 8 characters" };
    }

    // Guarded so this cannot be turned on the owner's own account, or on
    // anything that is not a shop login.
    const { data: profile } = await admin
      .from("staff")
      .select("role")
      .eq("id", data.staffId)
      .maybeSingle();
    if (profile?.role !== "shop") {
      return { ok: false, error: "That is not a shop account" };
    }

    const { error } = await admin.auth.admin.updateUserById(data.staffId, {
      password: data.password,
    });
    return error ? { ok: false, error: error.message } : { ok: true };
  });

export interface DeleteStaffInput {
  token: string;
  staffId: string;
}

/**
 * Removes a shop login entirely.
 *
 * Deactivating is usually the right answer — it keeps the name on past records
 * readable — so this is for accounts created by mistake.
 */
export const deleteStaffAccount = createServerFn({ method: "POST" })
  .validator((data: DeleteStaffInput) => data)
  .handler(async ({ data }): Promise<StaffResult> => {
    const admin = adminClient();
    if (!admin) return { ok: false, error: MISSING_KEY };
    if (!(await callerIsAdmin(admin, data.token))) {
      return { ok: false, error: "Only the owner can remove accounts" };
    }

    const { data: profile } = await admin
      .from("staff")
      .select("role")
      .eq("id", data.staffId)
      .maybeSingle();
    if (profile?.role !== "shop") {
      return { ok: false, error: "That is not a shop account" };
    }

    // `staff.id` cascades from auth.users, so the profile goes with the login.
    const { error } = await admin.auth.admin.deleteUser(data.staffId);
    return error ? { ok: false, error: error.message } : { ok: true };
  });
