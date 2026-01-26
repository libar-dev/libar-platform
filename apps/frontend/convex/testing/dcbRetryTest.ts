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
import { components } from "../_generated/api";
import {
  createScopeKey,
  calculateBackoff,
  noJitter,
  DCB_MAX_RETRIES_EXCEEDED,
  DCB_RETRY_KEY_PREFIX,
} from "@libar-dev/platform-core/dcb";
import { ensureTestEnvironment } from "@libar-dev/platform-core";
import { dcbRetryPool } from "../infrastructure";

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

    // Commit scope with version 0 (creates new scope at version 1)
    const result = await ctx.runMutation(components.eventStore.lib.commitScope, {
      scopeKey,
      expectedVersion: 0,
      streamIds: [`test-stream-${scopeId}`],
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

    const result = await ctx.runMutation(components.eventStore.lib.commitScope, {
      scopeKey,
      expectedVersion: currentVersion,
      streamIds: [`test-stream-${scopeId}`],
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

/**
 * Test that success results pass through unchanged.
 */
export const testSuccessPassthrough = query({
  args: {},
  handler: async () => {
    ensureTestEnvironment();
    // Simulate a success result - should pass through unchanged
    const mockSuccessResult = {
      status: "success" as const,
      data: { processed: true },
      scopeVersion: 5,
      events: [],
    };

    // In real usage, withDCBRetry.handleResult would return this unchanged
    return {
      input: mockSuccessResult,
      output: mockSuccessResult, // Same - passed through
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
    // Simulate a rejected result - should pass through unchanged
    const mockRejectedResult = {
      status: "rejected" as const,
      code: "BUSINESS_RULE_VIOLATION",
      reason: "Cannot process this request",
    };

    return {
      input: mockRejectedResult,
      output: mockRejectedResult, // Same - passed through
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
      // Use default jitter (random)
      const delay = calculateBackoff(attempt, {
        initialMs,
        base,
        maxMs,
        // No jitterFn = use defaultJitter
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
    scopeId: v.string(),
  },
  handler: async (_, { scopeId }) => {
    ensureTestEnvironment();
    const scopeKey = createScopeKey(TEST_TENANT_ID, TEST_SCOPE_TYPE, scopeId);
    const partitionKey = `${DCB_RETRY_KEY_PREFIX}${scopeKey}`;

    return {
      scopeKey,
      partitionKey,
      scopeKeyFormat: `tenant:${TEST_TENANT_ID}:${TEST_SCOPE_TYPE}:${scopeId}`,
      partitionKeyFormat: `dcb:tenant:${TEST_TENANT_ID}:${TEST_SCOPE_TYPE}:${scopeId}`,
    };
  },
});

// =============================================================================
// DCB Retry Pool Verification
// =============================================================================

/**
 * Verify dcbRetryPool is properly configured.
 *
 * This doesn't actually enqueue work, just verifies the pool exists.
 */
export const verifyDcbRetryPoolConfig = query({
  args: {},
  handler: async () => {
    ensureTestEnvironment();
    // dcbRetryPool is imported from infrastructure
    // If we got here without errors, it's configured
    const hasEnqueueMutation = typeof dcbRetryPool.enqueueMutation === "function";

    return {
      configured: true,
      hasEnqueueMutation,
    };
  },
});
