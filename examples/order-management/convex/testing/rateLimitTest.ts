/**
 * Rate Limit Test Mutations
 *
 * Test mutations for validating the ConvexRateLimitAdapter integration.
 * These are public mutations used only by integration tests.
 *
 * NOTE: Must be public (not internal) because integration tests call them
 * via the external Convex client, which can only access public functions.
 */
import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { rateLimiter } from "../rateLimits";
import { createConvexRateLimitAdapter, ensureTestEnvironment } from "@libar-dev/platform-core";

/**
 * Check rate limit for a given key using the adapter.
 * Returns the RateLimitResult for test verification.
 */
export const checkRateLimit = mutation({
  args: {
    limitName: v.union(
      v.literal("commandDispatch"),
      v.literal("adminOperations"),
      v.literal("testLimit")
    ),
    key: v.string(),
  },
  handler: async (ctx, { limitName, key }) => {
    ensureTestEnvironment();
    const checker = createConvexRateLimitAdapter(rateLimiter, limitName)(ctx);
    const result = await checker(key);
    return result;
  },
});

/**
 * Consume rate limit tokens for a given key.
 * Used to set up test preconditions (e.g., "5 requests have been made").
 */
export const consumeRateLimitTokens = mutation({
  args: {
    limitName: v.union(
      v.literal("commandDispatch"),
      v.literal("adminOperations"),
      v.literal("testLimit")
    ),
    key: v.string(),
    count: v.number(),
  },
  handler: async (ctx, { limitName, key, count }) => {
    ensureTestEnvironment();

    // Validate count parameter
    if (count < 1 || !Number.isInteger(count)) {
      throw new Error(`Invalid count: ${count}. Must be a positive integer.`);
    }

    const checker = createConvexRateLimitAdapter(rateLimiter, limitName)(ctx);

    // Consume tokens by making multiple checks
    const results = [];
    for (let i = 0; i < count; i++) {
      const result = await checker(key);
      results.push(result);
    }

    return {
      consumed: count,
      finalResult: results[results.length - 1],
      allAllowed: results.every((r) => r.allowed),
    };
  },
});
