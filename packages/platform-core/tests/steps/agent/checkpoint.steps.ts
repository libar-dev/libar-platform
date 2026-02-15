/**
 * Agent Checkpoint - Step Definitions
 *
 * BDD step definitions for agent checkpoint management including:
 * - AGENT_CHECKPOINT_STATUSES tuple validation
 * - AgentCheckpointStatusSchema / AgentCheckpointSchema Zod validation
 * - createInitialAgentCheckpoint factory
 * - applyCheckpointUpdate merge logic
 * - shouldProcessAgentEvent idempotency guard
 * - isAgentActive / isAgentPaused / isAgentStopped status helpers
 * - isValidAgentCheckpoint arbitrary input validation
 * - Checkpoint lifecycle workflows
 *
 * Mechanical migration from tests/unit/agent/checkpoint.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";

import {
  AGENT_CHECKPOINT_STATUSES,
  AgentCheckpointStatusSchema,
  AgentCheckpointSchema,
  createInitialAgentCheckpoint,
  applyCheckpointUpdate,
  shouldProcessAgentEvent,
  isAgentActive,
  isAgentPaused,
  isAgentStopped,
  isValidAgentCheckpoint,
  type AgentCheckpoint,
} from "../../../src/agent/checkpoint.js";
import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Test Fixtures
// =============================================================================

function createTestCheckpoint(overrides: Partial<AgentCheckpoint> = {}): AgentCheckpoint {
  return {
    agentId: "test-agent",
    subscriptionId: "sub-001",
    lastProcessedPosition: 100,
    lastEventId: "evt_test_123",
    status: "active",
    eventsProcessed: 50,
    updatedAt: Date.now(),
    ...overrides,
  };
}

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  checkpoint: AgentCheckpoint | null;
  arbitraryInput: unknown;
  oldUpdatedAt: number;
  originalCheckpoint: AgentCheckpoint | null;
}

function createInitialState(): TestState {
  return {
    checkpoint: null,
    arbitraryInput: undefined,
    oldUpdatedAt: 0,
    originalCheckpoint: null,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature
// =============================================================================

const feature = await loadFeature("tests/features/behavior/agent/checkpoint.feature");

describeFeature(feature, ({ Rule, Background, BeforeEachScenario, AfterEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  AfterEachScenario(() => {
    vi.useRealTimers();
  });

  Background(({ Given }) => {
    Given("the module is imported from platform-core", () => {
      // Module is imported at top level
    });
  });

  // ===========================================================================
  // Rule: AGENT_CHECKPOINT_STATUSES
  // ===========================================================================

  Rule("AGENT_CHECKPOINT_STATUSES is a readonly tuple of four statuses", ({ RuleScenario }) => {
    RuleScenario("Contains all four statuses", ({ Then }) => {
      Then(
        'AGENT_CHECKPOINT_STATUSES equals ["active", "paused", "stopped", "error_recovery"]',
        () => {
          expect(AGENT_CHECKPOINT_STATUSES).toEqual([
            "active",
            "paused",
            "stopped",
            "error_recovery",
          ]);
        }
      );
    });

    RuleScenario("Is a readonly tuple with 4 elements", ({ Then, And }) => {
      Then("AGENT_CHECKPOINT_STATUSES is an array", () => {
        expect(Array.isArray(AGENT_CHECKPOINT_STATUSES)).toBe(true);
      });
      And("AGENT_CHECKPOINT_STATUSES has length 4", () => {
        expect(AGENT_CHECKPOINT_STATUSES.length).toBe(4);
      });
    });
  });

  // ===========================================================================
  // Rule: AgentCheckpointStatusSchema
  // ===========================================================================

  Rule("AgentCheckpointStatusSchema accepts only valid status strings", ({ RuleScenario }) => {
    RuleScenario("Accepts all valid statuses", ({ Then }) => {
      Then("AgentCheckpointStatusSchema accepts all of:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ status: string }>(dataTable);
        for (const row of rows) {
          const result = AgentCheckpointStatusSchema.safeParse(row.status);
          expect(result.success, `Expected "${row.status}" to be accepted`).toBe(true);
        }
      });
    });

    RuleScenario("Rejects invalid statuses", ({ Then }) => {
      Then("AgentCheckpointStatusSchema rejects all of:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ value: string }>(dataTable);
        const valueMap: Record<string, unknown> = {
          null: null,
          undefined: undefined,
          "123": 123,
        };
        for (const row of rows) {
          const testValue = row.value in valueMap ? valueMap[row.value] : row.value;
          const result = AgentCheckpointStatusSchema.safeParse(testValue);
          expect(result.success, `Expected "${String(row.value)}" to be rejected`).toBe(false);
        }
      });
    });
  });

  // ===========================================================================
  // Rule: AgentCheckpointSchema
  // ===========================================================================

  Rule("AgentCheckpointSchema validates complete checkpoint objects", ({ RuleScenario }) => {
    RuleScenario("Accepts a valid checkpoint object", ({ Given, Then }) => {
      Given("a test checkpoint with defaults", () => {
        state.checkpoint = createTestCheckpoint();
      });
      Then("the checkpoint passes AgentCheckpointSchema validation", () => {
        const result = AgentCheckpointSchema.safeParse(state.checkpoint);
        expect(result.success).toBe(true);
      });
    });

    RuleScenario("Accepts checkpoint with sentinel position -1", ({ Given, Then }) => {
      Given("a test checkpoint with lastProcessedPosition -1", () => {
        state.checkpoint = createTestCheckpoint({
          lastProcessedPosition: -1,
        });
      });
      Then("the checkpoint passes AgentCheckpointSchema validation", () => {
        const result = AgentCheckpointSchema.safeParse(state.checkpoint);
        expect(result.success).toBe(true);
      });
    });

    RuleScenario("Rejects checkpoint with position below -1", ({ Given, Then }) => {
      Given("a test checkpoint with lastProcessedPosition -2", () => {
        state.checkpoint = createTestCheckpoint({
          lastProcessedPosition: -2,
        });
      });
      Then("the checkpoint fails AgentCheckpointSchema validation", () => {
        const result = AgentCheckpointSchema.safeParse(state.checkpoint);
        expect(result.success).toBe(false);
      });
    });

    RuleScenario("Rejects checkpoint with negative eventsProcessed", ({ Given, Then }) => {
      Given("a test checkpoint with eventsProcessed -1", () => {
        state.checkpoint = createTestCheckpoint({ eventsProcessed: -1 });
      });
      Then("the checkpoint fails AgentCheckpointSchema validation", () => {
        const result = AgentCheckpointSchema.safeParse(state.checkpoint);
        expect(result.success).toBe(false);
      });
    });

    RuleScenario("Rejects checkpoint with empty agentId", ({ Given, Then }) => {
      Given('a test checkpoint with agentId ""', () => {
        state.checkpoint = {
          ...createTestCheckpoint(),
          agentId: "",
        };
      });
      Then("the checkpoint fails AgentCheckpointSchema validation", () => {
        const result = AgentCheckpointSchema.safeParse(state.checkpoint);
        expect(result.success).toBe(false);
      });
    });

    RuleScenario("Rejects checkpoint with empty subscriptionId", ({ Given, Then }) => {
      Given('a test checkpoint with subscriptionId ""', () => {
        state.checkpoint = {
          ...createTestCheckpoint(),
          subscriptionId: "",
        };
      });
      Then("the checkpoint fails AgentCheckpointSchema validation", () => {
        const result = AgentCheckpointSchema.safeParse(state.checkpoint);
        expect(result.success).toBe(false);
      });
    });

    RuleScenario("Rejects checkpoint with missing required fields", ({ Given, Then }) => {
      Given('an object with only agentId "test"', () => {
        state.arbitraryInput = { agentId: "test" };
      });
      Then("the checkpoint fails AgentCheckpointSchema validation", () => {
        const result = AgentCheckpointSchema.safeParse(state.arbitraryInput ?? state.checkpoint);
        expect(result.success).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Rule: createInitialAgentCheckpoint
  // ===========================================================================

  Rule("createInitialAgentCheckpoint produces a valid default checkpoint", ({ RuleScenario }) => {
    RuleScenario("Creates checkpoint with correct agentId and subscriptionId", ({ When, Then }) => {
      When(
        'I create an initial checkpoint for agent "my-agent" with subscription "sub-001"',
        () => {
          state.checkpoint = createInitialAgentCheckpoint("my-agent", "sub-001");
        }
      );
      Then("the checkpoint has the following properties:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{
          property: string;
          value: string;
        }>(dataTable);
        for (const row of rows) {
          const actual = state.checkpoint![row.property as keyof AgentCheckpoint];
          expect(String(actual)).toBe(row.value);
        }
      });
    });

    RuleScenario("Initializes position and event tracking defaults", ({ When, Then, And }) => {
      When(
        'I create an initial checkpoint for agent "my-agent" with subscription "sub-001"',
        () => {
          state.checkpoint = createInitialAgentCheckpoint("my-agent", "sub-001");
        }
      );
      Then(
        "the checkpoint has the following numeric properties:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{
            property: string;
            value: string;
          }>(dataTable);
          for (const row of rows) {
            const actual = state.checkpoint![row.property as keyof AgentCheckpoint];
            expect(actual).toBe(Number(row.value));
          }
        }
      );
      And('the checkpoint lastEventId is ""', () => {
        expect(state.checkpoint!.lastEventId).toBe("");
      });
    });

    RuleScenario("Initializes status to active", ({ When, Then }) => {
      When(
        'I create an initial checkpoint for agent "my-agent" with subscription "sub-001"',
        () => {
          state.checkpoint = createInitialAgentCheckpoint("my-agent", "sub-001");
        }
      );
      Then('the checkpoint status is "active"', () => {
        expect(state.checkpoint!.status).toBe("active");
      });
    });

    RuleScenario("Sets updatedAt to current time", ({ When, Then }) => {
      When(
        'I create an initial checkpoint for agent "my-agent" with subscription "sub-001"',
        () => {
          state.checkpoint = createInitialAgentCheckpoint("my-agent", "sub-001");
        }
      );
      Then("the checkpoint updatedAt equals the current time", () => {
        expect(state.checkpoint!.updatedAt).toBe(Date.now());
      });
    });

    RuleScenario("Creates a checkpoint that passes schema validation", ({ When, Then }) => {
      When(
        'I create an initial checkpoint for agent "my-agent" with subscription "sub-001"',
        () => {
          state.checkpoint = createInitialAgentCheckpoint("my-agent", "sub-001");
        }
      );
      Then("the checkpoint passes AgentCheckpointSchema validation", () => {
        const result = AgentCheckpointSchema.safeParse(state.checkpoint);
        expect(result.success).toBe(true);
      });
    });
  });

  // ===========================================================================
  // Rule: applyCheckpointUpdate
  // ===========================================================================

  Rule(
    "applyCheckpointUpdate merges partial updates into an existing checkpoint",
    ({ RuleScenario }) => {
      RuleScenario("Updates lastProcessedPosition", ({ Given, When, Then }) => {
        Given("a test checkpoint with lastProcessedPosition 100", () => {
          state.checkpoint = createTestCheckpoint({
            lastProcessedPosition: 100,
          });
        });
        When("I apply an update with lastProcessedPosition 150", () => {
          state.checkpoint = applyCheckpointUpdate(state.checkpoint!, {
            lastProcessedPosition: 150,
          });
        });
        Then("the checkpoint lastProcessedPosition is 150", () => {
          expect(state.checkpoint!.lastProcessedPosition).toBe(150);
        });
      });

      RuleScenario("Updates lastEventId", ({ Given, When, Then }) => {
        Given('a test checkpoint with lastEventId "evt_old"', () => {
          state.checkpoint = createTestCheckpoint({ lastEventId: "evt_old" });
        });
        When('I apply an update with lastEventId "evt_new"', () => {
          state.checkpoint = applyCheckpointUpdate(state.checkpoint!, {
            lastEventId: "evt_new",
          });
        });
        Then('the checkpoint lastEventId is "evt_new"', () => {
          expect(state.checkpoint!.lastEventId).toBe("evt_new");
        });
      });

      RuleScenario("Updates status", ({ Given, When, Then }) => {
        Given('a test checkpoint with status "active"', () => {
          state.checkpoint = createTestCheckpoint({ status: "active" });
        });
        When('I apply an update with status "paused"', () => {
          state.checkpoint = applyCheckpointUpdate(state.checkpoint!, {
            status: "paused",
          });
        });
        Then('the checkpoint status is "paused"', () => {
          expect(state.checkpoint!.status).toBe("paused");
        });
      });

      RuleScenario("Increments eventsProcessed by specified amount", ({ Given, When, Then }) => {
        Given("a test checkpoint with eventsProcessed 50", () => {
          state.checkpoint = createTestCheckpoint({ eventsProcessed: 50 });
        });
        When("I apply an update with incrementEventsProcessed 5", () => {
          state.checkpoint = applyCheckpointUpdate(state.checkpoint!, {
            incrementEventsProcessed: 5,
          });
        });
        Then("the checkpoint eventsProcessed is 55", () => {
          expect(state.checkpoint!.eventsProcessed).toBe(55);
        });
      });

      RuleScenario("Increments eventsProcessed by 1 for single event", ({ Given, When, Then }) => {
        Given("a test checkpoint with eventsProcessed 100", () => {
          state.checkpoint = createTestCheckpoint({ eventsProcessed: 100 });
        });
        When("I apply an update with incrementEventsProcessed 1", () => {
          state.checkpoint = applyCheckpointUpdate(state.checkpoint!, {
            incrementEventsProcessed: 1,
          });
        });
        Then("the checkpoint eventsProcessed is 101", () => {
          expect(state.checkpoint!.eventsProcessed).toBe(101);
        });
      });

      RuleScenario(
        "Does not increment eventsProcessed when not specified",
        ({ Given, When, Then }) => {
          Given("a test checkpoint with eventsProcessed 50", () => {
            state.checkpoint = createTestCheckpoint({ eventsProcessed: 50 });
          });
          When("I apply an update with lastProcessedPosition 101", () => {
            state.checkpoint = applyCheckpointUpdate(state.checkpoint!, {
              lastProcessedPosition: 101,
            });
          });
          Then("the checkpoint eventsProcessed is 50", () => {
            expect(state.checkpoint!.eventsProcessed).toBe(50);
          });
        }
      );

      RuleScenario("Preserves unchanged fields", ({ Given, When, Then }) => {
        Given("a fully specified test checkpoint", () => {
          state.checkpoint = createTestCheckpoint({
            agentId: "my-agent",
            subscriptionId: "sub-001",
            lastProcessedPosition: 100,
            lastEventId: "evt_123",
            status: "active",
            eventsProcessed: 50,
          });
        });
        When("I apply an update with lastProcessedPosition 101", () => {
          state.checkpoint = applyCheckpointUpdate(state.checkpoint!, {
            lastProcessedPosition: 101,
          });
        });
        Then("the unchanged fields are preserved", () => {
          expect(state.checkpoint!.agentId).toBe("my-agent");
          expect(state.checkpoint!.subscriptionId).toBe("sub-001");
          expect(state.checkpoint!.lastEventId).toBe("evt_123");
          expect(state.checkpoint!.status).toBe("active");
          expect(state.checkpoint!.eventsProcessed).toBe(50);
        });
      });

      RuleScenario("Updates updatedAt to current time", ({ Given, When, Then, And }) => {
        Given("a test checkpoint with updatedAt 10000ms ago", () => {
          state.oldUpdatedAt = Date.now() - 10000;
          state.checkpoint = createTestCheckpoint({
            updatedAt: state.oldUpdatedAt,
          });
        });
        When("I apply an update with lastProcessedPosition 101", () => {
          state.checkpoint = applyCheckpointUpdate(state.checkpoint!, {
            lastProcessedPosition: 101,
          });
        });
        Then("the checkpoint updatedAt equals the current time", () => {
          expect(state.checkpoint!.updatedAt).toBe(Date.now());
        });
        And("the checkpoint updatedAt differs from the old time", () => {
          expect(state.checkpoint!.updatedAt).not.toBe(state.oldUpdatedAt);
        });
      });

      RuleScenario("Applies multiple updates at once", ({ Given, When, Then, And }) => {
        Given(
          'a test checkpoint with lastProcessedPosition 100 and lastEventId "evt_old" and status "active" and eventsProcessed 50',
          () => {
            state.checkpoint = createTestCheckpoint({
              lastProcessedPosition: 100,
              lastEventId: "evt_old",
              status: "active",
              eventsProcessed: 50,
            });
          }
        );
        When(
          'I apply an update with lastProcessedPosition 101 and lastEventId "evt_new" and status "paused" and incrementEventsProcessed 1',
          () => {
            state.checkpoint = applyCheckpointUpdate(state.checkpoint!, {
              lastProcessedPosition: 101,
              lastEventId: "evt_new",
              status: "paused",
              incrementEventsProcessed: 1,
            });
          }
        );
        Then(
          "the checkpoint has the following properties:",
          (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{
              property: string;
              value: string;
            }>(dataTable);
            for (const row of rows) {
              const actual = state.checkpoint![row.property as keyof AgentCheckpoint];
              if (typeof actual === "number") {
                expect(actual).toBe(Number(row.value));
              } else {
                expect(String(actual)).toBe(row.value);
              }
            }
          }
        );
        And("the checkpoint eventsProcessed is 51", () => {
          expect(state.checkpoint!.eventsProcessed).toBe(51);
        });
      });

      RuleScenario("Handles empty update by only updating timestamp", ({ Given, When, Then }) => {
        Given("a test checkpoint with defaults", () => {
          state.checkpoint = createTestCheckpoint();
          state.originalCheckpoint = { ...state.checkpoint };
        });
        When("I apply an empty update", () => {
          state.checkpoint = applyCheckpointUpdate(state.checkpoint!, {});
        });
        Then("the checkpoint fields match the original except updatedAt", () => {
          expect(state.checkpoint!.lastProcessedPosition).toBe(
            state.originalCheckpoint!.lastProcessedPosition
          );
          expect(state.checkpoint!.lastEventId).toBe(state.originalCheckpoint!.lastEventId);
          expect(state.checkpoint!.status).toBe(state.originalCheckpoint!.status);
          expect(state.checkpoint!.eventsProcessed).toBe(state.originalCheckpoint!.eventsProcessed);
          expect(state.checkpoint!.updatedAt).toBe(Date.now());
        });
      });
    }
  );

  // ===========================================================================
  // Rule: shouldProcessAgentEvent
  // ===========================================================================

  Rule(
    "shouldProcessAgentEvent guards against duplicate and out-of-order events",
    ({ RuleScenario }) => {
      RuleScenario("Returns true when event position is greater than checkpoint", ({ Then }) => {
        Then("shouldProcessAgentEvent with position 101 and checkpoint 100 returns true", () => {
          expect(shouldProcessAgentEvent(101, 100)).toBe(true);
        });
      });

      RuleScenario("Returns false for duplicate event at same position", ({ Then }) => {
        Then("shouldProcessAgentEvent with position 100 and checkpoint 100 returns false", () => {
          expect(shouldProcessAgentEvent(100, 100)).toBe(false);
        });
      });

      RuleScenario("Returns false for already-processed event", ({ Then }) => {
        Then("shouldProcessAgentEvent with position 50 and checkpoint 100 returns false", () => {
          expect(shouldProcessAgentEvent(50, 100)).toBe(false);
        });
      });

      RuleScenario(
        "Returns true for position 0 against sentinel -1 for a new agent",
        ({ Then }) => {
          Then("shouldProcessAgentEvent with position 0 and checkpoint -1 returns true", () => {
            expect(shouldProcessAgentEvent(0, -1)).toBe(true);
          });
        }
      );

      RuleScenario("Returns true for position 1 against sentinel -1", ({ Then }) => {
        Then("shouldProcessAgentEvent with position 1 and checkpoint -1 returns true", () => {
          expect(shouldProcessAgentEvent(1, -1)).toBe(true);
        });
      });

      RuleScenario("Returns true for any positive position against sentinel -1", ({ Then }) => {
        Then(
          "shouldProcessAgentEvent returns true for all positions against sentinel:",
          (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{ eventPosition: string }>(dataTable);
            for (const row of rows) {
              expect(shouldProcessAgentEvent(Number(row.eventPosition), -1)).toBe(true);
            }
          }
        );
      });

      RuleScenario("Returns true for position 1 against checkpoint 0", ({ Then }) => {
        Then("shouldProcessAgentEvent with position 1 and checkpoint 0 returns true", () => {
          expect(shouldProcessAgentEvent(1, 0)).toBe(true);
        });
      });

      RuleScenario("Returns false for position 0 against checkpoint 0", ({ Then }) => {
        Then("shouldProcessAgentEvent with position 0 and checkpoint 0 returns false", () => {
          expect(shouldProcessAgentEvent(0, 0)).toBe(false);
        });
      });

      RuleScenario("Handles large position values", ({ Then, And }) => {
        Then(
          "shouldProcessAgentEvent with position 1000001 and checkpoint 1000000 returns true",
          () => {
            expect(shouldProcessAgentEvent(1000001, 1000000)).toBe(true);
          }
        );
        And(
          "shouldProcessAgentEvent with position 1000000 and checkpoint 1000000 returns false",
          () => {
            expect(shouldProcessAgentEvent(1000000, 1000000)).toBe(false);
          }
        );
      });

      RuleScenario("Processes sequential events correctly", ({ When, Then }) => {
        When("processing sequential events starting from sentinel -1", () => {
          // Just set up the scenario
        });
        Then("each event is accepted and duplicates are rejected", () => {
          let checkpointPosition = -1;

          // First event
          expect(shouldProcessAgentEvent(0, checkpointPosition)).toBe(true);
          checkpointPosition = 0;

          // Second event
          expect(shouldProcessAgentEvent(1, checkpointPosition)).toBe(true);
          checkpointPosition = 1;

          // Third event
          expect(shouldProcessAgentEvent(2, checkpointPosition)).toBe(true);
          checkpointPosition = 2;

          // Duplicate of third event (should skip)
          expect(shouldProcessAgentEvent(2, checkpointPosition)).toBe(false);

          // Fourth event
          expect(shouldProcessAgentEvent(3, checkpointPosition)).toBe(true);
        });
      });

      RuleScenario("Handles gaps in event positions", ({ Then, And }) => {
        Then("shouldProcessAgentEvent with position 150 and checkpoint 100 returns true", () => {
          expect(shouldProcessAgentEvent(150, 100)).toBe(true);
        });
        And("shouldProcessAgentEvent with position 200 and checkpoint 150 returns true", () => {
          expect(shouldProcessAgentEvent(200, 150)).toBe(true);
        });
      });
    }
  );

  // ===========================================================================
  // Rule: Status helper functions
  // ===========================================================================

  Rule("Status helper functions reflect checkpoint status accurately", ({ RuleScenario }) => {
    RuleScenario("isAgentActive returns true only for active status", ({ Then }) => {
      Then(
        "isAgentActive returns the following for each status:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{
            status: string;
            expected: string;
          }>(dataTable);
          for (const row of rows) {
            const checkpoint = createTestCheckpoint({
              status: row.status as AgentCheckpoint["status"],
            });
            expect(isAgentActive(checkpoint)).toBe(row.expected === "true");
          }
        }
      );
    });

    RuleScenario("isAgentPaused returns true only for paused status", ({ Then }) => {
      Then(
        "isAgentPaused returns the following for each status:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{
            status: string;
            expected: string;
          }>(dataTable);
          for (const row of rows) {
            const checkpoint = createTestCheckpoint({
              status: row.status as AgentCheckpoint["status"],
            });
            expect(isAgentPaused(checkpoint)).toBe(row.expected === "true");
          }
        }
      );
    });

    RuleScenario("isAgentStopped returns true only for stopped status", ({ Then }) => {
      Then(
        "isAgentStopped returns the following for each status:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{
            status: string;
            expected: string;
          }>(dataTable);
          for (const row of rows) {
            const checkpoint = createTestCheckpoint({
              status: row.status as AgentCheckpoint["status"],
            });
            expect(isAgentStopped(checkpoint)).toBe(row.expected === "true");
          }
        }
      );
    });
  });

  // ===========================================================================
  // Rule: isValidAgentCheckpoint
  // ===========================================================================

  Rule(
    "isValidAgentCheckpoint validates arbitrary input against the schema",
    ({ RuleScenario }) => {
      RuleScenario("Returns true for a valid checkpoint", ({ Given, Then }) => {
        Given("a test checkpoint with defaults", () => {
          state.checkpoint = createTestCheckpoint();
        });
        Then("isValidAgentCheckpoint returns true", () => {
          expect(isValidAgentCheckpoint(state.checkpoint)).toBe(true);
        });
      });

      RuleScenario("Returns true for checkpoint with sentinel position", ({ Given, Then }) => {
        Given("a test checkpoint with lastProcessedPosition -1", () => {
          state.checkpoint = createTestCheckpoint({
            lastProcessedPosition: -1,
          });
        });
        Then("isValidAgentCheckpoint returns true", () => {
          expect(isValidAgentCheckpoint(state.checkpoint)).toBe(true);
        });
      });

      RuleScenario("Returns false for null, undefined, and empty object", ({ Then }) => {
        Then("isValidAgentCheckpoint returns false for:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ input: string }>(dataTable);
          const inputMap: Record<string, unknown> = {
            null: null,
            undefined: undefined,
            empty: {},
          };
          for (const row of rows) {
            const testValue = inputMap[row.input];
            expect(
              isValidAgentCheckpoint(testValue),
              `Expected isValidAgentCheckpoint(${row.input}) to be false`
            ).toBe(false);
          }
        });
      });

      RuleScenario("Returns false for non-object values", ({ Then }) => {
        Then(
          "isValidAgentCheckpoint returns false for non-objects:",
          (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{ input: string }>(dataTable);
            const inputMap: Record<string, unknown> = {
              "not an object": "not an object",
              "123": 123,
              true: true,
            };
            for (const row of rows) {
              const testValue = row.input in inputMap ? inputMap[row.input] : row.input;
              expect(
                isValidAgentCheckpoint(testValue),
                `Expected isValidAgentCheckpoint(${row.input}) to be false`
              ).toBe(false);
            }
          }
        );
      });

      RuleScenario("Returns false for checkpoint with invalid status", ({ Given, Then }) => {
        Given('a test checkpoint with status "invalid"', () => {
          state.checkpoint = {
            ...createTestCheckpoint(),
            status: "invalid" as AgentCheckpoint["status"],
          };
        });
        Then("isValidAgentCheckpoint returns false", () => {
          expect(isValidAgentCheckpoint(state.checkpoint)).toBe(false);
        });
      });

      RuleScenario("Returns false for checkpoint with position below -1", ({ Given, Then }) => {
        Given("a test checkpoint with lastProcessedPosition -2", () => {
          state.checkpoint = createTestCheckpoint({
            lastProcessedPosition: -2,
          });
        });
        Then("isValidAgentCheckpoint returns false", () => {
          expect(isValidAgentCheckpoint(state.checkpoint)).toBe(false);
        });
      });

      RuleScenario(
        "Returns false for checkpoint with negative eventsProcessed",
        ({ Given, Then }) => {
          Given("a test checkpoint with eventsProcessed -1", () => {
            state.checkpoint = createTestCheckpoint({ eventsProcessed: -1 });
          });
          Then("isValidAgentCheckpoint returns false", () => {
            expect(isValidAgentCheckpoint(state.checkpoint)).toBe(false);
          });
        }
      );
    }
  );

  // ===========================================================================
  // Rule: Checkpoint lifecycle
  // ===========================================================================

  Rule(
    "Checkpoint lifecycle supports create-process-pause-resume-recover workflows",
    ({ RuleScenario }) => {
      RuleScenario("New agent processes first events", ({ When, Then, And }) => {
        When(
          'I create an initial checkpoint for agent "new-agent" with subscription "sub-001"',
          () => {
            state.checkpoint = createInitialAgentCheckpoint("new-agent", "sub-001");
          }
        );
        Then("the checkpoint lastProcessedPosition is -1", () => {
          expect(state.checkpoint!.lastProcessedPosition).toBe(-1);
        });
        And("the checkpoint eventsProcessed is 0", () => {
          expect(state.checkpoint!.eventsProcessed).toBe(0);
        });
        And("isAgentActive returns true for the checkpoint", () => {
          expect(isAgentActive(state.checkpoint!)).toBe(true);
        });
        When('I process event at position 0 with id "evt_0"', () => {
          expect(shouldProcessAgentEvent(0, state.checkpoint!.lastProcessedPosition)).toBe(true);
          state.checkpoint = applyCheckpointUpdate(state.checkpoint!, {
            lastProcessedPosition: 0,
            lastEventId: "evt_0",
            incrementEventsProcessed: 1,
          });
        });
        Then("the checkpoint lastProcessedPosition is 0", () => {
          expect(state.checkpoint!.lastProcessedPosition).toBe(0);
        });
        And("the checkpoint eventsProcessed is 1", () => {
          expect(state.checkpoint!.eventsProcessed).toBe(1);
        });
        When('I process event at position 1 with id "evt_1"', () => {
          expect(shouldProcessAgentEvent(1, state.checkpoint!.lastProcessedPosition)).toBe(true);
          state.checkpoint = applyCheckpointUpdate(state.checkpoint!, {
            lastProcessedPosition: 1,
            lastEventId: "evt_1",
            incrementEventsProcessed: 1,
          });
        });
        Then("the checkpoint lastProcessedPosition is 1", () => {
          expect(state.checkpoint!.lastProcessedPosition).toBe(1);
        });
        And("the checkpoint eventsProcessed is 2", () => {
          expect(state.checkpoint!.eventsProcessed).toBe(2);
        });
      });

      RuleScenario("Agent pause and resume preserves position", ({ Given, When, Then, And }) => {
        Given(
          'a test checkpoint with status "active" and lastProcessedPosition 100 and eventsProcessed 100',
          () => {
            state.checkpoint = createTestCheckpoint({
              status: "active",
              lastProcessedPosition: 100,
              eventsProcessed: 100,
            });
          }
        );
        When('I apply an update with status "paused"', () => {
          state.checkpoint = applyCheckpointUpdate(state.checkpoint!, {
            status: "paused",
          });
        });
        Then("isAgentPaused returns true for the checkpoint", () => {
          expect(isAgentPaused(state.checkpoint!)).toBe(true);
        });
        And("isAgentActive returns false for the checkpoint", () => {
          expect(isAgentActive(state.checkpoint!)).toBe(false);
        });
        And("the checkpoint lastProcessedPosition is 100", () => {
          expect(state.checkpoint!.lastProcessedPosition).toBe(100);
        });
        And("the checkpoint eventsProcessed is 100", () => {
          expect(state.checkpoint!.eventsProcessed).toBe(100);
        });
        When('I apply an update with status "active"', () => {
          state.checkpoint = applyCheckpointUpdate(state.checkpoint!, {
            status: "active",
          });
        });
        Then("isAgentActive returns true for the checkpoint", () => {
          expect(isAgentActive(state.checkpoint!)).toBe(true);
        });
      });

      RuleScenario(
        "Agent restart recovery skips already-processed events",
        ({ Given, Then, And }) => {
          Given(
            'a test checkpoint with lastProcessedPosition 500 and lastEventId "evt_500" and eventsProcessed 500',
            () => {
              state.checkpoint = createTestCheckpoint({
                lastProcessedPosition: 500,
                lastEventId: "evt_500",
                eventsProcessed: 500,
              });
            }
          );
          Then("shouldProcessAgentEvent with position 500 and checkpoint 500 returns false", () => {
            expect(shouldProcessAgentEvent(500, 500)).toBe(false);
          });
          And("shouldProcessAgentEvent with position 499 and checkpoint 500 returns false", () => {
            expect(shouldProcessAgentEvent(499, 500)).toBe(false);
          });
          And("shouldProcessAgentEvent with position 501 and checkpoint 500 returns true", () => {
            expect(shouldProcessAgentEvent(501, 500)).toBe(true);
          });
        }
      );

      RuleScenario("Duplicate event delivery is idempotent", ({ Given, When, Then, And }) => {
        Given("a test checkpoint with lastProcessedPosition 100 and eventsProcessed 100", () => {
          state.checkpoint = createTestCheckpoint({
            lastProcessedPosition: 100,
            eventsProcessed: 100,
          });
        });
        When('I process event at position 101 with id "evt_101"', () => {
          expect(shouldProcessAgentEvent(101, state.checkpoint!.lastProcessedPosition)).toBe(true);
          state.checkpoint = applyCheckpointUpdate(state.checkpoint!, {
            lastProcessedPosition: 101,
            lastEventId: "evt_101",
            incrementEventsProcessed: 1,
          });
        });
        Then("shouldProcessAgentEvent with position 101 and checkpoint 101 returns false", () => {
          expect(shouldProcessAgentEvent(101, 101)).toBe(false);
        });
        And("the checkpoint eventsProcessed is 101", () => {
          expect(state.checkpoint!.eventsProcessed).toBe(101);
        });
        Then("shouldProcessAgentEvent with position 102 and checkpoint 101 returns true", () => {
          expect(shouldProcessAgentEvent(102, 101)).toBe(true);
        });
      });
    }
  );
});
