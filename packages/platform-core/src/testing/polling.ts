/**
 * Polling Utilities for Integration Tests
 *
 * Provides async waiting utilities for integration tests that need to poll
 * for state changes. Essential when testing eventual consistency patterns
 * like projections processed via Workpool.
 *
 * @module @libar-dev/platform-core/testing
 */

declare const setTimeout: (callback: () => void, ms: number) => unknown;

/**
 * Default timeout for waiting operations (30 seconds).
 */
export const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Default poll interval (100ms).
 */
export const DEFAULT_POLL_INTERVAL_MS = 100;

/**
 * Options for wait operations.
 */
export interface WaitOptions {
  /** Maximum time to wait in milliseconds. Default: 30000 */
  timeoutMs?: number;
  /** How often to check the condition in milliseconds. Default: 100 */
  pollIntervalMs?: number;
  /** Error message when timeout is reached. Default: "Condition not met" */
  message?: string;
}

/**
 * Simple sleep function.
 *
 * @param ms - Duration to sleep in milliseconds
 * @returns Promise that resolves after the specified duration
 *
 * @example
 * ```typescript
 * await sleep(1000); // Wait 1 second
 * ```
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll until a condition is met or timeout is reached.
 *
 * @param check - Async function that returns truthy when condition is met
 * @param options - Timeout and polling configuration
 * @returns The truthy result from the check function
 * @throws Error if timeout is reached before condition is met
 *
 * @example
 * ```typescript
 * // Wait for order to be confirmed
 * const order = await waitUntil(
 *   async () => {
 *     const o = await getOrder(orderId);
 *     return o?.status === "confirmed" ? o : null;
 *   },
 *   { message: `Order ${orderId} to be confirmed`, timeoutMs: 10000 }
 * );
 * ```
 */
export async function waitUntil<T>(check: () => Promise<T>, options: WaitOptions = {}): Promise<T> {
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
 * Wait for a predicate to return true.
 *
 * Simpler version of waitUntil when you just need a boolean check.
 *
 * @param predicate - Async function that returns boolean
 * @param options - Timeout and polling configuration
 * @throws Error if timeout is reached before predicate returns true
 *
 * @example
 * ```typescript
 * await waitFor(
 *   async () => (await getOrder(orderId))?.status === "confirmed",
 *   { message: "Order to be confirmed" }
 * );
 * ```
 */
export async function waitFor(
  predicate: () => Promise<boolean>,
  options: WaitOptions = {}
): Promise<void> {
  await waitUntil(async () => {
    const result = await predicate();
    return result || null;
  }, options);
}
