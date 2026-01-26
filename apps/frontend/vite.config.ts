import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  server: {
    port: 3000,
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
