/**
 * Test Run Identifier for Integration Test Isolation
 *
 * Provides a unique identifier for each test run. All entity IDs (orders, products,
 * reservations) should be prefixed with this ID to ensure logical isolation between
 * test runs without needing database cleanup.
 *
 * ## Why Namespacing?
 *
 * Convex components (Workpool, Workflow) have isolated databases with no cleanup API.
 * The clearAll() anti-pattern causes race conditions with background jobs, resulting
 * in OCC errors. Instead, we prefix entity IDs so each test run "sees" only its own data.
 *
 * ## Usage
 *
 * ```typescript
 * import { testRunId, withPrefix, generateTestRunId } from '@libar-dev/platform-core/testing';
 *
 * // Use the module-level singleton for consistent prefixing within a test suite
 * const orderId = withPrefix(`ord_${timestamp}_${random}`);
 *
 * // Or generate a fresh ID for isolated test contexts
 * const customRunId = generateTestRunId();
 * ```
 *
 * @module @libar-dev/platform-core/testing
 */

/**
 * Generate a unique test run identifier.
 *
 * Format: "r" + last 4 chars of base36 timestamp + 2 random chars
 * Example: "r1a2bxy"
 *
 * @returns A unique 7-character test run ID
 */
export function generateTestRunId(): string {
  return `r${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(-2)}`;
}

/**
 * Module-level singleton test run ID.
 *
 * Generated once when the module is loaded (start of test suite).
 * All tests within the same process share this ID for consistent prefixing.
 *
 * @example
 * ```typescript
 * import { testRunId } from '@libar-dev/platform-core/testing';
 * console.log(testRunId); // "r1a2bxy"
 * ```
 */
export const testRunId = generateTestRunId();

/**
 * Prefix an ID with the test run identifier.
 *
 * @param id - The original ID (e.g., "ord_test_xxx")
 * @returns The prefixed ID (e.g., "r1a2bxy_ord_test_xxx")
 *
 * @example
 * ```typescript
 * withPrefix("ord_test_123")  // "r1a2bxy_ord_test_123"
 * withPrefix("cmd_456")       // "r1a2bxy_cmd_456"
 * ```
 */
export function withPrefix(id: string): string {
  return `${testRunId}_${id}`;
}

/**
 * Prefix an ID with a custom test run identifier.
 *
 * Use this when you need isolation within a specific test context
 * rather than the module-level singleton.
 *
 * @param runId - Custom test run ID
 * @param id - The original ID
 * @returns The prefixed ID
 *
 * @example
 * ```typescript
 * const myRunId = generateTestRunId();
 * withCustomPrefix(myRunId, "ord_123"); // "r9x8zab_ord_123"
 * ```
 */
export function withCustomPrefix(runId: string, id: string): string {
  return `${runId}_${id}`;
}
