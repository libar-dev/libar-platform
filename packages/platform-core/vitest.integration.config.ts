import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for infrastructure integration tests.
 *
 * These tests run against a real Convex backend (Docker) to validate
 * the @libar-dev/platform-* infrastructure packages working together:
 * - CommandOrchestrator + Workpool integration
 * - Projection processing flow
 * - Dead letter handling
 *
 * Port: 3215 (infrastructure tests, separate from app tests on 3210)
 * Can be overridden via CONVEX_URL environment variable.
 *
 * Run with: pnpm test:integration
 */
export default defineConfig({
  test: {
    name: "@libar-dev/platform-core-integration",
    environment: "node",
    env: {
      // Default to app integration test port (3210) for tests that use order-management
      // Infrastructure-only tests can override to 3215 via CONVEX_URL env var
      CONVEX_URL: process.env.CONVEX_URL ?? "http://127.0.0.1:3210",
    },
    include: [
      "tests/integration/**/*.integration.test.ts",
      "tests/integration/**/*.integration.steps.ts", // BDD Gherkin integration tests
    ],
    testTimeout: 60000, // 60s for integration tests
    hookTimeout: 30000,
    // Run sequentially to avoid OCC transaction conflicts at the backend level
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
        isolate: true,
      },
    },
    // Ensure tests run sequentially (matches order-management config)
    fileParallelism: false,
    maxWorkers: 1,
  },
});
