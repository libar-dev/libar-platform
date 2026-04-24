import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "tests/steps/**/*.steps.ts"],
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
