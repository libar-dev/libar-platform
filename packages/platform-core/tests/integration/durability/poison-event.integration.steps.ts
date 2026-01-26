/**
 * Poison Event Handling - Integration Step Definitions
 *
 * Integration test steps for validating poison event handling
 * against a real Convex backend with the poisonEvents table.
 *
 * @libar-docs
 * @libar-docs-implements EventStoreDurability
 * @libar-docs-status active
 * @libar-docs-event-sourcing
 *
 * @since Phase 18b
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { ConvexTestingHelper } from "convex-helpers/testing";
import { makeFunctionReference } from "convex/server";
import type { SafeMutationRef, SafeQueryRef } from "../../../src/types/function-references.js";
import { withPrefix, testMutation, testQuery } from "../../../src/testing/index.js";

// =============================================================================
// Test Function References (TS2589 prevention)
// =============================================================================

const simulateProjectionFailure = makeFunctionReference<"mutation">(
  "testing/poisonEventTest:simulateProjectionFailure"
) as SafeMutationRef;

const getTestPoisonRecord = makeFunctionReference<"query">(
  "testing/poisonEventTest:getTestPoisonRecord"
) as SafeQueryRef;

const testUnquarantine = makeFunctionReference<"mutation">(
  "testing/poisonEventTest:testUnquarantine"
) as SafeMutationRef;

const createTestPoisonRecord = makeFunctionReference<"mutation">(
  "testing/poisonEventTest:createTestPoisonRecord"
) as SafeMutationRef;

const getPoisonStats = makeFunctionReference<"query">(
  "testing/poisonEventTest:getPoisonStats"
) as SafeQueryRef;

// =============================================================================
// Test State
// =============================================================================

interface SimulationResult {
  threwError: boolean;
  errorThrown: string | null;
  poisonRecord: PoisonRecord | null;
}

interface PoisonRecord {
  _id: string;
  eventId: string;
  eventType: string;
  projectionName: string;
  status: "pending" | "quarantined" | "replayed";
  attemptCount: number;
  error?: string;
  quarantinedAt?: number;
  createdAt?: number;
  updatedAt?: number;
}

interface PoisonStats {
  totalQuarantined: number;
  byProjection: Record<string, number>;
  recentErrors: Array<{
    eventId: string;
    projectionName: string;
    error: string;
    quarantinedAt: number;
  }>;
}

interface PoisonEventTestState {
  t: ConvexTestingHelper | null;
  currentEventId: string | null;
  currentEventType: string | null;
  currentProjectionName: string | null;
  maxAttempts: number;
  shouldFail: boolean;
  errorMessage: string | null;
  simulationResult: SimulationResult | null;
  unquarantineResult: { status: string } | null;
  poisonStats: PoisonStats | null;
  lastError: Error | null;
}

let state: PoisonEventTestState;

function resetState(): void {
  state = {
    t: null,
    currentEventId: null,
    currentEventType: null,
    currentProjectionName: null,
    maxAttempts: 3,
    shouldFail: false,
    errorMessage: null,
    simulationResult: null,
    unquarantineResult: null,
    poisonStats: null,
    lastError: null,
  };
}

/**
 * Generate a test-isolated event ID with testRunId prefix.
 */
