/**
 * withPMCheckpoint - Step Definitions
 *
 * BDD step definitions for PM checkpoint-based idempotency:
 * - New event processing
 * - Duplicate event skipping (idempotency)
 * - Terminal state handling
 * - Instance isolation
 * - Retry after failure
 * - Input validation
 * - Error handling and dead letters
 * - Command tracking
 * - createPMCheckpointHelper factory
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

import {
  withPMCheckpoint,
  createPMCheckpointHelper,
  type EmittedCommand,
} from "../../../src/processManager/withPMCheckpoint";
import type { ProcessManagerState } from "../../../src/processManager/types";
import { extractDataTable } from "../_helpers/data-table.js";

// ============================================================================
// Test Types
// ============================================================================

type MockCtx = { db: "mock" };
const mockCtx: MockCtx = { db: "mock" };

interface DeadLetterEntry {
  pmName: string;
  instanceId: string;
  error: string;
  attemptCount?: number;
  context?: Record<string, unknown>;
}

interface TestState {
  pmStateStore: Map<string, ProcessManagerState>;
  deadLetters: DeadLetterEntry[];
  emittedCommands: EmittedCommand[];
  result: Awaited<ReturnType<typeof withPMCheckpoint>> | null;
  firstResult: Awaited<ReturnType<typeof withPMCheckpoint>> | null;
  retryResult: Awaited<ReturnType<typeof withPMCheckpoint>> | null;
  processMock: ReturnType<typeof vi.fn> | null;
  emitCommandsMock: ReturnType<typeof vi.fn> | null;
  // Helper factory state
  helperResult: Awaited<ReturnType<typeof withPMCheckpoint>> | null;
  helperSecondResult: Awaited<ReturnType<typeof withPMCheckpoint>> | null;
  helperEmittedCommands: EmittedCommand[];
  helperPMStateStore: Map<string, ProcessManagerState>;
}

let state: TestState;

function resetState(): void {
  state = {
    pmStateStore: new Map(),
    deadLetters: [],
    emittedCommands: [],
    result: null,
    firstResult: null,
    retryResult: null,
    processMock: null,
    emitCommandsMock: null,
    helperResult: null,
    helperSecondResult: null,
    helperEmittedCommands: [],
    helperPMStateStore: new Map(),
  };
}

// ============================================================================
// Mock Factories
// ============================================================================

function createMockStorage() {
  return {
    getPMState: vi.fn(async (_ctx: MockCtx, pmName: string, instanceId: string) => {
      return state.pmStateStore.get(`${pmName}:${instanceId}`) ?? null;
    }),
    getOrCreatePMState: vi.fn(
      async (
        _ctx: MockCtx,
        pmName: string,
        instanceId: string,
        initial?: { triggerEventId?: string; correlationId?: string }
      ) => {
        const key = `${pmName}:${instanceId}`;
        const existing = state.pmStateStore.get(key);
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
          triggerEventId: initial?.triggerEventId,
          correlationId: initial?.correlationId,
        };
        state.pmStateStore.set(key, newState);
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
        const existing = state.pmStateStore.get(key);
        if (existing) {
          state.pmStateStore.set(key, {
            ...existing,
            ...updates,
            lastUpdatedAt: Date.now(),
          });
        }
      }
    ),
    recordDeadLetter: vi.fn(
      async (
        _ctx: MockCtx,
        pmName: string,
        instanceId: string,
        error: string,
        attemptCount: number,
        context?: Record<string, unknown>
      ) => {
        state.deadLetters.push({
          pmName,
          instanceId,
          error,
          attemptCount,
          context,
        });
      }
    ),
  };
}

function createDefaultProcess() {
  return vi.fn(async (_pmState: ProcessManagerState): Promise<EmittedCommand[]> => {
    return [
      {
        commandType: "SendNotification",
        payload: { email: "test@example.com" },
        causationId: "evt_123",
        correlationId: "corr_123",
      },
    ];
  });
}

function createDefaultEmitCommands() {
  return vi.fn(async (_ctx: MockCtx, commands: EmittedCommand[]) => {
    state.emittedCommands.push(...commands);
  });
}

// ============================================================================
// Feature
// ============================================================================

const feature = await loadFeature(
  "tests/features/behavior/processManager/with-pm-checkpoint.feature"
);

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

  Rule("withPMCheckpoint processes new events and updates PM state", ({ RuleScenario }) => {
    RuleScenario("Process event when no PM state exists", ({ Given, When, Then, And }) => {
      Given('no PM state exists for "orderNotification" instance "ord_123"', () => {
        // Default state: empty store
      });

      When(
        'I call withPMCheckpoint with pm "orderNotification" instance "ord_123" position 1000 event "evt_001" correlation "corr_001"',
        async () => {
          const storage = createMockStorage();
          state.processMock = createDefaultProcess();
          state.emitCommandsMock = createDefaultEmitCommands();

          state.result = await withPMCheckpoint(mockCtx, {
            pmName: "orderNotification",
            instanceId: "ord_123",
            globalPosition: 1000,
            eventId: "evt_001",
            correlationId: "corr_001",
            ...storage,
            process: state.processMock,
            emitCommands: state.emitCommandsMock,
          });
        }
      );

      Then('the PM result status is "processed"', () => {
        expect(state.result).not.toBeNull();
        expect(state.result!.status).toBe("processed");
      });

      And("the PM result commandsEmitted contains:", (_ctx: unknown, dataTable: unknown) => {
        const rows = extractDataTable<{ command: string }>(_ctx, dataTable);
        expect(state.result).not.toBeNull();
        expect(state.result!.status).toBe("processed");
        if (state.result!.status === "processed") {
          const expected = rows.map((r) => r.command);
          expect(state.result!.commandsEmitted).toEqual(expected);
        }
      });

      And("the process callback was invoked 1 time", () => {
        expect(state.processMock).toHaveBeenCalledTimes(1);
      });

      And("the emitCommands callback was invoked 1 time", () => {
        expect(state.emitCommandsMock).toHaveBeenCalledTimes(1);
      });

      And("the emitted commands list has 1 entry", () => {
        expect(state.emittedCommands).toHaveLength(1);
      });
    });

    RuleScenario(
      "Process event when globalPosition exceeds checkpoint",
      ({ Given, When, Then, And }) => {
        Given(
          'a PM state exists for "orderNotification" instance "ord_123" at position 1000 with status "idle"',
          () => {
            state.pmStateStore.set("orderNotification:ord_123", {
              processManagerName: "orderNotification",
              instanceId: "ord_123",
              status: "idle",
              lastGlobalPosition: 1000,
              commandsEmitted: 1,
              commandsFailed: 0,
              stateVersion: 1,
              createdAt: Date.now() - 5000,
              lastUpdatedAt: Date.now() - 5000,
            });
          }
        );

        When(
          'I call withPMCheckpoint with pm "orderNotification" instance "ord_123" position 2000 event "evt_002" correlation "corr_002"',
          async () => {
            const storage = createMockStorage();
            state.processMock = createDefaultProcess();
            state.emitCommandsMock = createDefaultEmitCommands();

            state.result = await withPMCheckpoint(mockCtx, {
              pmName: "orderNotification",
              instanceId: "ord_123",
              globalPosition: 2000,
              eventId: "evt_002",
              correlationId: "corr_002",
              ...storage,
              process: state.processMock,
              emitCommands: state.emitCommandsMock,
            });
          }
        );

        Then('the PM result status is "processed"', () => {
          expect(state.result).not.toBeNull();
          expect(state.result!.status).toBe("processed");
        });

        And("the process callback was invoked 1 time", () => {
          expect(state.processMock).toHaveBeenCalledTimes(1);
        });
      }
    );

    RuleScenario("PM state is updated after processing", ({ Given, When, Then }) => {
      Given('no PM state exists for "orderNotification" instance "ord_123"', () => {
        // Default state: empty store
      });

      When(
        'I call withPMCheckpoint with pm "orderNotification" instance "ord_123" position 1000 event "evt_001" correlation "corr_001"',
        async () => {
          const storage = createMockStorage();
          state.processMock = createDefaultProcess();
          state.emitCommandsMock = createDefaultEmitCommands();

          state.result = await withPMCheckpoint(mockCtx, {
            pmName: "orderNotification",
            instanceId: "ord_123",
            globalPosition: 1000,
            eventId: "evt_001",
            correlationId: "corr_001",
            ...storage,
            process: state.processMock,
            emitCommands: state.emitCommandsMock,
          });
        }
      );

      Then(
        'the saved PM state for "orderNotification" instance "ord_123" has fields:',
        (_ctx: unknown, dataTable: unknown) => {
          const rows = extractDataTable<{ field: string; value: string }>(_ctx, dataTable);
          const saved = state.pmStateStore.get("orderNotification:ord_123");
          expect(saved).toBeDefined();
          for (const row of rows) {
            const actual = saved![row.field as keyof ProcessManagerState];
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
  // Rule: Idempotency - Duplicate Event Skipping
  // ==========================================================================

  Rule("withPMCheckpoint skips events at or below the checkpoint position", ({ RuleScenario }) => {
    RuleScenario(
      "Skip event when globalPosition equals checkpoint",
      ({ Given, When, Then, And }) => {
        Given(
          'a PM state exists for "orderNotification" instance "ord_123" at position 1000 with status "idle"',
          () => {
            state.pmStateStore.set("orderNotification:ord_123", {
              processManagerName: "orderNotification",
              instanceId: "ord_123",
              status: "idle",
              lastGlobalPosition: 1000,
              commandsEmitted: 1,
              commandsFailed: 0,
              stateVersion: 1,
              createdAt: Date.now(),
              lastUpdatedAt: Date.now(),
            });
          }
        );

        When(
          'I call withPMCheckpoint with pm "orderNotification" instance "ord_123" position 1000 event "evt_001" correlation "corr_001"',
          async () => {
            const storage = createMockStorage();
            state.processMock = createDefaultProcess();
            state.emitCommandsMock = createDefaultEmitCommands();

            state.result = await withPMCheckpoint(mockCtx, {
              pmName: "orderNotification",
              instanceId: "ord_123",
              globalPosition: 1000,
              eventId: "evt_001",
              correlationId: "corr_001",
              ...storage,
              process: state.processMock,
              emitCommands: state.emitCommandsMock,
            });
          }
        );

        Then('the PM result status is "skipped"', () => {
          expect(state.result).not.toBeNull();
          expect(state.result!.status).toBe("skipped");
        });

        And('the PM result skip reason is "already_processed"', () => {
          expect(state.result!.status).toBe("skipped");
          if (state.result!.status === "skipped") {
            expect(state.result!.reason).toBe("already_processed");
          }
        });

        And("the process callback was not invoked", () => {
          expect(state.processMock).not.toHaveBeenCalled();
        });

        And("the emitCommands callback was not invoked", () => {
          expect(state.emitCommandsMock).not.toHaveBeenCalled();
        });
      }
    );

    RuleScenario(
      "Skip event when globalPosition is less than checkpoint",
      ({ Given, When, Then, And }) => {
        Given(
          'a PM state exists for "orderNotification" instance "ord_123" at position 2000 with status "idle"',
          () => {
            state.pmStateStore.set("orderNotification:ord_123", {
              processManagerName: "orderNotification",
              instanceId: "ord_123",
              status: "idle",
              lastGlobalPosition: 2000,
              commandsEmitted: 2,
              commandsFailed: 0,
              stateVersion: 1,
              createdAt: Date.now(),
              lastUpdatedAt: Date.now(),
            });
          }
        );

        When(
          'I call withPMCheckpoint with pm "orderNotification" instance "ord_123" position 1000 event "evt_001" correlation "corr_001"',
          async () => {
            const storage = createMockStorage();
            state.processMock = createDefaultProcess();
            state.emitCommandsMock = createDefaultEmitCommands();

            state.result = await withPMCheckpoint(mockCtx, {
              pmName: "orderNotification",
              instanceId: "ord_123",
              globalPosition: 1000,
              eventId: "evt_001",
              correlationId: "corr_001",
              ...storage,
              process: state.processMock,
              emitCommands: state.emitCommandsMock,
            });
          }
        );

        Then('the PM result status is "skipped"', () => {
          expect(state.result).not.toBeNull();
          expect(state.result!.status).toBe("skipped");
        });

        And('the PM result skip reason is "already_processed"', () => {
          expect(state.result!.status).toBe("skipped");
          if (state.result!.status === "skipped") {
            expect(state.result!.reason).toBe("already_processed");
          }
        });

        And("the process callback was not invoked", () => {
          expect(state.processMock).not.toHaveBeenCalled();
        });
      }
    );
  });

  // ==========================================================================
  // Rule: Terminal State Handling
  // ==========================================================================

  Rule("withPMCheckpoint skips events when PM is in a terminal state", ({ RuleScenario }) => {
    RuleScenario("Skip event when PM is in completed state", ({ Given, When, Then, And }) => {
      Given(
        'a PM state exists for "orderNotification" instance "ord_123" at position 1000 with status "completed"',
        () => {
          state.pmStateStore.set("orderNotification:ord_123", {
            processManagerName: "orderNotification",
            instanceId: "ord_123",
            status: "completed",
            lastGlobalPosition: 1000,
            commandsEmitted: 1,
            commandsFailed: 0,
            stateVersion: 1,
            createdAt: Date.now(),
            lastUpdatedAt: Date.now(),
          });
        }
      );

      When(
        'I call withPMCheckpoint with pm "orderNotification" instance "ord_123" position 2000 event "evt_002" correlation "corr_002"',
        async () => {
          const storage = createMockStorage();
          state.processMock = createDefaultProcess();
          state.emitCommandsMock = createDefaultEmitCommands();

          state.result = await withPMCheckpoint(mockCtx, {
            pmName: "orderNotification",
            instanceId: "ord_123",
            globalPosition: 2000,
            eventId: "evt_002",
            correlationId: "corr_002",
            ...storage,
            process: state.processMock,
            emitCommands: state.emitCommandsMock,
          });
        }
      );

      Then('the PM result status is "skipped"', () => {
        expect(state.result).not.toBeNull();
        expect(state.result!.status).toBe("skipped");
      });

      And('the PM result skip reason is "terminal_state"', () => {
        expect(state.result!.status).toBe("skipped");
        if (state.result!.status === "skipped") {
          expect(state.result!.reason).toBe("terminal_state");
        }
      });

      And("the process callback was not invoked", () => {
        expect(state.processMock).not.toHaveBeenCalled();
      });
    });
  });

  // ==========================================================================
  // Rule: Instance Isolation
  // ==========================================================================

  Rule("withPMCheckpoint maintains separate state per PM instance", ({ RuleScenario }) => {
    RuleScenario("Separate instances are processed independently", ({ Given, When, Then, And }) => {
      Given('no PM state exists for "orderNotification" instance "ord_001"', () => {
        // Default: empty
      });

      And('no PM state exists for "orderNotification" instance "ord_002"', () => {
        // Default: empty
      });

      When(
        'I call withPMCheckpoint with pm "orderNotification" instance "ord_001" position 1000 event "evt_001" correlation "corr_001"',
        async () => {
          const storage = createMockStorage();
          const process = createDefaultProcess();
          const emitCommands = createDefaultEmitCommands();

          await withPMCheckpoint(mockCtx, {
            pmName: "orderNotification",
            instanceId: "ord_001",
            globalPosition: 1000,
            eventId: "evt_001",
            correlationId: "corr_001",
            ...storage,
            process,
            emitCommands,
          });
        }
      );

      And(
        'I call withPMCheckpoint with pm "orderNotification" instance "ord_002" position 500 event "evt_002" correlation "corr_002"',
        async () => {
          const storage = createMockStorage();
          const process = createDefaultProcess();
          const emitCommands = createDefaultEmitCommands();

          await withPMCheckpoint(mockCtx, {
            pmName: "orderNotification",
            instanceId: "ord_002",
            globalPosition: 500,
            eventId: "evt_002",
            correlationId: "corr_002",
            ...storage,
            process,
            emitCommands,
          });
        }
      );

      Then(
        'the saved PM state for "orderNotification" instance "ord_001" has lastGlobalPosition 1000',
        () => {
          const saved = state.pmStateStore.get("orderNotification:ord_001");
          expect(saved).toBeDefined();
          expect(saved!.lastGlobalPosition).toBe(1000);
        }
      );

      And(
        'the saved PM state for "orderNotification" instance "ord_002" has lastGlobalPosition 500',
        () => {
          const saved = state.pmStateStore.get("orderNotification:ord_002");
          expect(saved).toBeDefined();
          expect(saved!.lastGlobalPosition).toBe(500);
        }
      );
    });
  });

  // ==========================================================================
  // Rule: Retry After Failure
  // ==========================================================================

  Rule("withPMCheckpoint allows retry after emitCommands failure", ({ RuleScenario }) => {
    RuleScenario("Retry succeeds after emitCommands failure", ({ Given, When, Then, And }) => {
      let emitCallCount = 0;
      let failingEmitCommands: ReturnType<typeof vi.fn>;

      Given('no PM state exists for "orderNotification" instance "ord_123"', () => {
        emitCallCount = 0;
      });

      When(
        'I call withPMCheckpoint with pm "orderNotification" instance "ord_123" position 100 event "evt_001" correlation "corr_001" and emitCommands fails on first call',
        async () => {
          const storage = createMockStorage();
          state.processMock = createDefaultProcess();
          failingEmitCommands = vi.fn(async (_ctx2: MockCtx, commands: EmittedCommand[]) => {
            emitCallCount++;
            if (emitCallCount === 1) {
              throw new Error("Command emission failed: queue unavailable");
            }
            state.emittedCommands.push(...commands);
          });

          state.firstResult = await withPMCheckpoint(mockCtx, {
            pmName: "orderNotification",
            instanceId: "ord_123",
            globalPosition: 100,
            eventId: "evt_001",
            correlationId: "corr_001",
            ...storage,
            process: state.processMock,
            emitCommands: failingEmitCommands,
          });
        }
      );

      Then('the first call PM result status is "failed"', () => {
        expect(state.firstResult).not.toBeNull();
        expect(state.firstResult!.status).toBe("failed");
      });

      And('the first call PM result error contains "queue unavailable"', () => {
        expect(state.firstResult!.status).toBe("failed");
        if (state.firstResult!.status === "failed") {
          expect(state.firstResult!.error).toContain("queue unavailable");
        }
      });

      And(
        'the saved PM state for "orderNotification" instance "ord_123" has status "failed"',
        () => {
          const saved = state.pmStateStore.get("orderNotification:ord_123");
          expect(saved).toBeDefined();
          expect(saved!.status).toBe("failed");
        }
      );

      When(
        'I retry withPMCheckpoint with pm "orderNotification" instance "ord_123" position 100 event "evt_001" correlation "corr_001"',
        async () => {
          const storage = createMockStorage();

          state.retryResult = await withPMCheckpoint(mockCtx, {
            pmName: "orderNotification",
            instanceId: "ord_123",
            globalPosition: 100,
            eventId: "evt_001",
            correlationId: "corr_001",
            ...storage,
            process: state.processMock!,
            emitCommands: failingEmitCommands,
          });
        }
      );

      Then('the retry PM result status is "processed"', () => {
        expect(state.retryResult).not.toBeNull();
        expect(state.retryResult!.status).toBe("processed");
      });

      And("the retry PM result commandsEmitted contains:", (_ctx: unknown, dataTable: unknown) => {
        const rows = extractDataTable<{ command: string }>(_ctx, dataTable);
        expect(state.retryResult).not.toBeNull();
        expect(state.retryResult!.status).toBe("processed");
        if (state.retryResult!.status === "processed") {
          const expected = rows.map((r) => r.command);
          expect(state.retryResult!.commandsEmitted).toEqual(expected);
        }
      });

      And("the emitted commands list has 1 entry", () => {
        expect(state.emittedCommands).toHaveLength(1);
      });
    });

    RuleScenario(
      "Retry succeeds when PM is stuck in processing state",
      ({ Given, When, Then, And }) => {
        Given(
          'a PM state exists for "orderNotification" instance "ord_123" at position 100 with status "processing"',
          () => {
            state.pmStateStore.set("orderNotification:ord_123", {
              processManagerName: "orderNotification",
              instanceId: "ord_123",
              status: "processing",
              lastGlobalPosition: 100,
              commandsEmitted: 0,
              commandsFailed: 0,
              stateVersion: 1,
              createdAt: Date.now() - 5000,
              lastUpdatedAt: Date.now() - 5000,
            });
          }
        );

        When(
          'I call withPMCheckpoint with pm "orderNotification" instance "ord_123" position 100 event "evt_001" correlation "corr_001"',
          async () => {
            const storage = createMockStorage();
            state.processMock = createDefaultProcess();
            state.emitCommandsMock = createDefaultEmitCommands();

            state.result = await withPMCheckpoint(mockCtx, {
              pmName: "orderNotification",
              instanceId: "ord_123",
              globalPosition: 100,
              eventId: "evt_001",
              correlationId: "corr_001",
              ...storage,
              process: state.processMock,
              emitCommands: state.emitCommandsMock,
            });
          }
        );

        Then('the PM result status is "processed"', () => {
          expect(state.result).not.toBeNull();
          expect(state.result!.status).toBe("processed");
        });

        And("the PM result commandsEmitted contains:", (_ctx: unknown, dataTable: unknown) => {
          const rows = extractDataTable<{ command: string }>(_ctx, dataTable);
          expect(state.result).not.toBeNull();
          expect(state.result!.status).toBe("processed");
          if (state.result!.status === "processed") {
            const expected = rows.map((r) => r.command);
            expect(state.result!.commandsEmitted).toEqual(expected);
          }
        });

        And("the emitted commands list has 1 entry", () => {
          expect(state.emittedCommands).toHaveLength(1);
        });
      }
    );
  });

  // ==========================================================================
  // Rule: Input Validation
  // ==========================================================================

  Rule("withPMCheckpoint validates input parameters", ({ RuleScenario }) => {
    RuleScenario("Reject negative globalPosition", ({ Given, When, Then, And }) => {
      Given('no PM state exists for "orderNotification" instance "ord_123"', () => {
        // Default: empty
      });

      When(
        'I call withPMCheckpoint with pm "orderNotification" instance "ord_123" position -1 event "evt_001" correlation "corr_001"',
        async () => {
          const storage = createMockStorage();
          state.processMock = createDefaultProcess();
          state.emitCommandsMock = createDefaultEmitCommands();

          state.result = await withPMCheckpoint(mockCtx, {
            pmName: "orderNotification",
            instanceId: "ord_123",
            globalPosition: -1,
            eventId: "evt_001",
            correlationId: "corr_001",
            ...storage,
            process: state.processMock,
            emitCommands: state.emitCommandsMock,
          });
        }
      );

      Then('the PM result status is "failed"', () => {
        expect(state.result).not.toBeNull();
        expect(state.result!.status).toBe("failed");
      });

      And('the PM result error contains "Invalid globalPosition"', () => {
        expect(state.result!.status).toBe("failed");
        if (state.result!.status === "failed") {
          expect(state.result!.error).toContain("Invalid globalPosition");
        }
      });

      And('the PM result error contains "-1"', () => {
        expect(state.result!.status).toBe("failed");
        if (state.result!.status === "failed") {
          expect(state.result!.error).toContain("-1");
        }
      });

      And("the process callback was not invoked", () => {
        expect(state.processMock).not.toHaveBeenCalled();
      });

      And("the emitCommands callback was not invoked", () => {
        expect(state.emitCommandsMock).not.toHaveBeenCalled();
      });
    });

    RuleScenario(
      "GlobalPosition zero is treated as already processed",
      ({ Given, When, Then, And }) => {
        Given('no PM state exists for "orderNotification" instance "ord_123"', () => {
          // Default: empty
        });

        When(
          'I call withPMCheckpoint with pm "orderNotification" instance "ord_123" position 0 event "evt_001" correlation "corr_001"',
          async () => {
            const storage = createMockStorage();
            state.processMock = createDefaultProcess();
            state.emitCommandsMock = createDefaultEmitCommands();

            state.result = await withPMCheckpoint(mockCtx, {
              pmName: "orderNotification",
              instanceId: "ord_123",
              globalPosition: 0,
              eventId: "evt_001",
              correlationId: "corr_001",
              ...storage,
              process: state.processMock,
              emitCommands: state.emitCommandsMock,
            });
          }
        );

        Then('the PM result status is "skipped"', () => {
          expect(state.result).not.toBeNull();
          expect(state.result!.status).toBe("skipped");
        });

        And('the PM result skip reason is "already_processed"', () => {
          expect(state.result!.status).toBe("skipped");
          if (state.result!.status === "skipped") {
            expect(state.result!.reason).toBe("already_processed");
          }
        });
      }
    );

    RuleScenario(
      "First real event after initialization is processed",
      ({ Given, When, Then, And }) => {
        Given('no PM state exists for "orderNotification" instance "ord_123"', () => {
          // Default: empty
        });

        When(
          'I call withPMCheckpoint with pm "orderNotification" instance "ord_123" position 1000000000 event "evt_001" correlation "corr_001"',
          async () => {
            const storage = createMockStorage();
            state.processMock = createDefaultProcess();
            state.emitCommandsMock = createDefaultEmitCommands();

            state.result = await withPMCheckpoint(mockCtx, {
              pmName: "orderNotification",
              instanceId: "ord_123",
              globalPosition: 1000000000,
              eventId: "evt_001",
              correlationId: "corr_001",
              ...storage,
              process: state.processMock,
              emitCommands: state.emitCommandsMock,
            });
          }
        );

        Then('the PM result status is "processed"', () => {
          expect(state.result).not.toBeNull();
          expect(state.result!.status).toBe("processed");
        });

        And("the process callback was invoked 1 time", () => {
          expect(state.processMock).toHaveBeenCalledTimes(1);
        });
      }
    );
  });

  // ==========================================================================
  // Rule: Error Handling and Dead Letters
  // ==========================================================================

  Rule("withPMCheckpoint records dead letters on failure", ({ RuleScenario }) => {
    RuleScenario("Dead letter recorded when process throws", ({ Given, When, Then, And }) => {
      Given('no PM state exists for "orderNotification" instance "ord_123"', () => {
        // Default: empty
      });

      When(
        'I call withPMCheckpoint with pm "orderNotification" instance "ord_123" position 1000 event "evt_001" correlation "corr_001" and process throws "Handler failed: external service unavailable"',
        async () => {
          const storage = createMockStorage();
          state.processMock = vi.fn(async () => {
            throw new Error("Handler failed: external service unavailable");
          });
          state.emitCommandsMock = createDefaultEmitCommands();

          state.result = await withPMCheckpoint(mockCtx, {
            pmName: "orderNotification",
            instanceId: "ord_123",
            globalPosition: 1000,
            eventId: "evt_001",
            correlationId: "corr_001",
            ...storage,
            process: state.processMock,
            emitCommands: state.emitCommandsMock,
          });
        }
      );

      Then('the PM result status is "failed"', () => {
        expect(state.result).not.toBeNull();
        expect(state.result!.status).toBe("failed");
      });

      And('the PM result error contains "external service unavailable"', () => {
        expect(state.result!.status).toBe("failed");
        if (state.result!.status === "failed") {
          expect(state.result!.error).toContain("external service unavailable");
        }
      });

      And("the dead letters list has 1 entry", () => {
        expect(state.deadLetters).toHaveLength(1);
      });

      And(
        'the dead letter at index 0 has pmName "orderNotification" and instanceId "ord_123"',
        () => {
          expect(state.deadLetters[0]).toBeDefined();
          expect(state.deadLetters[0]!.pmName).toBe("orderNotification");
          expect(state.deadLetters[0]!.instanceId).toBe("ord_123");
        }
      );

      And(
        'the saved PM state for "orderNotification" instance "ord_123" has status "failed"',
        () => {
          const saved = state.pmStateStore.get("orderNotification:ord_123");
          expect(saved).toBeDefined();
          expect(saved!.status).toBe("failed");
        }
      );
    });

    RuleScenario("Dead letter recorded when emitCommands throws", ({ Given, When, Then, And }) => {
      Given('no PM state exists for "orderNotification" instance "ord_123"', () => {
        // Default: empty
      });

      When(
        'I call withPMCheckpoint with pm "orderNotification" instance "ord_123" position 1000 event "evt_001" correlation "corr_001" and emitCommands throws "Command emission failed: queue unavailable"',
        async () => {
          const storage = createMockStorage();
          state.processMock = createDefaultProcess();
          state.emitCommandsMock = vi.fn(async () => {
            throw new Error("Command emission failed: queue unavailable");
          });

          state.result = await withPMCheckpoint(mockCtx, {
            pmName: "orderNotification",
            instanceId: "ord_123",
            globalPosition: 1000,
            eventId: "evt_001",
            correlationId: "corr_001",
            ...storage,
            process: state.processMock,
            emitCommands: state.emitCommandsMock,
          });
        }
      );

      Then('the PM result status is "failed"', () => {
        expect(state.result).not.toBeNull();
        expect(state.result!.status).toBe("failed");
      });

      And("the dead letters list has 1 entry", () => {
        expect(state.deadLetters).toHaveLength(1);
      });

      And('the dead letter at index 0 error contains "Command emission failed"', () => {
        expect(state.deadLetters[0]).toBeDefined();
        expect(state.deadLetters[0]!.error).toContain("Command emission failed");
      });
    });

    RuleScenario("commandsFailed counter is incremented on failure", ({ Given, When, Then }) => {
      Given('no PM state exists for "orderNotification" instance "ord_123"', () => {
        // Default: empty
      });

      When(
        'I call withPMCheckpoint with pm "orderNotification" instance "ord_123" position 1000 event "evt_001" correlation "corr_001" and emitCommands throws "Emission failed"',
        async () => {
          const storage = createMockStorage();
          state.processMock = createDefaultProcess();
          state.emitCommandsMock = vi.fn(async () => {
            throw new Error("Emission failed");
          });

          state.result = await withPMCheckpoint(mockCtx, {
            pmName: "orderNotification",
            instanceId: "ord_123",
            globalPosition: 1000,
            eventId: "evt_001",
            correlationId: "corr_001",
            ...storage,
            process: state.processMock,
            emitCommands: state.emitCommandsMock,
          });
        }
      );

      Then(
        'the saved PM state for "orderNotification" instance "ord_123" has commandsFailed 1',
        () => {
          const saved = state.pmStateStore.get("orderNotification:ord_123");
          expect(saved).toBeDefined();
          expect(saved!.commandsFailed).toBe(1);
        }
      );
    });
  });

  // ==========================================================================
  // Rule: Command Tracking
  // ==========================================================================

  Rule("withPMCheckpoint tracks emitted commands accurately", ({ RuleScenario }) => {
    RuleScenario("commandsEmitted counter tracks multiple commands", ({ Given, When, Then }) => {
      Given('no PM state exists for "orderNotification" instance "ord_123"', () => {
        // Default: empty
      });

      When(
        'I call withPMCheckpoint with pm "orderNotification" instance "ord_123" position 1000 event "evt_001" correlation "corr_001" and process returns 3 commands',
        async () => {
          const storage = createMockStorage();
          state.processMock = vi.fn(
            async (): Promise<EmittedCommand[]> => [
              {
                commandType: "Cmd1",
                payload: {},
                causationId: "evt_1",
              },
              {
                commandType: "Cmd2",
                payload: {},
                causationId: "evt_1",
              },
              {
                commandType: "Cmd3",
                payload: {},
                causationId: "evt_1",
              },
            ]
          );
          state.emitCommandsMock = createDefaultEmitCommands();

          state.result = await withPMCheckpoint(mockCtx, {
            pmName: "orderNotification",
            instanceId: "ord_123",
            globalPosition: 1000,
            eventId: "evt_001",
            correlationId: "corr_001",
            ...storage,
            process: state.processMock,
            emitCommands: state.emitCommandsMock,
          });
        }
      );

      Then(
        'the saved PM state for "orderNotification" instance "ord_123" has commandsEmitted 3',
        () => {
          const saved = state.pmStateStore.get("orderNotification:ord_123");
          expect(saved).toBeDefined();
          expect(saved!.commandsEmitted).toBe(3);
        }
      );
    });

    RuleScenario("Result contains emitted command types", ({ Given, When, Then, And }) => {
      Given('no PM state exists for "orderNotification" instance "ord_123"', () => {
        // Default: empty
      });

      When(
        'I call withPMCheckpoint with pm "orderNotification" instance "ord_123" position 1000 event "evt_001" correlation "corr_001" and process returns commands "SendEmail,UpdateCRM"',
        async () => {
          const storage = createMockStorage();
          state.processMock = vi.fn(
            async (): Promise<EmittedCommand[]> => [
              {
                commandType: "SendEmail",
                payload: {},
                causationId: "evt_1",
              },
              {
                commandType: "UpdateCRM",
                payload: {},
                causationId: "evt_1",
              },
            ]
          );
          state.emitCommandsMock = createDefaultEmitCommands();

          state.result = await withPMCheckpoint(mockCtx, {
            pmName: "orderNotification",
            instanceId: "ord_123",
            globalPosition: 1000,
            eventId: "evt_001",
            correlationId: "corr_001",
            ...storage,
            process: state.processMock,
            emitCommands: state.emitCommandsMock,
          });
        }
      );

      Then('the PM result status is "processed"', () => {
        expect(state.result).not.toBeNull();
        expect(state.result!.status).toBe("processed");
      });

      And("the PM result commandsEmitted contains:", (_ctx: unknown, dataTable: unknown) => {
        const rows = extractDataTable<{ command: string }>(_ctx, dataTable);
        expect(state.result).not.toBeNull();
        expect(state.result!.status).toBe("processed");
        if (state.result!.status === "processed") {
          const expected = rows.map((r) => r.command);
          expect(state.result!.commandsEmitted).toEqual(expected);
        }
      });
    });

    RuleScenario(
      "Empty command list produces no-op processed result",
      ({ Given, When, Then, And }) => {
        Given('no PM state exists for "orderNotification" instance "ord_123"', () => {
          // Default: empty
        });

        When(
          'I call withPMCheckpoint with pm "orderNotification" instance "ord_123" position 1000 event "evt_001" correlation "corr_001" and process returns 0 commands',
          async () => {
            const storage = createMockStorage();
            state.processMock = vi.fn(async (): Promise<EmittedCommand[]> => []);
            state.emitCommandsMock = createDefaultEmitCommands();

            state.result = await withPMCheckpoint(mockCtx, {
              pmName: "orderNotification",
              instanceId: "ord_123",
              globalPosition: 1000,
              eventId: "evt_001",
              correlationId: "corr_001",
              ...storage,
              process: state.processMock,
              emitCommands: state.emitCommandsMock,
            });
          }
        );

        Then('the PM result status is "processed"', () => {
          expect(state.result).not.toBeNull();
          expect(state.result!.status).toBe("processed");
        });

        And("the PM result commandsEmitted is empty", () => {
          expect(state.result!.status).toBe("processed");
          if (state.result!.status === "processed") {
            expect(state.result!.commandsEmitted).toEqual([]);
          }
        });

        And("the emitCommands callback was not invoked", () => {
          expect(state.emitCommandsMock).not.toHaveBeenCalled();
        });
      }
    );
  });

  // ==========================================================================
  // Rule: createPMCheckpointHelper Factory
  // ==========================================================================

  Rule(
    "createPMCheckpointHelper creates a reusable helper with bound storage",
    ({ RuleScenario }) => {
      RuleScenario("Helper processes event and updates state", ({ When, Then, And }) => {
        When(
          'I create a PM checkpoint helper and call it with pm "orderNotification" instance "ord_123" position 1000 event "evt_001" correlation "corr_001"',
          async () => {
            state.helperPMStateStore = new Map();
            state.helperEmittedCommands = [];

            const helper = createPMCheckpointHelper<MockCtx>({
              getPMState: async (_ctx2, pName, iId) => {
                return state.helperPMStateStore.get(`${pName}:${iId}`) ?? null;
              },
              getOrCreatePMState: async (_ctx2, pName, iId) => {
                const key = `${pName}:${iId}`;
                const existing = state.helperPMStateStore.get(key);
                if (existing) return existing;

                const newState: ProcessManagerState = {
                  processManagerName: pName,
                  instanceId: iId,
                  status: "idle",
                  lastGlobalPosition: 0,
                  commandsEmitted: 0,
                  commandsFailed: 0,
                  stateVersion: 1,
                  createdAt: Date.now(),
                  lastUpdatedAt: Date.now(),
                };
                state.helperPMStateStore.set(key, newState);
                return newState;
              },
              updatePMState: async (_ctx2, pName, iId, updates) => {
                const key = `${pName}:${iId}`;
                const existing = state.helperPMStateStore.get(key);
                if (existing) {
                  state.helperPMStateStore.set(key, {
                    ...existing,
                    ...updates,
                    lastUpdatedAt: Date.now(),
                  });
                }
              },
              recordDeadLetter: async (_ctx2, pName, iId, error) => {
                state.deadLetters.push({
                  pmName: pName,
                  instanceId: iId,
                  error,
                });
              },
            });

            state.helperResult = await helper(mockCtx, {
              pmName: "orderNotification",
              instanceId: "ord_123",
              globalPosition: 1000,
              eventId: "evt_001",
              correlationId: "corr_001",
              process: async (_pmState) => [
                {
                  commandType: "SendNotification",
                  payload: { test: true },
                  causationId: "evt_001",
                },
              ],
              emitCommands: async (_ctx2, commands) => {
                state.helperEmittedCommands.push(...commands);
              },
            });
          }
        );

        Then('the helper result status is "processed"', () => {
          expect(state.helperResult).not.toBeNull();
          expect(state.helperResult!.status).toBe("processed");
        });

        And("the helper emitted commands list has 1 entry", () => {
          expect(state.helperEmittedCommands).toHaveLength(1);
        });

        And(
          'the helper PM state for "orderNotification" instance "ord_123" has lastGlobalPosition 1000',
          () => {
            const saved = state.helperPMStateStore.get("orderNotification:ord_123");
            expect(saved).toBeDefined();
            expect(saved!.lastGlobalPosition).toBe(1000);
          }
        );
      });

      RuleScenario("Helper maintains PM idempotency semantics", ({ When, Then, And }) => {
        When(
          'I create a PM checkpoint helper and call it twice with pm "orderNotification" instance "ord_123" position 1000 event "evt_001" correlation "corr_001"',
          async () => {
            state.helperPMStateStore = new Map();
            state.helperEmittedCommands = [];

            const helper = createPMCheckpointHelper<MockCtx>({
              getPMState: async (_ctx2, pName, iId) => {
                return state.helperPMStateStore.get(`${pName}:${iId}`) ?? null;
              },
              getOrCreatePMState: async (_ctx2, pName, iId) => {
                const key = `${pName}:${iId}`;
                const existing = state.helperPMStateStore.get(key);
                if (existing) return existing;

                const newState: ProcessManagerState = {
                  processManagerName: pName,
                  instanceId: iId,
                  status: "idle",
                  lastGlobalPosition: 0,
                  commandsEmitted: 0,
                  commandsFailed: 0,
                  stateVersion: 1,
                  createdAt: Date.now(),
                  lastUpdatedAt: Date.now(),
                };
                state.helperPMStateStore.set(key, newState);
                return newState;
              },
              updatePMState: async (_ctx2, pName, iId, updates) => {
                const key = `${pName}:${iId}`;
                const existing = state.helperPMStateStore.get(key);
                if (existing) {
                  state.helperPMStateStore.set(key, {
                    ...existing,
                    ...updates,
                    lastUpdatedAt: Date.now(),
                  });
                }
              },
              recordDeadLetter: async (_ctx2, pName, iId, error) => {
                state.deadLetters.push({
                  pmName: pName,
                  instanceId: iId,
                  error,
                });
              },
            });

            // First call
            await helper(mockCtx, {
              pmName: "orderNotification",
              instanceId: "ord_123",
              globalPosition: 1000,
              eventId: "evt_001",
              correlationId: "corr_001",
              process: async (_pmState) => [
                {
                  commandType: "Cmd1",
                  payload: {},
                  causationId: "evt_001",
                },
              ],
              emitCommands: async (_ctx2, commands) => {
                state.helperEmittedCommands.push(...commands);
              },
            });

            // Second call - should skip (completed/terminal)
            state.helperSecondResult = await helper(mockCtx, {
              pmName: "orderNotification",
              instanceId: "ord_123",
              globalPosition: 1000,
              eventId: "evt_001",
              correlationId: "corr_001",
              process: async (_pmState) => [
                {
                  commandType: "Cmd2",
                  payload: {},
                  causationId: "evt_001",
                },
              ],
              emitCommands: async (_ctx2, commands) => {
                state.helperEmittedCommands.push(...commands);
              },
            });
          }
        );

        Then('the second helper call result status is "skipped"', () => {
          expect(state.helperSecondResult).not.toBeNull();
          expect(state.helperSecondResult!.status).toBe("skipped");
        });

        And("the helper emitted commands list has 1 entry", () => {
          expect(state.helperEmittedCommands).toHaveLength(1);
        });

        And('the helper first emitted command type is "Cmd1"', () => {
          expect(state.helperEmittedCommands[0]).toBeDefined();
          expect(state.helperEmittedCommands[0]!.commandType).toBe("Cmd1");
        });
      });
    }
  );
});
