import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@libar-dev/platform-bus",
    include: ["tests/unit/**/*.test.ts"],
    exclude: ["tests/integration/**", "tests/steps/**"],
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
