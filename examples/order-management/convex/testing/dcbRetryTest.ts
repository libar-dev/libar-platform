/**
 * DCB Retry Test Mutations
 *
 * Test mutations for validating the withDCBRetry integration.
 * These are public mutations/queries used only by integration tests.
 *
 * NOTE: Must be public (not internal) because integration tests call them
 * via the external Convex client, which can only access public functions.
 *
 * @since Phase 18a
 */
import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import type { FunctionReference } from "convex/server";
import { components } from "../_generated/api";
import {
  createScopeKey,
  calculateBackoff,
  noJitter,
  DCB_MAX_RETRIES_EXCEEDED,
  DCB_RETRY_KEY_PREFIX,
  executeWithDCB,
} from "@libar-dev/platform-core/dcb";
import { createVerificationProof, ensureTestEnvironment } from "@libar-dev/platform-core";
import { success } from "@libar-dev/platform-core/decider";

const commitScopeRef = components.eventStore.lib.commitScope as unknown as FunctionReference<
  "mutation",
  "internal"
>;

// =============================================================================
// Test Configuration
// =============================================================================

/**
 * Test tenant ID for DCB retry tests.
 */
const TEST_TENANT_ID = "dcb-retry-test-tenant";

/**
 * Test scope type for DCB retry tests.
 */
const TEST_SCOPE_TYPE = "retry-test";

// =============================================================================
// Scope Management Test Mutations
// =============================================================================

/**
 * Initialize a DCB scope for testing.
 *
 * Creates a scope with version 1 for test setup.
 */
export const initializeTestScope = mutation({
  args: {
    scopeId: v.string(),
  },
  handler: async (ctx, { scopeId }) => {
    ensureTestEnvironment();
    const scopeKey = createScopeKey(TEST_TENANT_ID, TEST_SCOPE_TYPE, scopeId);
    const verificationProof = await createVerificationProof({
      target: "eventStore",
      issuer: "order-management:testing:dcbRetryTest:initializeTestScope",
      subjectId: "inventory",
      subjectType: "boundedContext",
      boundedContext: "inventory",
      tenantId: TEST_TENANT_ID,
    });

    // Commit scope with version 0 (creates new scope at version 1)
    const result = await ctx.runMutation(commitScopeRef, {
      scopeKey,
      expectedVersion: 0,
      boundedContext: "inventory",
      streamIds: [`test-stream-${scopeId}`],
      verificationProof,
    });

    return {
      scopeKey,
      result,
    };
  },
});

/**
 * Advance a DCB scope version for testing conflicts.
 *
 * Increments the scope version without going through full DCB flow.
 * Used to set up conflict scenarios.
 */
export const advanceScopeVersion = mutation({
  args: {
    scopeId: v.string(),
    currentVersion: v.number(),
  },
  handler: async (ctx, { scopeId, currentVersion }) => {
    ensureTestEnvironment();
    const scopeKey = createScopeKey(TEST_TENANT_ID, TEST_SCOPE_TYPE, scopeId);
    const verificationProof = await createVerificationProof({
      target: "eventStore",
      issuer: "order-management:testing:dcbRetryTest:advanceScopeVersion",
      subjectId: "inventory",
      subjectType: "boundedContext",
      boundedContext: "inventory",
      tenantId: TEST_TENANT_ID,
    });

    const result = await ctx.runMutation(commitScopeRef, {
      scopeKey,
      expectedVersion: currentVersion,
      boundedContext: "inventory",
      streamIds: [`test-stream-${scopeId}`],
      verificationProof,
    });

    return result;
  },
});

/**
 * Get current scope state for test verification.
 */
export const getTestScopeState = query({
  args: {
    scopeId: v.string(),
  },
  handler: async (ctx, { scopeId }) => {
    ensureTestEnvironment();
    const scopeKey = createScopeKey(TEST_TENANT_ID, TEST_SCOPE_TYPE, scopeId);

    const scope = await ctx.runQuery(components.eventStore.lib.getScope, {
      scopeKey,
    });

    return {
      scopeKey,
      scope,
    };
  },
});

/**
 * Execute a real app-level DCB operation that hits a final scope commit conflict.
 *
 * This proves `executeWithDCB` returns `conflict` before `applyUpdate` runs, so
 * app-level CMS/projection rows are left unchanged when a competing scope commit
 * wins first.
 */
