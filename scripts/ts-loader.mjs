/**
 * TypeScript loader for the seed generator.
 *
 * Used by scripts/gen-seed-sql.mjs and scripts/test-all.mjs, which import the
 * app's own modules so the SQL they write and the behaviour they check come
 * from exactly the code the app runs.
 *
 * This used to strip types with a pile of regexes. That worked only for as long
 * as seed-data.ts stayed pure data — the first typed helper function it pulled
 * in broke the build with a parse error. TypeScript is already a devDependency,
 * so it does the transpiling now: types are erased properly, and nothing here
 * needs touching when the source grows a syntax the regexes never anticipated.
 */
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/**
 * `.ts` or `.tsx`, whichever is actually on disk.
 *
 * Extensionless imports are ambiguous in TypeScript source: `./store` is
 * store.tsx while `./store-types` is store-types.ts. Guessing `.ts` and
 * stopping was enough while only seed-data.ts was loaded, and broke the moment
 * anything reached a module that imports the provider.
 */
function resolveSource(specifier, parentURL) {
  const candidates = [`${specifier}.ts`, `${specifier}.tsx`];
  for (const candidate of candidates) {
    const url = new URL(candidate, parentURL);
    if (existsSync(fileURLToPath(url))) return url.href;
  }
  // Neither exists; let the .ts form produce the clearer error message.
  return new URL(candidates[0], parentURL).href;
}

export async function resolve(specifier, context, next) {
  if (/\.tsx?$/.test(specifier)) {
    return {
      url: new URL(specifier, context.parentURL).href,
      shortCircuit: true,
      format: "module",
    };
  }
  // The `@/…` alias tsconfig maps to src/.
  if (specifier.startsWith("@/")) {
    const fromSrc = new URL(`../src/${specifier.slice(2)}`, import.meta.url);
    return {
      url: resolveSource(fromSrc.href.replace(/\.[a-z]+$/i, ""), import.meta.url),
      shortCircuit: true,
      format: "module",
    };
  }
  // TypeScript source omits the extension ("./store-types"); add it back.
  if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) {
    return {
      url: resolveSource(specifier, context.parentURL),
      shortCircuit: true,
      format: "module",
    };
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (!/\.tsx?$/.test(url)) return next(url, context);

  const path = fileURLToPath(url);
  const src = await readFile(path, "utf8");

  const { outputText } = ts.transpileModule(src, {
    fileName: path,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      // Type-only imports must be dropped outright: Node would otherwise try to
      // resolve a runtime module for something that only exists at compile time.
      verbatimModuleSyntax: false,
      isolatedModules: true,
      // store.tsx contains JSX. The automatic runtime keeps this working
      // without the loader having to inject a React import of its own.
      jsx: ts.JsxEmit.ReactJSX,
    },
  });

  // `import.meta.env` is Vite's, and does not exist under Node. Modules that
  // read it (supabase.ts) would throw on import, taking down any script that
  // reaches them transitively. Defaulting it to an empty object is exactly what
  // the app already does with missing variables: fall back to demo data.
  const source = outputText.replace(/import\.meta\.env/g, "(import.meta.env ?? {})");

  return { format: "module", source, shortCircuit: true };
}
