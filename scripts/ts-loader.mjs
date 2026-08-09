/**
 * Minimal TypeScript loader for the seed generator.
 *
 * seed-data.ts contains only data plus `import type` statements, so stripping
 * the type-only imports and the annotations esbuild would normally remove is
 * enough — no full compiler needed. Used solely by scripts/gen-seed-sql.mjs.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, next) {
  if (specifier.endsWith(".ts")) {
    return { url: new URL(specifier, context.parentURL).href, shortCircuit: true, format: "module" };
  }
  // TypeScript source omits the extension ("./store-types"); add it back.
  if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) {
    return { url: new URL(`${specifier}.ts`, context.parentURL).href, shortCircuit: true, format: "module" };
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (!url.endsWith(".ts")) return next(url, context);

  let src = await readFile(fileURLToPath(url), "utf8");

  // Interfaces and type aliases vanish at runtime — remove them so Node can parse
  // the file. Interface bodies always close with `}` at column 0 in this codebase.
  // \r?\n throughout: this repo's files use CRLF endings.
  src = src.replace(/^export interface [\s\S]*?^\}\r?\n/gm, "");
  src = src.replace(/^export type [^=]+=[^;]+;\r?\n/gm, "");

  // Drop `import type { ... } from "..."` blocks entirely.
  src = src.replace(/import\s+type\s*\{[\s\S]*?\}\s*from\s*["'][^"']+["'];?/g, "");
  // Drop type-only members from mixed imports: `import { a, type B } from "x"`.
  src = src.replace(/import\s*\{([\s\S]*?)\}\s*from\s*(["'][^"']+["'])/g, (m, names, from) => {
    const kept = names
      .split(",")
      .map((n) => n.trim())
      .filter((n) => n && !n.startsWith("type "));
    return kept.length ? `import { ${kept.join(", ")} } from ${from}` : "";
  });
  // Strip annotations on exported consts and function return types.
  src = src.replace(/export const (\w+)\s*:\s*[^=]+=/g, "export const $1 =");
  src = src.replace(/export function (\w+)\(\)\s*:\s*[^{]+\{/g, "export function $1() {");
  // Strip inline annotations on local declarations and `as X` casts.
  src = src.replace(/const (\w+)\s*:\s*[A-Za-z_$][\w<>\[\]., |]*\s*=/g, "const $1 =");
  src = src.replace(/\s+as\s+[A-Za-z_$][\w<>\[\].|]*/g, "");

  return { format: "module", source: src, shortCircuit: true };
}
