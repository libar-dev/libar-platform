import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for integration tests
 *
 * Tests run against a real Convex backend via Docker.
 * Uses ConvexTestingHelper from convex-helpers/testing.
 *
 * Usage:
 *   - Full cycle: just test-integration
 *   - CI (backend already running): pnpm test:integration:ci
 *
 * IMPORTANT: workspace: false prevents vitest.workspace.ts from interfering
 */
export default defineConfig({
  // Empty projects array to prevent vitest.workspace.ts from interfering
  projects: [],
  test: {
    globals: true,
    env: {
      CONVEX_URL: "http://127.0.0.1:3210",
    },
    include: [
      "tests/**/*.integration.test.ts",
      "tests/integration-steps/durable-adapters.integration.steps.ts",
    ],
    environment: "node",
    testTimeout: 60000, // 1 minute per test
    hookTimeout: 30000, // 30 seconds for hooks
    teardownTimeout: 15000, // 15 seconds for teardown
    isolate: true,
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true, // Run integration tests in single fork
        isolate: true,
      },
    },
    // Disable parallel execution for integration tests
    fileParallelism: false,
    maxWorkers: 1,
    // Disable coverage for integration tests
    coverage: {
      enabled: false,
    },
    server: {
      deps: {
        inline: ["convex-test"],
      },
    },
  },
});
