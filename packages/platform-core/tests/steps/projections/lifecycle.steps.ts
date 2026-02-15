/**
 * Projection Lifecycle State Machine - Step Definitions
 *
 * BDD step definitions for projection lifecycle behavior:
 * - isValidTransition: allowed/rejected transition checks per state
 * - transitionState: valid transitions return target, invalid return null
 * - getValidEventsFrom: event listing per state
 * - getAllTransitions: full transition list with structure
 * - assertValidTransition: throw/no-throw with projection name
 * - State machine completeness: reachability and outgoing checks
 * - Typical workflows: multi-step operational sequences
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import {
  isValidTransition,
  transitionState,
  getValidEventsFrom,
  getAllTransitions,
  assertValidTransition,
  type ProjectionLifecycleState,
} from "../../../src/projections/lifecycle";
import { extractDataTable } from "../_helpers/data-table.js";

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  currentState: ProjectionLifecycleState;
  checkedState: ProjectionLifecycleState | null;
  validEvents: string[];
  transitions: ReturnType<typeof getAllTransitions> | null;
  transitions2: ReturnType<typeof getAllTransitions> | null;
  resultState: ProjectionLifecycleState | null;
}

function createInitialState(): TestState {
  return {
    currentState: "active",
    checkedState: null,
    validEvents: [],
    transitions: null,
    transitions2: null,
    resultState: null,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature
// =============================================================================

const feature = await loadFeature("tests/features/behavior/projections/lifecycle.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  // ==========================================================================
  // Rule: isValidTransition
  // ==========================================================================

  Rule(
    "isValidTransition returns true for allowed transitions and false for disallowed",
    ({ RuleScenario }) => {
      RuleScenario("Allowed transitions from active state", ({ When, Then }) => {
        When('I check valid transitions from "active"', () => {
          state.checkedState = "active";
        });

        Then("the following transitions are allowed:", (...args: unknown[]) => {
          const rows = extractDataTable<{ event: string }>(...args);
          for (const row of rows) {
            expect(isValidTransition(state.checkedState!, row.event as string)).toBe(true);
          }
        });
      });

      RuleScenario("Rejected transitions from active state", ({ When, Then }) => {
        When('I check valid transitions from "active"', () => {
          state.checkedState = "active";
        });

        Then("the following transitions are rejected:", (...args: unknown[]) => {
          const rows = extractDataTable<{ event: string }>(...args);
          for (const row of rows) {
            expect(isValidTransition(state.checkedState!, row.event as string)).toBe(false);
          }
        });
      });

      RuleScenario("Allowed transitions from rebuilding state", ({ When, Then }) => {
        When('I check valid transitions from "rebuilding"', () => {
          state.checkedState = "rebuilding";
        });

        Then("the following transitions are allowed:", (...args: unknown[]) => {
          const rows = extractDataTable<{ event: string }>(...args);
          for (const row of rows) {
            expect(isValidTransition(state.checkedState!, row.event as string)).toBe(true);
          }
        });
      });

      RuleScenario("Rejected transitions from rebuilding state", ({ When, Then }) => {
        When('I check valid transitions from "rebuilding"', () => {
          state.checkedState = "rebuilding";
        });

        Then("the following transitions are rejected:", (...args: unknown[]) => {
          const rows = extractDataTable<{ event: string }>(...args);
          for (const row of rows) {
            expect(isValidTransition(state.checkedState!, row.event as string)).toBe(false);
          }
        });
      });

      RuleScenario("Allowed transitions from paused state", ({ When, Then }) => {
        When('I check valid transitions from "paused"', () => {
          state.checkedState = "paused";
        });

        Then("the following transitions are allowed:", (...args: unknown[]) => {
          const rows = extractDataTable<{ event: string }>(...args);
          for (const row of rows) {
            expect(isValidTransition(state.checkedState!, row.event as string)).toBe(true);
          }
        });
      });

      RuleScenario("Rejected transitions from paused state", ({ When, Then }) => {
        When('I check valid transitions from "paused"', () => {
          state.checkedState = "paused";
        });

        Then("the following transitions are rejected:", (...args: unknown[]) => {
          const rows = extractDataTable<{ event: string }>(...args);
          for (const row of rows) {
            expect(isValidTransition(state.checkedState!, row.event as string)).toBe(false);
          }
        });
      });

      RuleScenario("Allowed transitions from error state", ({ When, Then }) => {
        When('I check valid transitions from "error"', () => {
          state.checkedState = "error";
        });

        Then("the following transitions are allowed:", (...args: unknown[]) => {
          const rows = extractDataTable<{ event: string }>(...args);
          for (const row of rows) {
            expect(isValidTransition(state.checkedState!, row.event as string)).toBe(true);
          }
        });
      });

      RuleScenario("Rejected transitions from error state", ({ When, Then }) => {
        When('I check valid transitions from "error"', () => {
          state.checkedState = "error";
        });

        Then("the following transitions are rejected:", (...args: unknown[]) => {
          const rows = extractDataTable<{ event: string }>(...args);
          for (const row of rows) {
            expect(isValidTransition(state.checkedState!, row.event as string)).toBe(false);
          }
        });
      });
    }
  );

  // ==========================================================================
  // Rule: transitionState
  // ==========================================================================

  Rule(
    "transitionState returns the target state for valid transitions and null for invalid",
    ({ RuleScenario }) => {
      RuleScenario("Valid transitions produce correct target states", ({ Then }) => {
        Then("transitionState returns correct targets for:", (...args: unknown[]) => {
          const rows = extractDataTable<{ from: string; event: string; expected: string }>(...args);
          for (const row of rows) {
            expect(transitionState(row.from as ProjectionLifecycleState, row.event as string)).toBe(
              row.expected
            );
          }
        });
      });

      RuleScenario("Invalid transitions return null", ({ Then }) => {
        Then("transitionState returns null for:", (...args: unknown[]) => {
          const rows = extractDataTable<{ from: string; event: string }>(...args);
          for (const row of rows) {
            expect(
              transitionState(row.from as ProjectionLifecycleState, row.event as string)
            ).toBeNull();
          }
        });
      });
    }
  );

  // ==========================================================================
  // Rule: getValidEventsFrom
  // ==========================================================================

  Rule(
    "getValidEventsFrom returns the set of allowed events for each state",
    ({ RuleScenario }) => {
      RuleScenario("Valid events from active state", ({ When, Then, And }) => {
        When('I get valid events from "active"', () => {
          state.validEvents = getValidEventsFrom("active");
        });

        Then("the valid events are:", (...args: unknown[]) => {
          const rows = extractDataTable<{ event: string }>(...args);
          for (const row of rows) {
            expect(state.validEvents).toContain(row.event);
          }
        });

        And("the event count is 3", () => {
          expect(state.validEvents).toHaveLength(3);
        });
      });

      RuleScenario("Valid events from rebuilding state", ({ When, Then, And }) => {
        When('I get valid events from "rebuilding"', () => {
          state.validEvents = getValidEventsFrom("rebuilding");
        });

        Then("the valid events are:", (...args: unknown[]) => {
          const rows = extractDataTable<{ event: string }>(...args);
          for (const row of rows) {
            expect(state.validEvents).toContain(row.event);
          }
        });

        And("the event count is 2", () => {
          expect(state.validEvents).toHaveLength(2);
        });
      });

      RuleScenario("Valid events from paused state", ({ When, Then, And }) => {
        When('I get valid events from "paused"', () => {
          state.validEvents = getValidEventsFrom("paused");
        });

        Then("the valid events are:", (...args: unknown[]) => {
          const rows = extractDataTable<{ event: string }>(...args);
          for (const row of rows) {
            expect(state.validEvents).toContain(row.event);
          }
        });

        And("the event count is 3", () => {
          expect(state.validEvents).toHaveLength(3);
        });
      });

      RuleScenario("Valid events from error state", ({ When, Then, And }) => {
        When('I get valid events from "error"', () => {
          state.validEvents = getValidEventsFrom("error");
        });

        Then("the valid events are:", (...args: unknown[]) => {
          const rows = extractDataTable<{ event: string }>(...args);
          for (const row of rows) {
            expect(state.validEvents).toContain(row.event);
          }
        });

        And("the event count is 2", () => {
          expect(state.validEvents).toHaveLength(2);
        });
      });
    }
  );

  // ==========================================================================
  // Rule: getAllTransitions
  // ==========================================================================

  Rule(
    "getAllTransitions returns all valid transitions in the state machine",
    ({ RuleScenario }) => {
      RuleScenario(
        "Returns all 10 valid transitions with correct structure",
        ({ When, Then, And }) => {
          When("I get all transitions", () => {
            state.transitions = getAllTransitions();
          });

          Then("the transition count is 10", () => {
            expect(state.transitions!.length).toBe(10);
          });

          And('each transition has "from", "event", and "to" properties', () => {
            state.transitions!.forEach((t) => {
              expect(t).toHaveProperty("from");
              expect(t).toHaveProperty("event");
              expect(t).toHaveProperty("to");
            });
          });
        }
      );

      RuleScenario("All expected transitions are included", ({ When, Then }) => {
        When("I get all transitions", () => {
          state.transitions = getAllTransitions();
        });

        Then("the transition list includes:", (...args: unknown[]) => {
          const rows = extractDataTable<{ from: string; event: string; to: string }>(...args);
          const transitionStrings = state.transitions!.map((t) => `${t.from}->${t.event}->${t.to}`);
          for (const row of rows) {
            expect(transitionStrings).toContain(`${row.from}->${row.event}->${row.to}`);
          }
        });
      });

      RuleScenario("Returns same array reference (memoized)", ({ When, Then }) => {
        When("I get all transitions twice", () => {
          state.transitions = getAllTransitions();
          state.transitions2 = getAllTransitions();
        });

        Then("both references are the same object", () => {
          expect(state.transitions).toBe(state.transitions2);
        });
      });
    }
  );

  // ==========================================================================
  // Rule: assertValidTransition
  // ==========================================================================

  Rule(
    "assertValidTransition returns new state or throws with projection name",
    ({ RuleScenario }) => {
      RuleScenario("Returns new state for valid transition", ({ When, Then }) => {
        When(
          'I assert valid transition from "active" with "START_REBUILD" for "orderSummary"',
          () => {
            state.resultState = assertValidTransition("active", "START_REBUILD", "orderSummary");
          }
        );

        Then('the result state is "rebuilding"', () => {
          expect(state.resultState).toBe("rebuilding");
        });
      });

      RuleScenario("Throws for invalid transition with projection name", ({ Then }) => {
        Then("assertValidTransition throws for:", (...args: unknown[]) => {
          const rows = extractDataTable<{
            from: string;
            event: string;
            projection: string;
            message: string;
          }>(...args);
          for (const row of rows) {
            expect(() => {
              assertValidTransition(
                row.from as ProjectionLifecycleState,
                row.event,
                row.projection
              );
            }).toThrow(row.message);
          }
        });
      });
    }
  );

  // ==========================================================================
  // Rule: State Machine Completeness
  // ==========================================================================

  Rule(
    "The state machine is complete — all states are reachable and can transition out",
    ({ RuleScenario }) => {
      RuleScenario("All states are reachable from at least one other state", ({ When, Then }) => {
        When("I get all transitions", () => {
          state.transitions = getAllTransitions();
        });

        Then("every state is a target of at least one transition:", (...args: unknown[]) => {
          const rows = extractDataTable<{ state: string }>(...args);
          const reachableStates = new Set(state.transitions!.map((t) => t.to));
          for (const row of rows) {
            expect(reachableStates.has(row.state as ProjectionLifecycleState)).toBe(true);
          }
        });
      });

      RuleScenario("All states have at least one outgoing transition", ({ Then }) => {
        Then("every state has at least one valid event:", (...args: unknown[]) => {
          const rows = extractDataTable<{ state: string }>(...args);
          for (const row of rows) {
            const validEvents = getValidEventsFrom(row.state as ProjectionLifecycleState);
            expect(validEvents.length).toBeGreaterThan(0);
          }
        });
      });

      RuleScenario("Recovery path exists from error to active", ({ When, Then }) => {
        When('I transition from "error" with "RECOVER"', () => {
          state.resultState = transitionState("error", "RECOVER");
        });

        Then('the result state is "active"', () => {
          expect(state.resultState).toBe("active");
        });
      });

      RuleScenario("Error path exists from active", ({ When, Then }) => {
        When('I transition from "active" with "FAIL"', () => {
          state.resultState = transitionState("active", "FAIL");
        });

        Then('the result state is "error"', () => {
          expect(state.resultState).toBe("error");
        });
      });

      RuleScenario("Rebuild retry path exists from error", ({ When, Then }) => {
        When('I transition from "error" with "START_REBUILD"', () => {
          state.resultState = transitionState("error", "START_REBUILD");
        });

        Then('the result state is "rebuilding"', () => {
          expect(state.resultState).toBe("rebuilding");
        });
      });
    }
  );

  // ==========================================================================
  // Rule: Typical Workflows
  // ==========================================================================

  Rule("Typical multi-step workflows complete successfully", ({ RuleScenario }) => {
    RuleScenario("Normal processing — active state allows FAIL event", ({ Given, Then }) => {
      Given('the projection is in "active" state', () => {
        state.currentState = "active";
      });

      Then('the valid events include "FAIL"', () => {
        expect(getValidEventsFrom(state.currentState)).toContain("FAIL");
      });
    });

    RuleScenario("Rebuild workflow — active to rebuilding to active", ({ Given, When, Then }) => {
      Given('the projection is in "active" state', () => {
        state.currentState = "active";
      });

      When('I apply event "START_REBUILD"', () => {
        state.currentState = transitionState(state.currentState, "START_REBUILD")!;
      });

      Then('the current state is "rebuilding"', () => {
        expect(state.currentState).toBe("rebuilding");
      });

      When('I apply event "COMPLETE_REBUILD"', () => {
        state.currentState = transitionState(state.currentState, "COMPLETE_REBUILD")!;
      });

      Then('the current state is "active"', () => {
        expect(state.currentState).toBe("active");
      });
    });

    RuleScenario("Error recovery workflow — active to error to active", ({ Given, When, Then }) => {
      Given('the projection is in "active" state', () => {
        state.currentState = "active";
      });

      When('I apply event "FAIL"', () => {
        state.currentState = transitionState(state.currentState, "FAIL")!;
      });

      Then('the current state is "error"', () => {
        expect(state.currentState).toBe("error");
      });

      When('I apply event "RECOVER"', () => {
        state.currentState = transitionState(state.currentState, "RECOVER")!;
      });

      Then('the current state is "active"', () => {
        expect(state.currentState).toBe("active");
      });
    });

    RuleScenario(
      "Error rebuild workflow — active to error to rebuilding to active",
      ({ Given, When, Then }) => {
        Given('the projection is in "active" state', () => {
          state.currentState = "active";
        });

        When('I apply event "FAIL"', () => {
          state.currentState = transitionState(state.currentState, "FAIL")!;
        });

        Then('the current state is "error"', () => {
          expect(state.currentState).toBe("error");
        });

        When('I apply event "START_REBUILD"', () => {
          state.currentState = transitionState(state.currentState, "START_REBUILD")!;
        });

        Then('the current state is "rebuilding"', () => {
          expect(state.currentState).toBe("rebuilding");
        });

        When('I apply event "COMPLETE_REBUILD"', () => {
          state.currentState = transitionState(state.currentState, "COMPLETE_REBUILD")!;
        });

        Then('the current state is "active"', () => {
          expect(state.currentState).toBe("active");
        });
      }
    );

    RuleScenario(
      "Pause and resume workflow — active to paused to active",
      ({ Given, When, Then }) => {
        Given('the projection is in "active" state', () => {
          state.currentState = "active";
        });

        When('I apply event "PAUSE"', () => {
          state.currentState = transitionState(state.currentState, "PAUSE")!;
        });

        Then('the current state is "paused"', () => {
          expect(state.currentState).toBe("paused");
        });

        When('I apply event "RESUME"', () => {
          state.currentState = transitionState(state.currentState, "RESUME")!;
        });

        Then('the current state is "active"', () => {
          expect(state.currentState).toBe("active");
        });
      }
    );

    RuleScenario(
      "Rebuild failure workflow — active to rebuilding to error to active",
      ({ Given, When, Then }) => {
        Given('the projection is in "active" state', () => {
          state.currentState = "active";
        });

        When('I apply event "START_REBUILD"', () => {
          state.currentState = transitionState(state.currentState, "START_REBUILD")!;
        });

        Then('the current state is "rebuilding"', () => {
          expect(state.currentState).toBe("rebuilding");
        });

        When('I apply event "FAIL"', () => {
          state.currentState = transitionState(state.currentState, "FAIL")!;
        });

        Then('the current state is "error"', () => {
          expect(state.currentState).toBe("error");
        });

        When('I apply event "RECOVER"', () => {
          state.currentState = transitionState(state.currentState, "RECOVER")!;
        });

        Then('the current state is "active"', () => {
          expect(state.currentState).toBe("active");
        });
      }
    );

    RuleScenario(
      "Paused rebuild workflow — active to paused to rebuilding to active",
      ({ Given, When, Then }) => {
        Given('the projection is in "active" state', () => {
          state.currentState = "active";
        });

        When('I apply event "PAUSE"', () => {
          state.currentState = transitionState(state.currentState, "PAUSE")!;
        });

        Then('the current state is "paused"', () => {
          expect(state.currentState).toBe("paused");
        });

        When('I apply event "START_REBUILD"', () => {
          state.currentState = transitionState(state.currentState, "START_REBUILD")!;
        });

        Then('the current state is "rebuilding"', () => {
          expect(state.currentState).toBe("rebuilding");
        });

        When('I apply event "COMPLETE_REBUILD"', () => {
          state.currentState = transitionState(state.currentState, "COMPLETE_REBUILD")!;
        });

        Then('the current state is "active"', () => {
          expect(state.currentState).toBe("active");
        });
      }
    );

    RuleScenario(
      "Paused error workflow — active to paused to error to active",
      ({ Given, When, Then }) => {
        Given('the projection is in "active" state', () => {
          state.currentState = "active";
        });

        When('I apply event "PAUSE"', () => {
          state.currentState = transitionState(state.currentState, "PAUSE")!;
        });

        Then('the current state is "paused"', () => {
          expect(state.currentState).toBe("paused");
        });

        When('I apply event "FAIL"', () => {
          state.currentState = transitionState(state.currentState, "FAIL")!;
        });

        Then('the current state is "error"', () => {
          expect(state.currentState).toBe("error");
        });

        When('I apply event "RECOVER"', () => {
          state.currentState = transitionState(state.currentState, "RECOVER")!;
        });

        Then('the current state is "active"', () => {
          expect(state.currentState).toBe("active");
        });
      }
    );
  });
});
