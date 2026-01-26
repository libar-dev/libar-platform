/**
 * Durable Publication Test Mutations
 *
 * Test mutations for validating durable cross-context event publication
 * with real database and Workpool. These test the eventPublications table
 * and publication tracking behavior.
 *
 * @since Phase 18b - EventStoreDurability
 */
import { mutation, query, action } from "../_generated/server";
import { v } from "convex/values";
import { ensureTestEnvironment, createDurableEventPublisher } from "@libar-dev/platform-core";
import type { SafeActionRef, SafeMutationRef, WorkpoolLike } from "@libar-dev/platform-core";
import { makeFunctionReference } from "convex/server";

// =============================================================================
// Mock Workpool for Testing
// =============================================================================

/**
 * Creates a mock workpool that satisfies WorkpoolLike interface.
 *
 * For integration tests, we only care that publication records are created correctly.
 * The actual delivery via workpool is tested separately in workpool-specific tests.
 */
function createMockWorkpool(): WorkpoolLike {
  return {
    async enqueueAction(
      _ctx: unknown,
      _actionRef: SafeActionRef,
      _args: Record<string, unknown>,
      _options?: {
        key?: string;
        onComplete?: SafeMutationRef;
        context?: Record<string, unknown>;
      }
    ): Promise<unknown> {
      // No-op for tests - we're testing record creation, not actual delivery
      return { workId: `test_work_${Date.now()}` };
    },
  };
}

const testWorkpool = createMockWorkpool();

// =============================================================================
// Test Delivery Action (Mock)
// =============================================================================

/**
 * Mock delivery action that simulates cross-context event delivery.
 *
 * In real scenarios, this would call the target context's integration route.
 * For testing, we control success/failure via a flag.
 */
export const mockDeliveryAction = action({
  args: {
    event: v.object({
      eventId: v.string(),
      eventType: v.string(),
      eventData: v.any(),
      streamType: v.string(),
      streamId: v.string(),
      correlationId: v.optional(v.string()),
    }),
    targetContext: v.string(),
    publicationId: v.string(),
    shouldFail: v.optional(v.boolean()),
  },
  handler: async (_ctx, args) => {
    ensureTestEnvironment();

    // Simulate delivery - success or failure based on shouldFail flag
    if (args.shouldFail) {
      throw new Error(`Simulated delivery failure to ${args.targetContext}`);
    }

    // Success - in real impl, would call target context integration route
    return {
      delivered: true,
      targetContext: args.targetContext,
      publicationId: args.publicationId,
    };
  },
});

// =============================================================================
// Test onComplete Handler
// =============================================================================

/**
 * onComplete handler for publication delivery.
 *
 * Updates publication status based on Workpool completion result.
 */
export const onPublicationComplete = mutation({
  args: {
    context: v.object({
      publicationId: v.string(),
      eventId: v.string(),
      targetContext: v.string(),
      sourceContext: v.string(),
      maxAttempts: v.number(),
      isRetry: v.optional(v.boolean()),
    }),
    result: v.union(
      v.object({
        type: v.literal("success"),
        value: v.any(),
      }),
      v.object({
        type: v.literal("failure"),
        error: v.string(),
      }),
      v.object({
        type: v.literal("canceled"),
      })
    ),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    const { publicationId, maxAttempts } = args.context;

    // Find the publication record
    const record = await ctx.db
      .query("eventPublications")
      .withIndex("by_publicationId", (q) => q.eq("publicationId", publicationId))
      .first();

    if (!record) {
      // Publication not found - silently return (may have been cleaned up)
      return;
    }

    const now = Date.now();
    const attemptCount = (record.attemptCount ?? 0) + 1;

    if (args.result.type === "success") {
      // Mark as delivered
      await ctx.db.patch(record._id, {
        status: "delivered",
        attemptCount,
        lastAttemptAt: now,
        deliveredAt: now,
        updatedAt: now,
      });
    } else if (args.result.type === "failure") {
      // Check if we've exhausted retries
      if (attemptCount >= maxAttempts) {
        await ctx.db.patch(record._id, {
          status: "dead_lettered",
          attemptCount,
          lastAttemptAt: now,
          lastError: args.result.error,
          updatedAt: now,
        });
      } else {
        // Still have retries left - workpool will retry
        await ctx.db.patch(record._id, {
          status: "failed",
          attemptCount,
          lastAttemptAt: now,
          lastError: args.result.error,
          updatedAt: now,
        });
      }
    }
    // Canceled - just leave as is
  },
});

// =============================================================================
// Function References (TS2589 Prevention)
// =============================================================================

const mockDeliveryActionRef = makeFunctionReference<"action">(
  "testing/durablePublicationTest:mockDeliveryAction"
) as SafeActionRef;

const onPublicationCompleteRef = makeFunctionReference<"mutation">(
  "testing/durablePublicationTest:onPublicationComplete"
) as SafeMutationRef;

// =============================================================================
// Test Mutations for Integration Tests
// =============================================================================

