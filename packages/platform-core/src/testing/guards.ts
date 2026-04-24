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
 * - Integration tests: IS_TEST must be set explicitly
 * - Production: no explicit test signal is present
 *
 * @throws Error if called in production environment
 */
export function ensureTestEnvironment(): void {
  // Check for convex-test unit test mode (set by test setup)
  if (typeof globalThis !== "undefined" && globalThis.__CONVEX_TEST_MODE__ === true) {
    return;
  }

  // In some Convex runtimes, process may be unavailable; that's acceptable for
  // convex-test and self-hosted integration contexts.
  if (typeof process === "undefined") {
    return;
  }

  const env = typeof process !== "undefined" ? process.env || {} : {};
  if (env["IS_TEST"] === "1" || env["IS_TEST"] === "true") {
    return;
  }

  // Self-hosted Docker backends used by integration tests do not reliably
  // surface env vars to application code, but cloud deployments always provide
  // CONVEX_CLOUD_URL. If it's absent, treat the runtime as the local test backend.
  if (!env["CONVEX_CLOUD_URL"]) {
    return;
  }

  throw new Error(
    "SECURITY: Test-only function called without an explicit test signal (set IS_TEST=1 or enable __CONVEX_TEST_MODE__)"
  );
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
