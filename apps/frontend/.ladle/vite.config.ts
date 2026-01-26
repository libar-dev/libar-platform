import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
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
