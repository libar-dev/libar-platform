/**
 * Integration Test Helpers for platform-store.
 *
 * Utilities for testing the EventStore component against a real Convex backend.
 * Uses namespace-based isolation via testRunId prefix.
 */

/**
 * Unique identifier for this test run.
 * Used as prefix for all stream IDs to ensure test isolation.
 */
export const testRunId = `r${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(-2)}`;

/**
 * Add the test run prefix to an ID for isolation.
 */
export function withPrefix(id: string): string {
  return `${testRunId}_${id}`;
}

/**
 * Generate a unique stream ID with test run prefix.
 */
export function generateStreamId(streamType: string): string {
  return withPrefix(
    `${streamType.toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  );
}

/**
 * Generate a unique event ID.
 */
export function generateEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Generate a unique correlation ID.
 */
export function generateCorrelationId(): string {
  return withPrefix(`corr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`);
}

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
  const { timeoutMs = 30000, pollIntervalMs = 100, message = "Condition not met" } = options;
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
