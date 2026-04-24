/**
 * Testing Utilities and Test-Only Functions
 *
 * These functions are ONLY for test environments.
 * They are protected by IS_TEST environment variable check.
 *
 * Test isolation is achieved via namespace prefixing (testRunId) rather than
 * database clearing. Each test run's entities have unique prefixed IDs.
 * Docker restart is used for complete state reset when needed.
 */

import { mutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import type { FunctionReference } from "convex/server";
import { components } from "./_generated/api";
import {
  createVerificationProof,
  ensureTestEnvironment,
  isTestEnvironment,
} from "@libar-dev/platform-core";
import { compatGlobalPositionValidator } from "./lib/globalPosition";

const verificationProofValidator = v.object({
  issuer: v.string(),
  subjectId: v.string(),
  subjectType: v.union(
    v.literal("reviewer"),
    v.literal("agent"),
    v.literal("boundedContext"),
    v.literal("system")
  ),
  boundedContext: v.string(),
  tenantId: v.optional(v.string()),
  issuedAt: v.number(),
  expiresAt: v.number(),
  nonce: v.string(),
  signature: v.string(),
});

// =============================================================================
// Internal Function References (TS2589 Prevention)
// =============================================================================
// Using makeFunctionReference() bypasses Convex's FilterApi recursive type
// resolution entirely. This prevents TS2589 errors when accessing internal paths.
// =============================================================================
const handleOrderConfirmedRef = makeFunctionReference<"mutation">(
  "processManagers/orderNotification:handleOrderConfirmed"
) as unknown as FunctionReference<"mutation", "internal">;

const getCommandBusCorrelationRef = components.commandBus.lib
  .getByCorrelation as unknown as FunctionReference<"query", "internal">;

const cleanupExpiredCommandsRef = components.commandBus.lib
  .cleanupExpired as unknown as FunctionReference<"mutation", "internal">;

const getEventStoreCorrelationRef = components.eventStore.lib
  .getByCorrelation as unknown as FunctionReference<"query", "internal">;

const readVirtualStreamRef = components.eventStore.lib
  .readVirtualStream as unknown as FunctionReference<"query", "internal">;

const commitScopeRef = components.eventStore.lib.commitScope as unknown as FunctionReference<
  "mutation",
  "internal"
>;

/**
 * Check if test environment is properly configured.
 * Returns diagnostic info for debugging test setup issues.
 */
export const checkTestEnvironment = internalQuery({
  args: {},
  handler: async () => {
    return {
      isTestEnvironment: isTestEnvironment(),
    };
  },
});

/**
 * Get PM state for testing.
 *
 * This exposes the component's getPMState function for integration tests.
 * Tests cannot call component functions directly, so this wrapper is required.
 */
export const getPMState = query({
  args: {
    processManagerName: v.string(),
    instanceId: v.string(),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    return await ctx.runQuery(components.eventStore.lib.getPMState, {
      processManagerName: args.processManagerName,
      instanceId: args.instanceId,
    });
  },
});

/**
 * Create or update PM state for crash-recovery testing.
 *
 * This allows tests to simulate a PM that crashed mid-processing by
 * setting it directly to "processing" status with a specific lastGlobalPosition.
 * Used to verify that the retry logic works correctly with real component transactions.
 */
export const createPMState = mutation({
  args: {
    processManagerName: v.string(),
    instanceId: v.string(),
    status: v.union(
      v.literal("idle"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed")
    ),
    lastGlobalPosition: compatGlobalPositionValidator,
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    // First, ensure the PM state exists
    await ctx.runMutation(components.eventStore.lib.getOrCreatePMState, {
      processManagerName: args.processManagerName,
      instanceId: args.instanceId,
    });

    // Then update it to the desired state
    await ctx.runMutation(components.eventStore.lib.updatePMState, {
      processManagerName: args.processManagerName,
      instanceId: args.instanceId,
      updates: {
        status: args.status,
        lastGlobalPosition: args.lastGlobalPosition,
      },
    });

    return { created: true };
  },
});

/**
 * List PM states for testing.
 *
 * This exposes the component's listPMStates function for integration tests.
 */
export const listPMStates = query({
  args: {
    processManagerName: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    // Build args object only with defined values
    const queryArgs: {
      processManagerName?: string;
      limit?: number;
    } = {};
    if (args.processManagerName !== undefined) {
      queryArgs.processManagerName = args.processManagerName;
    }
    if (args.limit !== undefined) {
      queryArgs.limit = args.limit;
    }

    return await ctx.runQuery(components.eventStore.lib.listPMStates, queryArgs);
  },
});

// ============================================================================
// EVENT STREAM INSPECTION
// ============================================================================

/**
 * Get events from an event stream for testing.
 *
 * This allows tests to inspect the events stored in the Event Store
 * without going through the full orchestration flow.
 */
export const getEventsForStream = query({
  args: {
    streamType: v.string(),
    streamId: v.string(),
    fromVersion: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    // Build args object only with defined values
    const queryArgs: {
      streamType: string;
      streamId: string;
      fromVersion?: number;
      limit?: number;
    } = {
      streamType: args.streamType,
      streamId: args.streamId,
    };
    if (args.fromVersion !== undefined) {
      queryArgs.fromVersion = args.fromVersion;
    }
    if (args.limit !== undefined) {
      queryArgs.limit = args.limit;
    }

    return await ctx.runQuery(components.eventStore.lib.readStream, queryArgs);
  },
});

export const readEventsFromPosition = query({
  args: {
    fromPosition: v.optional(compatGlobalPositionValidator),
    limit: v.optional(v.number()),
    eventTypes: v.optional(v.array(v.string())),
    boundedContext: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();
    return await ctx.runQuery(components.eventStore.lib.readFromPosition, args);
  },
});

export const getEventsByCorrelation = query({
  args: {
    correlationId: v.string(),
    limit: v.optional(v.number()),
    cursor: v.optional(compatGlobalPositionValidator),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();
    return await ctx.runQuery(getEventStoreCorrelationRef, args);
  },
});

export const readEventsForScope = query({
  args: {
    scopeKey: v.string(),
    fromGlobalPosition: v.optional(compatGlobalPositionValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();
    return await ctx.runQuery(readVirtualStreamRef, args);
  },
});

export const commitTestScope = mutation({
  args: {
    scopeKey: v.string(),
    expectedVersion: v.number(),
    streamIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();
    return await ctx.runMutation(commitScopeRef, args);
  },
});

// ============================================================================
// DIRECT PM HANDLER INVOCATION
// ============================================================================

/**
 * PM handler result type.
 */
interface PMHandlerResult {
  status: "processed" | "skipped" | "failed";
  commandsEmitted?: string[];
  reason?: "already_processed" | "terminal_state" | "not_subscribed";
  error?: string;
}

// ============================================================================
// COMMAND BUS TESTING
// ============================================================================

/**
 * Record a command for idempotency testing.
 *
 * This exposes the commandBus component's recordCommand function for integration tests.
 * Tests cannot call component functions directly, so this wrapper is required.
 */
export const recordCommand = mutation({
  args: {
    commandId: v.string(),
    commandType: v.string(),
    targetContext: v.string(),
    payload: v.any(),
    metadata: v.object({
      userId: v.optional(v.string()),
      correlationId: v.string(),
      timestamp: v.number(),
    }),
    ttl: v.optional(v.number()),
  },
  returns: v.union(
    v.object({
      status: v.literal("new"),
    }),
    v.object({
      status: v.literal("duplicate"),
      commandStatus: v.union(
        v.literal("pending"),
        v.literal("executed"),
        v.literal("rejected"),
        v.literal("failed")
      ),
      result: v.optional(v.any()),
    })
  ),
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    return await ctx.runMutation(components.commandBus.lib.recordCommand, args);
  },
});

/**
 * Update command result after execution.
 *
 * This exposes the commandBus component's updateCommandResult function for integration tests.
 */
export const updateCommandResult = mutation({
  args: {
    commandId: v.string(),
    status: v.union(v.literal("executed"), v.literal("rejected"), v.literal("failed")),
    result: v.optional(v.any()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    return await ctx.runMutation(components.commandBus.lib.updateCommandResult, args);
  },
});

/**
 * Get command status and result.
 *
 * This exposes the commandBus component's getCommandStatus function for integration tests.
 */
export const getCommandStatus = query({
  args: {
    commandId: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      commandId: v.string(),
      commandType: v.string(),
      targetContext: v.string(),
      status: v.union(
        v.literal("pending"),
        v.literal("executed"),
        v.literal("rejected"),
        v.literal("failed")
      ),
      result: v.optional(v.any()),
      executedAt: v.optional(v.number()),
    })
  ),
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    return await ctx.runQuery(components.commandBus.lib.getCommandStatus, args);
  },
});

