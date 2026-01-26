/**
 * Infrastructure Integration Test Helpers
 *
 * Utilities for testing @libar-dev/platform-* packages against a real Convex backend.
 * Uses namespace-based isolation via testRunId prefix instead of clearAll.
 */

import { withPrefix } from "./testRunId";

/**
 * Default timeout for waiting operations.
 */
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_POLL_INTERVAL_MS = 100;

/**
 * Simple sleep function.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait until a condition is met or timeout.
 */
export async function waitUntil<T>(
  check: () => Promise<T>,
  options: {
    timeoutMs?: number;
    pollIntervalMs?: number;
    message?: string;
  } = {}
): Promise<T> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    message = "Condition not met",
  } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const result = await check();
    if (result) {
      return result;
    }
    await sleep(pollIntervalMs);
  }

  throw new Error(`${message} within ${timeoutMs}ms`);
}

/**
 * Generate a unique test ID with prefix.
 * Includes testRunId for test isolation.
 */
export function generateTestId(prefix: string): string {
  return withPrefix(`${prefix}_infra_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
}
