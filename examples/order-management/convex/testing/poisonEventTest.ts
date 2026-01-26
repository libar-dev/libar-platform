/**
 * Poison Event Test Mutations
 *
 * Test mutations for validating poison event handling with real database.
 * These simulate projection failures and verify quarantine behavior.
 *
 * @since Phase 18b - EventStoreDurability
 */
import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { ensureTestEnvironment, withPoisonEventHandling } from "@libar-dev/platform-core";
import type { SafeQueryRef, SafeMutationRef } from "@libar-dev/platform-core";
import { makeFunctionReference, type FunctionReference } from "convex/server";

// =============================================================================
// Local Types (PoisonEventContext is not exported from platform-core)
// =============================================================================

/**
 * Context type for poison event operations.
 */
interface PoisonEventCtx {
  runQuery: <T>(ref: SafeQueryRef, args: Record<string, unknown>) => Promise<T>;
  runMutation: <T>(ref: SafeMutationRef, args: Record<string, unknown>) => Promise<T>;
}

// =============================================================================
// Poison Event Table References (TS2589 Prevention)
// =============================================================================

const getPoisonRecordRef = makeFunctionReference<"query">(
  "testing/poisonEventTest:getPoisonRecord"
) as SafeQueryRef;

const upsertPoisonRecordRef = makeFunctionReference<"mutation">(
  "testing/poisonEventTest:upsertPoisonRecord"
) as SafeMutationRef;

const listQuarantinedRecordsRef = makeFunctionReference<"query">(
  "testing/poisonEventTest:listQuarantinedRecords"
) as SafeQueryRef;

const getPoisonStatsRef = makeFunctionReference<"query">(
  "testing/poisonEventTest:getPoisonStats"
) as SafeQueryRef;

// =============================================================================
// Internal Function References (for ctx.runQuery/runMutation calls)
// These are needed because the generated types don't include testing namespace
// until after deployment. Using makeFunctionReference + FunctionReference cast.
// =============================================================================

const internalGetPoisonRecord = makeFunctionReference<"query">(
  "testing/poisonEventTest:getPoisonRecord"
) as FunctionReference<"query">;

const internalUpsertPoisonRecord = makeFunctionReference<"mutation">(
  "testing/poisonEventTest:upsertPoisonRecord"
) as FunctionReference<"mutation">;

const internalListQuarantinedRecords = makeFunctionReference<"query">(
  "testing/poisonEventTest:listQuarantinedRecords"
) as FunctionReference<"query">;

const internalGetPoisonStats = makeFunctionReference<"query">(
  "testing/poisonEventTest:getPoisonStats"
) as FunctionReference<"query">;

// =============================================================================
// Internal Database Operations (called by withPoisonEventHandling)
// =============================================================================

/**
 * Get poison record by eventId and projectionName.
 */
export const getPoisonRecord = query({
  args: {
    eventId: v.string(),
    projectionName: v.string(),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    const record = await ctx.db
      .query("poisonEvents")
      .withIndex("by_eventId_projection", (q) =>
        q.eq("eventId", args.eventId).eq("projectionName", args.projectionName)
      )
      .first();

    return record;
  },
});

/**
 * Upsert a poison record.
 */
export const upsertPoisonRecord = mutation({
  args: {
    eventId: v.string(),
    eventType: v.string(),
    projectionName: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("quarantined"),
      v.literal("replayed"),
      v.literal("ignored")
    ),
    attemptCount: v.number(),
    error: v.optional(v.string()),
    errorStack: v.optional(v.string()),
    eventPayload: v.optional(v.any()),
    quarantinedAt: v.optional(v.number()),
    updatedAt: v.number(),
    resolvedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    const existing = await ctx.db
      .query("poisonEvents")
      .withIndex("by_eventId_projection", (q) =>
        q.eq("eventId", args.eventId).eq("projectionName", args.projectionName)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.status,
        attemptCount: args.attemptCount,
        ...(args.error !== undefined && { error: args.error }),
        ...(args.errorStack !== undefined && { errorStack: args.errorStack }),
        ...(args.eventPayload !== undefined && { eventPayload: args.eventPayload }),
        ...(args.quarantinedAt !== undefined && { quarantinedAt: args.quarantinedAt }),
        updatedAt: args.updatedAt,
        ...(args.resolvedBy !== undefined && { resolvedBy: args.resolvedBy }),
      });
    } else {
      await ctx.db.insert("poisonEvents", {
        eventId: args.eventId,
        eventType: args.eventType,
        projectionName: args.projectionName,
        status: args.status,
        attemptCount: args.attemptCount,
        ...(args.error !== undefined && { error: args.error }),
        ...(args.errorStack !== undefined && { errorStack: args.errorStack }),
        ...(args.eventPayload !== undefined && { eventPayload: args.eventPayload }),
        ...(args.quarantinedAt !== undefined && { quarantinedAt: args.quarantinedAt }),
        createdAt: Date.now(),
        updatedAt: args.updatedAt,
      });
    }
  },
});

