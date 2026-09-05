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
 * Without them the app has nothing to show: there is no built-in data to fall
 * back to, and it says so rather than inventing records.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        /*
         * The session is kept, and kept alive.
         *
         * These were both off, from when the app had its own pretend login and
         * there was no real session worth storing. Left off with real sign-in
         * in place, every page refresh threw the session away and dropped the
         * person back at the login screen — and a shift at the till outlasting
         * one access token would have done the same thing mid-sale.
         */
        persistSession: true,
        autoRefreshToken: true,
        // Finishes reading the stored session before the app asks who is signed
        // in, so a refresh does not race the answer.
        detectSessionInUrl: true,
      },
    })
  : null;