export const getCommandsByCorrelation = query({
  args: {
    correlationId: v.string(),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();
    return await ctx.runQuery(getCommandBusCorrelationRef, args);
  },
});

export const cleanupExpiredCommandBusEntries = mutation({
  args: {
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();
    return await ctx.runMutation(cleanupExpiredCommandsRef, args);
  },
});

export const recordCommandEventCorrelationForTest = mutation({
  args: {
    commandId: v.string(),
    eventIds: v.array(v.string()),
    commandType: v.string(),
    boundedContext: v.string(),
    ttl: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();
    return await ctx.runMutation(components.commandBus.lib.recordCommandEventCorrelation, args);
  },
});

/**
 * Invoke the orderNotification PM handler directly, bypassing EventBus and Workpool.
 *
 * This allows tests to verify PM handler logic works correctly in isolation
 * from the delivery infrastructure. If this test passes but the full flow
 * fails, the issue is in EventBus/Workpool delivery, not PM logic.
 *
 * Note: This is specific to the orderNotification PM. For other PMs,
 * create similar test utilities with the appropriate handler reference.
 *
 * @param args - Event args matching OrderConfirmed event structure
 * @returns PM processing result (processed/skipped/failed)
 */
export const invokeOrderNotificationPMDirectly = mutation({
  args: {
    eventId: v.string(),
    eventType: v.string(),
    globalPosition: compatGlobalPositionValidator,
    correlationId: v.string(),
    streamType: v.string(),
    streamId: v.string(),
    payload: v.any(),
    timestamp: v.number(),
    category: v.string(),
    boundedContext: v.string(),
    instanceId: v.string(),
  },
  returns: v.object({
    status: v.union(v.literal("processed"), v.literal("skipped"), v.literal("failed")),
    commandsEmitted: v.optional(v.array(v.string())),
    reason: v.optional(
      v.union(
        v.literal("already_processed"),
        v.literal("terminal_state"),
        v.literal("not_subscribed")
      )
    ),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<PMHandlerResult> => {
    ensureTestEnvironment();

    // Call the PM handler directly
    return await ctx.runMutation(handleOrderConfirmedRef, {
      eventId: args.eventId,
      eventType: args.eventType,
      globalPosition: args.globalPosition,
      correlationId: args.correlationId,
      streamType: args.streamType,
      streamId: args.streamId,
      payload: args.payload,
      timestamp: args.timestamp,
      category: args.category,
      boundedContext: args.boundedContext,
      instanceId: args.instanceId,
    });
  },
});

// ============================================================================
// AGENT APPROVAL WORKFLOW TESTING
// ============================================================================
// Public wrappers for internal approval mutations.
// Integration tests cannot call internal mutations directly via ConvexClient.
// ============================================================================

const recordPendingApprovalRef = makeFunctionReference<"mutation">(
  "contexts/agent/tools/approval:recordPendingApproval"
) as unknown as FunctionReference<"mutation", "internal">;

const approveAgentActionRef = makeFunctionReference<"mutation">(
  "contexts/agent/tools/approval:approveAgentAction"
) as unknown as FunctionReference<"mutation", "internal">;

const rejectAgentActionRef = makeFunctionReference<"mutation">(
  "contexts/agent/tools/approval:rejectAgentAction"
) as unknown as FunctionReference<"mutation", "internal">;

const expirePendingApprovalsRef = makeFunctionReference<"mutation">(
  "contexts/agent/tools/approval:expirePendingApprovals"
) as unknown as FunctionReference<"mutation", "internal">;

/**
 * Record a pending approval for testing.
 *
 * This exposes the internal recordPendingApproval mutation for integration tests.
 * Tests cannot call internal functions directly, so this wrapper is required.
 */
export const testRecordPendingApproval = mutation({
  args: {
    approvalId: v.string(),
    agentId: v.string(),
    decisionId: v.string(),
    action: v.object({
      type: v.string(),
      payload: v.any(),
    }),
    confidence: v.number(),
    reason: v.string(),
    triggeringEventIds: v.array(v.string()),
    expiresAt: v.number(),
  },
  returns: v.object({
    approvalId: v.string(),
    created: v.boolean(),
  }),
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    return await ctx.runMutation(recordPendingApprovalRef, args);
  },
});

/**
 * Approve an agent action for testing.
 *
 * This exposes the internal approveAgentAction mutation for integration tests.
 */
export const testApproveAgentAction = mutation({
  args: {
    approvalId: v.string(),
    reviewerId: v.string(),
    reviewNote: v.optional(v.string()),
  },
  returns: v.union(
    v.object({
      success: v.literal(true),
      approvalId: v.string(),
    }),
    v.object({
      success: v.literal(false),
      error: v.string(),
    })
  ),
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    return await ctx.runMutation(approveAgentActionRef, args);
  },
});

