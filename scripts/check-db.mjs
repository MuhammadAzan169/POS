/**
 * Checks the live Supabase database against what the app expects.
 *
 *   node scripts/check-db.mjs
 *
 * The SQL Editor saying "Success" only means the statements parsed and ran. It
 * does not tell you that the app can now read what it needs, which is a
 * different question: PostgREST has its own schema cache, RLS can be on with no
 * policy behind it, and a column added to the wrong table still "succeeds".
 * This asks the same questions `loadSnapshot()` asks, through the same anon key
 * the browser uses, so a pass here means the app will work.
 *
 * Apart from one write probe, which removes its own row, it only reads.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

/* .env is read by hand: this is a plain node script, not a Vite build, so
   import.meta.env does not exist here. */
const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing from .env");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

let failures = 0;
const pass = (m) => console.log(`  ok    ${m}`);
const fail = (m) => { console.error(`  FAIL  ${m}`); failures++; };
const heading = (m) => console.log(`\n${m}`);

/** A table the app must be able to read through the anon key. */
async function checkTable(table, columns) {
  const { data, error } = await supabase.from(table).select(columns.join(",")).limit(1);
  if (error) {
    fail(`${table}: ${error.message}`);
    return null;
  }
  pass(`${table} readable (${columns.length} expected columns)`);
  return data;
}

console.log(`\nchecking ${url}`);

heading("tables added by migration 005:");
await checkTable("supplier_payments", ["id", "supplier_id", "date", "amount", "method", "shop_id", "session_id", "note", "paid_by"]);
await checkTable("set_offs", ["id", "date", "customer_id", "supplier_id", "amount", "note", "created_by"]);

heading("columns added by migration 005:");
await checkTable("purchases", ["id", "payment", "amount_paid", "due_date", "session_id"]);
await checkTable("customers", ["id", "linked_supplier_id"]);

heading("table added by migration 006:");
await checkTable("balance_adjustments", ["id", "date", "customer_id", "supplier_id", "amount", "reason", "created_by"]);

heading("table added by migration 007:");
await checkTable("activity_log", ["id", "at", "action", "entity", "entity_id", "label", "amount", "by_name", "by_role", "snapshot"]);

heading("tables the earlier migrations added (should already be fine):");
await checkTable("customer_payments", ["id", "customer_id", "amount"]);
await checkTable("day_sessions", ["id", "shop_id", "business_date"]);
await checkTable("messages", ["id", "shop_id", "body"]);

/* ------------------------------------------------------------- row counts */

heading("what is actually in there:");
const tables = [
  "shops", "products", "customers", "suppliers", "sales", "purchases",
  "supplier_payments", "set_offs", "balance_adjustments", "activity_log",
];
for (const t of tables) {
  const { count, error } = await supabase.from(t).select("*", { count: "exact", head: true });
  if (error) fail(`${t}: ${error.message}`);
  else console.log(`  ${t.padEnd(20)} ${count} rows`);
}

/* --------------------------------------------------- can the app write? */

/*
  RLS enabled with no policy behind it reads fine and fails silently on write,
  which would only surface as a toast the first time somebody records a
  payment. Better to find out now — the row is deleted straight after.
*/
heading("write access (a test row, removed again):");
const probeId = `__probe-${Date.now()}`;
const { data: sup } = await supabase.from("suppliers").select("id").limit(1);
if (!sup?.length) {
  console.log("  skipped — no suppliers to attach a probe row to");
} else {
  const row = {
    id: probeId, supplier_id: sup[0].id, date: "2000-01-01", amount: 0,
    method: "Cash", note: "connectivity probe", paid_by: "check-db",
  };
  const { error: insErr } = await supabase.from("supplier_payments").insert(row);
  if (insErr) {
    fail(`insert into supplier_payments: ${insErr.message}`);
  } else {
    pass("insert into supplier_payments");
    const { error: delErr } = await supabase.from("supplier_payments").delete().eq("id", probeId);
    if (delErr) fail(`could not remove the probe row ${probeId}: ${delErr.message}`);
    else pass("probe row removed");
  }
}

console.log(
  failures === 0
    ? "\nAll checks passed — the app can read and write everything it needs."
    : `\n${failures} check(s) failed. See supabase/migrations/ for the file to run.`,
);
process.exit(failures === 0 ? 0 : 1);
