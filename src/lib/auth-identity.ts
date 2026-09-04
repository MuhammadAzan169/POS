/**
 * How a shop worker's username becomes something an auth system can hold.
 *
 * Supabase Auth has no concept of a username — a password sign-in is
 * `signInWithPassword({ email, password })`. Shop staff are not given email
 * addresses to check, so each account gets a synthesised one they never see:
 * the username they type, at a domain that receives no mail. The account is
 * created with its email already confirmed, so nothing is ever sent to it.
 *
 * Kept in one place because the sign-in screen and the admin function that
 * creates the account must agree exactly; if they ever disagreed on the domain,
 * the worker would be created under one address and made to sign in as another.
 */

/** Never receives mail. Accounts here are made by the owner, confirmed on creation. */
export const STAFF_EMAIL_DOMAIN = "staff.apos.pk";

/**
 * The address behind a username.
 *
 * An owner who types a full email address gets it back untouched, so the same
 * field still works for an account that genuinely has one.
 */
export function staffEmail(username: string): string {
  const name = username.trim().toLowerCase();
  if (name.includes("@")) return name;
  // Spaces and punctuation are not addressable; a username is one word.
  return `${name.replace(/[^a-z0-9._-]/g, "")}@${STAFF_EMAIL_DOMAIN}`;
}

/** The username behind an address, for showing a signed-in worker who they are. */
export function usernameFromEmail(email: string): string {
  return email.toLowerCase().endsWith(`@${STAFF_EMAIL_DOMAIN}`) ? email.split("@")[0] : email;
}
