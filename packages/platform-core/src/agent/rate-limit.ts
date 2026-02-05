/**
 * LLM Rate Limiting for Agent BC
 *
 * Provides rate limiting configuration, validation, and utilities
 * for managing LLM API calls within agent bounded contexts.
 *
 * Protects against:
 * - API rate limits from LLM providers
 * - Cost overruns from excessive API usage
 * - Queue overflow during high event volume
 *
 * @module agent/rate-limit
 */

import { z } from "zod";
import type { AgentRateLimitConfig } from "./types.js";

// ============================================================================
// Error Codes
// ============================================================================

/**
 * Error codes for LLM rate limiting and API errors.
 */
export const RATE_LIMIT_ERROR_CODES = {
  /** LLM API rate limit exceeded */
  LLM_RATE_LIMITED: "LLM_RATE_LIMITED",
  /** LLM API is unavailable */
  LLM_UNAVAILABLE: "LLM_UNAVAILABLE",
  /** LLM API call timed out */
  LLM_TIMEOUT: "LLM_TIMEOUT",
  /** LLM returned an invalid response */
  LLM_INVALID_RESPONSE: "LLM_INVALID_RESPONSE",
  /** LLM authentication failed */
  LLM_AUTH_FAILED: "LLM_AUTH_FAILED",
  /** Event queue overflow (backpressure) */
  QUEUE_OVERFLOW: "QUEUE_OVERFLOW",
  /** Cost budget exceeded */
  BUDGET_EXCEEDED: "BUDGET_EXCEEDED",
  /** Invalid rate limit configuration */
  INVALID_RATE_LIMIT_CONFIG: "INVALID_RATE_LIMIT_CONFIG",
} as const;

export type RateLimitErrorCode =
  (typeof RATE_LIMIT_ERROR_CODES)[keyof typeof RATE_LIMIT_ERROR_CODES];

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * Schema for cost budget configuration.
 */
export const CostBudgetSchema = z.object({
  /** Daily budget in USD */
  daily: z.number().positive(),
  /** Alert threshold as percentage of budget (0-1) */
  alertThreshold: z
    .number()
    .min(0)
    .max(1)
    .describe("Alert threshold as percentage of budget (0-1)"),
});

/**
 * Type inferred from CostBudgetSchema.
 */
export type CostBudgetSchemaType = z.infer<typeof CostBudgetSchema>;

/**
 * Schema for agent rate limit configuration.
 */
export const AgentRateLimitConfigSchema = z.object({
  /** Maximum LLM API calls per minute */
  maxRequestsPerMinute: z.number().int().positive(),
  /** Maximum concurrent LLM calls (default: 5) */
  maxConcurrent: z.number().int().positive().optional(),
  /** Maximum queued events before backpressure (default: 100) */
  queueDepth: z.number().int().positive().optional(),
  /** Cost budget configuration */
  costBudget: CostBudgetSchema.optional(),
});

/**
 * Type inferred from AgentRateLimitConfigSchema.
 */
export type AgentRateLimitConfigSchemaType = z.infer<typeof AgentRateLimitConfigSchema>;

// ============================================================================
// Validation
// ============================================================================

/**
 * Result of validating rate limit configuration.
 */
export type RateLimitValidationResult =
  | { readonly valid: true }
  | {
      readonly valid: false;
      readonly code: RateLimitErrorCode;
      readonly message: string;
    };

/**
 * Validate rate limit configuration.
 *
 * @param config - Configuration to validate
 * @returns Validation result with error details if invalid
 */
