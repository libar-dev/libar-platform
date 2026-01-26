/**
 * Step Definitions for FSM State Transitions Feature
 *
 * Reference implementation for PDR-003 behavior feature step definitions.
 *
 * This is a Layer 0 package (pure TypeScript, no Convex dependencies),
 * so tests run without any backend - just pure function testing.
 *
 * @libar-docs-fsm
 * @libar-docs-pattern FSMTransitions
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import {
  defineFSM,
  canTransition,
  assertTransition,
  FSMTransitionError,
  type FSM,
} from "../../src/index.js";

// ============================================================================
// Test Types
// ============================================================================

type TestStatus = "draft" | "submitted" | "confirmed" | "cancelled";

// ============================================================================
// Test State
// ============================================================================

interface ScenarioState {
  fsm: FSM<TestStatus> | null;
  lastResult: boolean | string[] | null;
  lastError: Error | null;
  currentState: TestStatus;
}

let state: ScenarioState | null = null;

function initState(): ScenarioState {
  return {
    fsm: null,
    lastResult: null,
    lastError: null,
    currentState: "draft",
  };
}

// ============================================================================
// Feature Tests
// ============================================================================

const feature = await loadFeature("tests/features/behavior/fsm-transitions.feature");

describeFeature(feature, ({ Scenario, ScenarioOutline, Background, AfterEachScenario }) => {
  AfterEachScenario(() => {
    state = null;
  });

  // ==========================================================================
  // Background
  // ==========================================================================

  Background(({ Given, And }) => {
    Given("a test FSM with states: draft, submitted, confirmed, cancelled", async () => {
      state = initState();
    });

    And("initial state is {string}", async (_ctx: unknown, initialState: string) => {
      state!.currentState = initialState as TestStatus;
    });

    And(
      "transitions are defined as:",
      async (_ctx: unknown, table: Array<{ from: string; allowedTo: string }>) => {
        const transitions: Record<TestStatus, TestStatus[]> = {
          draft: [],
          submitted: [],
          confirmed: [],
          cancelled: [],
        };

        for (const row of table) {
          const from = row.from as TestStatus;
          const allowedTo = row.allowedTo
            .split(",")
            .map((s: string) => s.trim())
            .filter((s: string) => s.length > 0 && s !== "(terminal)") as TestStatus[];
          transitions[from] = allowedTo;
        }

        state!.fsm = defineFSM<TestStatus>({
          initial: state!.currentState,
          transitions,
        });
      }
    );
  });

  // ==========================================================================
  // FSM Definition Scenarios
  // ==========================================================================

  Scenario("FSM is created with correct initial state", ({ When, Then, And }) => {
    When("the FSM is defined", async () => {
      expect(state!.fsm).not.toBeNull();
    });

    Then("the initial state should be {string}", async (_ctx: unknown, expected: string) => {
      expect(state!.fsm!.initial).toBe(expected);
    });

    And("the FSM definition should be accessible", async () => {
      expect(state!.fsm!.definition).toBeDefined();
      expect(state!.fsm!.definition.initial).toBe(state!.currentState);
      expect(state!.fsm!.definition.transitions).toBeDefined();
    });
  });

  // ==========================================================================
  // Valid Transitions Scenarios
  // ==========================================================================

  ScenarioOutline(
    "Valid transitions are allowed",
    ({ When, Then }, variables: { from: string; to: string }) => {
      When('checking if transition from "<from>" to "<to>" is valid', async () => {
        state!.lastResult = state!.fsm!.canTransition(
          variables.from as TestStatus,
          variables.to as TestStatus
        );
        state!.lastError = null;
      });

      Then("canTransition should return true", async () => {
        expect(state!.lastResult).toBe(true);
      });
    }
  );

  ScenarioOutline(
    "assertTransition does not throw for valid transitions",
    ({ When, Then }, variables: { from: string; to: string }) => {
      When('asserting transition from "<from>" to "<to>"', async () => {
        state!.lastError = null;
        try {
          state!.fsm!.assertTransition(variables.from as TestStatus, variables.to as TestStatus);
        } catch (error) {
          state!.lastError = error as Error;
        }
      });

      Then("no error should be thrown", async () => {
        expect(state!.lastError).toBeNull();
      });
    }
  );

  // ==========================================================================
  // Invalid Transitions Scenarios
  // ==========================================================================

  ScenarioOutline(
    "Invalid transitions are detected",
    ({ When, Then }, variables: { from: string; to: string }) => {
      When('checking if transition from "<from>" to "<to>" is valid', async () => {
        state!.lastResult = state!.fsm!.canTransition(
          variables.from as TestStatus,
          variables.to as TestStatus
        );
        state!.lastError = null;
      });

      Then("canTransition should return false", async () => {
        expect(state!.lastResult).toBe(false);
      });
    }
  );

  Scenario(
    "assertTransition throws FSMTransitionError for invalid transitions",
    ({ When, Then, And }) => {
      When(
        "asserting transition from {string} to {string}",
        async (_ctx: unknown, from: string, to: string) => {
          state!.lastError = null;
          try {
            state!.fsm!.assertTransition(from as TestStatus, to as TestStatus);
          } catch (error) {
            state!.lastError = error as Error;
          }
        }
      );

      Then("an FSMTransitionError should be thrown", async () => {
        expect(state!.lastError).toBeInstanceOf(FSMTransitionError);
      });

      And("the error should have from state {string}", async (_ctx: unknown, expected: string) => {
        expect((state!.lastError as FSMTransitionError).from).toBe(expected);
      });

      And("the error should have to state {string}", async (_ctx: unknown, expected: string) => {
        expect((state!.lastError as FSMTransitionError).to).toBe(expected);
      });

      And(
        "the error should have valid transitions {string}",
        async (_ctx: unknown, expected: string) => {
          const expectedTransitions = expected.split(",").map((s) => s.trim());
          expect((state!.lastError as FSMTransitionError).validTransitions).toEqual(
            expectedTransitions
          );
        }
      );

      And("the error code should be {string}", async (_ctx: unknown, expected: string) => {
        expect((state!.lastError as FSMTransitionError).code).toBe(expected);
      });
    }
  );

  // ==========================================================================
  // Terminal States Scenarios
  // ==========================================================================

  ScenarioOutline(
    "Terminal states are correctly identified",
    ({ When, Then }, variables: { state: string; expected: string }) => {
      When('checking if "<state>" is terminal', async () => {
        state!.lastResult = state!.fsm!.isTerminal(variables.state as TestStatus);
      });

      Then('isTerminal should return "<expected>"', async () => {
        const expectedBool = variables.expected === "true";
        expect(state!.lastResult).toBe(expectedBool);
      });
    }
  );

  Scenario(
    "Terminal state error message indicates no valid transitions",
    ({ Given, When, Then, And }) => {
      Given("the FSM is in state {string}", async (_ctx: unknown, currentState: string) => {
        state!.currentState = currentState as TestStatus;
      });

      When(
        "asserting transition from {string} to {string}",
        async (_ctx: unknown, from: string, to: string) => {
          state!.lastError = null;
          try {
            state!.fsm!.assertTransition(from as TestStatus, to as TestStatus);
          } catch (error) {
            state!.lastError = error as Error;
          }
        }
      );

      Then("an FSMTransitionError should be thrown", async () => {
        expect(state!.lastError).toBeInstanceOf(FSMTransitionError);
      });

      And("the error message should contain {string}", async (_ctx: unknown, expected: string) => {
        expect(state!.lastError!.message).toContain(expected);
      });
    }
  );

  // ==========================================================================
  // State Validation Scenarios
  // ==========================================================================

  ScenarioOutline(
    "State validity is correctly checked",
    ({ When, Then }, variables: { state: string; expected: string }) => {
      When('checking if "<state>" is a valid state', async () => {
        state!.lastResult = state!.fsm!.isValidState(variables.state);
      });

      Then('isValidState should return "<expected>"', async () => {
        const expectedBool = variables.expected === "true";
        expect(state!.lastResult).toBe(expectedBool);
      });
    }
  );

  // ==========================================================================
  // Valid Transitions Query Scenarios
  // ==========================================================================

  ScenarioOutline(
    "Valid transitions can be queried for any state",
    ({ When, Then }, variables: { state: string; expected: string }) => {
      When('querying valid transitions from "<state>"', async () => {
        state!.lastResult = state!.fsm!.validTransitions(variables.state as TestStatus);
      });

      Then('the result should be "<expected>"', async () => {
        if (variables.expected === "empty") {
          expect(state!.lastResult).toEqual([]);
        } else {
          const expectedTransitions = variables.expected.split(",").map((s) => s.trim());
          expect(state!.lastResult).toEqual(expectedTransitions);
        }
      });
    }
  );

  // ==========================================================================
  // Standalone Functions Scenarios
  // ==========================================================================

  ScenarioOutline(
    "Standalone functions work identically to FSM methods",
    ({ Given, When, Then }, variables: { from: string; to: string; expected: string }) => {
      Given("the standalone canTransition function", async () => {
        expect(canTransition).toBeDefined();
      });

      When('checking "<from>" to "<to>" with standalone function', async () => {
        state!.lastResult = canTransition(
          state!.fsm!,
          variables.from as TestStatus,
          variables.to as TestStatus
        );
      });

      Then('the result should be "<expected>"', async () => {
        const expectedBool = variables.expected === "true";
        expect(state!.lastResult).toBe(expectedBool);
      });
    }
  );

  Scenario("Standalone assertTransition throws same errors", ({ Given, When, Then }) => {
    Given("the standalone assertTransition function", async () => {
      expect(assertTransition).toBeDefined();
    });

    When(
      "asserting {string} to {string} with standalone function",
      async (_ctx: unknown, from: string, to: string) => {
        state!.lastError = null;
        try {
          assertTransition(state!.fsm!, from as TestStatus, to as TestStatus);
        } catch (error) {
          state!.lastError = error as Error;
        }
      }
    );

    Then("an FSMTransitionError should be thrown", async () => {
      expect(state!.lastError).toBeInstanceOf(FSMTransitionError);
    });
  });
});