/**
 * Reject an agent action for testing.
 *
 * This exposes the internal rejectAgentAction mutation for integration tests.
 */
export const testRejectAgentAction = mutation({
  args: {
    approvalId: v.string(),
    reviewerId: v.string(),
    reviewNote: v.optional(v.string()),
  },
  returns: v.union(
    v.object({
      success: v.literal(true),
      approvalId: v.string(),
    }),
    v.object({
      success: v.literal(false),
      error: v.string(),
    })
  ),
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    return await ctx.runMutation(rejectAgentActionRef, args);
  },
});

/**
 * Expire pending approvals for testing.
 *
 * This exposes the internal expirePendingApprovals mutation for integration tests.
 * Simulates the cron job that expires stale approvals.
 */
export const testExpirePendingApprovals = mutation({
  args: {},
  returns: v.object({
    expiredCount: v.number(),
  }),
  handler: async (ctx) => {
    ensureTestEnvironment();

    return await ctx.runMutation(expirePendingApprovalsRef, {});
  },
});

// ============================================================================
// AGENT AUTHORIZATION TESTING
// ============================================================================

/**
 * Approve an agent action with authorization check.
 *
 * Unlike testApproveAgentAction, this mutation includes authorization
 * validation - the reviewer must be authorized for the agent's agentId.
 *
 * @param authorizedAgentIds - Explicit list of agent IDs this reviewer can approve.
 *                             Empty or undefined lists fail closed.
 */
