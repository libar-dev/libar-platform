import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@libar-dev/platform-bc",
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/steps/**/*.steps.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary"],
      thresholds: {
        statements: 89,
        branches: 98,
        functions: 84,
        lines: 89,
      },
    },
  },
});
