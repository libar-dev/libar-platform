/**
 * Rate Limiting Middleware
 *
 * API protection through configurable rate limiting.
 * Integration point for rate limiter services.
 */
import type {
  Middleware,
  MiddlewareContext,
  MiddlewareBeforeResult,
  RateLimitConfig,
} from "./types.js";

/** Middleware execution order for rate limiting */
export const RATE_LIMIT_ORDER = 50;

/**
 * Create a rate limiting middleware.
 *
 * Integrates with rate limiter services to protect APIs.
 * Uses a factory pattern to support Convex component integration.
 *
 * @param config - Configuration with rate limit checker factory
 * @returns A middleware that enforces rate limits
 *
 * @example
 * ```typescript
 * // With createConvexRateLimitAdapter (production pattern)
 * const rateLimitMiddleware = createRateLimitMiddleware({
 *   checkerFactory: (ctx) =>
 *     createConvexRateLimitAdapter(rateLimiter, "commandDispatch")(ctx.raw),
 *   getKey: RateLimitKeys.byUserAndCommand((ctx) => ctx.custom.userId ?? "anonymous"),
 *   skipFor: ["GetSystemHealth", "CleanupExpired"],
 * });
 * ```
 */
export function createRateLimitMiddleware(config: RateLimitConfig): Middleware {
  const skipSet = new Set(config.skipFor ?? []);

  return {
    name: "rateLimit",
    order: RATE_LIMIT_ORDER,

    async before(ctx: MiddlewareContext): Promise<MiddlewareBeforeResult> {
      const { command } = ctx;

      // Skip rate limiting for configured commands
      if (skipSet.has(command.type)) {
        return { continue: true, ctx };
      }

      // Create checker per-request using factory (allows access to ctx.raw)
      const checker = config.checkerFactory(ctx);
      const key = config.getKey(ctx);
      const result = await checker(key);

      if (!result.allowed) {
        return {
          continue: false,
          result: {
            status: "rejected",
            code: "RATE_LIMITED",
            reason: "Too many requests, please try again later",
            context: { retryAfterMs: result.retryAfterMs },
          },
        };
      }

      return { continue: true, ctx };
    },
  };
}

/**
 * Common rate limit key strategies.
 */
export const RateLimitKeys = {
  /**
   * Rate limit by user ID.
   */
  byUserId(
    getUserId: (ctx: MiddlewareContext) => string | undefined
  ): (ctx: MiddlewareContext) => string {
    return (ctx) => {
      const userId = getUserId(ctx);
      return `user:${userId ?? "anonymous"}`;
    };
  },

  /**
   * Rate limit by command type.
   */
  byCommandType(): (ctx: MiddlewareContext) => string {
    return (ctx) => `command:${ctx.command.type}`;
  },

  /**
   * Rate limit by user and command type combination.
   */
  byUserAndCommand(
    getUserId: (ctx: MiddlewareContext) => string | undefined
  ): (ctx: MiddlewareContext) => string {
    return (ctx) => {
      const userId = getUserId(ctx);
      return `user:${userId ?? "anonymous"}:${ctx.command.type}`;
    };
  },

  /**
   * Rate limit by aggregate ID.
   * Useful for protecting specific resources from abuse.
   */
  byAggregateId(
    getAggregateId: (ctx: MiddlewareContext) => string | undefined
  ): (ctx: MiddlewareContext) => string {
    return (ctx) => {
      const aggregateId = getAggregateId(ctx);
      return `aggregate:${ctx.command.type}:${aggregateId ?? "unknown"}`;
    };
  },

  /**
   * Rate limit by IP address (from custom context).
   */
  byIpAddress(
    getIpAddress: (ctx: MiddlewareContext) => string | undefined
  ): (ctx: MiddlewareContext) => string {
    return (ctx) => {
      const ip = getIpAddress(ctx);
      return `ip:${ip ?? "unknown"}`;
    };
  },
} as const;
