import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@libar-dev/platform-store",
    include: ["tests/unit/**/*.test.ts"],
    exclude: ["tests/integration/**"],
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text-summary"],
      thresholds: {
        statements: 98,
        branches: 98,
        functions: 98,
        lines: 98,
      },
    },
  },
});
