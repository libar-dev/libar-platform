/**
 * Intent/Completion - Step Definitions
 *
 * BDD step definitions for intent/completion bracketing pattern:
 * - Intent key builder
 * - recordIntent function
 * - recordCompletion function
 * - checkIntentTimeout function
 * - queryOrphanedIntents function
 *
 * @libar-docs
 * @libar-docs-implements EventStoreDurability
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

import {
  buildIntentKey,
  recordIntent,
  recordCompletion,
  checkIntentTimeout,
  queryOrphanedIntents,
  type RecordIntentResult,
} from "../../../src/durability/intentCompletion.js";
import type { CompletionStatus } from "../../../src/durability/types.js";

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  intentKey: string | null;
  appendedEvents: Array<{ eventType: string; eventData: Record<string, unknown> }>;
  schedulerCalls: Array<{ delay: number; args: Record<string, unknown> }>;
  mockCompletionExists: boolean;
  mockIntentEvents: Array<{ payload: { intentKey: string; operationType: string } }>;
  mockHasCompletionFor: Set<string>;
  recordIntentResult: RecordIntentResult | null;
  checkTimeoutResult: { status: string } | null;
  orphanedIntentsResult: Array<{ intentKey: string; timeSinceIntent: number }> | null;
  filteredOperationType: string | null;
  error: Error | null;
}

let state: TestState;

function resetState(): void {
  state = {
    intentKey: null,
    appendedEvents: [],
    schedulerCalls: [],
    mockCompletionExists: false,
    mockIntentEvents: [],
    mockHasCompletionFor: new Set(),
    recordIntentResult: null,
    checkTimeoutResult: null,
    orphanedIntentsResult: null,
    filteredOperationType: null,
    error: null,
  };
}

function createMockContext() {
  return {
    runQuery: vi.fn().mockImplementation((_ref, args) => {
      if (args?.idempotencyKey) {
        return Promise.resolve(state.mockCompletionExists ? { eventId: "existing" } : null);
      }
      if (args?.intentKey !== undefined) {
        return Promise.resolve(state.mockHasCompletionFor.has(args.intentKey));
      }
      if (args?.operationType) {
        state.filteredOperationType = args.operationType;
      }
      return Promise.resolve(state.mockIntentEvents);
    }),
    runMutation: vi.fn().mockImplementation((_ref, args) => {
      const eventType = args.events?.[0]?.eventType ?? args.event?.eventType ?? "unknown";
      const eventData = args.events?.[0]?.payload ?? args.event?.eventData ?? {};
      state.appendedEvents.push({ eventType, eventData });
      return Promise.resolve({ status: "success", newVersion: 1 });
    }),
    scheduler: {
      runAfter: vi.fn().mockImplementation((delay, _handler, args) => {
        state.schedulerCalls.push({ delay, args });
        return Promise.resolve("scheduled-id");
      }),
    },
  };
}

// =============================================================================
// Feature Definition
// =============================================================================

const feature = await loadFeature(
  "tests/features/behavior/event-store-durability/intent-completion.feature"
);

describeFeature(feature, ({ Scenario, ScenarioOutline, BeforeEachScenario, AfterEachScenario }) => {
  BeforeEachScenario(() => {
    resetState();
  });

  AfterEachScenario(() => {
    resetState();
  });

  // ===========================================================================
  // Intent Key Scenarios
  // ===========================================================================

  Scenario("buildIntentKey generates correct format", ({ When, Then }) => {
    When(
      'building intent key for operation "OrderSubmission", stream "Order:ord-123", timestamp 1704067200000',
      () => {
        state.intentKey = buildIntentKey("OrderSubmission", "Order", "ord-123", 1704067200000);
      }
    );

    Then('the intent key should be "OrderSubmission:Order:ord-123:1704067200000"', () => {
      expect(state.intentKey).toBe("OrderSubmission:Order:ord-123:1704067200000");
    });
  });

  ScenarioOutline(
    "Intent key handles various operation types",
    (
      { When, Then },
      variables: {
        opType: string;
        streamType: string;
        streamId: string;
        timestamp: string;
        expected: string;
      }
    ) => {
      When(
        'building intent key for operation "<opType>", stream "<streamType>:<streamId>", timestamp <timestamp>',
        () => {
          state.intentKey = buildIntentKey(
            variables.opType,
            variables.streamType,
            variables.streamId,
            parseInt(variables.timestamp, 10)
          );
        }
      );

      Then('the intent key should be "<expected>"', () => {
        expect(state.intentKey).toBe(variables.expected);
      });
    }
  );

  // ===========================================================================
  // Record Intent Scenarios
  // ===========================================================================

  Scenario("recordIntent creates intent event with correct type", ({ Given, When, Then, And }) => {
    Given("a mock context for intent recording", () => {
      // Mock context will be created in When step
    });

    When('recording intent for operation "OrderSubmission" with timeout 300000ms', async () => {
      const ctx = createMockContext();
      state.recordIntentResult = await recordIntent(ctx, {
        operationType: "OrderSubmission",
        streamType: "Order",
        streamId: "ord-123",
        boundedContext: "orders",
        timeoutMs: 300000,
        onTimeout: "mockTimeoutHandler",
        dependencies: {
          getByIdempotencyKey: "mock",
          appendToStream: "mock",
        },
      });
    });

    Then('an event of type "OrderSubmissionStarted" should be created', () => {
      expect(state.appendedEvents.length).toBeGreaterThan(0);
      expect(state.appendedEvents[0].eventType).toBe("OrderSubmissionStarted");
    });

    And("the event data should include the intent key and timeout", () => {
      expect(state.appendedEvents[0].eventData).toHaveProperty("intentKey");
      expect(state.appendedEvents[0].eventData).toHaveProperty("timeoutMs", 300000);
    });
  });

  Scenario("recordIntent schedules timeout check", ({ Given, When, Then }) => {
    Given("a mock context for intent recording", () => {
      // Mock context will be created in When step
    });

    When("recording intent with timeout 60000ms", async () => {
      const ctx = createMockContext();
      await recordIntent(ctx, {
        operationType: "OrderSubmission",
        streamType: "Order",
        streamId: "ord-123",
        boundedContext: "orders",
        timeoutMs: 60000,
        onTimeout: "mockTimeoutHandler",
        dependencies: {
          getByIdempotencyKey: "mock",
          appendToStream: "mock",
        },
      });
    });

    Then("scheduler.runAfter should be called with 60000ms delay", () => {
      expect(state.schedulerCalls.length).toBe(1);
      expect(state.schedulerCalls[0].delay).toBe(60000);
    });
  });

  Scenario("recordIntent returns intentKey and eventId", ({ Given, When, Then }) => {
    Given("a mock context for intent recording", () => {
      // Mock context will be created in When step
    });

    When("recording any intent", async () => {
      const ctx = createMockContext();
      state.recordIntentResult = await recordIntent(ctx, {
        operationType: "OrderSubmission",
        streamType: "Order",
        streamId: "ord-123",
        boundedContext: "orders",
        timeoutMs: 60000,
        onTimeout: "mockTimeoutHandler",
        dependencies: {
          getByIdempotencyKey: "mock",
          appendToStream: "mock",
        },
      });
    });

    Then("the result should contain intentKey and intentEventId", () => {
      expect(state.recordIntentResult?.intentKey).toBeDefined();
      expect(state.recordIntentResult?.intentEventId).toBeDefined();
    });
  });

  // ===========================================================================
  // Record Completion Scenarios
  // ===========================================================================

  Scenario("recordCompletion creates success event", ({ Given, When, Then }) => {
    Given("a mock context for completion recording", () => {
      // Mock context will be created in When step
    });

    When(
      'recording completion with status "success" for intent "OrderSubmission:Order:ord-123:1704067200000"',
      async () => {
        const ctx = createMockContext();
        await recordCompletion(ctx, {
          intentKey: "OrderSubmission:Order:ord-123:1704067200000",
          status: "success" as CompletionStatus,
          streamType: "Order",
          streamId: "ord-123",
          boundedContext: "orders",
          dependencies: {
            getByIdempotencyKey: "mock",
            appendToStream: "mock",
          },
        });
      }
    );

    Then('an event of type "OrderSubmissionCompleted" should be created', () => {
      expect(state.appendedEvents.length).toBeGreaterThan(0);
      expect(state.appendedEvents[0].eventType).toBe("OrderSubmissionCompleted");
    });
  });

  Scenario("recordCompletion creates failure event with error", ({ Given, When, Then, And }) => {
    Given("a mock context for completion recording", () => {
      // Mock context will be created in When step
    });

    When('recording completion with status "failure" and error "Validation failed"', async () => {
      const ctx = createMockContext();
      await recordCompletion(ctx, {
        intentKey: "OrderSubmission:Order:ord-123:1704067200000",
        status: "failure" as CompletionStatus,
        streamType: "Order",
        streamId: "ord-123",
        boundedContext: "orders",
        dependencies: {
          getByIdempotencyKey: "mock",
          appendToStream: "mock",
        },
        error: "Validation failed",
      });
    });

    Then('an event of type "OrderSubmissionFailed" should be created', () => {
      expect(state.appendedEvents.length).toBeGreaterThan(0);
      expect(state.appendedEvents[0].eventType).toBe("OrderSubmissionFailed");
    });

    And('the event data should include error "Validation failed"', () => {
      expect(state.appendedEvents[0].eventData).toHaveProperty("error", "Validation failed");
    });
  });

  Scenario("recordCompletion creates abandonment event", ({ Given, When, Then }) => {
    Given("a mock context for completion recording", () => {
      // Mock context will be created in When step
    });

    When(
      'recording completion with status "abandoned" for intent "OrderSubmission:Order:ord-123:1704067200000"',
      async () => {
        const ctx = createMockContext();
        await recordCompletion(ctx, {
          intentKey: "OrderSubmission:Order:ord-123:1704067200000",
          status: "abandoned" as CompletionStatus,
          streamType: "Order",
          streamId: "ord-123",
          boundedContext: "orders",
          dependencies: {
            getByIdempotencyKey: "mock",
            appendToStream: "mock",
          },
        });
      }
    );

    Then('an event of type "OrderSubmissionAbandoned" should be created', () => {
      expect(state.appendedEvents.length).toBeGreaterThan(0);
      expect(state.appendedEvents[0].eventType).toBe("OrderSubmissionAbandoned");
    });
  });

  // ===========================================================================
  // Timeout Check Scenarios
  // ===========================================================================

  Scenario(
    "checkIntentTimeout returns already_resolved when completion exists",
    ({ Given, When, Then, And }) => {
      Given("a mock context where completion exists for the intent", () => {
        state.mockCompletionExists = true;
      });

      When("calling checkIntentTimeout", async () => {
        const ctx = createMockContext();
        state.checkTimeoutResult = await checkIntentTimeout(ctx, {
          intentKey: "OrderSubmission:Order:ord-123:1704067200000",
          streamType: "Order",
          streamId: "ord-123",
          boundedContext: "orders",
          dependencies: {
            getByIdempotencyKey: "mock",
            appendToStream: "mock",
          },
        });
      });

      Then('the result status should be "already_resolved"', () => {
        expect(state.checkTimeoutResult?.status).toBe("already_resolved");
      });

      And("no new event should be created", () => {
        expect(state.appendedEvents.length).toBe(0);
      });
    }
  );

  Scenario(
    "checkIntentTimeout creates abandonment when no completion",
    ({ Given, When, Then, And }) => {
      Given("a mock context where no completion exists", () => {
        state.mockCompletionExists = false;
      });

      When("calling checkIntentTimeout", async () => {
        const ctx = createMockContext();
        state.checkTimeoutResult = await checkIntentTimeout(ctx, {
          intentKey: "OrderSubmission:Order:ord-123:1704067200000",
          streamType: "Order",
          streamId: "ord-123",
          boundedContext: "orders",
          dependencies: {
            getByIdempotencyKey: "mock",
            appendToStream: "mock",
          },
        });
      });

      Then('the result status should be "abandoned"', () => {
        expect(state.checkTimeoutResult?.status).toBe("abandoned");
      });

      And("an abandonment event should be created", () => {
        expect(state.appendedEvents.length).toBeGreaterThan(0);
        expect(state.appendedEvents[0].eventType).toBe("OrderSubmissionAbandoned");
      });
    }
  );

  Scenario("checkIntentTimeout is idempotent", ({ Given, When, Then }) => {
    Given("a mock context where abandonment completion already exists", () => {
      state.mockCompletionExists = true;
    });

    When("calling checkIntentTimeout again", async () => {
      const ctx = createMockContext();
      state.checkTimeoutResult = await checkIntentTimeout(ctx, {
        intentKey: "OrderSubmission:Order:ord-123:1704067200000",
        streamType: "Order",
        streamId: "ord-123",
        boundedContext: "orders",
        dependencies: {
          getByIdempotencyKey: "mock",
          appendToStream: "mock",
        },
      });
    });

    Then('the result status should be "already_resolved"', () => {
      expect(state.checkTimeoutResult?.status).toBe("already_resolved");
    });
  });

  // ===========================================================================
  // Query Orphaned Intents Scenarios
  // ===========================================================================

  Scenario(
    "queryOrphanedIntents returns intents without completion",
    ({ Given, When, Then, And }) => {
      Given("3 intent events where 1 has no completion", () => {
        const _now = Date.now();
        state.mockIntentEvents = [
          { payload: { intentKey: "intent-1", operationType: "OrderSubmission" } },
          { payload: { intentKey: "intent-2", operationType: "OrderSubmission" } },
          { payload: { intentKey: "intent-3", operationType: "OrderSubmission" } },
        ];
        state.mockHasCompletionFor = new Set(["intent-1", "intent-2"]);
      });

      When("querying orphaned intents older than 300000ms", async () => {
        const ctx = {
          runQuery: vi.fn().mockImplementation((_ref, args) => {
            if (args?.intentKey !== undefined) {
              return Promise.resolve(state.mockHasCompletionFor.has(args.intentKey));
            }
            return Promise.resolve(state.mockIntentEvents);
          }),
        };

        state.orphanedIntentsResult = await queryOrphanedIntents(ctx, {
          olderThanMs: 300000,
          queryIntentEvents: "mock",
          hasCompletion: "mock",
        });
      });

      Then("the result should contain 1 orphaned intent", () => {
        expect(state.orphanedIntentsResult?.length).toBe(1);
      });

      And("each orphan should include timeSinceIntent", () => {
        expect(state.orphanedIntentsResult?.[0]).toHaveProperty("timeSinceIntent");
      });
    }
  );

  Scenario("queryOrphanedIntents filters by operation type", ({ Given, When, Then }) => {
    Given("orphaned intents for multiple operation types", () => {
      state.mockIntentEvents = [
        { payload: { intentKey: "intent-1", operationType: "OrderSubmission" } },
      ];
      state.mockHasCompletionFor = new Set();
    });

    When('querying with operationType filter "OrderSubmission"', async () => {
      const ctx = {
        runQuery: vi.fn().mockImplementation((_ref, args) => {
          if (args?.operationType) {
            state.filteredOperationType = args.operationType;
          }
          if (args?.intentKey !== undefined) {
            return Promise.resolve(state.mockHasCompletionFor.has(args.intentKey));
          }
          return Promise.resolve(state.mockIntentEvents);
        }),
      };

      state.orphanedIntentsResult = await queryOrphanedIntents(ctx, {
        operationType: "OrderSubmission",
        olderThanMs: 300000,
        queryIntentEvents: "mock",
        hasCompletion: "mock",
      });
    });

    Then("the query should filter by operation type", () => {
      expect(state.filteredOperationType).toBe("OrderSubmission");
    });
  });
});
