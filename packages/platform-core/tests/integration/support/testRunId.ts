/**
 * Test Run Identifier for Platform Integration Test Isolation
 *
 * Provides a unique identifier for each test run. All entity IDs are prefixed
 * with this ID to ensure isolation between test runs without database cleanup.
 *
 * @see examples/order-management/tests/support/testRunId.ts - App-level version
 */

/**
 * Unique identifier for this test run.
 * Format: "r" + last 4 chars of base36 timestamp + 2 random chars
 */
export const testRunId = `r${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(-2)}`;

/**
 * Prefix an ID with the test run identifier.
 */
export function withPrefix(id: string): string {
  return `${testRunId}_${id}`;
}
