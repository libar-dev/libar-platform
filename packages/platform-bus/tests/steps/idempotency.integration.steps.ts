/**
 * Step Definitions for Command Bus Idempotency Feature
 *
 * Reference implementation for PDR-003 behavior feature step definitions.
 *
 * This is an INTEGRATION test that requires a real Convex backend.
 * Run via justfile which handles CONVEX_URL and backend lifecycle:
 *
 *   just test-infrastructure          # Full cycle on port 3210
 *   just test-infrastructure-isolated # Full cycle on port 3215 (parallel safe)
 *
 * @libar-docs-command
 * @libar-docs-pattern CommandBusIdempotency
 */

import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { ConvexTestingHelper } from "convex-helpers/testing";
import { api } from "../../../../../examples/order-management/convex/_generated/api";
import {
  testRunId,
  generateCommandId,
  generateCorrelationId,
  testMutation,
  testQuery,
} from "../support/helpers";

// ============================================================================
// Types
// ============================================================================

/**
 * Response from recordCommand mutation.
 */
type RecordCommandResult =
  | { status: "new" }
  | {
      status: "duplicate";
      commandStatus: "pending" | "executed" | "rejected" | "failed";
      result?: unknown;
    };

/**
 * State shared across steps within a scenario.
 */
interface ScenarioState {
  t: ConvexTestingHelper;
  currentCommand: {
    id: string;
    type: string;
    context: string;
    correlationId: string;
  } | null;
  lastResult: RecordCommandResult | null;
  lastError: Error | null;
  // For concurrent test
  concurrentResults: RecordCommandResult[];
  concurrentCommandId: string | null;
}

let state: ScenarioState | null = null;

function initState(): ScenarioState {
  const backendUrl = process.env.CONVEX_URL;
  if (!backendUrl) {
    throw new Error(
      "CONVEX_URL environment variable must be set. " + "Run tests via: just test-infrastructure"
    );
  }
  const t = new ConvexTestingHelper({ backendUrl });

  return {
    t,
    currentCommand: null,
    lastResult: null,
    lastError: null,
    concurrentResults: [],
    concurrentCommandId: null,
  };
}

// ============================================================================
// Feature Tests
// ============================================================================

const feature = await loadFeature("tests/features/behavior/idempotency.feature");