export const testApproveAgentActionWithAuth = mutation({
  args: {
    approvalId: v.string(),
    reviewerId: v.string(),
    reviewNote: v.optional(v.string()),
    authorizedAgentIds: v.optional(v.array(v.string())),
  },
  returns: v.union(
    v.object({
      success: v.literal(true),
      approvalId: v.string(),
    }),
    v.object({
      success: v.literal(false),
      error: v.string(),
    })
  ),
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    // Load the approval first to check authorization via component
    const approval = await ctx.runQuery(components.agentBC.approvals.getById, {
      approvalId: args.approvalId,
    });

    if (!approval) {
      return { success: false, error: "APPROVAL_NOT_FOUND" };
    }

    if (!args.authorizedAgentIds || args.authorizedAgentIds.length === 0) {
      return { success: false, error: "UNAUTHORIZED_REVIEWER" };
    }

    if (!args.authorizedAgentIds.includes(approval.agentId)) {
      return { success: false, error: "UNAUTHORIZED_REVIEWER" };
    }

    // Proceed with the normal approval flow
    return await ctx.runMutation(approveAgentActionRef, {
      approvalId: args.approvalId,
      reviewerId: args.reviewerId,
      reviewNote: args.reviewNote,
    });
  },
});

// ============================================================================
// AGENT DEAD LETTER TESTING
// ============================================================================

