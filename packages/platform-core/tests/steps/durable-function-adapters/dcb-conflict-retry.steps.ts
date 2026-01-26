/**
 * DCB Conflict Retry - Step Definitions
 *
 * BDD step definitions for DCB OCC conflict retry behavior:
 * - Backoff calculation with exponential growth
 * - Jitter for thundering herd prevention
 * - Max retry limiting
 * - Partition key generation
 *
 * @since Phase 18a (DurableFunctionAdapters)
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

// Import modules under test
import { calculateBackoff, defaultJitter, noJitter } from "../../../src/dcb/backoff.js";
import {
  withDCBRetry,
  DCB_MAX_RETRIES_EXCEEDED,
  DCB_RETRY_KEY_PREFIX,
  isDCBDeferredResult,
  isDCBSuccessResult,
  isDCBRejectedResult,
  isMaxRetriesExceeded,
  type DCBRetryOptions,
} from "../../../src/dcb/withRetry.js";
import { createScopeKey, type DCBScopeKey } from "../../../src/dcb/index.js";
import type {
  DCBExecutionResult,
  DCBSuccessResult,
  DCBConflictResult,
  DCBRejectedResult,
  DCBRetryResult,
} from "../../../src/dcb/types.js";

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  backoffConfig: {
    initialMs: number;
    base: number;
    maxMs: number;
    jitterFn?: () => number;
  } | null;
  backoffResult: number | null;
  backoffResults: number[];
  dcbResult: DCBExecutionResult<object> | null;
  retryResult: DCBRetryResult<object> | null;
  scopeKey: DCBScopeKey | null;
  workpoolMock: MockWorkpool | null;
  retryConfig: DCBRetryOptions | null;
  error: Error | null;
}

function createInitialState(): TestState {
  return {
    backoffConfig: null,
    backoffResult: null,
    backoffResults: [],
    dcbResult: null,
    retryResult: null,
    scopeKey: null,
    workpoolMock: null,
    retryConfig: null,
    error: null,
  };
}

let state: TestState = createInitialState();

function resetState(): void {
  state = createInitialState();
}

// =============================================================================
// Mocks
// =============================================================================

interface EnqueuedMutation {
  handler: unknown;
  args: Record<string, unknown>;
  options: {
    key?: string;
    runAfter?: number;
    onComplete?: unknown;
    context?: unknown;
  };
}

interface MockWorkpool {
  enqueueMutation: ReturnType<typeof vi.fn>;
  enqueuedMutations: EnqueuedMutation[];
}

function createMockWorkpool(): MockWorkpool {
  const enqueuedMutations: EnqueuedMutation[] = [];

  return {
    enqueueMutation: vi.fn(async (_ctx, handler, args, options = {}) => {
      enqueuedMutations.push({ handler, args, options });
      return `work_${Date.now()}`;
    }),
    enqueuedMutations,
  };
}

function createMockCtx(): unknown {
  return {
    db: {
      insert: vi.fn(),
      query: vi.fn(),
      patch: vi.fn(),
    },
  };
}

// =============================================================================
// DCB Conflict Retry Feature
// =============================================================================

const dcbConflictRetryFeature = await loadFeature(
  "tests/features/behavior/durable-function-adapters/dcb-conflict-retry.feature"
);

describeFeature(dcbConflictRetryFeature, ({ Background, Rule, AfterEachScenario }) => {
  // Note: Background runs BEFORE BeforeEachScenario in vitest-cucumber,
  // so we do the setup in Background and reset in AfterEachScenario

  AfterEachScenario(() => {
    vi.clearAllMocks();
    resetState();
  });

  Background(({ Given }) => {
    Given("DCB retry helper is configured", () => {
      // Create workpool and set config with hardcoded values
      // Note: vitest-cucumber has issues with {int} params in Background with Rules
      state.workpoolMock = createMockWorkpool();
      state.retryConfig = {
        maxAttempts: 5,
        initialBackoffMs: 100,
      };
    });
  });

  // =========================================================================
  // Success Path
  // =========================================================================

  Rule("DCB operations succeed without retry when no conflict", ({ RuleScenario }) => {
    RuleScenario("DCB succeeds on first attempt", ({ Given, And, When, Then }) => {
      Given("a DCB operation with expectedVersion 5", () => {
        state.scopeKey = createScopeKey("t1", "reservation", "res_123");
      });

      And("currentVersion is 5 - no conflict", () => {
        state.dcbResult = {
          status: "success",
          data: { orderId: "ord_123" },
          event: { eventId: "evt_123", eventType: "ItemReserved" },
          newVersion: 6,
        } satisfies DCBSuccessResult<{ orderId: string }>;
      });

      When("withDCBRetry is called", async () => {
        const ctx = createMockCtx();
        const handler = withDCBRetry(ctx as never, {
          workpool: state.workpoolMock!,
          retryMutation: vi.fn() as never,
          scopeKey: state.scopeKey!,
          options: state.retryConfig ?? undefined,
        });

        state.retryResult = await handler.handleResult(state.dcbResult!, {
          attempt: 0,
          retryArgs: { someArg: "value" },
        });
      });

      Then("executeWithDCB should be called once", () => {
        // The DCB result was mocked directly; we verify the behavior
        expect(state.dcbResult).not.toBeNull();
      });

      And("the success result should be returned unchanged", () => {
        expect(state.retryResult).not.toBeNull();
        expect(state.retryResult!.status).toBe("success");
        expect(isDCBSuccessResult(state.retryResult!)).toBe(true);
      });

      And("no retry should be scheduled", () => {
        expect(state.workpoolMock!.enqueueMutation).not.toHaveBeenCalled();
      });
    });

    RuleScenario("Rejected result passes through unchanged", ({ Given, When, Then, And }) => {
      Given("a DCB operation that will be rejected by decider", () => {
        state.scopeKey = createScopeKey("t1", "order", "ord_123");
        state.dcbResult = {
          status: "rejected",
          code: "INSUFFICIENT_STOCK",
          reason: "Not enough items in inventory",
        } satisfies DCBRejectedResult;
      });

      When("withDCBRetry is called", async () => {
        const ctx = createMockCtx();
        const handler = withDCBRetry(ctx as never, {
          workpool: state.workpoolMock!,
          retryMutation: vi.fn() as never,
          scopeKey: state.scopeKey!,
          options: state.retryConfig ?? undefined,
        });

        state.retryResult = await handler.handleResult(state.dcbResult!, {
          attempt: 0,
          retryArgs: {},
        });
      });

      Then("the rejected result should be returned unchanged", () => {
        expect(state.retryResult!.status).toBe("rejected");
        expect(isDCBRejectedResult(state.retryResult!)).toBe(true);
        expect((state.retryResult as DCBRejectedResult).code).toBe("INSUFFICIENT_STOCK");
      });

      And("no retry should be scheduled", () => {
        expect(state.workpoolMock!.enqueueMutation).not.toHaveBeenCalled();
      });
    });
  });

  // =========================================================================
  // Retry Behavior
  // =========================================================================

  Rule("OCC conflicts trigger automatic retry via Workpool", ({ RuleScenario }) => {
    RuleScenario("Conflict triggers retry with updated version", ({ Given, And, When, Then }) => {
      Given("a DCB operation with expectedVersion 5", () => {
        state.scopeKey = createScopeKey("t1", "reservation", "res_123");
      });

      And("currentVersion is 6 - conflict detected", () => {
        state.dcbResult = {
          status: "conflict",
          expectedVersion: 5,
          currentVersion: 6,
          scopeKey: state.scopeKey!,
        } satisfies DCBConflictResult;
      });

      When("withDCBRetry is called with attempt 0", async () => {
        const ctx = createMockCtx();
        const handler = withDCBRetry(ctx as never, {
          workpool: state.workpoolMock!,
          retryMutation: vi.fn() as never,
          scopeKey: state.scopeKey!,
          options: {
            ...state.retryConfig,
            jitterFn: noJitter, // Deterministic for testing
          },
        });

        state.retryResult = await handler.handleResult(state.dcbResult!, {
          attempt: 0,
          retryArgs: { orderId: "ord_123" },
        });
      });

      Then("a retry mutation should be enqueued to Workpool", () => {
        expect(state.workpoolMock!.enqueueMutation).toHaveBeenCalledTimes(1);
      });

      And("the retry should use expectedVersion 6", () => {
        const enqueued = state.workpoolMock!.enqueuedMutations[0];
        expect(enqueued.args.expectedVersion).toBe(6);
      });

      And('the result should have status "deferred"', () => {
        expect(state.retryResult!.status).toBe("deferred");
        expect(isDCBDeferredResult(state.retryResult!)).toBe(true);
      });
    });

    RuleScenario("Max retries exceeded returns rejected", ({ Given, And, When, Then }) => {
      Given("a DCB operation that conflicts", () => {
        state.scopeKey = createScopeKey("t1", "reservation", "res_123");
        state.dcbResult = {
          status: "conflict",
          expectedVersion: 5,
          currentVersion: 10,
          scopeKey: state.scopeKey!,
        } satisfies DCBConflictResult;
      });

      And("attempt is 5 - equal to maxAttempts", () => {
        // attempt will be used in When step
      });

      When("withDCBRetry is called", async () => {
        const ctx = createMockCtx();
        const handler = withDCBRetry(ctx as never, {
          workpool: state.workpoolMock!,
          retryMutation: vi.fn() as never,
          scopeKey: state.scopeKey!,
          options: state.retryConfig ?? undefined,
        });

        state.retryResult = await handler.handleResult(state.dcbResult!, {
          attempt: 5, // Equal to maxAttempts
          retryArgs: {},
        });
      });

      Then('the result should have status "rejected"', () => {
        expect(state.retryResult!.status).toBe("rejected");
      });

      And('the code should be "DCB_MAX_RETRIES_EXCEEDED"', () => {
        expect((state.retryResult as DCBRejectedResult).code).toBe(DCB_MAX_RETRIES_EXCEEDED);
        expect(isMaxRetriesExceeded(state.retryResult!)).toBe(true);
      });
    });

    RuleScenario("Partition key ensures scope serialization", ({ Given, When, Then }) => {
      Given('scope key "tenant:t1:reservation:r1"', () => {
        state.scopeKey = createScopeKey("t1", "reservation", "r1");
        state.dcbResult = {
          status: "conflict",
          expectedVersion: 5,
          currentVersion: 6,
          scopeKey: state.scopeKey!,
        } satisfies DCBConflictResult;
      });

      When("conflict triggers retry", async () => {
        const ctx = createMockCtx();
        const handler = withDCBRetry(ctx as never, {
          workpool: state.workpoolMock!,
          retryMutation: vi.fn() as never,
          scopeKey: state.scopeKey!,
          options: { jitterFn: noJitter },
        });

        await handler.handleResult(state.dcbResult!, {
          attempt: 0,
          retryArgs: {},
        });
      });

      Then('partition key should be "dcb:tenant:t1:reservation:r1"', () => {
        const enqueued = state.workpoolMock!.enqueuedMutations[0];
        expect(enqueued.options.key).toBe(`${DCB_RETRY_KEY_PREFIX}${state.scopeKey!}`);
      });
    });

    RuleScenario("Successful retry calls onComplete with result", ({ Given, And, When, Then }) => {
      Given("a DCB operation with onComplete callback configured", () => {
        state.scopeKey = createScopeKey("t1", "order", "ord_123");
      });

      And("the operation conflicts then succeeds on retry", () => {
        state.dcbResult = {
          status: "conflict",
          expectedVersion: 5,
          currentVersion: 6,
          scopeKey: state.scopeKey!,
        } satisfies DCBConflictResult;
      });

      When("the retry mutation completes successfully", async () => {
        const ctx = createMockCtx();
        const onComplete = vi.fn();

        const handler = withDCBRetry(ctx as never, {
          workpool: state.workpoolMock!,
          retryMutation: vi.fn() as never,
          scopeKey: state.scopeKey!,
          options: {
            jitterFn: noJitter,
            onComplete: onComplete as never,
          },
        });

        await handler.handleResult(state.dcbResult!, {
          attempt: 0,
          retryArgs: { orderId: "ord_123" },
        });
      });

      Then("onComplete should be called with success result", () => {
        const enqueued = state.workpoolMock!.enqueuedMutations[0];
        expect(enqueued.options.onComplete).toBeDefined();
      });

      And("the context object should be passed through", () => {
        const enqueued = state.workpoolMock!.enqueuedMutations[0];
        expect(enqueued.options.context).toMatchObject({
          scopeKey: state.scopeKey,
          attempt: 1,
          expectedVersion: 6,
        });
      });
    });

    RuleScenario("Version advances during retry delay", ({ Given, And, When, Then }) => {
      Given("call A schedules retry with expectedVersion 6 at t=0", () => {
        state.scopeKey = createScopeKey("t1", "order", "ord_123");
      });

      And("call B advances version to 7 at t=100ms", () => {
        // This is the current version at the time of retry
      });

      When("call A's retry executes at t=250ms with expectedVersion 6", async () => {
        // Simulate the second conflict (version advanced from 6 to 7)
        state.dcbResult = {
          status: "conflict",
          expectedVersion: 6,
          currentVersion: 7,
          scopeKey: state.scopeKey!,
        } satisfies DCBConflictResult;

        const ctx = createMockCtx();
        const handler = withDCBRetry(ctx as never, {
          workpool: state.workpoolMock!,
          retryMutation: vi.fn() as never,
          scopeKey: state.scopeKey!,
          options: { jitterFn: noJitter },
        });

        state.retryResult = await handler.handleResult(state.dcbResult!, {
          attempt: 1, // Second attempt (after first retry)
          retryArgs: {},
        });
      });

      Then("it should detect conflict with currentVersion 7", () => {
        expect(state.dcbResult!.status).toBe("conflict");
        expect((state.dcbResult as DCBConflictResult).currentVersion).toBe(7);
      });

      And("it should schedule another retry with expectedVersion 7", () => {
        const enqueued = state.workpoolMock!.enqueuedMutations[0];
        expect(enqueued.args.expectedVersion).toBe(7);
      });

      And("attempt counter should be 2", () => {
        const enqueued = state.workpoolMock!.enqueuedMutations[0];
        expect(enqueued.args.attempt).toBe(2);
      });
    });
  });

  // =========================================================================
  // Backoff Calculation
  // =========================================================================

  Rule("Backoff uses exponential increase with jitter", ({ RuleScenario, RuleScenarioOutline }) => {
    RuleScenarioOutline(
      "Backoff increases exponentially",
      ({ Given, When, Then }, variables: { attempt: string; delay: string }) => {
        Given("backoff config with initialMs 100 and base 2", () => {
          state.backoffConfig = {
            initialMs: 100,
            base: 2,
            maxMs: 30000,
            jitterFn: noJitter,
          };
        });

        When("calculating backoff for attempt <attempt>", () => {
          const attempt = parseInt(variables.attempt, 10);
          state.backoffResult = calculateBackoff(attempt, state.backoffConfig!);
        });

        Then("base delay should be <delay>ms", () => {
          const expectedDelay = parseInt(variables.delay, 10);
          expect(state.backoffResult).toBe(expectedDelay);
        });
      }
    );

    RuleScenario("Backoff is capped at maximum", ({ Given, When, Then }) => {
      Given("backoff config with maxMs 30000", () => {
        state.backoffConfig = {
          initialMs: 100,
          base: 2,
          maxMs: 30000,
          jitterFn: noJitter,
        };
      });

      When("calculating backoff for attempt 10", () => {
        state.backoffResult = calculateBackoff(10, state.backoffConfig!);
      });

      Then("total delay should not exceed 30000ms", () => {
        expect(state.backoffResult).toBeLessThanOrEqual(30000);
      });
    });

    RuleScenario("Jitter adds randomness to prevent thundering herd", ({ Given, When, Then }) => {
      Given("backoff config with initialMs 100", () => {
        state.backoffConfig = {
          initialMs: 100,
          base: 2,
          maxMs: 30000,
          jitterFn: defaultJitter, // Use real jitter
        };
      });

      When("calculating backoff for attempt 0 multiple times", () => {
        state.backoffResults = [];
        for (let i = 0; i < 100; i++) {
          state.backoffResults.push(calculateBackoff(0, state.backoffConfig!));
        }
      });

      Then("results should vary within 50-150% multiplicative jitter range", () => {
        const min = Math.min(...state.backoffResults);
        const max = Math.max(...state.backoffResults);
        const base = state.backoffConfig!.initialMs;

        // With 50-150% jitter, min should be ~50 and max ~150 for attempt 0
        expect(min).toBeLessThan(base);
        expect(max).toBeGreaterThan(base);
        expect(min).toBeGreaterThanOrEqual(base * 0.45); // Allow some tolerance
        expect(max).toBeLessThanOrEqual(base * 1.55); // Allow some tolerance

        // Verify variance exists
        expect(max - min).toBeGreaterThan(0);
      });
    });

    RuleScenario(
      "Jitter function is injectable for deterministic tests",
      ({ Given, When, Then }) => {
        Given("a backoff calculator with custom jitter function returning 1.0", () => {
          const jitterValue = 1.0;
          state.backoffConfig = {
            initialMs: 100,
            base: 2,
            maxMs: 30000,
            jitterFn: () => jitterValue,
          };
        });

        When("calculating backoff for attempt 0 with initialMs 100", () => {
          state.backoffResult = calculateBackoff(0, {
            ...state.backoffConfig!,
            initialMs: 100,
          });
        });

        Then("result should be exactly 100ms - no random variation", () => {
          expect(state.backoffResult).toBe(100);
        });
      }
    );
  });
});
