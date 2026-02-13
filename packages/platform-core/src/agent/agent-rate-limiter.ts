/**
 * Agent Rate Limiter — Runtime Integration
 *
 * Wraps LLM calls with rate limit checks using a callback pattern.
 * The actual @convex-dev/rate-limiter is provided at the app level
 * via the checkRateLimit callback, keeping platform-core decoupled.
 *
 * Different from rate-limit.ts which provides types, validation,
 * and helper functions only. This module provides the runtime
 * execution wrapper for rate-limited LLM calls.
 *
 * @module agent/agent-rate-limiter
 */

import type { Logger } from "../logging/types.js";
import { createPlatformNoOpLogger } from "../logging/scoped.js";

// ============================================================================
// Configuration
// ============================================================================

/**
 * Agent rate limiter configuration.
 *
 * Uses a callback pattern so the actual @convex-dev/rate-limiter
 * is provided at the app level.
 */
export interface AgentRateLimiterConfig {
  /** Agent ID for rate limit key derivation and logging */
  readonly agentId: string;

  /**
   * Check rate limit callback.
   *
   * Returns `{ ok: true }` if under limit, or
   * `{ ok: false, retryAfterMs }` if rate limited.
   *
   * The app level provides this via @convex-dev/rate-limiter's check() method.
   */
  readonly checkRateLimit: (
    key: string
  ) => Promise<{ ok: true } | { ok: false; retryAfterMs: number }>;

  /** Optional logger (defaults to no-op) */
  readonly logger?: Logger;
}

// ============================================================================
// Result Types
// ============================================================================

/**
 * Result of a rate-limited operation.
 *
 * Either the operation was allowed and completed (with its result),
 * or it was rate limited (with a retry-after duration).
 */
export type RateLimitedResult<T> =
  | { readonly allowed: true; readonly result: T }
  | { readonly allowed: false; readonly retryAfterMs: number };

// ============================================================================
// Runtime Integration
// ============================================================================

/**
 * Execute an operation with rate limiting.
 *
 * Checks the rate limit BEFORE calling the operation.
 * If rate limited, returns `{ allowed: false, retryAfterMs }` without
 * executing the operation. If allowed, calls the operation and returns
 * `{ allowed: true, result }`.
 *
 * The rate limit key is derived from the agent ID to scope limits
 * per agent instance.
 *
 * @typeParam T - The operation result type
 * @param config - Rate limiter configuration
 * @param operation - The operation to execute if rate limit allows
 * @returns Rate-limited result
 *
 * @example
 * ```typescript
 * const config: AgentRateLimiterConfig = {
 *   agentId: "churn-risk-agent",
 *   checkRateLimit: async (key) => {
 *     return await rateLimiter.check(ctx, { name: "llm-calls", key });
 *   },
 * };
 *
 * const result = await withRateLimit(config, async () => {
 *   return await agent.analyze(prompt, events);
 * });
 *
 * if (result.allowed) {
 *   // Use result.result
 * } else {
 *   // Retry after result.retryAfterMs
 * }
 * ```
 */
export async function withRateLimit<T>(
  config: AgentRateLimiterConfig,
  operation: () => Promise<T>
): Promise<RateLimitedResult<T>> {
  const logger = config.logger ?? createPlatformNoOpLogger();
  const rateLimitKey = `agent:${config.agentId}`;

  logger.debug("Checking rate limit", {
    agentId: config.agentId,
    key: rateLimitKey,
  });

  const check = await config.checkRateLimit(rateLimitKey);

  if (!check.ok) {
    logger.warn("Rate limited", {
      agentId: config.agentId,
      retryAfterMs: check.retryAfterMs,
    });
    return { allowed: false, retryAfterMs: check.retryAfterMs };
  }

  logger.debug("Rate limit passed, executing operation", {
    agentId: config.agentId,
  });

  const result = await operation();
  return { allowed: true, result };
}