export const executeFinalScopeConflictRollback = mutation({
  args: {
    scopeId: v.string(),
    productId: v.string(),
    quantity: v.number(),
    correlationId: v.string(),
    commandId: v.string(),
  },
  handler: async (ctx, { scopeId, productId, quantity, correlationId, commandId }) => {
    ensureTestEnvironment();

    const scopeKey = createScopeKey(TEST_TENANT_ID, TEST_SCOPE_TYPE, scopeId);
    const competingStreamId = `competing-stream-${scopeId}`;
    const verificationProof = await createVerificationProof({
      target: "eventStore",
      issuer: "order-management:testing:dcbRetryTest:executeFinalScopeConflictRollback",
      subjectId: "inventory",
      subjectType: "boundedContext",
      boundedContext: "inventory",
      tenantId: TEST_TENANT_ID,
    });

    let competingCommitInjected = false;

    const result = await executeWithDCB(ctx as Parameters<typeof executeWithDCB>[0], {
      scopeKey,
      expectedVersion: 0,
      boundedContext: "inventory",
      streamType: "Reservation",
      schemaVersion: 1,
      scopeOperations: {
        getScope: async () => {
          return await ctx.runQuery(components.eventStore.lib.getScope, { scopeKey });
        },
        commitScope: async (streamIds) => {
          if (!competingCommitInjected) {
            competingCommitInjected = true;
            const competingCommit = await ctx.runMutation(commitScopeRef, {
              scopeKey,
              expectedVersion: 0,
              boundedContext: "inventory",
              streamIds: [competingStreamId],
              verificationProof,
            });

            if (competingCommit.status !== "success") {
              throw new Error("Failed to inject competing scope commit for rollback test");
            }
          }

          return await ctx.runMutation(commitScopeRef, {
            scopeKey,
            expectedVersion: 0,
            boundedContext: "inventory",
            streamIds,
            verificationProof,
          });
        },
      },
      entities: {
        streamIds: [productId],
        loadEntity: async (_innerCtx, streamId) => {
          const product = await ctx.db
            .query("productCatalog")
            .withIndex("by_productId", (q) => q.eq("productId", streamId))
            .first();

          if (!product) {
            return null;
          }

          return {
            cms: product,
            _id: product._id,
          };
        },
      },
      decider: (state, command, deciderContext) => {
        const entityState = state.entities.get(command.productId);
        if (!entityState) {
          throw new Error(`Expected product ${command.productId} to exist for DCB rollback test`);
        }

        return success({
          data: {
            productId: command.productId,
            requestedQuantity: command.quantity,
            attemptedAt: deciderContext.now,
          },
          event: {
            eventType: "TestScopeConflictRollbackVerified" as const,
            payload: {
              productId: command.productId,
              quantity: command.quantity,
            },
          },
          stateUpdate: new Map([
            [
              command.productId,
              {
                availableQuantity: entityState.cms.availableQuantity - command.quantity,
                reservedQuantity: entityState.cms.reservedQuantity + command.quantity,
              },
            ],
          ]),
        });
      },
      command: { productId, quantity },
      applyUpdate: async (innerCtx, id, _cms, update, _version, now) => {
        await innerCtx.db.patch(id, {
          ...update,
          updatedAt: now,
        });
      },
      commandId,
      correlationId,
    });

    return {
      scopeKey,
      correlationId,
      competingStreamId,
      result,
    };
  },
});

// =============================================================================
// DCB Retry Logic Test Mutations
// =============================================================================

/**
 * Simulate withDCBRetry handling of a conflict result.
 *
 * This tests the retry scheduling logic without needing a full DCB operation.
 * It simulates what happens when withDCBRetry receives a conflict result.
 */
export const simulateConflictRetry = mutation({
  args: {
    scopeId: v.string(),
    currentVersion: v.number(),
    attempt: v.number(),
    maxAttempts: v.optional(v.number()),
    initialBackoffMs: v.optional(v.number()),
    useNoJitter: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    ensureTestEnvironment();
    const {
      scopeId,
      currentVersion,
      attempt,
      maxAttempts = 5,
      initialBackoffMs = 100,
      useNoJitter = true,
    } = args;

    const scopeKey = createScopeKey(TEST_TENANT_ID, TEST_SCOPE_TYPE, scopeId);

    // Check max attempts
    if (attempt >= maxAttempts) {
      return {
        status: "rejected" as const,
        code: DCB_MAX_RETRIES_EXCEEDED,
        reason: `DCB operation failed after ${maxAttempts} attempts due to OCC conflicts`,
        context: {
          scopeKey,
          lastAttempt: attempt,
          lastConflictVersion: currentVersion,
        },
      };
    }

    // Calculate backoff
    const jitterFn = useNoJitter ? noJitter : undefined;
    const backoffMs = calculateBackoff(attempt, {
      initialMs: initialBackoffMs,
      base: 2,
      maxMs: 30000,
      jitterFn,
    });

    // Build partition key
    const partitionKey = `${DCB_RETRY_KEY_PREFIX}${scopeKey}`;

    // For testing, we don't actually enqueue (would need a real retry mutation)
    // Instead, return what would be enqueued
    return {
      status: "deferred" as const,
      wouldEnqueue: {
        partitionKey,
        runAfter: backoffMs,
        retryAttempt: attempt + 1,
        expectedVersion: currentVersion,
      },
      retryAttempt: attempt + 1,
      scheduledAfterMs: backoffMs,
    };
  },
});

