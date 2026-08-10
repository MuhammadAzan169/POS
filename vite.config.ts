import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

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
    ...(command === "build" ? [nitro({ defaultPreset: "cloudflare-module" })] : []),
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