function generateEventId(suffix?: string): string {
  const base = `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  return withPrefix(suffix ? `${suffix}-${base}` : base);
}

/**
 * Generate a test-isolated projection name with testRunId prefix.
 */
function generateProjectionName(): string {
  return withPrefix(`projection-${Date.now()}`);
}

// =============================================================================
// Feature Loading
// =============================================================================

const feature = await loadFeature(
  "../../examples/order-management/tests/integration-features/durability/poison-event.feature"
);

// =============================================================================
// Feature Implementation
// =============================================================================

describeFeature(
  feature,
  ({ Background, Rule, BeforeAllScenarios, AfterAllScenarios, BeforeEachScenario }) => {
    BeforeAllScenarios(async () => {
      resetState();
      const backendUrl = process.env.CONVEX_URL ?? "http://127.0.0.1:3210";
      state.t = new ConvexTestingHelper({ backendUrl });
    });

    BeforeEachScenario(() => {
      const t = state.t;
      resetState();
      state.t = t;
      state.maxAttempts = 3; // Default from background
    });

    AfterAllScenarios(async () => {
      if (state.t) {
        await state.t.close();
      }
      resetState();
    });

    // ===========================================================================
    // Background
    // ===========================================================================

    Background(({ Given, And }) => {
      Given("the backend is running and clean", () => {
        expect(state.t).not.toBeNull();
      });

      And("poison event handling is configured with maxAttempts 3", () => {
        state.maxAttempts = 3;
      });
    });

    // ===========================================================================
    // Rule: Failed projections are tracked in poisonEvents table
    // ===========================================================================

    Rule("Failed projections are tracked in poisonEvents table", ({ RuleScenario }) => {
      RuleScenario("First failure creates pending poison record", ({ Given, And, When, Then }) => {
        Given('a test event "evt-poison-001" of type "OrderCreated"', () => {
          state.currentEventId = generateEventId("poison-001");
          state.currentEventType = "OrderCreated";
          state.currentProjectionName = generateProjectionName();
        });

        And("the projection handler will fail", () => {
          state.shouldFail = true;
          state.errorMessage = "Simulated projection failure";
        });

        When("processing the event through withPoisonEventHandling", async () => {
          state.simulationResult = await testMutation(state.t!, simulateProjectionFailure, {
            eventId: state.currentEventId!,
            eventType: state.currentEventType!,
            projectionName: state.currentProjectionName!,
            maxAttempts: state.maxAttempts,
            shouldFail: state.shouldFail,
            errorMessage: state.errorMessage,
          });
        });

        Then("a poison record should exist in the database", async () => {
          const record = await testQuery(state.t!, getTestPoisonRecord, {
            eventId: state.currentEventId!,
            projectionName: state.currentProjectionName!,
          });
          expect(record).not.toBeNull();
        });

        And('the record status should be "pending"', () => {
          expect(state.simulationResult?.poisonRecord?.status).toBe("pending");
        });

        And("the attemptCount should be 1", () => {
          expect(state.simulationResult?.poisonRecord?.attemptCount).toBe(1);
        });

        And("the error should be captured", () => {
          expect(state.simulationResult?.poisonRecord?.error).toBeDefined();
          expect(state.simulationResult?.poisonRecord?.error).toContain(
            "Simulated projection failure"
          );
        });
      });

      RuleScenario("Second failure increments attempt count", ({ Given, And, When, Then }) => {
        Given('a pending poison record for event "evt-poison-002" with 1 attempt', async () => {
          state.currentEventId = generateEventId("poison-002");
          state.currentEventType = "OrderCreated";
          state.currentProjectionName = generateProjectionName();

          // Create existing pending record with 1 attempt
          await testMutation(state.t!, createTestPoisonRecord, {
            eventId: state.currentEventId,
            eventType: state.currentEventType,
            projectionName: state.currentProjectionName,
            status: "pending",
            attemptCount: 1,
          });
        });

        And("the projection handler will fail", () => {
          state.shouldFail = true;
          state.errorMessage = "Second failure";
        });

        When("processing the event through withPoisonEventHandling", async () => {
          state.simulationResult = await testMutation(state.t!, simulateProjectionFailure, {
            eventId: state.currentEventId!,
            eventType: state.currentEventType!,
            projectionName: state.currentProjectionName!,
            maxAttempts: state.maxAttempts,
            shouldFail: state.shouldFail,
            errorMessage: state.errorMessage,
          });
        });

        Then("the attemptCount should be 2", () => {
          expect(state.simulationResult?.poisonRecord?.attemptCount).toBe(2);
        });

        And('the record status should still be "pending"', () => {
          expect(state.simulationResult?.poisonRecord?.status).toBe("pending");
        });

        And("the handler should have re-thrown the error", () => {
          expect(state.simulationResult?.threwError).toBe(true);
          expect(state.simulationResult?.errorThrown).toContain("Second failure");
        });
      });
    });

    // ===========================================================================
    // Rule: Events are quarantined after max attempts
    // ===========================================================================

    Rule("Events are quarantined after max attempts", ({ RuleScenario }) => {
      RuleScenario("Event quarantined after 3 failures", ({ Given, And, When, Then }) => {
        Given('a pending poison record for event "evt-poison-003" with 2 attempts', async () => {
          state.currentEventId = generateEventId("poison-003");
          state.currentEventType = "OrderCreated";
          state.currentProjectionName = generateProjectionName();

          await testMutation(state.t!, createTestPoisonRecord, {
            eventId: state.currentEventId,
            eventType: state.currentEventType,
            projectionName: state.currentProjectionName,
            status: "pending",
            attemptCount: 2,
          });
        });

        And("the projection handler will fail", () => {
          state.shouldFail = true;
          state.errorMessage = "Third and final failure";
        });

        When("processing the event through withPoisonEventHandling", async () => {
          state.simulationResult = await testMutation(state.t!, simulateProjectionFailure, {
            eventId: state.currentEventId!,
            eventType: state.currentEventType!,
            projectionName: state.currentProjectionName!,
            maxAttempts: state.maxAttempts,
            shouldFail: state.shouldFail,
            errorMessage: state.errorMessage,
          });
        });

        Then('the record status should be "quarantined"', () => {
          expect(state.simulationResult?.poisonRecord?.status).toBe("quarantined");
        });

        And("the attemptCount should be 3", () => {
          expect(state.simulationResult?.poisonRecord?.attemptCount).toBe(3);
        });

        And("quarantinedAt timestamp should be set", () => {
          expect(state.simulationResult?.poisonRecord?.quarantinedAt).toBeDefined();
          expect(state.simulationResult?.poisonRecord?.quarantinedAt).toBeGreaterThan(0);
        });

        And("the error should be swallowed", () => {
          // When quarantined, error is NOT re-thrown
          expect(state.simulationResult?.threwError).toBe(false);
        });
      });

      RuleScenario("Quarantine captures error details", ({ Given, And, When, Then }) => {
        Given('a test event "evt-poison-004" of type "OrderCreated"', () => {
          state.currentEventId = generateEventId("poison-004");
          state.currentEventType = "OrderCreated";
          state.currentProjectionName = generateProjectionName();
        });

        And('the projection handler will fail with message "Invalid order format"', () => {
          state.shouldFail = true;
          state.errorMessage = "Invalid order format";
        });

        When("processing reaches maxAttempts failures", async () => {
          // Run through all 3 attempts
          for (let i = 0; i < state.maxAttempts; i++) {
            state.simulationResult = await testMutation(state.t!, simulateProjectionFailure, {
              eventId: state.currentEventId!,
              eventType: state.currentEventType!,
              projectionName: state.currentProjectionName!,
              maxAttempts: state.maxAttempts,
              shouldFail: state.shouldFail,
              errorMessage: state.errorMessage,
            });
          }
        });

        Then('the poison record should contain error "Invalid order format"', () => {
          expect(state.simulationResult?.poisonRecord?.error).toContain("Invalid order format");
        });

        And("the record should be queryable by projection name", async () => {
          const record = await testQuery(state.t!, getTestPoisonRecord, {
            eventId: state.currentEventId!,
            projectionName: state.currentProjectionName!,
          });
          expect(record).not.toBeNull();
          expect(record.projectionName).toBe(state.currentProjectionName);
        });
      });
    });

    // ===========================================================================
    // Rule: Quarantined events are skipped
    // ===========================================================================

    Rule("Quarantined events are skipped", ({ RuleScenario }) => {
      RuleScenario(
        "Quarantined event bypasses handler completely",
        ({ Given, And, When, Then }) => {
          Given('event "evt-poison-005" is already quarantined', async () => {
            state.currentEventId = generateEventId("poison-005");
            state.currentEventType = "OrderCreated";
            state.currentProjectionName = generateProjectionName();

            await testMutation(state.t!, createTestPoisonRecord, {
              eventId: state.currentEventId,
              eventType: state.currentEventType,
              projectionName: state.currentProjectionName,
              status: "quarantined",
              attemptCount: 3,
            });
          });

          And("the projection handler would fail if called", () => {
            state.shouldFail = true;
            state.errorMessage = "Should not see this error - handler bypassed";
          });

          When("processing the event through withPoisonEventHandling", async () => {
            state.simulationResult = await testMutation(state.t!, simulateProjectionFailure, {
              eventId: state.currentEventId!,
              eventType: state.currentEventType!,
              projectionName: state.currentProjectionName!,
              maxAttempts: state.maxAttempts,
              shouldFail: state.shouldFail,
              errorMessage: state.errorMessage,
            });
          });

          Then("the underlying projection handler should NOT be called", () => {
            // If handler was called with shouldFail=true, it would have updated attemptCount
            // Since event is quarantined, handler is skipped, attemptCount stays at 3
            expect(state.simulationResult?.poisonRecord?.attemptCount).toBe(3);
          });

          And("the operation should complete without error", () => {
            expect(state.simulationResult?.threwError).toBe(false);
          });

          And("no new error should be recorded", () => {
            // Error message should not contain our new error message
            const currentError = state.simulationResult?.poisonRecord?.error ?? "";
            expect(currentError).not.toContain("Should not see this error");
          });
        }
      );
    });

    // ===========================================================================
    // Rule: Unquarantine enables reprocessing
    // ===========================================================================

    Rule("Unquarantine enables reprocessing", ({ RuleScenario }) => {
      RuleScenario("Unquarantine resets status for retry", ({ Given, When, Then, And }) => {
        Given('event "evt-poison-006" is quarantined with 3 attempts', async () => {
          state.currentEventId = generateEventId("poison-006");
          state.currentEventType = "OrderCreated";
          state.currentProjectionName = generateProjectionName();

          await testMutation(state.t!, createTestPoisonRecord, {
            eventId: state.currentEventId,
            eventType: state.currentEventType,
            projectionName: state.currentProjectionName,
            status: "quarantined",
            attemptCount: 3,
          });
        });

        When("calling unquarantine for the event", async () => {
          state.unquarantineResult = await testMutation(state.t!, testUnquarantine, {
            eventId: state.currentEventId!,
            projectionName: state.currentProjectionName!,
          });
        });

        Then('the record status should be "replayed"', async () => {
          const record = await testQuery(state.t!, getTestPoisonRecord, {
            eventId: state.currentEventId!,
            projectionName: state.currentProjectionName!,
          });
          expect(record.status).toBe("replayed");
        });

        And("the attemptCount should be reset to 0", async () => {
          const record = await testQuery(state.t!, getTestPoisonRecord, {
            eventId: state.currentEventId!,
            projectionName: state.currentProjectionName!,
          });
          expect(record.attemptCount).toBe(0);
        });

        And("the event can be processed again", async () => {
          // Process with success this time
          state.shouldFail = false;
          const result = await testMutation(state.t!, simulateProjectionFailure, {
            eventId: state.currentEventId!,
            eventType: state.currentEventType!,
            projectionName: state.currentProjectionName!,
            maxAttempts: state.maxAttempts,
            shouldFail: false,
          });
          expect(result.threwError).toBe(false);
        });
      });

      RuleScenario(
        "Unquarantine of non-quarantined event returns not_quarantined",
        ({ Given, When, Then, And }) => {
          Given('a pending poison record for event "evt-poison-007" with 1 attempt', async () => {
            state.currentEventId = generateEventId("poison-007");
            state.currentEventType = "OrderCreated";
            state.currentProjectionName = generateProjectionName();

            await testMutation(state.t!, createTestPoisonRecord, {
              eventId: state.currentEventId,
              eventType: state.currentEventType,
              projectionName: state.currentProjectionName,
              status: "pending",
              attemptCount: 1,
            });
          });

          When("calling unquarantine for the event", async () => {
            state.unquarantineResult = await testMutation(state.t!, testUnquarantine, {
              eventId: state.currentEventId!,
              projectionName: state.currentProjectionName!,
            });
          });

          Then('the result should be "not_quarantined"', () => {
            expect(state.unquarantineResult?.status).toBe("not_quarantined");
          });

          And("the record should remain unchanged", async () => {
            const record = await testQuery(state.t!, getTestPoisonRecord, {
              eventId: state.currentEventId!,
              projectionName: state.currentProjectionName!,
            });
            expect(record.status).toBe("pending");
            expect(record.attemptCount).toBe(1);
          });
        }
      );
    });

    // ===========================================================================
    // Rule: Stats provide visibility into poison events
    // ===========================================================================

    Rule("Stats provide visibility into poison events", ({ RuleScenario }) => {
      RuleScenario(
        "Stats show quarantined event counts by projection",
        ({ Given, And, When, Then }) => {
          let orderSummaryProjection: string;
          let inventoryViewProjection: string;
          let eventA: string;
          let eventB: string;
          let eventC: string;

          Given(
            'events "evt-p-a" and "evt-p-b" are quarantined for projection "orderSummary"',
            async () => {
              orderSummaryProjection = generateProjectionName();
              eventA = generateEventId("stats-a");
              eventB = generateEventId("stats-b");

              await testMutation(state.t!, createTestPoisonRecord, {
                eventId: eventA,
                eventType: "OrderCreated",
                projectionName: orderSummaryProjection,
                status: "quarantined",
                attemptCount: 3,
              });

              await testMutation(state.t!, createTestPoisonRecord, {
                eventId: eventB,
                eventType: "OrderCreated",
                projectionName: orderSummaryProjection,
                status: "quarantined",
                attemptCount: 3,
              });
            }
          );

          And('event "evt-p-c" is quarantined for projection "inventoryView"', async () => {
            inventoryViewProjection = generateProjectionName();
            eventC = generateEventId("stats-c");

            await testMutation(state.t!, createTestPoisonRecord, {
              eventId: eventC,
              eventType: "InventoryAdjusted",
              projectionName: inventoryViewProjection,
              status: "quarantined",
              attemptCount: 3,
            });
          });

          When("querying poison event stats", async () => {
            state.poisonStats = await testQuery(state.t!, getPoisonStats, {});
          });

          Then("totalQuarantined should be 3", () => {
            // Note: there may be more from previous tests due to namespace isolation
            // We just verify these 3 exist
            expect(state.poisonStats?.totalQuarantined).toBeGreaterThanOrEqual(3);
          });

          And('byProjection should show 2 for "orderSummary"', () => {
            expect(state.poisonStats?.byProjection[orderSummaryProjection]).toBe(2);
          });

          And('byProjection should show 1 for "inventoryView"', () => {
            expect(state.poisonStats?.byProjection[inventoryViewProjection]).toBe(1);
          });
        }
      );
    });
  }
);
