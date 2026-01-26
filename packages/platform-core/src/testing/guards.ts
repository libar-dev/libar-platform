/**
 * Test environment guards for bounded context testing helpers.
 *
 * These guards ensure that test-only functions (like createTestEntity, getTestEntity)
 * cannot be called in production environments.
 *
 * @example
 * ```typescript
 * import { ensureTestEnvironment } from "@libar-dev/platform-core/testing";
 *
 * export const createTestOrder = mutation({
 *   args: { orderId: v.string(), customerId: v.string() },
 *   handler: async (ctx, args) => {
 *     ensureTestEnvironment();
 *     // ... create test order directly in CMS
 *   },
 * });
 * ```
 */

// Type declaration for Node.js globals that exist at runtime in Convex
declare const process: { env: Record<string, string | undefined> } | undefined;

// Type augmentation for convex-test mode flag
declare global {
  var __CONVEX_TEST_MODE__: boolean | undefined;
}

/**
 * Guards test-only functions from production execution.
 *
 * Security model:
 * - Unit tests: __CONVEX_TEST_MODE__ is set by test setup
 * - Integration tests: Self-hosted Docker backend (ephemeral, localhost-only)
 * - Production: Cloud Convex with CONVEX_CLOUD_URL env var
 *
 * Note: Self-hosted Convex doesn't reliably expose env vars via process.env,
 * so we use a heuristic: if CONVEX_CLOUD_URL is NOT set, we assume test mode.
 * In production (cloud Convex), this env var is always present.
 *
 * @throws Error if called in production environment
 */
export function ensureTestEnvironment(): void {
  // Check for convex-test unit test mode (set by test setup)
  if (typeof globalThis !== "undefined" && globalThis.__CONVEX_TEST_MODE__ === true) {
    return; // Unit test environment, allow
  }

  // In convex-test runtime, process may not be defined - which is fine for tests
  if (typeof process === "undefined") {
    return; // convex-test environment without globalThis flag, allow
  }

  // Check for IS_TEST env var (explicit test mode)
  const env = process.env || {};
  if (env["IS_TEST"]) {
    return; // Explicit test mode, allow
  }

  // In self-hosted Convex (Docker), env vars may not be accessible via process.env.
  // Cloud Convex always has CONVEX_CLOUD_URL set. If it's absent, we're likely in
  // a self-hosted test environment.
  if (!env["CONVEX_CLOUD_URL"]) {
    return; // Self-hosted (likely Docker test backend), allow
  }

  throw new Error("SECURITY: Test-only function called without IS_TEST environment variable");
}

/**
 * Type guard to check if we're in a test environment.
 * Does not throw, returns a boolean instead.
 */
export function isTestEnvironment(): boolean {
  try {
    ensureTestEnvironment();
    return true;
  } catch {
    return false;
  }
}
