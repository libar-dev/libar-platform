import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for platform-store integration tests.
 *
 * Tests the EventStore component against a real Convex backend (Docker).
 * Uses the order-management example app's testing API to exercise
 * store operations (appendToStream, readStream, getStreamVersion).
 *
 * Port: 3215 (infrastructure tests) or 3210 (app tests)
 * Can be overridden via CONVEX_URL environment variable.
 */
export default defineConfig({
  test: {
    name: "@libar-dev/platform-store-integration",
    environment: "node",
    // Fail fast if Docker backend isn't running
    globalSetup: "./tests/integration/support/checkBackendHealth.ts",
    env: {
      CONVEX_URL: process.env.CONVEX_URL ?? "http://127.0.0.1:3210",
    },
    include: [
      "tests/integration/**/*.integration.test.ts",
      "tests/integration/**/*.integration.steps.ts",
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
