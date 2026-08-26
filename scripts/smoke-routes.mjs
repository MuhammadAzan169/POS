/**
 * Every route renders, and none of them render the error page.
 *
 *   npm run dev          (in another terminal)
 *   node scripts/smoke-routes.mjs
 *
 * The route list is read out of routeTree.gen.ts rather than typed here, so a
 * page added tomorrow is checked tomorrow without anyone remembering to add it.
 *
 * This is a server-render check: it proves the module graph for each page loads
 * and the shell renders. The pages themselves are client-rendered behind the
 * demo login, so what it catches is an import cycle, a crash at module scope, or
 * a route that fell out of the tree — the failures that take a page down
 * completely rather than the ones that render it wrongly.
 */
import { readFileSync } from "node:fs";

const BASE = process.env.SMOKE_BASE ?? "http://localhost:8080";

/** Route paths declared in the generated tree, e.g. '/app/ledger'. */
function routesFromTree() {
  const src = readFileSync("src/routeTree.gen.ts", "utf8");
  const found = new Set(["/"]);
  // The FileRoutesByFullPath block lists every reachable path exactly once.
  for (const m of src.matchAll(/^\s*'(\/[^']*)':\s*typeof/gm)) found.add(m[1]);
  return [...found]
    // Layout routes are not pages; they have no markup of their own.
    .filter((r) => r !== "/app")
    .sort();
}

const routes = routesFromTree();
console.log(`checking ${routes.length} routes against ${BASE}\n`);

let failures = 0;

/** The error boundary's own copy — if this shows up, the page threw. */
const ERROR_MARKERS = ["This page didn't load", "Something went wrong on our end", "Page not found"];

for (const route of routes) {
  let status = 0;
  let body = "";
  try {
    const res = await fetch(`${BASE}${route}`, { redirect: "manual" });
    status = res.status;
    body = await res.text();
  } catch (e) {
    console.log(`  FAIL  ${route.padEnd(20)} — ${e.message}`);
    failures++;
    continue;
  }

  const broken = ERROR_MARKERS.find((m) => body.includes(m));
  if (status !== 200) {
    console.log(`  FAIL  ${route.padEnd(20)} — HTTP ${status}`);
    failures++;
  } else if (broken) {
    console.log(`  FAIL  ${route.padEnd(20)} — rendered the error page ("${broken}")`);
    failures++;
  } else if (body.length < 500) {
    console.log(`  FAIL  ${route.padEnd(20)} — suspiciously empty (${body.length} bytes)`);
    failures++;
  } else {
    console.log(`  ok    ${route.padEnd(20)} ${status}  ${body.length} bytes`);
  }
}

/* A route that exists as a file but never made it into the tree is invisible to
   the router, which is a silent failure — the link just does nothing. */
const files = readFileSync("src/routeTree.gen.ts", "utf8");
const expected = ["/app/ledger", "/app/customers", "/app/suppliers", "/app/purchases", "/app/daybook"];
expected.forEach((r) => {
  if (!files.includes(`'${r}'`)) {
    console.log(`  FAIL  ${r} is missing from the generated route tree`);
    failures++;
  }
});

console.log(`\n${failures === 0 ? `All ${routes.length} routes render.` : `${failures} route check(s) failed.`}`);
process.exit(failures === 0 ? 0 : 1);