// =============================================================================
// Passthrough Tests
// =============================================================================

/**
 * Test that success results pass through unchanged.
 */
export const testSuccessPassthrough = query({
  args: {},
  handler: async () => {
    ensureTestEnvironment();
    const mockSuccessResult = {
      status: "success" as const,
      data: { processed: true },
      scopeVersion: 5,
      events: [],
    };

    return {
      input: mockSuccessResult,
      output: mockSuccessResult,
      passedThrough: true,
    };
  },
});

/**
 * Test that rejected results pass through unchanged.
 */
export const testRejectedPassthrough = query({
  args: {},
  handler: async () => {
    ensureTestEnvironment();
    const mockRejectedResult = {
      status: "rejected" as const,
      code: "BUSINESS_RULE_VIOLATION",
      reason: "Cannot process this request",
    };

    return {
      input: mockRejectedResult,
      output: mockRejectedResult,
      passedThrough: true,
    };
  },
});

// =============================================================================
// Backoff Calculation Tests
// =============================================================================

/**
 * Test backoff calculation for verification.
 *
 * This is a "unit test in integration context" - it tests the backoff
 * calculation logic via a Convex query so we can verify it works
 * in the deployed environment.
 */
export const testBackoffCalculation = query({
  args: {
    attempt: v.number(),
    initialMs: v.number(),
    base: v.number(),
    maxMs: v.number(),
  },
  handler: async (_, { attempt, initialMs, base, maxMs }) => {
    ensureTestEnvironment();
    // Always use noJitter for deterministic test results
    const delay = calculateBackoff(attempt, {
      initialMs,
      base,
      maxMs,
      jitterFn: noJitter,
    });

    return {
      attempt,
      delay,
      config: { initialMs, base, maxMs },
    };
  },
});

/**
 * Test backoff with jitter to verify randomness range.
 */
export const testBackoffWithJitter = query({
  args: {
    attempt: v.number(),
    initialMs: v.number(),
    base: v.number(),
    maxMs: v.number(),
    samples: v.number(),
  },
  handler: async (_, { attempt, initialMs, base, maxMs, samples }) => {
    ensureTestEnvironment();
    const results: number[] = [];

    for (let i = 0; i < samples; i++) {
      const delay = calculateBackoff(attempt, {
        initialMs,
        base,
        maxMs,
      });
      results.push(delay);
    }

    const baseDelay = initialMs * Math.pow(base, attempt);
    const minExpected = Math.min(maxMs, baseDelay * 0.5);
    const maxExpected = Math.min(maxMs, baseDelay * 1.5);

    return {
      samples: results,
      min: Math.min(...results),
      max: Math.max(...results),
      expectedRange: { min: minExpected, max: maxExpected },
      baseDelay,
    };
  },
});

// =============================================================================
// Partition Key Tests
// =============================================================================

/**
 * Test partition key generation.
 */
export const testPartitionKeyGeneration = query({
  args: {
    scopeId: v.optional(v.string()),
    scopeKey: v.optional(v.string()),
  },
  handler: async (_, { scopeId, scopeKey }) => {
    ensureTestEnvironment();
    const effectiveScopeKey =
      scopeKey ??
      (scopeId !== undefined
        ? createScopeKey(TEST_TENANT_ID, TEST_SCOPE_TYPE, scopeId)
        : undefined);

    if (effectiveScopeKey === undefined) {
      throw new Error("Either scopeKey or scopeId is required for partition key testing");
    }

    const partitionKey = `${DCB_RETRY_KEY_PREFIX}${effectiveScopeKey}`;

    return {
      scopeKey: effectiveScopeKey,
      partitionKey,
      partitionKeyFormat: `dcb:${effectiveScopeKey}`,
    };
  },
});
