/**
 * Rate Limit Definitions
 *
 * Centralized rate limit configuration for the order-management application.
 * Uses @convex-dev/rate-limiter for production-grade limiting with sharding.
 *
 * @libar-docs
 * @libar-docs-pattern DurableFunctionAdapters
 * @libar-docs-status active
 * @libar-docs-infra
 */
import { RateLimiter, MINUTE, HOUR } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  /**
   * Command dispatch: token bucket for bursty command execution.
   * 100/min sustained rate with 150 burst capacity, sharded for ~100 QPS.
   *
   * Sharding guideline from CONVEX-DURABILITY-REFERENCE.md:
   * - Expected QPS 50-200: use 5-10 shards
   * - Expected QPS 200-1000: use 10-50 shards
   * Formula: shards ~= QPS / 2
   */
  commandDispatch: {
    kind: "token bucket",
    rate: 100,
    period: MINUTE,
    capacity: 150,
    shards: 50,
  },

  /**
   * Admin operations: strict hourly limit for sensitive operations.
   * Fixed window ensures hard cap on total operations per hour.
   */
  adminOperations: {
    kind: "fixed window",
    rate: 10,
    period: HOUR,
  },

  /**
   * Test limit: 10 requests per minute for integration tests.
   * Uses token bucket with capacity equal to rate for predictable testing.
   */
  testLimit: {
    kind: "token bucket",
    rate: 10,
    period: MINUTE,
    capacity: 10,
  },
});
