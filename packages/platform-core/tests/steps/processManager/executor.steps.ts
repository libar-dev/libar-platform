/**
 * Process Manager Executor - Step Definitions
 *
 * BDD step definitions for PM executor behavior:
 * - createProcessManagerExecutor factory creation
 * - Event type filtering (handles())
 * - Event processing and command emission
 * - Instance ID resolution (default and custom)
 * - Error handling (handler and emitter failures)
 * - createMultiPMExecutor routing and processAll
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

import {
  createProcessManagerExecutor,
  createMultiPMExecutor,
  type PMDomainEvent,
  type EmittedCommand,
  type ProcessManagerExecutor,
} from "../../../src/processManager/executor";
import type { ProcessManagerState } from "../../../src/processManager/types";
import { extractDataTable } from "../_helpers/data-table.js";

// =============================================================================
// Mock Types and Helpers
// =============================================================================

type MockCtx = { db: "mock" };
const mockCtx: MockCtx = { db: "mock" };

function createMockStorage(
  pmStateStore: Map<string, ProcessManagerState>,
  deadLetters: Array<{ pmName: string; error: string }>
) {
  return {
    getPMState: vi.fn(async (_ctx: MockCtx, pmName: string, instanceId: string) => {
      return pmStateStore.get(`${pmName}:${instanceId}`) ?? null;
    }),
    getOrCreatePMState: vi.fn(
      async (
        _ctx: MockCtx,
        pmName: string,
        instanceId: string,
        _initial?: { triggerEventId?: string; correlationId?: string }
      ) => {
        const key = `${pmName}:${instanceId}`;
        const existing = pmStateStore.get(key);
        if (existing) return existing;

        const newState: ProcessManagerState = {
          processManagerName: pmName,
          instanceId,
          status: "idle",
          lastGlobalPosition: 0,
          commandsEmitted: 0,
          commandsFailed: 0,
          stateVersion: 1,
          createdAt: Date.now(),
          lastUpdatedAt: Date.now(),
        };
        pmStateStore.set(key, newState);
        return newState;
      }
    ),
    updatePMState: vi.fn(
      async (
        _ctx: MockCtx,
        pmName: string,
        instanceId: string,
        updates: Partial<ProcessManagerState>
      ) => {
        const key = `${pmName}:${instanceId}`;
        const existing = pmStateStore.get(key);
        if (existing) {
          pmStateStore.set(key, { ...existing, ...updates, lastUpdatedAt: Date.now() });
        }
      }
    ),
    recordDeadLetter: vi.fn(
      async (_ctx: MockCtx, pmName: string, _instanceId: string, error: string) => {
        deadLetters.push({ pmName, error });
      }
    ),
  };
}

function createMockEvent(overrides?: Partial<PMDomainEvent>): PMDomainEvent {
  return {
    eventId: "evt_001",
    eventType: "OrderConfirmed",
    globalPosition: 1000,
    correlationId: "corr_001",
    streamType: "Order",
    streamId: "ord_123",
    payload: { orderId: "ord_123", customerId: "cust_456" },
    timestamp: Date.now(),
    ...overrides,
  };
}

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  pmStateStore: Map<string, ProcessManagerState>;
  emittedCommands: EmittedCommand[];
  deadLetters: Array<{ pmName: string; error: string }>;
  executor: ProcessManagerExecutor<MockCtx> | null;
  multiExecutor: ReturnType<typeof createMultiPMExecutor<MockCtx>> | null;
  processResult: Awaited<ReturnType<ProcessManagerExecutor<MockCtx>["process"]>> | null;
  processAllResults: Awaited<
    ReturnType<ReturnType<typeof createMultiPMExecutor<MockCtx>>["processAll"]>
  > | null;
  handler: ReturnType<typeof vi.fn> | null;
  receivedCustomState: unknown;
  storage: ReturnType<typeof createMockStorage> | null;
}

function createInitialState(): TestState {
  return {
    pmStateStore: new Map(),
    emittedCommands: [],
    deadLetters: [],
    executor: null,
    multiExecutor: null,
    processResult: null,
    processAllResults: null,
    handler: null,
    receivedCustomState: undefined,
    storage: null,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature
// =============================================================================

const feature = await loadFeature("tests/features/behavior/processManager/executor.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Helper: build executor from Given params
  // ==========================================================================

  function buildExecutor(pmName: string, subscriptions: string[]) {
    state.storage = createMockStorage(state.pmStateStore, state.deadLetters);
    state.handler = vi.fn(async (): Promise<EmittedCommand[]> => []);

    state.executor = createProcessManagerExecutor<MockCtx>({
      pmName,
      eventSubscriptions: subscriptions as [string, ...string[]],
      storage: state.storage,
      commandEmitter: async (_ctx, commands) => {
        state.emittedCommands.push(...commands);
      },
      handler: state.handler,
    });
  }

  function buildNotificationExecutor(): ProcessManagerExecutor<MockCtx> {
    const storage = createMockStorage(state.pmStateStore, state.deadLetters);
    return createProcessManagerExecutor<MockCtx>({
      pmName: "orderNotification",
      eventSubscriptions: ["OrderConfirmed"] as const,
      storage,
      commandEmitter: async (_ctx, commands) => {
        state.emittedCommands.push(...commands);
      },
      handler: async () => [{ commandType: "SendEmail", payload: {}, causationId: "evt_1" }],
    });
  }

  function buildAnalyticsExecutor(): ProcessManagerExecutor<MockCtx> {
    const storage = createMockStorage(state.pmStateStore, state.deadLetters);
    return createProcessManagerExecutor<MockCtx>({
      pmName: "orderAnalytics",
      eventSubscriptions: ["OrderConfirmed", "OrderShipped"] as const,
      storage,
      commandEmitter: async (_ctx, commands) => {
        state.emittedCommands.push(...commands);
      },
      handler: async () => [{ commandType: "TrackEvent", payload: {}, causationId: "evt_1" }],
    });
  }

  function buildThrowingExecutor(): ProcessManagerExecutor<MockCtx> {
    const storage = createMockStorage(state.pmStateStore, state.deadLetters);
    return createProcessManagerExecutor<MockCtx>({
      pmName: "throwingPM",
      eventSubscriptions: ["OrderConfirmed"] as const,
      storage,
      commandEmitter: async (_ctx, commands) => {
        state.emittedCommands.push(...commands);
      },
      handler: async () => {
        throw new Error("Unexpected executor error");
      },
    });
  }

  // ==========================================================================
  // Rule: Factory creates executor with correct identity and subscription filtering
  // ==========================================================================

  Rule(
    "Factory creates executor with correct identity and subscription filtering",
    ({ RuleScenario }) => {
      RuleScenario("Executor exposes pmName and eventSubscriptions", ({ Given, Then, And }) => {
        Given(
          'a PM executor "orderNotification" subscribing to "OrderConfirmed,OrderShipped"',
          () => {
            buildExecutor("orderNotification", ["OrderConfirmed", "OrderShipped"]);
          }
        );

        Then('the executor pmName is "orderNotification"', () => {
          expect(state.executor!.pmName).toBe("orderNotification");
        });

        And('the executor eventSubscriptions are "OrderConfirmed,OrderShipped"', () => {
          expect(state.executor!.eventSubscriptions).toEqual(["OrderConfirmed", "OrderShipped"]);
        });
      });

      RuleScenario(
        "handles() returns true for subscribed and false for unsubscribed events",
        ({ Given, Then }) => {
          Given(
            'a PM executor "orderNotification" subscribing to "OrderConfirmed,OrderShipped"',
            () => {
              buildExecutor("orderNotification", ["OrderConfirmed", "OrderShipped"]);
            }
          );

          Then("handles returns expected results for event types:", (...args: unknown[]) => {
            const rows = extractDataTable<{ eventType: string; expected: string }>(...args);
            for (const row of rows) {
              expect(state.executor!.handles(row.eventType)).toBe(row.expected === "true");
            }
          });
        }
      );
    }
  );

  // ==========================================================================
  // Rule: Executor processes subscribed events and emits commands
  // ==========================================================================

  Rule("Executor processes subscribed events and emits commands", ({ RuleScenario }) => {
    RuleScenario("Processes event and emits commands", ({ Given, And, When, Then }) => {
      Given('a PM executor "orderNotification" subscribing to "OrderConfirmed"', () => {
        buildExecutor("orderNotification", ["OrderConfirmed"]);
      });

      And('the handler returns a "SendNotification" command', () => {
        state.handler = vi.fn(
          async (): Promise<EmittedCommand[]> => [
            {
              commandType: "SendNotification",
              payload: { email: "test@example.com" },
              causationId: "evt_001",
              correlationId: "corr_001",
            },
          ]
        );
        // Rebuild executor with the new handler
        state.executor = createProcessManagerExecutor<MockCtx>({
          pmName: "orderNotification",
          eventSubscriptions: ["OrderConfirmed"] as const,
          storage: state.storage!,
          commandEmitter: async (_ctx, commands) => {
            state.emittedCommands.push(...commands);
          },
          handler: state.handler,
        });
      });

      When('the executor processes an "OrderConfirmed" event', async () => {
        const event = createMockEvent();
        state.processResult = await state.executor!.process(mockCtx, event);
      });

      Then('the process result status is "processed"', () => {
        expect(state.processResult!.status).toBe("processed");
      });

      And("the handler was called with the event", () => {
        expect(state.handler).toHaveBeenCalledWith(
          mockCtx,
          expect.objectContaining({ eventType: "OrderConfirmed" }),
          undefined
        );
      });

      And('1 command was emitted with commandType "SendNotification"', () => {
        expect(state.emittedCommands).toHaveLength(1);
        expect(state.emittedCommands[0]?.commandType).toBe("SendNotification");
      });
    });
  });

  // ==========================================================================
  // Rule: Executor skips events it is not subscribed to
  // ==========================================================================

  Rule("Executor skips events it is not subscribed to", ({ RuleScenario }) => {
    RuleScenario(
      "Skips unsubscribed event with not_subscribed reason",
      ({ Given, When, Then, And }) => {
        Given('a PM executor "orderNotification" subscribing to "OrderConfirmed"', () => {
          buildExecutor("orderNotification", ["OrderConfirmed"]);
        });

        When('the executor processes an "OrderCancelled" event', async () => {
          const event = createMockEvent({ eventType: "OrderCancelled" });
          state.processResult = await state.executor!.process(mockCtx, event);
        });

        Then('the process result status is "skipped"', () => {
          expect(state.processResult!.status).toBe("skipped");
        });

        And('the skip reason is "not_subscribed"', () => {
          if (state.processResult!.status === "skipped") {
            expect((state.processResult as { status: "skipped"; reason: string }).reason).toBe(
              "not_subscribed"
            );
          }
        });

        And("the handler was not called", () => {
          expect(state.handler).not.toHaveBeenCalled();
        });
      }
    );
  });

  // ==========================================================================
  // Rule: Executor passes custom state from storage to handler
  // ==========================================================================

  Rule("Executor passes custom state from storage to handler", ({ RuleScenario }) => {
    RuleScenario("Passes custom state to handler", ({ Given, And, When, Then }) => {
      Given('a PM executor "orderNotification" subscribing to "OrderConfirmed"', () => {
        // Will be rebuilt after state is seeded
      });

      And('the PM state store has custom state for "orderNotification:ord_123"', () => {
        const customState = { notificationsSent: 5 };
        state.pmStateStore.set("orderNotification:ord_123", {
          processManagerName: "orderNotification",
          instanceId: "ord_123",
          status: "idle",
          lastGlobalPosition: 500,
          commandsEmitted: 5,
          commandsFailed: 0,
          stateVersion: 1,
          createdAt: Date.now(),
          lastUpdatedAt: Date.now(),
          customState,
        });

        // Build executor with a handler that captures customState
        state.storage = createMockStorage(state.pmStateStore, state.deadLetters);
        state.handler = vi.fn(
          async (
            _ctx: MockCtx,
            _event: PMDomainEvent,
            pmState: unknown
          ): Promise<EmittedCommand[]> => {
            state.receivedCustomState = pmState;
            return [];
          }
        );
        state.executor = createProcessManagerExecutor<MockCtx>({
          pmName: "orderNotification",
          eventSubscriptions: ["OrderConfirmed"] as const,
          storage: state.storage,
          commandEmitter: async (_ctx, commands) => {
            state.emittedCommands.push(...commands);
          },
          handler: state.handler,
        });
      });

      When('the executor processes an "OrderConfirmed" event', async () => {
        const event = createMockEvent();
        state.processResult = await state.executor!.process(mockCtx, event);
      });

      Then("the handler received the custom state", () => {
        expect(state.receivedCustomState).toEqual({ notificationsSent: 5 });
      });
    });
  });

  // ==========================================================================
  // Rule: Default instance ID resolver uses streamId
  // ==========================================================================

  Rule("Default instance ID resolver uses streamId", ({ RuleScenario }) => {
    RuleScenario("Uses streamId as default instance ID", ({ Given, When, Then }) => {
      Given(
        'a PM executor "orderNotification" subscribing to "OrderConfirmed" with no custom resolver',
        () => {
          buildExecutor("orderNotification", ["OrderConfirmed"]);
        }
      );

      When(
        'the executor processes an "OrderConfirmed" event with streamId "ord_custom_id"',
        async () => {
          const event = createMockEvent({ streamId: "ord_custom_id" });
          await state.executor!.process(mockCtx, event);
        }
      );

      Then('storage getPMState was called with instanceId "ord_custom_id"', () => {
        expect(state.storage!.getPMState).toHaveBeenCalledWith(
          mockCtx,
          "orderNotification",
          "ord_custom_id"
        );
      });
    });
  });

  // ==========================================================================
  // Rule: Custom instance ID resolver overrides default
  // ==========================================================================

  Rule("Custom instance ID resolver overrides default", ({ RuleScenario }) => {
    RuleScenario("Uses custom instance ID resolver", ({ Given, When, Then }) => {
      Given(
        'a PM executor "orderNotification" subscribing to "OrderConfirmed" with a customer-based resolver',
        () => {
          state.storage = createMockStorage(state.pmStateStore, state.deadLetters);
          state.executor = createProcessManagerExecutor<MockCtx>({
            pmName: "orderNotification",
            eventSubscriptions: ["OrderConfirmed"] as const,
            storage: state.storage,
            commandEmitter: async (_ctx, commands) => {
              state.emittedCommands.push(...commands);
            },
            handler: async () => [],
            instanceIdResolver: (event) => {
              const payload = event.payload as { customerId?: string };
              return `customer:${payload.customerId ?? "unknown"}`;
            },
          });
        }
      );

      When(
        'the executor processes an "OrderConfirmed" event with customerId "cust_789"',
        async () => {
          const event = createMockEvent({
            payload: { orderId: "ord_123", customerId: "cust_789" },
          });
          await state.executor!.process(mockCtx, event);
        }
      );

      Then('storage getPMState was called with instanceId "customer:cust_789"', () => {
        expect(state.storage!.getPMState).toHaveBeenCalledWith(
          mockCtx,
          "orderNotification",
          "customer:cust_789"
        );
      });
    });
  });

  // ==========================================================================
  // Rule: Handler errors produce failed status and dead letters
  // ==========================================================================

  Rule("Handler errors produce failed status and dead letters", ({ RuleScenario }) => {
    RuleScenario("Returns failed status when handler throws", ({ Given, When, Then, And }) => {
      Given(
        'a PM executor "orderNotification" subscribing to "OrderConfirmed" with a throwing handler',
        () => {
          state.storage = createMockStorage(state.pmStateStore, state.deadLetters);
          state.executor = createProcessManagerExecutor<MockCtx>({
            pmName: "orderNotification",
            eventSubscriptions: ["OrderConfirmed"] as const,
            storage: state.storage,
            commandEmitter: async (_ctx, commands) => {
              state.emittedCommands.push(...commands);
            },
            handler: async () => {
              throw new Error("Handler failed");
            },
          });
        }
      );

      When('the executor processes an "OrderConfirmed" event', async () => {
        const event = createMockEvent();
        state.processResult = await state.executor!.process(mockCtx, event);
      });

      Then('the process result status is "failed"', () => {
        expect(state.processResult!.status).toBe("failed");
      });

      And('the result error contains "Handler failed"', () => {
        if (state.processResult!.status === "failed") {
          expect((state.processResult as { status: "failed"; error: string }).error).toContain(
            "Handler failed"
          );
        }
      });

      And("1 dead letter was recorded", () => {
        expect(state.deadLetters).toHaveLength(1);
      });
    });
  });

  // ==========================================================================
  // Rule: Command emitter errors produce failed status and dead letters
  // ==========================================================================

  Rule("Command emitter errors produce failed status and dead letters", ({ RuleScenario }) => {
    RuleScenario(
      "Returns failed status when command emitter throws",
      ({ Given, When, Then, And }) => {
        Given(
          'a PM executor "orderNotification" subscribing to "OrderConfirmed" with a throwing emitter',
          () => {
            state.storage = createMockStorage(state.pmStateStore, state.deadLetters);
            state.executor = createProcessManagerExecutor<MockCtx>({
              pmName: "orderNotification",
              eventSubscriptions: ["OrderConfirmed"] as const,
              storage: state.storage,
              commandEmitter: async () => {
                throw new Error("Emission failed");
              },
              handler: async () => [
                { commandType: "SendNotification", payload: {}, causationId: "evt_1" },
              ],
            });
          }
        );

        When('the executor processes an "OrderConfirmed" event', async () => {
          const event = createMockEvent();
          state.processResult = await state.executor!.process(mockCtx, event);
        });

        Then('the process result status is "failed"', () => {
          expect(state.processResult!.status).toBe("failed");
        });

        And("1 dead letter was recorded", () => {
          expect(state.deadLetters).toHaveLength(1);
        });
      }
    );
  });

  // ==========================================================================
  // Rule: Multi-executor exposes all PM names and finds executors by event type
  // ==========================================================================

  Rule(
    "Multi-executor exposes all PM names and finds executors by event type",
    ({ RuleScenario }) => {
      RuleScenario("Returns all PM names", ({ Given, Then }) => {
        Given('a multi-executor with "orderNotification" and "orderAnalytics"', () => {
          state.multiExecutor = createMultiPMExecutor([
            buildNotificationExecutor(),
            buildAnalyticsExecutor(),
          ]);
        });

        Then('the multi-executor pmNames are "orderNotification,orderAnalytics"', () => {
          expect(state.multiExecutor!.pmNames).toEqual(["orderNotification", "orderAnalytics"]);
        });
      });

      RuleScenario("Finds executors by event type", ({ Given, Then }) => {
        Given('a multi-executor with "orderNotification" and "orderAnalytics"', () => {
          state.multiExecutor = createMultiPMExecutor([
            buildNotificationExecutor(),
            buildAnalyticsExecutor(),
          ]);
        });

        Then("findExecutors returns expected counts:", (...args: unknown[]) => {
          const rows = extractDataTable<{ eventType: string; count: string; firstPmName: string }>(
            ...args
          );
          for (const row of rows) {
            const executors = state.multiExecutor!.findExecutors(row.eventType);
            expect(executors).toHaveLength(Number(row.count));
            if (row.firstPmName) {
              expect(executors[0]?.pmName).toBe(row.firstPmName);
            }
          }
        });
      });
    }
  );

  // ==========================================================================
  // Rule: processAll routes events through all matching executors
  // ==========================================================================

  Rule("processAll routes events through all matching executors", ({ RuleScenario }) => {
    RuleScenario("Processes event through all matching executors", ({ Given, When, Then, And }) => {
      Given('a multi-executor with "orderNotification" and "orderAnalytics"', () => {
        state.multiExecutor = createMultiPMExecutor([
          buildNotificationExecutor(),
          buildAnalyticsExecutor(),
        ]);
      });

      When('processAll is called with an "OrderConfirmed" event', async () => {
        const event = createMockEvent({ eventType: "OrderConfirmed" });
        state.processAllResults = await state.multiExecutor!.processAll(mockCtx, event);
      });

      Then("processAll returns 2 results", () => {
        expect(state.processAllResults).toHaveLength(2);
      });

      And('processAll result 0 has pmName "orderNotification" and status "processed"', () => {
        expect(state.processAllResults![0]?.pmName).toBe("orderNotification");
        expect(state.processAllResults![0]?.result.status).toBe("processed");
      });

      And('processAll result 1 has pmName "orderAnalytics" and status "processed"', () => {
        expect(state.processAllResults![1]?.pmName).toBe("orderAnalytics");
        expect(state.processAllResults![1]?.result.status).toBe("processed");
      });

      And("2 commands were emitted total", () => {
        expect(state.emittedCommands).toHaveLength(2);
      });
    });
  });

  // ==========================================================================
  // Rule: processAll returns empty for unsubscribed events
  // ==========================================================================

  Rule("processAll returns empty for unsubscribed events", ({ RuleScenario }) => {
    RuleScenario("Returns empty array for unsubscribed event", ({ Given, When, Then, And }) => {
      Given('a multi-executor with "orderNotification" and "orderAnalytics"', () => {
        state.multiExecutor = createMultiPMExecutor([
          buildNotificationExecutor(),
          buildAnalyticsExecutor(),
        ]);
      });

      When('processAll is called with an "OrderCancelled" event', async () => {
        const event = createMockEvent({ eventType: "OrderCancelled" });
        state.processAllResults = await state.multiExecutor!.processAll(mockCtx, event);
      });

      Then("processAll returns 0 results", () => {
        expect(state.processAllResults).toHaveLength(0);
      });

      And("0 commands were emitted total", () => {
        expect(state.emittedCommands).toHaveLength(0);
      });
    });
  });

  // ==========================================================================
  // Rule: processAll routes to single matching executor
  // ==========================================================================

  Rule("processAll routes to single matching executor", ({ RuleScenario }) => {
    RuleScenario("Processes single matching executor", ({ Given, When, Then, And }) => {
      Given('a multi-executor with "orderNotification" and "orderAnalytics"', () => {
        state.multiExecutor = createMultiPMExecutor([
          buildNotificationExecutor(),
          buildAnalyticsExecutor(),
        ]);
      });

      When('processAll is called with an "OrderShipped" event', async () => {
        const event = createMockEvent({ eventType: "OrderShipped" });
        state.processAllResults = await state.multiExecutor!.processAll(mockCtx, event);
      });

      Then("processAll returns 1 results", () => {
        expect(state.processAllResults).toHaveLength(1);
      });

      And('processAll result 0 has pmName "orderAnalytics" and status "processed"', () => {
        expect(state.processAllResults![0]?.pmName).toBe("orderAnalytics");
        expect(state.processAllResults![0]?.result.status).toBe("processed");
      });

      And('1 command was emitted with commandType "TrackEvent"', () => {
        expect(state.emittedCommands).toHaveLength(1);
        expect(state.emittedCommands[0]?.commandType).toBe("TrackEvent");
      });
    });
  });

  // ==========================================================================
  // Rule: processAll isolates exceptions across executors
  // ==========================================================================

  Rule("processAll isolates exceptions across executors", ({ RuleScenario }) => {
    RuleScenario(
      "Isolates exceptions so other executors still run",
      ({ Given, When, Then, And }) => {
        Given(
          'a multi-executor with a throwing executor and "orderNotification" and "orderAnalytics"',
          () => {
            state.multiExecutor = createMultiPMExecutor([
              buildThrowingExecutor(),
              buildNotificationExecutor(),
              buildAnalyticsExecutor(),
            ]);
          }
        );

        When('processAll is called with an "OrderConfirmed" event', async () => {
          const event = createMockEvent({ eventType: "OrderConfirmed" });
          state.processAllResults = await state.multiExecutor!.processAll(mockCtx, event);
        });

        Then("processAll returns 3 results", () => {
          expect(state.processAllResults).toHaveLength(3);
        });

        And('processAll result 0 has pmName "throwingPM" and status "failed"', () => {
          expect(state.processAllResults![0]?.pmName).toBe("throwingPM");
          expect(state.processAllResults![0]?.result.status).toBe("failed");
        });

        And('processAll result 0 error contains "Unexpected executor error"', () => {
          const result = state.processAllResults![0]?.result;
          if (result?.status === "failed") {
            expect((result as { status: "failed"; error: string }).error).toContain(
              "Unexpected executor error"
            );
          }
        });

        And('processAll result 1 has pmName "orderNotification" and status "processed"', () => {
          expect(state.processAllResults![1]?.pmName).toBe("orderNotification");
          expect(state.processAllResults![1]?.result.status).toBe("processed");
        });

        And('processAll result 2 has pmName "orderAnalytics" and status "processed"', () => {
          expect(state.processAllResults![2]?.pmName).toBe("orderAnalytics");
          expect(state.processAllResults![2]?.result.status).toBe("processed");
        });

        And("2 commands were emitted total", () => {
          expect(state.emittedCommands).toHaveLength(2);
        });
      }
    );
  });

  // ==========================================================================
  // Rule: processAll handles empty executors array gracefully
  // ==========================================================================

  Rule("processAll handles empty executors array gracefully", ({ RuleScenario }) => {
    RuleScenario("Handles empty executors array", ({ Given, Then, And, When }) => {
      Given("an empty multi-executor", () => {
        state.multiExecutor = createMultiPMExecutor<MockCtx>([]);
      });

      Then("the multi-executor pmNames are empty", () => {
        expect(state.multiExecutor!.pmNames).toEqual([]);
      });

      And('findExecutors for "OrderConfirmed" returns 0 executors', () => {
        expect(state.multiExecutor!.findExecutors("OrderConfirmed")).toEqual([]);
      });

      When('processAll is called with an "OrderConfirmed" event', async () => {
        const event = createMockEvent({ eventType: "OrderConfirmed" });
        state.processAllResults = await state.multiExecutor!.processAll(mockCtx, event);
      });

      Then("processAll returns 0 results", () => {
        expect(state.processAllResults).toEqual([]);
      });
    });
  });
});