/**
 * Publish an event using the durable publisher.
 *
 * Creates publication tracking records and enqueues delivery actions.
 */
export const testPublishEvent = mutation({
  args: {
    eventId: v.string(),
    eventType: v.string(),
    eventData: v.any(),
    streamType: v.string(),
    streamId: v.string(),
    sourceContext: v.string(),
    targetContexts: v.array(v.string()),
    correlationId: v.optional(v.string()),
    maxAttempts: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    const publisher = createDurableEventPublisher({
      maxAttempts: args.maxAttempts ?? 3,
      initialBackoffMs: 100,
      base: 2,
      dependencies: {
        workpool: testWorkpool,
        deliveryActionRef: mockDeliveryActionRef,
        onCompleteRef: onPublicationCompleteRef,
        tableName: "eventPublications",
      },
    });

    const result = await publisher.publish(
      ctx as unknown as Parameters<typeof publisher.publish>[0],
      {
        event: {
          eventId: args.eventId,
          eventType: args.eventType,
          eventData: args.eventData,
          streamType: args.streamType,
          streamId: args.streamId,
          ...(args.correlationId !== undefined && { correlationId: args.correlationId }),
        },
        sourceContext: args.sourceContext,
        targetContexts: args.targetContexts,
        ...(args.correlationId !== undefined && { correlationId: args.correlationId }),
      }
    );

    return result;
  },
});

/**
 * Get publication records for an event.
 */
export const getPublicationRecords = query({
  args: {
    eventId: v.string(),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    const records = await ctx.db
      .query("eventPublications")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .collect();

    return records;
  },
});

/**
 * Get a single publication record by ID.
 */
export const getPublicationById = query({
  args: {
    publicationId: v.string(),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    const record = await ctx.db
      .query("eventPublications")
      .withIndex("by_publicationId", (q) => q.eq("publicationId", args.publicationId))
      .first();

    return record;
  },
});

/**
 * Create a publication record directly for test setup.
 */
export const createTestPublication = mutation({
  args: {
    publicationId: v.string(),
    eventId: v.string(),
    sourceContext: v.string(),
    targetContext: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("delivered"),
      v.literal("failed"),
      v.literal("dead_lettered")
    ),
    attemptCount: v.number(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    const now = Date.now();

    const id = await ctx.db.insert("eventPublications", {
      publicationId: args.publicationId,
      eventId: args.eventId,
      sourceContext: args.sourceContext,
      targetContext: args.targetContext,
      status: args.status,
      attemptCount: args.attemptCount,
      createdAt: now,
      updatedAt: now,
      ...(args.error !== undefined && { lastError: args.error }),
      ...(args.status === "delivered" && { deliveredAt: now }),
    });

    return id;
  },
});

/**
 * List publications by status.
 */
export const listPublicationsByStatus = query({
  args: {
    status: v.union(
      v.literal("pending"),
      v.literal("delivered"),
      v.literal("failed"),
      v.literal("dead_lettered")
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    const limit = args.limit ?? 100;

    const records = await ctx.db
      .query("eventPublications")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .take(limit);

    return records;
  },
});

/**
 * Get publication stats.
 */
export const getPublicationStats = query({
  args: {},
  handler: async (ctx) => {
    ensureTestEnvironment();

    // Count by status
    const pending = await ctx.db
      .query("eventPublications")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    const delivered = await ctx.db
      .query("eventPublications")
      .withIndex("by_status", (q) => q.eq("status", "delivered"))
      .collect();

    const failed = await ctx.db
      .query("eventPublications")
      .withIndex("by_status", (q) => q.eq("status", "failed"))
      .collect();

    const deadLettered = await ctx.db
      .query("eventPublications")
      .withIndex("by_status", (q) => q.eq("status", "dead_lettered"))
      .collect();

    return {
      pending: pending.length,
      delivered: delivered.length,
      failed: failed.length,
      deadLettered: deadLettered.length,
      total: pending.length + delivered.length + failed.length + deadLettered.length,
    };
  },
});

/**
 * Manually update publication status (for testing).
 */
export const updatePublicationStatus = mutation({
  args: {
    publicationId: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("delivered"),
      v.literal("failed"),
      v.literal("dead_lettered")
    ),
    error: v.optional(v.string()),
    incrementAttempt: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    const record = await ctx.db
      .query("eventPublications")
      .withIndex("by_publicationId", (q) => q.eq("publicationId", args.publicationId))
      .first();

    if (!record) {
      return { status: "not_found" as const };
    }

    const now = Date.now();
    const attemptCount = args.incrementAttempt
      ? (record.attemptCount ?? 0) + 1
      : (record.attemptCount ?? 0);

    await ctx.db.patch(record._id, {
      status: args.status,
      attemptCount,
      updatedAt: now,
      lastAttemptAt: now,
      ...(args.error !== undefined && { lastError: args.error }),
      ...(args.status === "delivered" && { deliveredAt: now }),
    });

    return { status: "updated" as const };
  },
});
