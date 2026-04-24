import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@libar-dev/platform-core",
    environment: "node",
    include: [
      "tests/unit/**/*.test.ts",
      "tests/steps/**/*.steps.ts", // Gherkin step files
    ],
    exclude: [
      "tests/integration/**/*.test.ts",
      "tests/planning-stubs/**/*.steps.ts", // Planning artifacts (not yet executable)
    ],
    testTimeout: 30000,
    hookTimeout: 15000,
    coverage: {
      provider: "v8",
      reporter: ["text-summary"],
      thresholds: {
        statements: 76,
        branches: 57,
        functions: 54,
        lines: 84,
      },
    },
  },
});
