import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  ssr: {
    noExternal: ["@convex-dev/react-query", "@tanstack/react-router-ssr-query"],
  },
  server: {
    port: 3000,
    headers: {
      // Prevent browser caching SSR hydration data in development
      // Fixes: "Cannot read properties of undefined (reading 'isDehydrated')"
      // when TanStack Start's window.$_TSR becomes stale
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
    },
    fs: {
      // Allow serving files from monorepo root node_modules
      // Required because pnpm hoists packages to root, and symlinks
      // from libar-platform/apps/frontend/node_modules/ point there
      allow: [
        // Current package directory
        path.resolve(__dirname),
        // Monorepo root (3 levels up: frontend -> apps -> libar-platform -> root)
        path.resolve(__dirname, "../../.."),
      ],
    },
  },
  plugins: [
    // Tailwind CSS v4 Vite plugin
    tailwindcss(),
    // Enables Vite to resolve imports using path aliases from tsconfig
    tsconfigPaths(),
    // TanStack Start configuration
    tanstackStart({
      srcDirectory: ".", // Root of the app
      router: {
        // Use 'app' directory to maintain Next.js-like structure
        routesDirectory: "app",
      },
    }),
    // React plugin for JSX/TSX support
    react(),
  ],
});
