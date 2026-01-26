import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  server: {
    fs: {
      // Allow serving files from monorepo root node_modules
      // Required because pnpm hoists packages to root, and symlinks
      // from libar-platform/apps/frontend/node_modules/ point there
      allow: [
        // Current Ladle directory
        path.resolve(__dirname),
        // Monorepo root (4 levels up: .ladle -> frontend -> apps -> libar-platform -> root)
        path.resolve(__dirname, "../../../.."),
      ],
    },
  },
  plugins: [tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../"),
      "@convex": path.resolve(__dirname, "../convex"),
      // TanStack Router mock for Ladle - replaces TanStack Router with
      // Ladle-compatible implementations that render without router context
      "@tanstack/react-router": path.resolve(__dirname, "./mocks/tanstack-router.tsx"),
    },
  },
});
