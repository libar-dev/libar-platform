/**
 * Convex Rate Limit Adapter
 *
 * Bridges the platform RateLimitChecker interface to @convex-dev/rate-limiter.
 * Enables production-grade rate limiting with persistence and sharding without
 * requiring changes to the middleware pipeline.
 *
 * @libar-docs
 * @libar-docs-pattern DurableFunctionAdapters
 * @libar-docs-status active
 * @libar-docs-infra
 * @libar-docs-uses RateLimitChecker
 */
import type { RateLimitChecker, RateLimitResult } from "./types.js";

/**
 * Rate limit check result from the component.
 *
 * The actual @convex-dev/rate-limiter returns a discriminated union:
 * - { ok: true; retryAfter?: number | undefined } when allowed
 * - { ok: false; retryAfter: number } when rate limited
 *
 * We accept a wider type to be compatible with both cases.
 * Note: `retryAfter?: number | undefined` is required for exactOptionalPropertyTypes.
 */
export type RateLimiterResult =
  | { ok: true; retryAfter?: number | undefined }
  | { ok: false; retryAfter: number };

/**
 * Structural type for rate limiter component.
 *
 * Uses structural typing to avoid direct dependency on @convex-dev/rate-limiter
 * in platform-core. The actual RateLimiter instance comes from the app code.
 */
export interface RateLimiterLike {
  limit(
    ctx: unknown,
    name: string,
    options?: { key?: string; count?: number; throws?: boolean; reserve?: boolean }
  ): Promise<RateLimiterResult>;
}

/**
 * Create a RateLimitChecker factory that delegates to @convex-dev/rate-limiter.
 *
 * The factory pattern allows the adapter to be configured once at module level
 * and then instantiated per-request with the mutation context.
 *
 * @param rateLimiter - RateLimiter instance from mounted component
 * @param limitName - Named limit from rateLimiter configuration
 * @returns Factory function that creates RateLimitChecker for a mutation context
 *
 * @example
 * ```typescript
 * // In convex/rateLimits.ts
 * export const rateLimiter = new RateLimiter(components.rateLimiter, {
 *   commandDispatch: { kind: "token bucket", rate: 100, period: MINUTE, shards: 50 },
 * });
 *
 * // In middleware setup
 * const checkerFactory = createConvexRateLimitAdapter(rateLimiter, "commandDispatch");
 *
 * // In command handler (per-request)
 * const checker = checkerFactory(ctx);
 * const result = await checker(`user:${userId}`);
 * if (!result.allowed) {
 *   return { status: "rejected", code: "RATE_LIMITED", ... };
 * }
 * ```
 */
export function createConvexRateLimitAdapter<TCtx>(
  rateLimiter: RateLimiterLike,
  limitName: string
): (ctx: TCtx) => RateLimitChecker {
  return (ctx: TCtx): RateLimitChecker => {
    return async (key: string): Promise<RateLimitResult> => {
      const status = await rateLimiter.limit(ctx, limitName, { key });

      // Handle exactOptionalPropertyTypes - only include retryAfterMs if defined
      const result: RateLimitResult = { allowed: status.ok };
      if (status.retryAfter !== undefined) {
        result.retryAfterMs = status.retryAfter;
      }
      return result;
    };
  };
}
