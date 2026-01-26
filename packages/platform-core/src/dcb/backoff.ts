/**
 * ## DCB Retry Backoff Calculation
 *
 * Exponential backoff with jitter for DCB conflict retry scheduling.
 *
 * @libar-docs
 * @libar-docs-pattern DurableFunctionAdapters
 * @libar-docs-status completed
 * @libar-docs-infra
 *
 * ### Formula
 *
 * ```
 * delay = min(maxMs, initialMs * base^attempt * jitter)
 * ```
 *
 * Where:
 * - `attempt` is 0-indexed (first retry = attempt 0)
 * - `jitter` is a random multiplier in range [0.5, 1.5]
 *
 * ### Why Jitter?
 *
 * Jitter prevents the "thundering herd" problem where multiple clients
 * retry at exactly the same time, causing another round of conflicts.
 * By randomizing the delay, retries are spread out over time.
 *
 * @example
 * ```typescript
 * import { calculateBackoff, defaultJitter } from "@libar-dev/platform-core/dcb";
 *
 * // Basic usage with defaults
 * const delay = calculateBackoff(0, { initialMs: 100, base: 2, maxMs: 30000 });
 *
 * // Deterministic testing
 * const testDelay = calculateBackoff(0, {
 *   initialMs: 100,
 *   base: 2,
 *   maxMs: 30000,
 *   jitterFn: () => 1.0, // No jitter
 * });
 * // testDelay === 100 (exact, no randomness)
 * ```
 *
 * @module dcb/backoff
 * @since Phase 18a
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Configuration options for backoff calculation.
 */
export interface BackoffOptions {
  /**
   * Initial delay in milliseconds.
   *
   * This is the base delay for attempt 0 (before jitter is applied).
   *
   * @default 100
   */
  initialMs: number;

  /**
   * Exponential base for delay growth.
   *
   * Delay grows as `initialMs * base^attempt`.
   *
   * @default 2
   */
  base: number;

  /**
   * Maximum delay in milliseconds.
   *
   * Delays are capped at this value to prevent unreasonably long waits.
   *
   * @default 30000
   */
  maxMs: number;

  /**
   * Optional jitter function for randomization.
   *
   * Returns a multiplier (typically in range [0.5, 1.5]).
   * Use a constant function (e.g., `() => 1.0`) for deterministic tests.
   *
   * @default defaultJitter (random 0.5-1.5)
   */
  jitterFn?: (() => number) | undefined;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Default backoff configuration values.
 */
export const BACKOFF_DEFAULTS = {
  initialMs: 100,
  base: 2,
  maxMs: 30_000,
} as const;

// =============================================================================
// Jitter Functions
// =============================================================================

/**
 * Default jitter function with multiplicative randomization.
 *
 * Returns a random value in the range [0.5, 1.5], providing
 * ±50% variation to prevent thundering herd effects.
 *
 * @returns Random multiplier between 0.5 and 1.5
 */
export function defaultJitter(): number {
  return 0.5 + Math.random();
}

/**
 * No-jitter function for deterministic testing.
 *
 * Always returns 1.0, resulting in exact exponential delays
 * without any randomization.
 *
 * @returns Constant 1.0
 */
export function noJitter(): number {
  return 1.0;
}

// =============================================================================
// Backoff Calculation
// =============================================================================

/**
 * Calculate exponential backoff delay with jitter.
 *
 * Formula: `min(maxMs, initialMs * base^attempt * jitter)`
 *
 * The attempt is 0-indexed, meaning:
 * - attempt 0: first retry (initialMs * base^0 = initialMs)
 * - attempt 1: second retry (initialMs * base^1)
 * - attempt n: (n+1)th retry (initialMs * base^n)
 *
 * @param attempt - 0-indexed retry attempt number
 * @param options - Backoff configuration options
 * @returns Delay in milliseconds
 *
 * @example
 * ```typescript
 * // With defaults (100ms initial, base 2, 30s max)
 * calculateBackoff(0, { initialMs: 100, base: 2, maxMs: 30000 });
 * // Returns ~100ms (with jitter: 50-150ms)
 *
 * calculateBackoff(1, { initialMs: 100, base: 2, maxMs: 30000 });
 * // Returns ~200ms (with jitter: 100-300ms)
 *
 * calculateBackoff(3, { initialMs: 100, base: 2, maxMs: 30000 });
 * // Returns ~800ms (with jitter: 400-1200ms)
 *
 * // Deterministic for testing
 * calculateBackoff(0, { initialMs: 100, base: 2, maxMs: 30000, jitterFn: () => 1.0 });
 * // Returns exactly 100ms
 * ```
 */
export function calculateBackoff(attempt: number, options: BackoffOptions): number {
  const { initialMs, base, maxMs, jitterFn = defaultJitter } = options;

  // Validate inputs
  if (attempt < 0) {
    throw new Error(`Invalid attempt number: ${attempt}. Must be >= 0.`);
  }
  if (!Number.isInteger(attempt)) {
    throw new Error(`Invalid attempt number: ${attempt}. Must be an integer >= 0.`);
  }
  if (initialMs <= 0) {
    throw new Error(`Invalid initialMs: ${initialMs}. Must be > 0.`);
  }
  if (base <= 0) {
    throw new Error(`Invalid base: ${base}. Must be > 0.`);
  }
  if (maxMs <= 0) {
    throw new Error(`Invalid maxMs: ${maxMs}. Must be > 0.`);
  }

  // Calculate base delay: initialMs * base^attempt
  const baseDelay = initialMs * Math.pow(base, attempt);

  // Apply jitter multiplier
  const jitter = jitterFn();
  if (!Number.isFinite(jitter) || jitter <= 0) {
    throw new Error(`Invalid jitter value: ${jitter}. Must be a finite number > 0.`);
  }
  const delayWithJitter = baseDelay * jitter;

  // Cap at maximum
  return Math.min(maxMs, Math.round(delayWithJitter));
}

/**
 * Create a backoff calculator with fixed options.
 *
 * Useful when you want to configure backoff once and reuse it.
 *
 * @param options - Backoff configuration options
 * @returns Function that takes attempt number and returns delay
 *
 * @example
 * ```typescript
 * const getBackoff = createBackoffCalculator({
 *   initialMs: 100,
 *   base: 2,
 *   maxMs: 30000,
 * });
 *
 * const delay0 = getBackoff(0); // ~100ms
 * const delay1 = getBackoff(1); // ~200ms
 * const delay2 = getBackoff(2); // ~400ms
 * ```
 */
export function createBackoffCalculator(options: BackoffOptions): (attempt: number) => number {
  return (attempt: number) => calculateBackoff(attempt, options);
}
