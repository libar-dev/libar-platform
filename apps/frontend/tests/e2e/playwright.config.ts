import { defineConfig, devices } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";

const isCI = !!process.env.CI;

// E2E environment ports (SEPARATE from integration tests on 3210 and dev on 3220)
// These match the Justfile E2E variables for consistency
// Note: E2E frontend uses 3005 to avoid collision with dev frontend (3000/3001)
const E2E_BACKEND_PORT = process.env.E2E_BACKEND_PORT || "3230";
const E2E_FRONTEND_PORT = process.env.E2E_FRONTEND_PORT || "3005";

/**
 * Feature file ordering and tag filtering.
 *
 * Empty state tests are tagged with @skip because they require fresh Docker.
 * Run with: just test-e2e-clean to include these tests (auto-restarts Docker).
 *
 * E2E tests use dedicated ports (3230 backend, 3005 frontend) to avoid
 * conflicts with integration tests (3210) and local dev (3220/3000-3001).
 *
 * The namespace-based isolation strategy means old data persists,
 * so empty state tests will fail unless the database is reset.
 */
const testDir = defineBddConfig({
  features: ["./features/**/*.feature"],
  steps: "./steps/**/*.ts",
  // Exclude @skip tests by default (they require clean Docker)
  tags: "not @skip",
});

export default defineConfig({
  testDir,
  fullyParallel: false,
  workers: 1,
  retries: isCI ? 2 : 0,
  timeout: 60000,
  // Increased timeout for projection/saga processing (was 15000)
  expect: { timeout: 30000 },
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : [["html", { open: "on-failure" }]],
  use: {
    // E2E tests use port 3005, local dev uses port 3000/3001
    baseURL: process.env.FRONTEND_URL || `http://localhost:${E2E_FRONTEND_PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  // In CI, servers are started separately; locally, auto-start them
  // Uses E2E test port (3230), NOT integration (3210) or dev port (3220)
  // This keeps E2E tests isolated from both integration tests and local development
  webServer: isCI
    ? undefined
    : [
        {
          // Start E2E test backend (port 3230) with dashboard for debugging
          command: "just e2e-start && just e2e-deploy",
          url: `http://127.0.0.1:${E2E_BACKEND_PORT}`,
          reuseExistingServer: true,
          timeout: 120000,
          cwd: "../../../..",
        },
        {
          // Start frontend pointing to E2E backend (Vite/TanStack Start)
          command: `VITE_CONVEX_URL=http://127.0.0.1:${E2E_BACKEND_PORT} pnpm dev --port ${E2E_FRONTEND_PORT}`,
          url: `http://localhost:${E2E_FRONTEND_PORT}`,
          reuseExistingServer: true,
          timeout: 60000,
        },
      ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
