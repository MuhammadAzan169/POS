import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase connection.
 *
 * Both values are `VITE_`-prefixed, meaning they are compiled into the browser
 * bundle and are therefore PUBLIC. That is correct for these two — the anon key
 * is designed to be published and access is meant to be governed by Row Level
 * Security. Never put a service_role key or an AI provider key here; those go in
 * unprefixed env vars read only by server functions.
 *
 * When the variables are missing the app falls back to the built-in demo data,
 * so a fresh clone still runs without any setup.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        // No Supabase Auth yet — the app still uses its own demo login, so there
        // is no session to persist or refresh.
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

/** Human-readable reason the app is running on demo data, for the UI to show. */
export const supabaseStatus = isSupabaseConfigured
  ? "connected"
  : "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env to use Supabase.";
