import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

/**
 * Which server bundle to build.
 *
 * Nitro's output shape is host-specific: Cloudflare wants a Worker module,
 * Vercel wants a `.vercel/output` Build Output API directory. Hardcoding
 * `cloudflare-module` meant every Vercel deployment built a Cloudflare Worker
 * that Vercel had nothing to serve — the build "succeeded" locally and the
 * deployment failed, so the live site never moved off an older version.
 *
 * Vercel sets `VERCEL=1` in its build container, so the host announces itself.
 * `NITRO_PRESET` still wins for anyone deploying somewhere else, and a local
 * `npm run build` keeps producing the Cloudflare bundle as before.
 */
function hostPreset() {
  if (process.env.NITRO_PRESET) return process.env.NITRO_PRESET;
  if (process.env.VERCEL) return "vercel";
  return "cloudflare-module";
}

export default defineConfig(({ command }) => ({
  plugins: [
    tailwindcss(),
    tanstackStart({
      // Keeps server-only modules out of the client bundle.
      importProtection: {
        behavior: "error",
        client: {
          files: ["**/server/**"],
          specifiers: ["server-only"],
        },
      },
      // Routes TanStack Start's bundled server entry through src/server.ts,
      // which wraps SSR errors into a readable page.
      server: { entry: "server" },
    }),
    // Nitro only participates in builds; running it under `vite dev` is not supported.
    ...(command === "build" ? [nitro({ defaultPreset: hostPreset() })] : []),
    viteReact(),
  ],
  resolve: {
    // Vite 8 resolves tsconfig "paths" (the @/* alias) natively; the
    // vite-tsconfig-paths plugin is no longer needed and warns if present.
    tsconfigPaths: true,
    // A second copy of React (or the query client) breaks hooks and context.
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  server: {
    host: "::",
    port: 8080,
    strictPort: true,
  },
  preview: {
    host: "::",
    port: 8080,
  },
}));
