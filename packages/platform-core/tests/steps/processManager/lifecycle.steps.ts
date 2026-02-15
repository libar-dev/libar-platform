/**
 * Process Manager Lifecycle State Machine - Step Definitions
 *
 * BDD step definitions for PM lifecycle behavior:
 * - isPMValidTransition: valid/invalid transition checks per state
 * - pmTransitionState: deterministic target state or null
 * - getPMValidEventsFrom: valid event set per state
 * - getAllPMTransitions: complete transition enumeration
 * - assertPMValidTransition: throw/no-throw with PM context
 * - isTerminalState: terminal state identification
 * - isErrorState: error state identification
 * - State machine completeness and typical workflows
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import {
  isPMValidTransition,
  pmTransitionState,
  getPMValidEventsFrom,
  getAllPMTransitions,
  assertPMValidTransition,
  isTerminalState,
  isErrorState,
  type ProcessManagerLifecycleState,
} from "../../../src/processManager/lifecycle";
import { extractDataTable } from "../_helpers/data-table.js";

// =============================================================================
// Test State
// =============================================================================

type PMEvent = "START" | "SUCCESS" | "FAIL" | "RETRY" | "RESET";

interface TestState {
  transitionValid: boolean | null;
  validEvents: PMEvent[] | null;
  allTransitions: ReturnType<typeof getAllPMTransitions> | null;
  allTransitions2: ReturnType<typeof getAllPMTransitions> | null;
  resultState: ProcessManagerLifecycleState | null;
  pmState: ProcessManagerLifecycleState | null;
}

function createInitialState(): TestState {
  return {
    transitionValid: null,
    validEvents: null,
    allTransitions: null,
    allTransitions2: null,
    resultState: null,
    pmState: null,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Feature
// =============================================================================

const feature = await loadFeature("tests/features/behavior/processManager/lifecycle.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  // ==========================================================================
  // Rule: isPMValidTransition — idle state
  // ==========================================================================

  Rule("isPMValidTransition validates allowed transitions from idle state", ({ RuleScenario }) => {
    RuleScenario("Idle state allows START", ({ When, Then }) => {
      When('I check if transition from "idle" with "START" is valid', () => {
        state.transitionValid = isPMValidTransition("idle", "START");
      });

      Then("the transition is valid", () => {
        expect(state.transitionValid).toBe(true);
      });
    });

    RuleScenario("Idle state rejects invalid events", ({ Then }) => {
      Then("isPMValidTransition returns false for:", (...args: unknown[]) => {
        const rows = extractDataTable<{ state: string; event: string }>(...args);
        for (const row of rows) {
          expect(
            isPMValidTransition(row.state as ProcessManagerLifecycleState, row.event as PMEvent)
          ).toBe(false);
        }
      });
    });
  });

  // ==========================================================================
  // Rule: isPMValidTransition — processing state
  // ==========================================================================

  Rule(
    "isPMValidTransition validates allowed transitions from processing state",
    ({ RuleScenario }) => {
      RuleScenario("Processing state allows SUCCESS and FAIL", ({ Then }) => {
        Then("isPMValidTransition returns true for:", (...args: unknown[]) => {
          const rows = extractDataTable<{ state: string; event: string }>(...args);
          for (const row of rows) {
            expect(
              isPMValidTransition(row.state as ProcessManagerLifecycleState, row.event as PMEvent)
            ).toBe(true);
          }
        });
      });

      RuleScenario("Processing state rejects invalid events", ({ Then }) => {
        Then("isPMValidTransition returns false for:", (...args: unknown[]) => {
          const rows = extractDataTable<{ state: string; event: string }>(...args);
          for (const row of rows) {
            expect(
              isPMValidTransition(row.state as ProcessManagerLifecycleState, row.event as PMEvent)
            ).toBe(false);
          }
        });
      });
    }
  );

  // ==========================================================================
  // Rule: isPMValidTransition — completed state
  // ==========================================================================

  Rule(
    "isPMValidTransition validates allowed transitions from completed state",
    ({ RuleScenario }) => {
      RuleScenario("Completed state allows RESET", ({ When, Then }) => {
        When('I check if transition from "completed" with "RESET" is valid', () => {
          state.transitionValid = isPMValidTransition("completed", "RESET");
        });

        Then("the transition is valid", () => {
          expect(state.transitionValid).toBe(true);
        });
      });

      RuleScenario("Completed state rejects invalid events", ({ Then }) => {
        Then("isPMValidTransition returns false for:", (...args: unknown[]) => {
          const rows = extractDataTable<{ state: string; event: string }>(...args);
          for (const row of rows) {
            expect(
              isPMValidTransition(row.state as ProcessManagerLifecycleState, row.event as PMEvent)
            ).toBe(false);
          }
        });
      });
    }
  );

  // ==========================================================================
  // Rule: isPMValidTransition — failed state
  // ==========================================================================

  Rule(
    "isPMValidTransition validates allowed transitions from failed state",
    ({ RuleScenario }) => {
      RuleScenario("Failed state allows RETRY and RESET", ({ Then }) => {
        Then("isPMValidTransition returns true for:", (...args: unknown[]) => {
          const rows = extractDataTable<{ state: string; event: string }>(...args);
          for (const row of rows) {
            expect(
              isPMValidTransition(row.state as ProcessManagerLifecycleState, row.event as PMEvent)
            ).toBe(true);
          }
        });
      });

      RuleScenario("Failed state rejects invalid events", ({ Then }) => {
        Then("isPMValidTransition returns false for:", (...args: unknown[]) => {
          const rows = extractDataTable<{ state: string; event: string }>(...args);
          for (const row of rows) {
            expect(
              isPMValidTransition(row.state as ProcessManagerLifecycleState, row.event as PMEvent)
            ).toBe(false);
          }
        });
      });
    }
  );

  // ==========================================================================
  // Rule: pmTransitionState
  // ==========================================================================

  Rule(
    "pmTransitionState returns the target state for valid transitions and null for invalid",
    ({ RuleScenario }) => {
      RuleScenario("Valid transitions return correct target state", ({ Then }) => {
        Then("pmTransitionState returns the expected state for:", (...args: unknown[]) => {
          const rows = extractDataTable<{ from: string; event: string; to: string }>(...args);
          for (const row of rows) {
            expect(
              pmTransitionState(row.from as ProcessManagerLifecycleState, row.event as PMEvent)
            ).toBe(row.to);
          }
        });
      });

      RuleScenario("Invalid transitions return null", ({ Then }) => {
        Then("pmTransitionState returns null for:", (...args: unknown[]) => {
          const rows = extractDataTable<{ from: string; event: string }>(...args);
          for (const row of rows) {
            expect(
              pmTransitionState(row.from as ProcessManagerLifecycleState, row.event as PMEvent)
            ).toBeNull();
          }
        });
      });
    }
  );

  // ==========================================================================
  // Rule: getPMValidEventsFrom
  // ==========================================================================

  Rule(
    "getPMValidEventsFrom returns the set of valid events for each state",
    ({ RuleScenario }) => {
      RuleScenario("Idle state has exactly one valid event", ({ When, Then, And }) => {
        When('I get valid events from "idle"', () => {
          state.validEvents = getPMValidEventsFrom("idle") as PMEvent[];
        });

        Then('the valid events contain "START"', () => {
          expect(state.validEvents).toContain("START");
        });

        And("the valid events count is 1", () => {
          expect(state.validEvents).toHaveLength(1);
        });
      });

      RuleScenario("Processing state has exactly two valid events", ({ When, Then, And }) => {
        When('I get valid events from "processing"', () => {
          state.validEvents = getPMValidEventsFrom("processing") as PMEvent[];
        });

        Then("the valid events contain all of:", (...args: unknown[]) => {
          const rows = extractDataTable<{ event: string }>(...args);
          for (const row of rows) {
            expect(state.validEvents).toContain(row.event);
          }
        });

        And("the valid events count is 2", () => {
          expect(state.validEvents).toHaveLength(2);
        });
      });

      RuleScenario("Completed state has exactly one valid event", ({ When, Then, And }) => {
        When('I get valid events from "completed"', () => {
          state.validEvents = getPMValidEventsFrom("completed") as PMEvent[];
        });

        Then('the valid events contain "RESET"', () => {
          expect(state.validEvents).toContain("RESET");
        });

        And("the valid events count is 1", () => {
          expect(state.validEvents).toHaveLength(1);
        });
      });

      RuleScenario("Failed state has exactly two valid events", ({ When, Then, And }) => {
        When('I get valid events from "failed"', () => {
          state.validEvents = getPMValidEventsFrom("failed") as PMEvent[];
        });

        Then("the valid events contain all of:", (...args: unknown[]) => {
          const rows = extractDataTable<{ event: string }>(...args);
          for (const row of rows) {
            expect(state.validEvents).toContain(row.event);
          }
        });

        And("the valid events count is 2", () => {
          expect(state.validEvents).toHaveLength(2);
        });
      });
    }
  );

  // ==========================================================================
  // Rule: getAllPMTransitions
  // ==========================================================================

  Rule(
    "getAllPMTransitions returns all valid transitions in the state machine",
    ({ RuleScenario }) => {
      RuleScenario(
        "Returns exactly 6 transitions with correct properties",
        ({ When, Then, And }) => {
          When("I get all PM transitions", () => {
            state.allTransitions = getAllPMTransitions();
          });

          Then("there are 6 transitions", () => {
            expect(state.allTransitions!.length).toBe(6);
          });

          And('each transition has "from", "event", and "to" properties', () => {
            state.allTransitions!.forEach((t) => {
              expect(t).toHaveProperty("from");
              expect(t).toHaveProperty("event");
              expect(t).toHaveProperty("to");
            });
          });
        }
      );

      RuleScenario("All expected transitions are present", ({ When, Then }) => {
        When("I get all PM transitions", () => {
          state.allTransitions = getAllPMTransitions();
        });

        Then("all expected transitions are present:", (...args: unknown[]) => {
          const rows = extractDataTable<{ from: string; event: string; to: string }>(...args);
          const transitionStrings = state.allTransitions!.map(
            (t) => `${t.from}->${t.event}->${t.to}`
          );
          for (const row of rows) {
            expect(transitionStrings).toContain(`${row.from}->${row.event}->${row.to}`);
          }
        });
      });

      RuleScenario("Returns same array reference on repeated calls", ({ When, Then }) => {
        When("I get all PM transitions twice", () => {
          state.allTransitions = getAllPMTransitions();
          state.allTransitions2 = getAllPMTransitions();
        });

        Then("both references are identical", () => {
          expect(state.allTransitions).toBe(state.allTransitions2);
        });
      });
    }
  );

  // ==========================================================================
  // Rule: assertPMValidTransition
  // ==========================================================================

  Rule(
    "assertPMValidTransition returns the target state or throws with PM context",
    ({ RuleScenario }) => {
      RuleScenario("Valid transition returns new state", ({ When, Then }) => {
        When(
          'I assert PM transition from "idle" with "START" for "orderNotification" instance "inst-123"',
          () => {
            state.resultState = assertPMValidTransition(
              "idle",
              "START",
              "orderNotification",
              "inst-123"
            );
          }
        );

        Then('the result state is "processing"', () => {
          expect(state.resultState).toBe("processing");
        });
      });

      RuleScenario("Invalid transition throws with PM name and instance ID", ({ Then }) => {
        Then("assertPMValidTransition throws for:", (...args: unknown[]) => {
          const rows = extractDataTable<{
            state: string;
            event: string;
            pmName: string;
            instanceId: string;
          }>(...args);
          for (const row of rows) {
            expect(() => {
              assertPMValidTransition(
                row.state as ProcessManagerLifecycleState,
                row.event as PMEvent,
                row.pmName,
                row.instanceId
              );
            }).toThrow(
              `Invalid PM transition for "${row.pmName}" (${row.instanceId}): ${row.state} -> ${row.event}`
            );
          }
        });
      });
    }
  );

  // ==========================================================================
  // Rule: isTerminalState
  // ==========================================================================

  Rule("isTerminalState identifies completed as the only terminal state", ({ RuleScenario }) => {
    RuleScenario("Completed is terminal", ({ Then }) => {
      Then('isTerminalState returns true for "completed"', () => {
        expect(isTerminalState("completed")).toBe(true);
      });
    });

    RuleScenario("Non-terminal states return false", ({ Then }) => {
      Then("isTerminalState returns false for:", (...args: unknown[]) => {
        const rows = extractDataTable<{ state: string }>(...args);
        for (const row of rows) {
          expect(isTerminalState(row.state as ProcessManagerLifecycleState)).toBe(false);
        }
      });
    });
  });

  // ==========================================================================
  // Rule: isErrorState
  // ==========================================================================

  Rule("isErrorState identifies failed as the only error state", ({ RuleScenario }) => {
    RuleScenario("Failed is an error state", ({ Then }) => {
      Then('isErrorState returns true for "failed"', () => {
        expect(isErrorState("failed")).toBe(true);
      });
    });

    RuleScenario("Non-error states return false", ({ Then }) => {
      Then("isErrorState returns false for:", (...args: unknown[]) => {
        const rows = extractDataTable<{ state: string }>(...args);
        for (const row of rows) {
          expect(isErrorState(row.state as ProcessManagerLifecycleState)).toBe(false);
        }
      });
    });
  });

  // ==========================================================================
  // Rule: State Machine Completeness
  // ==========================================================================

  Rule(
    "All non-terminal states can transition and critical paths are reachable",
    ({ RuleScenario }) => {
      RuleScenario("All non-terminal states have at least one valid event", ({ Then }) => {
        Then("every non-terminal state has at least one valid event", () => {
          const states: ProcessManagerLifecycleState[] = [
            "idle",
            "processing",
            "completed",
            "failed",
          ];
          const nonTerminalStates = states.filter((s) => !isTerminalState(s));
          nonTerminalStates.forEach((s) => {
            const validEvents = getPMValidEventsFrom(s);
            expect(validEvents.length).toBeGreaterThan(0);
          });
        });
      });

      RuleScenario("Critical reachability paths exist", ({ Then }) => {
        Then("pmTransitionState returns the expected state for:", (...args: unknown[]) => {
          const rows = extractDataTable<{ from: string; event: string; to: string }>(...args);
          for (const row of rows) {
            expect(
              pmTransitionState(row.from as ProcessManagerLifecycleState, row.event as PMEvent)
            ).toBe(row.to);
          }
        });
      });
    }
  );

  // ==========================================================================
  // Rule: Typical Workflows
  // ==========================================================================

  Rule("Typical PM workflows produce the expected state sequences", ({ RuleScenario }) => {
    RuleScenario("Happy path - idle to processing to completed", ({ Given, When, Then }) => {
      Given('PM state is "idle"', () => {
        state.pmState = "idle";
      });

      When("I apply events in sequence:", (...args: unknown[]) => {
        const rows = extractDataTable<{ event: string }>(...args);
        for (const row of rows) {
          state.pmState = pmTransitionState(state.pmState!, row.event as PMEvent)!;
        }
      });

      Then('the final PM state is "completed"', () => {
        expect(state.pmState).toBe("completed");
      });
    });

    RuleScenario("Failure path - idle to processing to failed", ({ Given, When, Then }) => {
      Given('PM state is "idle"', () => {
        state.pmState = "idle";
      });

      When("I apply events in sequence:", (...args: unknown[]) => {
        const rows = extractDataTable<{ event: string }>(...args);
        for (const row of rows) {
          state.pmState = pmTransitionState(state.pmState!, row.event as PMEvent)!;
        }
      });

      Then('the final PM state is "failed"', () => {
        expect(state.pmState).toBe("failed");
      });
    });

    RuleScenario(
      "Retry workflow - idle to processing to failed to processing to completed",
      ({ Given, When, Then }) => {
        Given('PM state is "idle"', () => {
          state.pmState = "idle";
        });

        When("I apply events in sequence:", (...args: unknown[]) => {
          const rows = extractDataTable<{ event: string }>(...args);
          for (const row of rows) {
            state.pmState = pmTransitionState(state.pmState!, row.event as PMEvent)!;
          }
        });

        Then('the final PM state is "completed"', () => {
          expect(state.pmState).toBe("completed");
        });
      }
    );

    RuleScenario(
      "Time-triggered PM workflow - idle to processing to completed to idle",
      ({ Given, When, Then }) => {
        Given('PM state is "idle"', () => {
          state.pmState = "idle";
        });

        When("I apply events in sequence:", (...args: unknown[]) => {
          const rows = extractDataTable<{ event: string }>(...args);
          for (const row of rows) {
            state.pmState = pmTransitionState(state.pmState!, row.event as PMEvent)!;
          }
        });

        Then('the final PM state is "idle"', () => {
          expect(state.pmState).toBe("idle");
        });
      }
    );

    RuleScenario(
      "Failed reset workflow - idle to processing to failed to idle",
      ({ Given, When, Then }) => {
        Given('PM state is "idle"', () => {
          state.pmState = "idle";
        });

        When("I apply events in sequence:", (...args: unknown[]) => {
          const rows = extractDataTable<{ event: string }>(...args);
          for (const row of rows) {
            state.pmState = pmTransitionState(state.pmState!, row.event as PMEvent)!;
          }
        });

        Then('the final PM state is "idle"', () => {
          expect(state.pmState).toBe("idle");
        });
      }
    );
  });
});