describeFeature(feature, ({ Scenario, Background, AfterEachScenario }) => {
  AfterEachScenario(async () => {
    if (state?.t) {
      try {
        // Use Promise.race to add a timeout for cleanup
        // This prevents hanging if the WebSocket connection failed
        await Promise.race([
          state.t.close(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Cleanup timeout")), 5000)),
        ]);
      } catch {
        // Ignore cleanup errors - connection may have failed
      }
    }
    state = null;
  });

  // ==========================================================================
  // Background
  // ==========================================================================

  Background(({ Given, And }) => {
    Given("the command bus component is available", async () => {
      state = initState();
      // Verify we can connect by making a simple query
      // The component is available if we can query it without error
    });

    And("the test uses isolated command IDs", async () => {
      // testRunId is used automatically in generateCommandId()
      // This step documents the isolation strategy
      expect(testRunId).toBeDefined();
    });
  });

  // ==========================================================================
  // Scenario: First command submission is recorded
  // ==========================================================================

  Scenario("First command submission is recorded", ({ Given, And, When, Then }) => {
    Given("a new command with unique id", async () => {
      state!.currentCommand = {
        id: generateCommandId("first"),
        type: "TestCommand",
        context: "test",
        correlationId: generateCorrelationId(),
      };
    });

    And("command type {string}", async (_ctx: unknown, commandType: string) => {
      state!.currentCommand!.type = commandType;
    });

    And("target context {string}", async (_ctx: unknown, targetContext: string) => {
      state!.currentCommand!.context = targetContext;
    });

    When("the command is submitted to the command bus", async () => {
      try {
        state!.lastResult = (await testMutation(state!.t, api.testingFunctions.recordCommand, {
          commandId: state!.currentCommand!.id,
          commandType: state!.currentCommand!.type,
          targetContext: state!.currentCommand!.context,
          payload: { test: true },
          metadata: {
            correlationId: state!.currentCommand!.correlationId,
            timestamp: Date.now(),
          },
        })) as RecordCommandResult;
        state!.lastError = null;
      } catch (error) {
        state!.lastError = error as Error;
        state!.lastResult = null;
      }
    });

    Then("the response status should be {string}", async (_ctx: unknown, expected: string) => {
      expect(state!.lastError).toBeNull();
      expect(state!.lastResult).not.toBeNull();
      expect(state!.lastResult!.status).toBe(expected);
    });

    And("the command should be queryable by its id", async () => {
      const queryResult = await testQuery(state!.t, api.testingFunctions.getCommandStatus, {
        commandId: state!.currentCommand!.id,
      });
      expect(queryResult).not.toBeNull();
      expect(queryResult!.commandId).toBe(state!.currentCommand!.id);
      expect(queryResult!.status).toBe("pending");
    });
  });

  // ==========================================================================
  // Scenario: Duplicate command returns existing status when completed
  // ==========================================================================

  Scenario(
    "Duplicate command returns existing status when completed",
    ({ Given, When, Then, And }) => {
      Given("a command was previously submitted and executed", async () => {
        const commandId = generateCommandId("completed");
        const correlationId = generateCorrelationId();

        // Submit the command
        await testMutation(state!.t, api.testingFunctions.recordCommand, {
          commandId,
          commandType: "TestCommand",
          targetContext: "test",
          payload: { test: true },
          metadata: {
            correlationId,
            timestamp: Date.now(),
          },
        });

        // Mark it as executed
        await testMutation(state!.t, api.testingFunctions.updateCommandResult, {
          commandId,
          status: "executed",
          result: { success: true },
        });

        state!.currentCommand = {
          id: commandId,
          type: "TestCommand",
          context: "test",
          correlationId,
        };
      });

      When("a duplicate command with the same id is submitted", async () => {
        try {
          state!.lastResult = (await testMutation(state!.t, api.testingFunctions.recordCommand, {
            commandId: state!.currentCommand!.id,
            commandType: state!.currentCommand!.type,
            targetContext: state!.currentCommand!.context,
            payload: { test: true },
            metadata: {
              correlationId: generateCorrelationId(),
              timestamp: Date.now(),
            },
          })) as RecordCommandResult;
          state!.lastError = null;
        } catch (error) {
          state!.lastError = error as Error;
          state!.lastResult = null;
        }
      });

      Then("the response status should be {string}", async (_ctx: unknown, expected: string) => {
        expect(state!.lastError).toBeNull();
        expect(state!.lastResult).not.toBeNull();
        expect(state!.lastResult!.status).toBe(expected);
      });

      And(
        "the response should include command status {string}",
        async (_ctx: unknown, expectedCommandStatus: string) => {
          expect(state!.lastResult!.status).toBe("duplicate");
          if (state!.lastResult!.status === "duplicate") {
            expect(state!.lastResult!.commandStatus).toBe(expectedCommandStatus);
          }
        }
      );
    }
  );

  // ==========================================================================
  // Scenario: Duplicate command during processing returns pending status
  // ==========================================================================

  Scenario(
    "Duplicate command during processing returns pending status",
    ({ Given, When, Then, And }) => {
      Given("a command is currently pending", async () => {
        const commandId = generateCommandId("pending");
        const correlationId = generateCorrelationId();

        // Submit the command but don't update its status - it stays "pending"
        await testMutation(state!.t, api.testingFunctions.recordCommand, {
          commandId,
          commandType: "TestCommand",
          targetContext: "test",
          payload: { test: true },
          metadata: {
            correlationId,
            timestamp: Date.now(),
          },
        });

        state!.currentCommand = {
          id: commandId,
          type: "TestCommand",
          context: "test",
          correlationId,
        };
      });

      When("a duplicate command with the same id is submitted", async () => {
        try {
          state!.lastResult = (await testMutation(state!.t, api.testingFunctions.recordCommand, {
            commandId: state!.currentCommand!.id,
            commandType: state!.currentCommand!.type,
            targetContext: state!.currentCommand!.context,
            payload: { test: true },
            metadata: {
              correlationId: generateCorrelationId(),
              timestamp: Date.now(),
            },
          })) as RecordCommandResult;
          state!.lastError = null;
        } catch (error) {
          state!.lastError = error as Error;
          state!.lastResult = null;
        }
      });

      Then("the response status should be {string}", async (_ctx: unknown, expected: string) => {
        expect(state!.lastError).toBeNull();
        expect(state!.lastResult).not.toBeNull();
        expect(state!.lastResult!.status).toBe(expected);
      });

      And(
        "the response should include command status {string}",
        async (_ctx: unknown, expectedCommandStatus: string) => {
          expect(state!.lastResult!.status).toBe("duplicate");
          if (state!.lastResult!.status === "duplicate") {
            expect(state!.lastResult!.commandStatus).toBe(expectedCommandStatus);
          }
        }
      );
    }
  );

  // ==========================================================================
  // Scenario: Concurrent duplicate detection via post-insert verification
  // ==========================================================================

  Scenario(
    "Concurrent duplicate detection via post-insert verification",
    ({ Given, When, Then, And }) => {
      Given("two concurrent submissions with identical command id", async () => {
        state!.concurrentCommandId = generateCommandId("concurrent");
        state!.concurrentResults = [];
      });

      When("both requests are processed", async () => {
        const commandId = state!.concurrentCommandId!;
        const correlationId1 = generateCorrelationId();
        const correlationId2 = generateCorrelationId();

        // Submit both concurrently using Promise.all
        const [result1, result2] = await Promise.all([
          testMutation(state!.t, api.testingFunctions.recordCommand, {
            commandId,
            commandType: "ConcurrentTest",
            targetContext: "test",
            payload: { submission: 1 },
            metadata: {
              correlationId: correlationId1,
              timestamp: Date.now(),
            },
          }),
          testMutation(state!.t, api.testingFunctions.recordCommand, {
            commandId,
            commandType: "ConcurrentTest",
            targetContext: "test",
            payload: { submission: 2 },
            metadata: {
              correlationId: correlationId2,
              timestamp: Date.now(),
            },
          }),
        ]);

        state!.concurrentResults = [result1 as RecordCommandResult, result2 as RecordCommandResult];
      });

      Then("exactly one command record should exist", async () => {
        const queryResult = await testQuery(state!.t, api.testingFunctions.getCommandStatus, {
          commandId: state!.concurrentCommandId!,
        });
        expect(queryResult).not.toBeNull();
        expect(queryResult!.commandId).toBe(state!.concurrentCommandId!);
      });

      And(
        "the submissions should have one {string} and one {string} response",
        async (_ctx: unknown, first: string, second: string) => {
          const firstCount = state!.concurrentResults.filter((r) => r.status === first).length;
          const secondCount = state!.concurrentResults.filter((r) => r.status === second).length;

          // Exactly one of each status
          expect(firstCount).toBe(1);
          expect(secondCount).toBe(1);
          expect(state!.concurrentResults.length).toBe(2);
        }
      );
    }
  );
});
