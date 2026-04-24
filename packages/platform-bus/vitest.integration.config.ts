import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@libar-dev/platform-bus-integration",
    environment: "node",
    // Fail fast if Docker backend isn't running
    globalSetup: "./tests/integration/support/checkBackendHealth.ts",
    env: {
      CONVEX_URL: process.env.CONVEX_URL ?? "http://127.0.0.1:3210",
    },
    include: [
      "tests/integration/**/*.integration.test.ts",
      "tests/integration/**/*.integration.steps.ts",
      "tests/steps/**/*.integration.steps.ts",
    ],
    testTimeout: 60000,
    hookTimeout: 30000,
    // Run sequentially to avoid OCC transaction conflicts
    isolate: true,
    pool: "forks",
    fileParallelism: false,
    maxWorkers: 1,
  },
});