/**
 * List quarantined records.
 */
export const listQuarantinedRecords = query({
  args: {
    projectionName: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    const limit = args.limit ?? 100;

    if (args.projectionName !== undefined) {
      // Capture for closure - TypeScript narrowing doesn't flow into withIndex callback
      const projName = args.projectionName;
      return await ctx.db
        .query("poisonEvents")
        .withIndex("by_projection_status", (q) =>
          q.eq("projectionName", projName).eq("status", "quarantined")
        )
        .take(limit);
    }

    return await ctx.db
      .query("poisonEvents")
      .withIndex("by_status", (q) => q.eq("status", "quarantined"))
      .take(limit);
  },
});

/**
 * Get poison event stats.
 */
export const getPoisonStats = query({
  args: {},
  handler: async (ctx) => {
    ensureTestEnvironment();

    const quarantined = await ctx.db
      .query("poisonEvents")
      .withIndex("by_status", (q) => q.eq("status", "quarantined"))
      .collect();

    const byProjection: Record<string, number> = {};
    for (const record of quarantined) {
      byProjection[record.projectionName] = (byProjection[record.projectionName] ?? 0) + 1;
    }

    return {
      totalQuarantined: quarantined.length,
      byProjection,
      recentErrors: quarantined.slice(0, 10).map((r) => ({
        eventId: r.eventId,
        projectionName: r.projectionName,
        error: r.error ?? "",
        quarantinedAt: r.quarantinedAt ?? 0,
      })),
    };
  },
});

// =============================================================================
// Poison Record Type (for internal use)
// =============================================================================

interface PoisonRecordResult {
  _id: unknown;
  eventId: string;
  eventType: string;
  projectionName: string;
  status: "pending" | "quarantined" | "replayed" | "ignored";
  attemptCount: number;
  error?: string;
  errorStack?: string;
  eventPayload?: unknown;
  quarantinedAt?: number;
  createdAt?: number;
  updatedAt: number;
}

// =============================================================================
// Test Mutations
// =============================================================================

/**
 * Simulate a projection handler that always fails.
 *
 * This runs the handler through withPoisonEventHandling to test the full flow.
 */
