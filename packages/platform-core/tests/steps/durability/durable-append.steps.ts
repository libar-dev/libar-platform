/**
 * Durable Append - Step Definitions
 *
 * BDD step definitions for durable event append operations:
 * - Partition key generation
 * - Workpool enqueue behavior
 * - Action handler factory
 *
 * @libar-docs
 * @libar-docs-implements EventStoreDurability
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

import {
  durableAppendEvent,
  createAppendPartitionKey,
  createDurableAppendActionHandler,
  type WorkpoolLike,
  type DurableAppendEnqueueResult,
} from "../../../src/durability/durableAppend.js";

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  partitionKey: { name: string; value: string } | null;
  mockWorkpool: WorkpoolLike | null;
  workpoolEnqueueCalled: boolean;
  workpoolEnqueueArgs: {
    partitionKey?: string;
    onComplete?: unknown;
    context?: Record<string, unknown>;
  };
  workpoolReturnedWorkId: string;
  durableAppendResult: DurableAppendEnqueueResult | null;
  actionHandler: ((ctx: unknown, args: unknown) => Promise<unknown>) | null;
  idempotentAppendCalled: boolean;
  error: Error | null;
}

let state: TestState;

function resetState(): void {
  state = {
    partitionKey: null,
    mockWorkpool: null,
    workpoolEnqueueCalled: false,
    workpoolEnqueueArgs: {},
    workpoolReturnedWorkId: "work-default",
    durableAppendResult: null,
    actionHandler: null,
    idempotentAppendCalled: false,
    error: null,
  };
}

function createMockWorkpool(workId: string = "work-default"): WorkpoolLike {
  return {
    enqueueAction: vi.fn().mockImplementation((_ctx, _actionRef, _args, options) => {
      state.workpoolEnqueueCalled = true;
      state.workpoolEnqueueArgs = {
        partitionKey: options?.key,
        onComplete: options?.onComplete,
        context: options?.context,
      };
      return Promise.resolve(workId);
    }),
  };
}

// =============================================================================
// Feature Definition
// =============================================================================

const feature = await loadFeature(
  "tests/features/behavior/event-store-durability/durable-append.feature"
);

describeFeature(feature, ({ Scenario, ScenarioOutline, BeforeEachScenario, AfterEachScenario }) => {
  BeforeEachScenario(() => {
    resetState();
  });

  AfterEachScenario(() => {
    resetState();
  });

  // ===========================================================================
  // Partition Key Scenarios
  // ===========================================================================

  Scenario("createAppendPartitionKey generates correct format", ({ When, Then, And }) => {
    When('calling createAppendPartitionKey with stream type "Order" and ID "ord-456"', () => {
      state.partitionKey = createAppendPartitionKey("Order", "ord-456");
    });

    Then('the partition key name should be "append"', () => {
      expect(state.partitionKey?.name).toBe("append");
    });

    And('the partition key value should be "Order:ord-456"', () => {
      expect(state.partitionKey?.value).toBe("Order:ord-456");
    });
  });

  ScenarioOutline(
    "Partition key handles various stream types",
    ({ When, Then }, variables: { streamType: string; streamId: string; expected: string }) => {
      When(
        'calling createAppendPartitionKey with stream type "<streamType>" and ID "<streamId>"',
        () => {
          state.partitionKey = createAppendPartitionKey(variables.streamType, variables.streamId);
        }
      );

      Then('the partition key value should be "<expected>"', () => {
        expect(state.partitionKey?.value).toBe(variables.expected);
      });
    }
  );

  // ===========================================================================
  // Durable Append Enqueue Scenarios
  // ===========================================================================

  Scenario("durableAppendEvent enqueues action to Workpool", ({ Given, When, Then, And }) => {
    Given("a mock Workpool for durable append", () => {
      state.mockWorkpool = createMockWorkpool();
    });

    When('calling durableAppendEvent for stream "Order:ord-123"', async () => {
      state.durableAppendResult = await durableAppendEvent(
        {},
        {
          workpool: state.mockWorkpool!,
          actionRef: "mockActionRef",
          append: {
            event: {
              idempotencyKey: "test:ord-123",
              streamType: "Order",
              streamId: "ord-123",
              eventType: "TestEvent",
              eventData: { test: true },
              boundedContext: "test",
            },
            dependencies: {
              getByIdempotencyKey: "mock",
              appendToStream: "mock",
            },
          },
        }
      );
    });

    Then("Workpool enqueueAction should be called", () => {
      expect(state.workpoolEnqueueCalled).toBe(true);
    });

    And('the workpool partition key should be "Order:ord-123"', () => {
      expect(state.workpoolEnqueueArgs.partitionKey).toBe("Order:ord-123");
    });

    And('the result status should be "enqueued"', () => {
      expect(state.durableAppendResult?.status).toBe("enqueued");
    });
  });

  Scenario("durableAppendEvent returns work ID from Workpool", ({ Given, When, Then }) => {
    Given('a mock Workpool that returns work ID "work-789"', () => {
      state.mockWorkpool = createMockWorkpool("work-789");
    });

    When("calling durableAppendEvent for any event", async () => {
      state.durableAppendResult = await durableAppendEvent(
        {},
        {
          workpool: state.mockWorkpool!,
          actionRef: "mockActionRef",
          append: {
            event: {
              idempotencyKey: "test:ord-123",
              streamType: "Order",
              streamId: "ord-123",
              eventType: "TestEvent",
              eventData: { test: true },
              boundedContext: "test",
            },
            dependencies: {
              getByIdempotencyKey: "mock",
              appendToStream: "mock",
            },
          },
        }
      );
    });

    Then('the result workId should be "work-789"', () => {
      expect(state.durableAppendResult?.workId).toBe("work-789");
    });
  });

  Scenario("durableAppendEvent passes onComplete to Workpool", ({ Given, When, Then }) => {
    Given("a mock Workpool for durable append", () => {
      state.mockWorkpool = createMockWorkpool();
    });

    When("calling durableAppendEvent with onComplete handler", async () => {
      await durableAppendEvent(
        {},
        {
          workpool: state.mockWorkpool!,
          actionRef: "mockActionRef",
          append: {
            event: {
              idempotencyKey: "test:ord-123",
              streamType: "Order",
              streamId: "ord-123",
              eventType: "TestEvent",
              eventData: { test: true },
              boundedContext: "test",
            },
            dependencies: {
              getByIdempotencyKey: "mock",
              appendToStream: "mock",
            },
          },
          options: {
            onComplete: "mockOnCompleteRef",
          },
        }
      );
    });

    Then("Workpool should receive the onComplete reference", () => {
      expect(state.workpoolEnqueueArgs.onComplete).toBe("mockOnCompleteRef");
    });
  });

  Scenario("durableAppendEvent includes idempotencyKey in context", ({ Given, When, Then }) => {
    Given("a mock Workpool for durable append", () => {
      state.mockWorkpool = createMockWorkpool();
    });

    When('calling durableAppendEvent with idempotencyKey "test:ord-123"', async () => {
      await durableAppendEvent(
        {},
        {
          workpool: state.mockWorkpool!,
          actionRef: "mockActionRef",
          append: {
            event: {
              idempotencyKey: "test:ord-123",
              streamType: "Order",
              streamId: "ord-123",
              eventType: "TestEvent",
              eventData: { test: true },
              boundedContext: "test",
            },
            dependencies: {
              getByIdempotencyKey: "mock",
              appendToStream: "mock",
            },
          },
        }
      );
    });

    Then("Workpool context should include the idempotencyKey", () => {
      expect(state.workpoolEnqueueArgs.context?.idempotencyKey).toBe("test:ord-123");
    });
  });

  // ===========================================================================
  // Action Handler Factory Scenarios
  // ===========================================================================

  Scenario("createDurableAppendActionHandler returns a function", ({ When, Then }) => {
    When("calling createDurableAppendActionHandler", () => {
      state.actionHandler = createDurableAppendActionHandler();
    });

    Then("the result should be a callable function", () => {
      expect(typeof state.actionHandler).toBe("function");
    });
  });

  Scenario("Action handler invokes idempotentAppendEvent", ({ Given, When, Then }) => {
    Given("a durable append action handler", () => {
      state.actionHandler = createDurableAppendActionHandler();
    });

    When("invoking the handler with event args", async () => {
      const mockCtx = {
        runQuery: vi.fn().mockResolvedValue(null),
        runMutation: vi.fn().mockImplementation(() => {
          state.idempotentAppendCalled = true;
          return Promise.resolve({ status: "success", newVersion: 1 });
        }),
      };

      try {
        await state.actionHandler!(mockCtx, {
          event: {
            idempotencyKey: "test:ord-123",
            streamType: "Order",
            streamId: "ord-123",
            eventType: "TestEvent",
            eventData: { test: true },
            boundedContext: "test",
          },
          dependencies: {
            getByIdempotencyKey: "mock",
            appendToStream: "mock",
          },
        });
      } catch (e) {
        state.error = e as Error;
      }
    });

    Then("idempotentAppendEvent should be called", () => {
      expect(state.idempotentAppendCalled).toBe(true);
    });
  });
});
