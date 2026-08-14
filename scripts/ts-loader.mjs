/**
 * TypeScript loader for the seed generator.
 *
 * Used solely by scripts/gen-seed-sql.mjs, which imports src/lib/seed-data.ts
 * so the SQL it writes is generated from exactly the data the app shows.
 *
 * This used to strip types with a pile of regexes. That worked only for as long
 * as seed-data.ts stayed pure data — the first typed helper function it pulled
 * in broke the build with a parse error. TypeScript is already a devDependency,
 * so it does the transpiling now: types are erased properly, and nothing here
 * needs touching when the source grows a syntax the regexes never anticipated.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import ts from "typescript";

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
    },
  });

  return { format: "module", source: outputText, shortCircuit: true };
}