/**
 * Create a dead letter entry for testing.
 *
 * This directly creates a dead letter to test dead letter infrastructure
 * without needing to trigger an actual processing failure.
 * Simulates what happens when agent processing fails via onComplete handler.
 */
export const testCreateAgentDeadLetter = mutation({
  args: {
    agentId: v.string(),
    subscriptionId: v.string(),
    eventId: v.string(),
    globalPosition: compatGlobalPositionValidator,
    error: v.string(),
    attemptCount: v.optional(v.number()),
    workId: v.optional(v.string()),
    correlationId: v.optional(v.string()),
  },
  returns: v.object({
    eventId: v.string(),
    created: v.boolean(),
    deadLetterId: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    // Build context object
    const contextObj: {
      correlationId?: string;
      errorCode?: string;
      ignoreReason?: string;
    } = {};
    if (args.correlationId) {
      contextObj.correlationId = args.correlationId;
    }

    // Create dead letter entry via component
    const result = await ctx.runMutation(components.agentBC.deadLetters.record, {
      agentId: args.agentId,
      subscriptionId: args.subscriptionId,
      eventId: args.eventId,
      globalPosition: args.globalPosition,
      error: args.error,
      attemptCount: args.attemptCount ?? 1,
      workId: args.workId ?? `test_work_${Date.now()}`,
      ...(Object.keys(contextObj).length > 0 && { context: contextObj }),
    });

    return {
      eventId: args.eventId,
      created: result.created,
      ...(result.deadLetterId && { deadLetterId: result.deadLetterId }),
    };
  },
});

// ============================================================================
// COMPONENT-BOUNDARY AUTH TESTING
// ============================================================================

export const testComponentApproveWithProof = mutation({
  args: {
    approvalId: v.string(),
    reviewerId: v.string(),
    reviewNote: v.optional(v.string()),
    verificationProof: v.optional(verificationProofValidator),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    try {
      const result = await ctx.runMutation(components.agentBC.approvals.approve, {
        approvalId: args.approvalId,
        reviewerId: args.reviewerId,
        ...(args.reviewNote !== undefined && { reviewNote: args.reviewNote }),
        ...(args.verificationProof !== undefined && { verificationProof: args.verificationProof }),
      });

      return { success: true as const, result };
    } catch (error) {
      return {
        success: false as const,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

export const testComponentRejectWithProof = mutation({
  args: {
    approvalId: v.string(),
    reviewerId: v.string(),
    reviewNote: v.optional(v.string()),
    verificationProof: v.optional(verificationProofValidator),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    try {
      const result = await ctx.runMutation(components.agentBC.approvals.reject, {
        approvalId: args.approvalId,
        reviewerId: args.reviewerId,
        ...(args.reviewNote !== undefined && { reviewNote: args.reviewNote }),
        ...(args.verificationProof !== undefined && { verificationProof: args.verificationProof }),
      });

      return { success: true as const, result };
    } catch (error) {
      return {
        success: false as const,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

export const testComponentAuditRecordWithProof = mutation({
  args: {
    eventType: v.string(),
    agentId: v.string(),
    decisionId: v.string(),
    timestamp: v.number(),
    payload: v.any(),
    verificationProof: v.optional(verificationProofValidator),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    try {
      const result = await ctx.runMutation(components.agentBC.audit.record, {
        eventType: args.eventType as never,
        agentId: args.agentId,
        decisionId: args.decisionId,
        timestamp: args.timestamp,
        payload: args.payload,
        ...(args.verificationProof !== undefined && { verificationProof: args.verificationProof }),
      });

      return { success: true as const, result };
    } catch (error) {
      return {
        success: false as const,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

export const testComponentCommandRecordWithProof = mutation({
  args: {
    agentId: v.string(),
    type: v.string(),
    payload: v.any(),
    confidence: v.number(),
    reason: v.string(),
    triggeringEventIds: v.array(v.string()),
    decisionId: v.string(),
    patternId: v.optional(v.string()),
    correlationId: v.optional(v.string()),
    routingAttempts: v.optional(v.number()),
    verificationProof: v.optional(verificationProofValidator),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    try {
      const result = await ctx.runMutation(components.agentBC.commands.record, {
        agentId: args.agentId,
        type: args.type,
        payload: args.payload,
        confidence: args.confidence,
        reason: args.reason,
        triggeringEventIds: args.triggeringEventIds,
        decisionId: args.decisionId,
        ...(args.patternId !== undefined && { patternId: args.patternId }),
        ...(args.correlationId !== undefined && { correlationId: args.correlationId }),
        ...(args.routingAttempts !== undefined && { routingAttempts: args.routingAttempts }),
        ...(args.verificationProof !== undefined && { verificationProof: args.verificationProof }),
      });

      return { success: true as const, result };
    } catch (error) {
      return {
        success: false as const,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

export const testComponentAppendToStreamWithProof = mutation({
  args: {
    streamType: v.string(),
    streamId: v.string(),
    expectedVersion: v.number(),
    boundedContext: v.string(),
    tenantId: v.optional(v.string()),
    events: v.array(
      v.object({
        eventId: v.string(),
        eventType: v.string(),
        scopeKey: v.optional(v.string()),
        category: v.optional(
          v.union(
            v.literal("domain"),
            v.literal("integration"),
            v.literal("trigger"),
            v.literal("fat")
          )
        ),
        schemaVersion: v.optional(v.number()),
        payload: v.any(),
        metadata: v.object({
          correlationId: v.string(),
          causationId: v.optional(v.string()),
          userId: v.optional(v.string()),
          schemaVersion: v.optional(v.number()),
        }),
        idempotencyKey: v.optional(v.string()),
      })
    ),
    verificationProof: v.optional(verificationProofValidator),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();

    try {
      const verificationProof =
        args.verificationProof ??
        (await createVerificationProof({
          target: "eventStore",
          issuer: "order-management:testingFunctions:testComponentAppendToStreamWithProof",
          subjectId: args.boundedContext,
          subjectType: "boundedContext",
          boundedContext: args.boundedContext,
          ...(args.tenantId !== undefined && { tenantId: args.tenantId }),
        }));

      const result = await ctx.runMutation(components.eventStore.lib.appendToStream, {
        streamType: args.streamType,
        streamId: args.streamId,
        expectedVersion: args.expectedVersion,
        boundedContext: args.boundedContext,
        ...(args.tenantId !== undefined && { tenantId: args.tenantId }),
        events: args.events,
        verificationProof,
      });

      return { success: true as const, result };
    } catch (error) {
      return {
        success: false as const,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

export const getAgentAuditEventByDecisionId = query({
  args: {
    decisionId: v.string(),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();
    return ctx.runQuery(components.agentBC.audit.getByDecisionId, args);
  },
});

export const getAgentCommandByDecisionId = query({
  args: {
    decisionId: v.string(),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();
    return ctx.runQuery(components.agentBC.commands.getByDecisionId, args);
  },
});
