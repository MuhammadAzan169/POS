/**
 * Signing in, and finding out what the signed-in person is allowed to be.
 *
 * Two steps, deliberately separate:
 *
 *   1. Supabase authenticates — this proves an email and password match, and
 *      hands back a session. Anyone can reach this; the anon key is in the page.
 *   2. The database decides the role — `staff` is read with that session, and
 *      row-level security means a stranger's session sees nothing.
 *
 * A session on its own grants nothing. Without a profile row the app shows "no
 * access" and signs the person straight back out, which is why leaving signups
 * open is not a hole: an uninvited account is an account that can see an empty
 * database.
 */
import { supabase } from "./supabase";
import { STAFF_EMAIL_DOMAIN, staffEmail, usernameFromEmail } from "./auth-identity";
import type { Role, User } from "./store-types";

export interface AuthResult {
  user: User | null;
  /** Set when the sign-in itself worked but the account has no access. */
  error?: string;
}

/** The profile row as the database holds it. */
interface StaffRow {
  id: string;
  name: string;
  role: Role;
  shop_id: string | null;
  active: boolean;
}

const toUser = (row: StaffRow, email: string): User => ({
  id: row.id,
  name: row.name,
  email,
  role: row.role,
  shopId: row.shop_id ?? undefined,
  active: row.active,
});

/**
 * The profile for whoever is signed in, or null.
 *
 * Also returns null for a signed-in account that has been switched off, so a
 * deactivated worker is treated exactly like a stranger from the next page load
 * — the policies stop them mid-session, this stops them at the door.
 */
export async function currentUser(): Promise<User | null> {
  if (!supabase) return null;
  const { data: session } = await supabase.auth.getUser();
  const account = session.user;
  if (!account) return null;

  const { data, error } = await supabase
    .from("staff")
    .select("id, name, role, shop_id, active")
    .eq("id", account.id)
    .maybeSingle();

  if (error || !data || !data.active) return null;
  return toUser(data as StaffRow, account.email ?? "");
}

/** The owner signs in with an email address; a worker with a username. */
export async function signIn(
  identifier: string,
  password: string,
  kind: "owner" | "staff",
): Promise<AuthResult> {
  if (!supabase) return { user: null, error: "Sign-in is not configured" };

  const email = kind === "staff" ? staffEmail(identifier) : identifier.trim().toLowerCase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Deliberately not "no such user" versus "wrong password": telling an
    // attacker which addresses exist is free reconnaissance.
    return {
      user: null,
      error: kind === "staff" ? "Wrong username or password" : "Wrong email or password",
    };
  }

  const user = await currentUser();
  if (!user) {
    // Authenticated, but nobody the system knows. Do not leave the session
    // lying around.
    await signOut();
    return { user: null, error: "This account has no access. Ask the owner to set it up." };
  }
  return { user };
}

export async function signOut() {
  await supabase?.auth.signOut();
}

/** Whether an owner has been claimed yet. Safe to call before signing in. */
export async function hasOwner(): Promise<boolean> {
  if (!supabase) return true;
  const { data, error } = await supabase.rpc("has_owner");
  // On error, assume there IS an owner: the failure mode of guessing wrong that
  // way is a sign-in form nobody can use, rather than an open door.
  return error ? true : Boolean(data);
}

/**
 * Creates the very first owner: sign up, then claim.
 *
 * The claim is what actually grants the role, and the database refuses it once
 * an owner exists — so this cannot be used twice, and a second person running
 * it gets an account with no access rather than a share of the business.
 */
export async function createOwner(
  email: string,
  password: string,
  name: string,
): Promise<AuthResult> {
  if (!supabase) return { user: null, error: "Sign-in is not configured" };

  const address = email.trim().toLowerCase();
  const { error: signUpError } = await supabase.auth.signUp({ email: address, password });

  // An existing account is fine — they may have signed up and not finished
  // claiming — so fall through to a sign-in rather than failing here.
  if (signUpError && !/already/i.test(signUpError.message)) {
    return { user: null, error: signUpError.message };
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: address,
    password,
  });
  if (signInError) {
    return {
      user: null,
      error: /confirm/i.test(signInError.message)
        ? "Check the confirmation setting in Supabase, or confirm this address first."
        : signInError.message,
    };
  }

  const { error: claimError } = await supabase.rpc("claim_owner", { owner_name: name.trim() });
  if (claimError) {
    await signOut();
    return { user: null, error: claimError.message };
  }

  return { user: await currentUser() };
}

/* ------------------------------------------------------------- passwords */

/**
 * Starts a password reset: Supabase emails a six-digit code.
 *
 * Only useful for an account with a real mailbox, which in this system means
 * the owner. Shop staff are addressed at a domain that receives nothing, by
 * design — their passwords are reset by the owner from the Users page, which is
 * the only way it could work for someone with no email.
 */
export async function requestPasswordReset(email: string): Promise<{ error?: string }> {
  if (!supabase) return { error: "Sign-in is not configured" };

  const address = email.trim().toLowerCase();
  if (address.endsWith(`@${STAFF_EMAIL_DOMAIN}`)) {
    return { error: "Shop accounts have no email. Ask the owner to reset your password." };
  }

  const { error } = await supabase.auth.resetPasswordForEmail(address);
  // Deliberately not reporting "no such account": whether an address is
  // registered is not something a stranger should be able to test for.
  return error && !/not found|no user/i.test(error.message) ? { error: error.message } : {};
}

/**
 * Checks the emailed code and, if it matches, sets the new password.
 *
 * The two are one step on purpose. Verifying a recovery code hands back a live
 * session, so splitting them would leave a window where anyone holding the code
 * is simply signed in — the password change is what that session is FOR, and it
 * should be spent immediately.
 */
export async function resetPasswordWithCode(
  email: string,
  code: string,
  password: string,
): Promise<AuthResult> {
  if (!supabase) return { user: null, error: "Sign-in is not configured" };

  const { error: codeError } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: code.trim(),
    type: "recovery",
  });
  if (codeError) return { user: null, error: "That code is wrong or has expired" };

  const { error: setError } = await supabase.auth.updateUser({ password });
  if (setError) return { user: null, error: setError.message };

  const user = await currentUser();
  if (!user) {
    await signOut();
    return { user: null, error: "Password changed, but this account has no access." };
  }
  return { user };
}

/**
 * Changes the password of whoever is signed in.
 *
 * The current password is checked first by signing in with it. Supabase does
 * not require that — `updateUser` would take the new password on the strength
 * of the session alone — which would mean a till left unlocked at a counter is
 * a till whose password a passer-by can change, locking out the person whose
 * account it is.
 *
 * Works for shop staff as well as the owner: changing your own password needs
 * no email, only the old one.
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ error?: string }> {
  if (!supabase) return { error: "Sign-in is not configured" };

  const { data } = await supabase.auth.getUser();
  const email = data.user?.email;
  if (!email) return { error: "You are not signed in" };

  const { error: checkError } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
  });
  if (checkError) return { error: "Your current password is not right" };

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  return error ? { error: error.message } : {};
}

/** Re-reads the profile whenever the session changes in another tab. */
export function onAuthChange(handler: (user: User | null) => void) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange(() => {
    void currentUser().then(handler);
  });
  return () => data.subscription.unsubscribe();
}

export { usernameFromEmail };
