/**
 * Public API for Saga operations.
 *
 * Provides read access to saga state for monitoring and testing.
 * Admin operations are available in `sagas/admin.ts` (api.sagas.admin.*).
 *
 * Core saga mutations (start, update) are handled internally via the saga registry.
 */
import { query } from "./_generated/server";
import { v } from "convex/values";

// Admin operations are available at api.sagas.admin.*
// See sagas/admin.ts for: getSagaDetails, getStuckSagas, getFailedSagas,
// getSagaStats, markSagaFailed, markSagaCompensated, cancelSaga, retrySaga

/**
 * Get a saga by type and ID.
 *
 * Used for monitoring saga progress and in integration tests.
 */
export const getSaga = query({
  args: {
    sagaType: v.string(),
    sagaId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sagas")
      .withIndex("by_sagaId", (q) => q.eq("sagaType", args.sagaType).eq("sagaId", args.sagaId))
      .first();
  },
});

/**
 * Get sagas by status (for monitoring/debugging).
 */
export const getSagasByStatus = query({
  args: {
    sagaType: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("compensating")
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sagas")
      .withIndex("by_status", (q) => q.eq("sagaType", args.sagaType).eq("status", args.status))
      .order("desc")
      .take(args.limit ?? 100);
  },
});
