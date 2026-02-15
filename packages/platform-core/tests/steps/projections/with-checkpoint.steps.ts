/**
 * withCheckpoint - Step Definitions
 *
 * BDD step definitions for checkpoint-based projection idempotency:
 * - New event processing
 * - Duplicate event skipping
 * - Partition isolation
 * - Error handling
 * - Checkpoint data integrity
 * - createCheckpointHelper factory
 * - Pure functions (shouldProcessEvent, createInitialCheckpoint)
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

import { withCheckpoint, createCheckpointHelper } from "../../../src/projections/withCheckpoint.js";
import {
  shouldProcessEvent,
  createInitialCheckpoint,
} from "../../../src/projections/checkpoint.js";
import type { ProjectionCheckpoint } from "../../../src/projections/types.js";

// ============================================================================
// Test Types
// ============================================================================

type MockCtx = { db: "mock" };
const mockCtx: MockCtx = { db: "mock" };

interface TestState {
  checkpointStore: Map<string, ProjectionCheckpoint>;
  processedEvents: string[];
  result: { status: string } | null;
  error: Error | null;
  mocks: ReturnType<typeof createMockFns> | null;
  mocks1: ReturnType<typeof createMockFns> | null;
  mocks2: ReturnType<typeof createMockFns> | null;
  helperResult: { status: string } | null;
  helperProcessedEvents: string[];
  helperCheckpointStore: Map<string, ProjectionCheckpoint>;
  initialCheckpoint: ProjectionCheckpoint | null;
  initialCheckpoint2: ProjectionCheckpoint | null;
  retryResult: { status: string } | null;
  beforeTime: number;
}

// ============================================================================
// Helpers
// ============================================================================

function createMockFns(
  checkpointStore: Map<string, ProjectionCheckpoint>,
  processedEvents: string[]
) {
  return {
    getCheckpoint: vi.fn(async (_ctx: MockCtx, partitionKey: string) => {
      return checkpointStore.get(partitionKey) ?? null;
    }),
    updateCheckpoint: vi.fn(
      async (_ctx: MockCtx, partitionKey: string, checkpoint: ProjectionCheckpoint) => {
        checkpointStore.set(partitionKey, checkpoint);
      }
    ),
    process: vi.fn(async () => {
      processedEvents.push("event_processed");
    }),
  };
}

let state: TestState;

function resetState(): void {
  state = {
    checkpointStore: new Map(),
    processedEvents: [],
    result: null,
    error: null,
    mocks: null,
    mocks1: null,
    mocks2: null,
    helperResult: null,
    helperProcessedEvents: [],
    helperCheckpointStore: new Map(),
    initialCheckpoint: null,
    initialCheckpoint2: null,
    retryResult: null,
    beforeTime: 0,
  };
}

// ============================================================================
// Feature
// ============================================================================

const feature = await loadFeature("tests/features/behavior/projections/with-checkpoint.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario, AfterEachScenario }) => {
  BeforeEachScenario(() => {
    resetState();
    vi.clearAllMocks();
  });

  AfterEachScenario(() => {
    resetState();
  });

  // ==========================================================================
  // Rule: New Event Processing
  // ==========================================================================

  Rule("withCheckpoint processes events that have not been seen before", ({ RuleScenario }) => {
    RuleScenario("Process event when no checkpoint exists", ({ Given, When, Then, And }) => {
      Given('no checkpoint exists for partition "ord_123"', () => {
        // Default state: empty checkpoint store
      });

      When(
        'I call withCheckpoint with projection "orderSummary" partition "ord_123" position 1000 event "evt_001"',
        async () => {
          state.mocks = createMockFns(state.checkpointStore, state.processedEvents);
          state.result = await withCheckpoint(mockCtx, {
            projectionName: "orderSummary",
            partitionKey: "ord_123",
            globalPosition: 1000,
            eventId: "evt_001",
            ...state.mocks,
          });
        }
      );

      Then('the result status is "processed"', () => {
        expect(state.result?.status).toBe("processed");
      });

      And("the process callback was invoked 1 time", () => {
        expect(state.mocks!.process).toHaveBeenCalledTimes(1);
      });

      And("the updateCheckpoint callback was invoked 1 time", () => {
        expect(state.mocks!.updateCheckpoint).toHaveBeenCalledTimes(1);
      });

      And("the processed events list contains:", (_ctx: unknown, dataTable: unknown) => {
        const table = dataTable as { event: string }[];
        const expected = table.map((r) => r.event);
        expect(state.processedEvents).toEqual(expected);
      });
    });

    RuleScenario(
      "Process event when globalPosition exceeds checkpoint",
      ({ Given, When, Then, And }) => {
        Given(
          'a checkpoint exists for partition "ord_123" at position 1000 with event "evt_001"',
          () => {
            state.checkpointStore.set("ord_123", {
              projectionName: "orderSummary",
              partitionKey: "ord_123",
              lastGlobalPosition: 1000,
              lastEventId: "evt_001",
              updatedAt: Date.now() - 5000,
            });
          }
        );

        When(
          'I call withCheckpoint with projection "orderSummary" partition "ord_123" position 2000 event "evt_002"',
          async () => {
            state.mocks = createMockFns(state.checkpointStore, state.processedEvents);
            state.result = await withCheckpoint(mockCtx, {
              projectionName: "orderSummary",
              partitionKey: "ord_123",
              globalPosition: 2000,
              eventId: "evt_002",
              ...state.mocks,
            });
          }
        );

        Then('the result status is "processed"', () => {
          expect(state.result?.status).toBe("processed");
        });

        And("the process callback was invoked 1 time", () => {
          expect(state.mocks!.process).toHaveBeenCalledTimes(1);
        });
      }
    );

    RuleScenario("Checkpoint is updated after processing", ({ Given, When, Then, And }) => {
      Given('no checkpoint exists for partition "ord_123"', () => {
        // Default state: empty checkpoint store
      });

      When(
        'I call withCheckpoint with projection "orderSummary" partition "ord_123" position 1000 event "evt_001"',
        async () => {
          state.beforeTime = Date.now();
          state.mocks = createMockFns(state.checkpointStore, state.processedEvents);
          state.result = await withCheckpoint(mockCtx, {
            projectionName: "orderSummary",
            partitionKey: "ord_123",
            globalPosition: 1000,
            eventId: "evt_001",
            ...state.mocks,
          });
        }
      );

      Then(
        'the saved checkpoint for partition "ord_123" has all fields:',
        (_ctx: unknown, dataTable: unknown) => {
          const table = dataTable as { field: string; value: string }[];
          const savedCheckpoint = state.checkpointStore.get("ord_123");
          expect(savedCheckpoint).toBeDefined();
          for (const row of table) {
            const actual = savedCheckpoint![row.field as keyof ProjectionCheckpoint];
            if (typeof actual === "number") {
              expect(actual).toBe(Number(row.value));
            } else {
              expect(actual).toBe(row.value);
            }
          }
        }
      );

      And("the saved checkpoint updatedAt is recent", () => {
        const savedCheckpoint = state.checkpointStore.get("ord_123");
        expect(savedCheckpoint!.updatedAt).toBeGreaterThanOrEqual(state.beforeTime);
      });
    });
  });

  // ==========================================================================
  // Rule: Duplicate Event Skipping
  // ==========================================================================

  Rule("withCheckpoint skips events at or below the checkpoint position", ({ RuleScenario }) => {
    RuleScenario(
      "Skip event when globalPosition equals checkpoint",
      ({ Given, When, Then, And }) => {
        Given(
          'a checkpoint exists for partition "ord_123" at position 1000 with event "evt_001"',
          () => {
            state.checkpointStore.set("ord_123", {
              projectionName: "orderSummary",
              partitionKey: "ord_123",
              lastGlobalPosition: 1000,
              lastEventId: "evt_001",
              updatedAt: Date.now(),
            });
          }
        );

        When(
          'I call withCheckpoint with projection "orderSummary" partition "ord_123" position 1000 event "evt_001"',
          async () => {
            state.mocks = createMockFns(state.checkpointStore, state.processedEvents);
            state.result = await withCheckpoint(mockCtx, {
              projectionName: "orderSummary",
              partitionKey: "ord_123",
              globalPosition: 1000,
              eventId: "evt_001",
              ...state.mocks,
            });
          }
        );

        Then('the result status is "skipped"', () => {
          expect(state.result?.status).toBe("skipped");
        });

        And("the process callback was not invoked", () => {
          expect(state.mocks!.process).not.toHaveBeenCalled();
        });

        And("the updateCheckpoint callback was not invoked", () => {
          expect(state.mocks!.updateCheckpoint).not.toHaveBeenCalled();
        });
      }
    );

    RuleScenario(
      "Skip event when globalPosition is less than checkpoint",
      ({ Given, When, Then, And }) => {
        Given(
          'a checkpoint exists for partition "ord_123" at position 2000 with event "evt_002"',
          () => {
            state.checkpointStore.set("ord_123", {
              projectionName: "orderSummary",
              partitionKey: "ord_123",
              lastGlobalPosition: 2000,
              lastEventId: "evt_002",
              updatedAt: Date.now(),
            });
          }
        );

        When(
          'I call withCheckpoint with projection "orderSummary" partition "ord_123" position 1000 event "evt_001"',
          async () => {
            state.mocks = createMockFns(state.checkpointStore, state.processedEvents);
            state.result = await withCheckpoint(mockCtx, {
              projectionName: "orderSummary",
              partitionKey: "ord_123",
              globalPosition: 1000,
              eventId: "evt_001",
              ...state.mocks,
            });
          }
        );

        Then('the result status is "skipped"', () => {
          expect(state.result?.status).toBe("skipped");
        });

        And("the process callback was not invoked", () => {
          expect(state.mocks!.process).not.toHaveBeenCalled();
        });
      }
    );
  });

  // ==========================================================================
  // Rule: Partition Isolation
  // ==========================================================================

  Rule("withCheckpoint maintains separate checkpoints per partition key", ({ RuleScenario }) => {
    RuleScenario("Separate checkpoints per partition", ({ Given, When, Then, And }) => {
      Given('no checkpoint exists for partition "ord_001"', () => {
        // Default state
      });

      And('no checkpoint exists for partition "ord_002"', () => {
        // Default state
      });

      When(
        'I process partition "ord_001" with projection "orderSummary" position 1000 event "evt_001"',
        async () => {
          state.mocks1 = createMockFns(state.checkpointStore, state.processedEvents);
          await withCheckpoint(mockCtx, {
            projectionName: "orderSummary",
            partitionKey: "ord_001",
            globalPosition: 1000,
            eventId: "evt_001",
            ...state.mocks1,
          });
        }
      );

      And(
        'I process partition "ord_002" with projection "orderSummary" position 500 event "evt_002"',
        async () => {
          state.mocks2 = createMockFns(state.checkpointStore, state.processedEvents);
          await withCheckpoint(mockCtx, {
            projectionName: "orderSummary",
            partitionKey: "ord_002",
            globalPosition: 500,
            eventId: "evt_002",
            ...state.mocks2,
          });
        }
      );

      Then("both partitions were processed", () => {
        expect(state.mocks1!.process).toHaveBeenCalledTimes(1);
        expect(state.mocks2!.process).toHaveBeenCalledTimes(1);
      });

      And('the saved checkpoint for partition "ord_001" has lastGlobalPosition 1000', () => {
        expect(state.checkpointStore.get("ord_001")?.lastGlobalPosition).toBe(1000);
      });

      And('the saved checkpoint for partition "ord_002" has lastGlobalPosition 500', () => {
        expect(state.checkpointStore.get("ord_002")?.lastGlobalPosition).toBe(500);
      });
    });

    RuleScenario(
      "Same position in different partitions does not cause skip",
      ({ Given, When, Then, And }) => {
        Given(
          'a checkpoint exists for partition "ord_001" at position 1000 with event "evt_001"',
          () => {
            state.checkpointStore.set("ord_001", {
              projectionName: "orderSummary",
              partitionKey: "ord_001",
              lastGlobalPosition: 1000,
              lastEventId: "evt_001",
              updatedAt: Date.now(),
            });
          }
        );

        When(
          'I call withCheckpoint with projection "orderSummary" partition "ord_002" position 1000 event "evt_002"',
          async () => {
            state.mocks = createMockFns(state.checkpointStore, state.processedEvents);
            state.result = await withCheckpoint(mockCtx, {
              projectionName: "orderSummary",
              partitionKey: "ord_002",
              globalPosition: 1000,
              eventId: "evt_002",
              ...state.mocks,
            });
          }
        );

        Then('the result status is "processed"', () => {
          expect(state.result?.status).toBe("processed");
        });

        And("the process callback was invoked 1 time", () => {
          expect(state.mocks!.process).toHaveBeenCalledTimes(1);
        });
      }
    );
  });

  // ==========================================================================
  // Rule: Error Handling
  // ==========================================================================

  Rule("withCheckpoint does not update checkpoint when processing fails", ({ RuleScenario }) => {
    RuleScenario("Checkpoint not updated when process throws", ({ Given, When, Then, And }) => {
      Given('no checkpoint exists for partition "ord_123"', () => {
        // Default state
      });

      When(
        'I call withCheckpoint with a failing process for partition "ord_123" position 1000 event "evt_001"',
        async () => {
          state.mocks = createMockFns(state.checkpointStore, state.processedEvents);
          state.mocks.process = vi.fn(async () => {
            throw new Error("Process failed: database unavailable");
          });
          try {
            await withCheckpoint(mockCtx, {
              projectionName: "orderSummary",
              partitionKey: "ord_123",
              globalPosition: 1000,
              eventId: "evt_001",
              ...state.mocks,
            });
          } catch (e) {
            state.error = e as Error;
          }
        }
      );

      Then('the call rejects with "Process failed: database unavailable"', () => {
        expect(state.error).toBeDefined();
        expect(state.error!.message).toBe("Process failed: database unavailable");
      });

      And("the updateCheckpoint callback was not invoked", () => {
        expect(state.mocks!.updateCheckpoint).not.toHaveBeenCalled();
      });

      And('no checkpoint exists in store for partition "ord_123"', () => {
        expect(state.checkpointStore.get("ord_123")).toBeUndefined();
      });
    });

    RuleScenario("Retry succeeds after process failure", ({ Given, When, Then, And }) => {
      Given('no checkpoint exists for partition "ord_123"', () => {
        // Default state
      });

      When(
        'I call withCheckpoint with a transiently failing process for partition "ord_123" position 1000 event "evt_001"',
        async () => {
          let callCount = 0;
          state.mocks = createMockFns(state.checkpointStore, state.processedEvents);
          state.mocks.process = vi.fn(async () => {
            callCount++;
            if (callCount === 1) {
              throw new Error("Transient failure");
            }
            state.processedEvents.push("success_on_retry");
          });

          // First attempt - fails
          try {
            await withCheckpoint(mockCtx, {
              projectionName: "orderSummary",
              partitionKey: "ord_123",
              globalPosition: 1000,
              eventId: "evt_001",
              ...state.mocks,
            });
          } catch (e) {
            state.error = e as Error;
          }

          // Second attempt (retry) - succeeds
          state.retryResult = await withCheckpoint(mockCtx, {
            projectionName: "orderSummary",
            partitionKey: "ord_123",
            globalPosition: 1000,
            eventId: "evt_001",
            ...state.mocks,
          });
        }
      );

      Then('the first attempt rejects with "Transient failure"', () => {
        expect(state.error).toBeDefined();
        expect(state.error!.message).toBe("Transient failure");
      });

      And('the retry attempt succeeds with status "processed"', () => {
        expect(state.retryResult?.status).toBe("processed");
      });

      And("the processed events list contains:", (_ctx: unknown, dataTable: unknown) => {
        const table = dataTable as { event: string }[];
        const expected = table.map((r) => r.event);
        expect(state.processedEvents).toEqual(expected);
      });

      And('the saved checkpoint for partition "ord_123" has lastGlobalPosition 1000', () => {
        expect(state.checkpointStore.get("ord_123")?.lastGlobalPosition).toBe(1000);
      });
    });
  });

  // ==========================================================================
  // Rule: Checkpoint Data Integrity
  // ==========================================================================

  Rule("withCheckpoint stores all checkpoint fields correctly", ({ RuleScenario }) => {
    RuleScenario("All checkpoint fields stored correctly", ({ Given, When, Then }) => {
      Given('no checkpoint exists for partition "prod_xyz"', () => {
        // Default state
      });

      When(
        'I call withCheckpoint with projection "productCatalog" partition "prod_xyz" position 12345 event "evt_abc123"',
        async () => {
          state.mocks = createMockFns(state.checkpointStore, state.processedEvents);
          await withCheckpoint(mockCtx, {
            projectionName: "productCatalog",
            partitionKey: "prod_xyz",
            globalPosition: 12345,
            eventId: "evt_abc123",
            ...state.mocks,
          });
        }
      );

      Then(
        "updateCheckpoint was called with checkpoint matching:",
        (_ctx: unknown, dataTable: unknown) => {
          const table = dataTable as { field: string; value: string }[];
          expect(state.mocks!.updateCheckpoint).toHaveBeenCalledWith(
            mockCtx,
            "prod_xyz",
            expect.objectContaining({
              projectionName: "productCatalog",
              partitionKey: "prod_xyz",
              lastGlobalPosition: 12345,
              lastEventId: "evt_abc123",
              updatedAt: expect.any(Number),
            })
          );
          for (const row of table) {
            const callArgs = state.mocks!.updateCheckpoint.mock.calls[0];
            const checkpoint = callArgs[2] as ProjectionCheckpoint;
            const actual = checkpoint[row.field as keyof ProjectionCheckpoint];
            if (typeof actual === "number") {
              expect(actual).toBe(Number(row.value));
            } else {
              expect(actual).toBe(row.value);
            }
          }
        }
      );
    });
  });

  // ==========================================================================
  // Rule: createCheckpointHelper Factory
  // ==========================================================================

  Rule("createCheckpointHelper creates a reusable pre-configured helper", ({ RuleScenario }) => {
    RuleScenario("Helper processes and stores checkpoint", ({ When, Then, And }) => {
      When(
        'I create a checkpoint helper and process partition "ord_123" position 1000 event "evt_001"',
        async () => {
          const withOrderCheckpoint = createCheckpointHelper<MockCtx>(
            async (_ctx, partitionKey) => state.helperCheckpointStore.get(partitionKey) ?? null,
            async (_ctx, partitionKey, checkpoint) => {
              state.helperCheckpointStore.set(partitionKey, checkpoint);
            }
          );

          state.helperResult = await withOrderCheckpoint(mockCtx, {
            projectionName: "orderSummary",
            partitionKey: "ord_123",
            globalPosition: 1000,
            eventId: "evt_001",
            process: async () => {
              state.helperProcessedEvents.push("processed");
            },
          });
        }
      );

      Then('the helper result status is "processed"', () => {
        expect(state.helperResult?.status).toBe("processed");
      });

      And("the helper processed events list contains:", (_ctx: unknown, dataTable: unknown) => {
        const table = dataTable as { event: string }[];
        const expected = table.map((r) => r.event);
        expect(state.helperProcessedEvents).toEqual(expected);
      });

      And('the helper checkpoint for partition "ord_123" has lastGlobalPosition 1000', () => {
        expect(state.helperCheckpointStore.get("ord_123")?.lastGlobalPosition).toBe(1000);
      });
    });

    RuleScenario("Helper maintains checkpoint semantics across calls", ({ When, Then, And }) => {
      When(
        'I create a checkpoint helper and run a three-call sequence on partition "ord_123"',
        async () => {
          const withOrderCheckpoint = createCheckpointHelper<MockCtx>(
            async (_ctx, partitionKey) => state.helperCheckpointStore.get(partitionKey) ?? null,
            async (_ctx, partitionKey, checkpoint) => {
              state.helperCheckpointStore.set(partitionKey, checkpoint);
            }
          );

          // First call - should process
          await withOrderCheckpoint(mockCtx, {
            projectionName: "orderSummary",
            partitionKey: "ord_123",
            globalPosition: 1000,
            eventId: "evt_001",
            process: async () => {
              state.helperProcessedEvents.push("first");
            },
          });

          // Second call same position - should skip
          state.helperResult = await withOrderCheckpoint(mockCtx, {
            projectionName: "orderSummary",
            partitionKey: "ord_123",
            globalPosition: 1000,
            eventId: "evt_001",
            process: async () => {
              state.helperProcessedEvents.push("second");
            },
          });

          // Third call higher position - should process
          await withOrderCheckpoint(mockCtx, {
            projectionName: "orderSummary",
            partitionKey: "ord_123",
            globalPosition: 2000,
            eventId: "evt_002",
            process: async () => {
              state.helperProcessedEvents.push("third");
            },
          });
        }
      );

      Then("the second call was skipped", () => {
        expect(state.helperResult?.status).toBe("skipped");
      });

      And("the helper processed events list contains:", (_ctx: unknown, dataTable: unknown) => {
        const table = dataTable as { event: string }[];
        const expected = table.map((r) => r.event);
        expect(state.helperProcessedEvents).toEqual(expected);
      });
    });
  });

  // ==========================================================================
  // Rule: Pure Functions - shouldProcessEvent
  // ==========================================================================

  Rule(
    "shouldProcessEvent returns true only when event position exceeds checkpoint",
    ({ RuleScenario }) => {
      RuleScenario("shouldProcessEvent position comparisons", ({ Then }) => {
        Then(
          "shouldProcessEvent returns expected results for:",
          (_ctx: unknown, dataTable: unknown) => {
            const table = dataTable as {
              eventPosition: string;
              checkpointPosition: string;
              expected: string;
            }[];
            for (const row of table) {
              const result = shouldProcessEvent(
                Number(row.eventPosition),
                Number(row.checkpointPosition)
              );
              expect(result).toBe(row.expected === "true");
            }
          }
        );
      });
    }
  );

  // ==========================================================================
  // Rule: Pure Functions - createInitialCheckpoint
  // ==========================================================================

  Rule("createInitialCheckpoint creates a checkpoint with sentinel values", ({ RuleScenario }) => {
    RuleScenario("Initial checkpoint has sentinel values", ({ When, Then, And }) => {
      When(
        'I create an initial checkpoint for projection "orderSummary" partition "ord_123"',
        () => {
          state.initialCheckpoint = createInitialCheckpoint("orderSummary", "ord_123");
        }
      );

      Then("the initial checkpoint has all fields:", (_ctx: unknown, dataTable: unknown) => {
        const table = dataTable as { field: string; value: string }[];
        for (const row of table) {
          const actual = state.initialCheckpoint![row.field as keyof ProjectionCheckpoint];
          if (typeof actual === "number") {
            expect(actual).toBe(Number(row.value));
          } else {
            expect(String(actual ?? "")).toBe(row.value);
          }
        }
      });

      And("the initial checkpoint updatedAt is greater than 0", () => {
        expect(state.initialCheckpoint!.updatedAt).toBeGreaterThan(0);
      });
    });

    RuleScenario("Each initial checkpoint gets a unique updatedAt", ({ When, Then }) => {
      When("I create two initial checkpoints with a delay", async () => {
        state.initialCheckpoint = createInitialCheckpoint("test", "key1");
        await new Promise((resolve) => setTimeout(resolve, 5));
        state.initialCheckpoint2 = createInitialCheckpoint("test", "key2");
      });

      Then("the second checkpoint updatedAt is greater than or equal to the first", () => {
        expect(state.initialCheckpoint2!.updatedAt).toBeGreaterThanOrEqual(
          state.initialCheckpoint!.updatedAt
        );
      });
    });
  });
});