export function validateRateLimitConfig(
  config: Partial<AgentRateLimitConfig>
): RateLimitValidationResult {
  // Check required maxRequestsPerMinute
  if (
    config.maxRequestsPerMinute === undefined ||
    config.maxRequestsPerMinute <= 0 ||
    !Number.isInteger(config.maxRequestsPerMinute)
  ) {
    return {
      valid: false,
      code: RATE_LIMIT_ERROR_CODES.INVALID_RATE_LIMIT_CONFIG,
      message: "maxRequestsPerMinute must be a positive integer",
    };
  }

  // Check optional maxConcurrent
  if (
    config.maxConcurrent !== undefined &&
    (config.maxConcurrent <= 0 || !Number.isInteger(config.maxConcurrent))
  ) {
    return {
      valid: false,
      code: RATE_LIMIT_ERROR_CODES.INVALID_RATE_LIMIT_CONFIG,
      message: "maxConcurrent must be a positive integer",
    };
  }

  // Check optional queueDepth
  if (
    config.queueDepth !== undefined &&
    (config.queueDepth <= 0 || !Number.isInteger(config.queueDepth))
  ) {
    return {
      valid: false,
      code: RATE_LIMIT_ERROR_CODES.INVALID_RATE_LIMIT_CONFIG,
      message: "queueDepth must be a positive integer",
    };
  }

  // Check optional costBudget
  if (config.costBudget !== undefined) {
    if (config.costBudget.daily <= 0) {
      return {
        valid: false,
        code: RATE_LIMIT_ERROR_CODES.INVALID_RATE_LIMIT_CONFIG,
        message: "costBudget.daily must be a positive number",
      };
    }
    if (config.costBudget.alertThreshold < 0 || config.costBudget.alertThreshold > 1) {
      return {
        valid: false,
        code: RATE_LIMIT_ERROR_CODES.INVALID_RATE_LIMIT_CONFIG,
        message: "costBudget.alertThreshold must be between 0 and 1",
      };
    }
  }

  return { valid: true };
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Default rate limit configuration values.
 */
export const DEFAULT_RATE_LIMIT_VALUES = {
  /** Default max requests per minute */
  maxRequestsPerMinute: 60,
  /** Default max concurrent calls */
  maxConcurrent: 5,
  /** Default queue depth before backpressure */
  queueDepth: 100,
} as const;

/**
 * Create default rate limit configuration with sensible defaults.
 *
 * Defaults:
 * - maxRequestsPerMinute: 60 (1 per second average)
 * - maxConcurrent: 5 (parallel LLM calls)
 * - queueDepth: 100 (events before backpressure)
 * - No cost budget (unlimited)
 *
 * @returns Default rate limit configuration
 *
 * @example
 * ```typescript
 * const config = createDefaultRateLimitConfig();
 * // { maxRequestsPerMinute: 60, maxConcurrent: 5, queueDepth: 100 }
 * ```
 */
export function createDefaultRateLimitConfig(): AgentRateLimitConfig {
  return {
    maxRequestsPerMinute: DEFAULT_RATE_LIMIT_VALUES.maxRequestsPerMinute,
    maxConcurrent: DEFAULT_RATE_LIMIT_VALUES.maxConcurrent,
    queueDepth: DEFAULT_RATE_LIMIT_VALUES.queueDepth,
  };
}

/**
 * Create rate limit configuration with cost budget.
 *
 * @param options - Configuration options
 * @returns Rate limit configuration with cost budget
 *
 * @example
 * ```typescript
 * const config = createRateLimitConfigWithBudget({
 *   maxRequestsPerMinute: 30,
 *   dailyBudget: 10.00,
 *   alertThreshold: 0.8,
 * });
 * ```
 */
export function createRateLimitConfigWithBudget(options: {
  maxRequestsPerMinute?: number;
  maxConcurrent?: number;
  queueDepth?: number;
  dailyBudget: number;
  alertThreshold?: number;
}): AgentRateLimitConfig {
  return {
    maxRequestsPerMinute:
      options.maxRequestsPerMinute ?? DEFAULT_RATE_LIMIT_VALUES.maxRequestsPerMinute,
    maxConcurrent: options.maxConcurrent ?? DEFAULT_RATE_LIMIT_VALUES.maxConcurrent,
    queueDepth: options.queueDepth ?? DEFAULT_RATE_LIMIT_VALUES.queueDepth,
    costBudget: {
      daily: options.dailyBudget,
      alertThreshold: options.alertThreshold ?? 0.8,
    },
  };
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error thrown when LLM rate limit is exceeded.
 */
export interface RateLimitError {
  readonly code: RateLimitErrorCode;
  readonly message: string;
  /** Retry after this many milliseconds (if available) */
  readonly retryAfterMs?: number;
  /** Additional context */
  readonly context?: Record<string, unknown>;
}

/**
 * Create a rate limit error object.
 *
 * @param code - Error code
 * @param message - Error message
 * @param options - Additional options
 * @returns Rate limit error object
 */
export function createRateLimitError(
  code: RateLimitErrorCode,
  message: string,
  options?: { retryAfterMs?: number; context?: Record<string, unknown> }
): RateLimitError {
  const base: RateLimitError = { code, message };

  if (options?.retryAfterMs !== undefined && options?.context !== undefined) {
    return { ...base, retryAfterMs: options.retryAfterMs, context: options.context };
  }
  if (options?.retryAfterMs !== undefined) {
    return { ...base, retryAfterMs: options.retryAfterMs };
  }
  if (options?.context !== undefined) {
    return { ...base, context: options.context };
  }
  return base;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if an error is a rate limit error.
 *
 * @param error - Error to check
 * @returns true if error is a rate limit error
 *
 * @example
 * ```typescript
 * try {
 *   await agent.analyze(prompt, events);
 * } catch (error) {
 *   if (isRateLimitError(error)) {
 *     // Handle rate limiting
 *     if (error.retryAfterMs) {
 *       await delay(error.retryAfterMs);
 *     }
 *   }
 * }
 * ```
 */
export function isRateLimitError(error: unknown): error is RateLimitError {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const err = error as Record<string, unknown>;
  const code = err["code"];
  const message = err["message"];
  return (
    typeof code === "string" &&
    typeof message === "string" &&
    Object.values(RATE_LIMIT_ERROR_CODES).includes(code as RateLimitErrorCode)
  );
}

/**
 * Check if an error indicates the LLM is temporarily unavailable.
 *
 * @param error - Error to check
 * @returns true if LLM is temporarily unavailable (should retry)
 */
export function isRetryableError(error: unknown): boolean {
  if (!isRateLimitError(error)) {
    return false;
  }
  // These errors are typically transient and can be retried
  const retryableCodes: RateLimitErrorCode[] = [
    RATE_LIMIT_ERROR_CODES.LLM_RATE_LIMITED,
    RATE_LIMIT_ERROR_CODES.LLM_UNAVAILABLE,
    RATE_LIMIT_ERROR_CODES.LLM_TIMEOUT,
  ];
  return retryableCodes.includes(error.code);
}

/**
 * Check if an error indicates a permanent failure (should not retry).
 *
 * @param error - Error to check
 * @returns true if error is permanent (should not retry)
 */
export function isPermanentError(error: unknown): boolean {
  if (!isRateLimitError(error)) {
    return false;
  }
  // These errors require intervention and should not be retried
  const permanentCodes: RateLimitErrorCode[] = [
    RATE_LIMIT_ERROR_CODES.LLM_AUTH_FAILED,
    RATE_LIMIT_ERROR_CODES.BUDGET_EXCEEDED,
  ];
  return permanentCodes.includes(error.code);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate delay for exponential backoff.
 *
 * @param attempt - Current attempt number (0-indexed)
 * @param baseDelayMs - Base delay in milliseconds (default: 1000)
 * @param maxDelayMs - Maximum delay in milliseconds (default: 60000)
 * @returns Delay in milliseconds with jitter
 */
export function calculateBackoffDelay(
  attempt: number,
  baseDelayMs: number = 1000,
  maxDelayMs: number = 60000
): number {
  // Exponential backoff: 2^attempt * base
  const exponentialDelay = Math.pow(2, attempt) * baseDelayMs;
  // Cap at maximum
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
  // Add jitter (0-25% of delay)
  const jitter = cappedDelay * 0.25 * Math.random();
  return Math.floor(cappedDelay + jitter);
}

/**
 * Get the effective rate limit configuration with defaults applied.
 *
 * @param config - Partial or full configuration
 * @returns Complete configuration with defaults
 */
export function getEffectiveRateLimitConfig(
  config?: Partial<AgentRateLimitConfig>
): AgentRateLimitConfig {
  const defaults = createDefaultRateLimitConfig();
  if (!config) {
    return defaults;
  }

  const base: AgentRateLimitConfig = {
    maxRequestsPerMinute: config.maxRequestsPerMinute ?? defaults.maxRequestsPerMinute,
  };

  // Build result with only defined optional properties
  const maxConcurrent = config.maxConcurrent ?? defaults.maxConcurrent;
  const queueDepth = config.queueDepth ?? defaults.queueDepth;
  const costBudget = config.costBudget;

  // All defaults are defined, so these will always have values
  if (maxConcurrent !== undefined && queueDepth !== undefined && costBudget !== undefined) {
    return { ...base, maxConcurrent, queueDepth, costBudget };
  }
  if (maxConcurrent !== undefined && queueDepth !== undefined) {
    return { ...base, maxConcurrent, queueDepth };
  }
  if (maxConcurrent !== undefined) {
    return { ...base, maxConcurrent };
  }
  return base;
}

/**
 * Check if a cost budget would be exceeded by additional spending.
 *
 * @param currentSpend - Current daily spend in USD
 * @param additionalCost - Cost of the next operation in USD
 * @param budget - Cost budget configuration
 * @returns true if budget would be exceeded
 */
export function wouldExceedBudget(
  currentSpend: number,
  additionalCost: number,
  budget: { daily: number; alertThreshold: number }
): boolean {
  return currentSpend + additionalCost > budget.daily;
}

/**
 * Check if spending has reached the alert threshold.
 *
 * @param currentSpend - Current daily spend in USD
 * @param budget - Cost budget configuration
 * @returns true if alert threshold is reached
 */
export function isAtAlertThreshold(
  currentSpend: number,
  budget: { daily: number; alertThreshold: number }
): boolean {
  return currentSpend >= budget.daily * budget.alertThreshold;
}
