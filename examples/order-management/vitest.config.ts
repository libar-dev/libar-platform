import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Vitest configuration for unit tests
 *
 * Uses convex-test mock backend for fast, isolated testing.
 * Runs Gherkin step definition files as tests.
 *
 * Usage: pnpm test:unit
 */
export default defineConfig({
  resolve: {
    alias: {
      // Workspace package subpath exports don't resolve correctly in Vite
      // without explicit alias configuration for symlinked packages
      "@libar-dev/platform-decider/testing": path.resolve(
        __dirname,
        "../../packages/platform-decider/dist/testing/index.js"
      ),
      "@libar-dev/platform-decider": path.resolve(
        __dirname,
        "../../packages/platform-decider/dist/index.js"
      ),
      "@libar-dev/platform-core/testing": path.resolve(
        __dirname,
        "../../packages/platform-core/dist/testing/index.js"
      ),
      "@libar-dev/platform-fsm/testing": path.resolve(
        __dirname,
        "../../packages/platform-fsm/dist/testing/index.js"
      ),
      "@libar-dev/platform-fsm": path.resolve(
        __dirname,
        "../../packages/platform-fsm/dist/index.js"
      ),
    },
  },
  test: {
    globals: true,
    environment: "edge-runtime",
    include: [
      "tests/unit/**/*.test.ts",
      "tests/steps/**/*.steps.ts", // Gherkin step files
    ],
    exclude: [
      "tests/**/*.integration.test.ts",
      "tests/steps/common.steps.ts", // Utility file, not a test file
    ],
    server: {
      deps: {
        inline: ["convex-test"],
      },
    },
    testTimeout: 30000,
    hookTimeout: 15000,
    env: {
      IS_TEST: "true", // Enable test-only mutations and no-op workpool
    },
  },
});