export const simulateProjectionFailure = mutation({
  args: {
    eventId: v.string(),
    eventType: v.string(),
    projectionName: v.string(),
    maxAttempts: v.number(),
    shouldFail: v.boolean(),
    errorMessage: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    threwError: boolean;
    errorThrown: string | null;
    poisonRecord: PoisonRecordResult | null;
  }> => {
    ensureTestEnvironment();

    const { eventId, eventType, projectionName, maxAttempts, shouldFail, errorMessage } = args;

    // Create a context that wraps ctx with proper typing
    // Using module-level function references to avoid TS2589 and internal namespace issues
    const poisonCtx: PoisonEventCtx = {
      runQuery: async <T>(_ref: SafeQueryRef, queryArgs: Record<string, unknown>): Promise<T> => {
        // Route to appropriate query based on the args pattern
        if ("eventId" in queryArgs && "projectionName" in queryArgs) {
          return (await ctx.runQuery(
            internalGetPoisonRecord,
            queryArgs as { eventId: string; projectionName: string }
          )) as T;
        }
        if ("limit" in queryArgs || Object.keys(queryArgs).length === 0) {
          return (await ctx.runQuery(
            internalListQuarantinedRecords,
            queryArgs as { projectionName?: string; limit?: number }
          )) as T;
        }
        return (await ctx.runQuery(internalGetPoisonStats, {})) as T;
      },
      runMutation: async <T>(
        _ref: SafeMutationRef,
        mutationArgs: Record<string, unknown>
      ): Promise<T> => {
        // Type the mutation args properly
        type UpsertArgs = {
          eventId: string;
          eventType: string;
          projectionName: string;
          status: "pending" | "quarantined" | "replayed" | "ignored";
          attemptCount: number;
          error?: string;
          errorStack?: string;
          eventPayload?: unknown;
          quarantinedAt?: number;
          updatedAt: number;
          resolvedBy?: string;
        };
        return (await ctx.runMutation(internalUpsertPoisonRecord, mutationArgs as UpsertArgs)) as T;
      },
    };

    // Create a handler that fails if shouldFail is true
    const projHandler = async (
      _handlerCtx: PoisonEventCtx,
      _event: { eventId?: string; eventType?: string }
    ): Promise<void> => {
      if (shouldFail) {
        throw new Error(errorMessage ?? "Simulated projection failure");
      }
      // Success - do nothing
    };

    // Wrap with poison event handling
    const wrappedHandler = withPoisonEventHandling(projHandler, {
      projectionName,
      maxAttempts,
      alertOnQuarantine: true,
      dependencies: {
        getPoisonRecord: getPoisonRecordRef,
        upsertPoisonRecord: upsertPoisonRecordRef,
        listQuarantinedRecords: listQuarantinedRecordsRef,
        getPoisonStats: getPoisonStatsRef,
      },
    });

    // Execute and capture whether we threw or not
    let threwError = false;
    let errorThrown: string | null = null;

    try {
      await wrappedHandler(poisonCtx, { eventId, eventType });
    } catch (e) {
      threwError = true;
      errorThrown = e instanceof Error ? e.message : String(e);
    }

    // Return the current state of the poison record
    const record = await ctx.runQuery(internalGetPoisonRecord, {
      eventId,
      projectionName,
    });

    return {
      threwError,
      errorThrown,
      poisonRecord: record as PoisonRecordResult | null,
    };
  },
});

/**
 * Get current poison record for an event/projection.
 */
export const getTestPoisonRecord = query({
  args: {
    eventId: v.string(),
    projectionName: v.string(),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    return await ctx.db
      .query("poisonEvents")
      .withIndex("by_eventId_projection", (q) =>
        q.eq("eventId", args.eventId).eq("projectionName", args.projectionName)
      )
      .first();
  },
});

/**
 * Test unquarantine operation.
 */
export const testUnquarantine = mutation({
  args: {
    eventId: v.string(),
    projectionName: v.string(),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    const record = await ctx.db
      .query("poisonEvents")
      .withIndex("by_eventId_projection", (q) =>
        q.eq("eventId", args.eventId).eq("projectionName", args.projectionName)
      )
      .first();

    if (!record) {
      return { status: "not_found" as const };
    }

    if (record.status !== "quarantined") {
      return { status: "not_quarantined" as const };
    }

    await ctx.db.patch(record._id, {
      status: "replayed",
      attemptCount: 0,
      updatedAt: Date.now(),
      resolvedBy: "test",
    });

    return { status: "unquarantined" as const };
  },
});

/**
 * Create a poison record directly for test setup.
 */
export const createTestPoisonRecord = mutation({
  args: {
    eventId: v.string(),
    eventType: v.string(),
    projectionName: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("quarantined"),
      v.literal("replayed"),
      v.literal("ignored")
    ),
    attemptCount: v.number(),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    const { eventId, eventType, projectionName, status, attemptCount } = args;
    const now = Date.now();

    // Check if exists
    const existing = await ctx.db
      .query("poisonEvents")
      .withIndex("by_eventId_projection", (q) =>
        q.eq("eventId", eventId).eq("projectionName", projectionName)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        status,
        attemptCount,
        updatedAt: now,
        ...(status === "quarantined" && { quarantinedAt: now }),
      });
      return existing._id;
    }

    return await ctx.db.insert("poisonEvents", {
      eventId,
      eventType,
      projectionName,
      status,
      attemptCount,
      createdAt: now,
      updatedAt: now,
      ...(status === "quarantined" && { quarantinedAt: now }),
    });
  },
});

/**
 * Count poison records for a projection.
 */
export const getHandlerCallCount = query({
  args: {
    projectionName: v.string(),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    const records = await ctx.db
      .query("poisonEvents")
      .withIndex("by_projection_status", (q) => q.eq("projectionName", args.projectionName))
      .collect();

    return records.length;
  },
});
