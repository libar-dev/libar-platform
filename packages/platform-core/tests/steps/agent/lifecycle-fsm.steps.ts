/**
 * Lifecycle FSM - Step Definitions
 *
 * BDD step definitions for the pure agent lifecycle state machine including:
 * - All 10 valid transitions from the transition table
 * - Invalid transitions that return null or throw
 * - assertValidAgentTransition throws/returns behavior
 * - getValidAgentEventsFrom returns correct event arrays
 * - getAllAgentTransitions returns all 10 transitions
 * - State classification helpers (isAgentErrorState, isAgentProcessingState)
 * - commandToEvent maps command types to lifecycle events
 *
 * Mechanical migration from tests/unit/agent/lifecycle-fsm.test.ts
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import {
  AGENT_LIFECYCLE_STATES,
  AGENT_LIFECYCLE_EVENTS,
  isValidAgentTransition,
  transitionAgentState,
  assertValidAgentTransition,
  getValidAgentEventsFrom,
  getAllAgentTransitions,
  isAgentErrorState,
  isAgentProcessingState,
  commandToEvent,
  type AgentLifecycleState,
  type AgentLifecycleEvent,
} from "../../../src/agent/lifecycle-fsm.js";
import { getDataTableRows } from "../_helpers/data-table.js";

// =============================================================================
// Test State
// =============================================================================

interface TestState {
  currentState: AgentLifecycleState | null;
}

function createInitialState(): TestState {
  return {
    currentState: null,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Helpers for exhaustive invalid pairs
// =============================================================================

function computeInvalidPairs(): [AgentLifecycleState, AgentLifecycleEvent][] {
  const allPairs: [AgentLifecycleState, AgentLifecycleEvent][] = [];
  for (const s of AGENT_LIFECYCLE_STATES) {
    for (const e of AGENT_LIFECYCLE_EVENTS) {
      allPairs.push([s, e]);
    }
  }
  const validPairs = getAllAgentTransitions().map((t) => `${t.from}:${t.event}`);
  return allPairs.filter(([s, e]) => !validPairs.includes(`${s}:${e}`));
}

// =============================================================================
// Feature Definition
// =============================================================================

const feature = await loadFeature("tests/features/behavior/agent/lifecycle-fsm.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  // ===========================================================================
  // Rule: Lifecycle state constants are well-defined
  // ===========================================================================

  Rule("Lifecycle state constants are well-defined", ({ RuleScenario }) => {
    RuleScenario("AGENT_LIFECYCLE_STATES contains all four states", ({ Then, And }) => {
      Then("AGENT_LIFECYCLE_STATES equals:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ state: string }>(dataTable);
        const expected = rows.map((r) => r.state);
        expect(AGENT_LIFECYCLE_STATES).toEqual(expected);
      });

      And("AGENT_LIFECYCLE_STATES has length 4", () => {
        expect(AGENT_LIFECYCLE_STATES).toHaveLength(4);
      });
    });
  });

  // ===========================================================================
  // Rule: Lifecycle event constants are well-defined
  // ===========================================================================

  Rule("Lifecycle event constants are well-defined", ({ RuleScenario }) => {
    RuleScenario("AGENT_LIFECYCLE_EVENTS contains all seven events", ({ Then, And }) => {
      Then("AGENT_LIFECYCLE_EVENTS equals:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ event: string }>(dataTable);
        const expected = rows.map((r) => r.event);
        expect(AGENT_LIFECYCLE_EVENTS).toEqual(expected);
      });

      And("AGENT_LIFECYCLE_EVENTS has length 7", () => {
        expect(AGENT_LIFECYCLE_EVENTS).toHaveLength(7);
      });
    });
  });

  // ===========================================================================
  // Rule: All 10 valid transitions produce the correct target state
  // ===========================================================================

  Rule("All 10 valid transitions produce the correct target state", ({ RuleScenario }) => {
    RuleScenario(
      "transitionAgentState returns correct target for every valid transition",
      ({ Then }) => {
        Then(
          "transitionAgentState returns the correct target for all valid transitions:",
          (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{
              from: string;
              event: string;
              to: string;
            }>(dataTable);
            for (const row of rows) {
              expect(
                transitionAgentState(
                  row.from as AgentLifecycleState,
                  row.event as AgentLifecycleEvent
                )
              ).toBe(row.to);
            }
          }
        );
      }
    );
  });

  // ===========================================================================
  // Rule: isValidAgentTransition returns true for all valid pairs
  // ===========================================================================

  Rule("isValidAgentTransition returns true for all valid pairs", ({ RuleScenario }) => {
    RuleScenario("isValidAgentTransition returns true for every valid pair", ({ Then }) => {
      Then(
        "isValidAgentTransition returns true for all valid pairs:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{
            from: string;
            event: string;
          }>(dataTable);
          for (const row of rows) {
            expect(
              isValidAgentTransition(
                row.from as AgentLifecycleState,
                row.event as AgentLifecycleEvent
              )
            ).toBe(true);
          }
        }
      );
    });
  });

  // ===========================================================================
  // Rule: transitionAgentState returns null for invalid transitions
  // ===========================================================================

  Rule("transitionAgentState returns null for invalid transitions", ({ RuleScenario }) => {
    RuleScenario(
      "transitionAgentState returns null for representative invalid pairs",
      ({ Then }) => {
        Then(
          "transitionAgentState returns null for these invalid pairs:",
          (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{
              from: string;
              event: string;
              reason: string;
            }>(dataTable);
            for (const row of rows) {
              expect(
                transitionAgentState(
                  row.from as AgentLifecycleState,
                  row.event as AgentLifecycleEvent
                )
              ).toBeNull();
            }
          }
        );
      }
    );
  });

  // ===========================================================================
  // Rule: Exhaustive invalid pair coverage via isValidAgentTransition
  // ===========================================================================

  Rule("Exhaustive invalid pair coverage via isValidAgentTransition", ({ RuleScenario }) => {
    RuleScenario("Exactly 18 invalid pairs exist and all return false", ({ Then, And }) => {
      Then("there are exactly 18 invalid state-event pairs", () => {
        const invalidPairs = computeInvalidPairs();
        expect(invalidPairs).toHaveLength(18);
      });

      And("isValidAgentTransition returns false for every invalid pair", () => {
        const invalidPairs = computeInvalidPairs();
        for (const [from, event] of invalidPairs) {
          expect(isValidAgentTransition(from, event)).toBe(false);
        }
      });
    });
  });

  // ===========================================================================
  // Rule: Exhaustive invalid pair coverage via transitionAgentState
  // ===========================================================================

  Rule("Exhaustive invalid pair coverage via transitionAgentState", ({ RuleScenario }) => {
    RuleScenario(
      "Exactly 18 invalid pairs return null from transitionAgentState",
      ({ Then, And }) => {
        Then("there are exactly 18 invalid state-event pairs for transitionAgentState", () => {
          const invalidPairs = computeInvalidPairs();
          expect(invalidPairs).toHaveLength(18);
        });

        And("transitionAgentState returns null for every invalid pair", () => {
          const invalidPairs = computeInvalidPairs();
          for (const [from, event] of invalidPairs) {
            expect(transitionAgentState(from, event)).toBeNull();
          }
        });
      }
    );
  });

  // ===========================================================================
  // Rule: assertValidAgentTransition returns next state or throws
  // ===========================================================================

  Rule("assertValidAgentTransition returns next state or throws", ({ RuleScenario }) => {
    RuleScenario(
      "assertValidAgentTransition returns next state for valid transitions",
      ({ Then }) => {
        Then(
          "assertValidAgentTransition returns the correct state for valid inputs:",
          (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{
              from: string;
              event: string;
              agentId: string;
              expected: string;
            }>(dataTable);
            for (const row of rows) {
              const result = assertValidAgentTransition(
                row.from as AgentLifecycleState,
                row.event as AgentLifecycleEvent,
                row.agentId
              );
              expect(result).toBe(row.expected);
            }
          }
        );
      }
    );

    RuleScenario("assertValidAgentTransition throws for invalid transition", ({ Then }) => {
      Then(
        'assertValidAgentTransition throws for from "stopped" event "PAUSE" agentId "test-agent"',
        () => {
          expect(() => assertValidAgentTransition("stopped", "PAUSE", "test-agent")).toThrow(
            /Invalid agent lifecycle transition/
          );
        }
      );
    });

    RuleScenario("assertValidAgentTransition error message includes details", ({ Then }) => {
      Then(
        'assertValidAgentTransition error for from "stopped" event "PAUSE" agentId "my-agent" contains:',
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ pattern: string }>(dataTable);
          for (const row of rows) {
            expect(() => assertValidAgentTransition("stopped", "PAUSE", "my-agent")).toThrow(
              new RegExp(row.pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
            );
          }
        }
      );
    });
  });

  // ===========================================================================
  // Rule: getValidAgentEventsFrom returns correct events per state
  // ===========================================================================

  Rule("getValidAgentEventsFrom returns correct events per state", ({ RuleScenario }) => {
    RuleScenario(
      "getValidAgentEventsFrom returns correct events for stopped",
      ({ Given, Then }) => {
        Given('the state is "stopped"', () => {
          state.currentState = "stopped";
        });

        Then("getValidAgentEventsFrom returns:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ event: string }>(dataTable);
          const expected = rows.map((r) => r.event);
          expect(getValidAgentEventsFrom(state.currentState!)).toEqual(expected);
        });
      }
    );

    RuleScenario("getValidAgentEventsFrom returns correct events for active", ({ Given, Then }) => {
      Given('the state is "active"', () => {
        state.currentState = "active";
      });

      Then("getValidAgentEventsFrom returns:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ event: string }>(dataTable);
        const expected = rows.map((r) => r.event);
        expect(getValidAgentEventsFrom(state.currentState!)).toEqual(expected);
      });
    });

    RuleScenario("getValidAgentEventsFrom returns correct events for paused", ({ Given, Then }) => {
      Given('the state is "paused"', () => {
        state.currentState = "paused";
      });

      Then("getValidAgentEventsFrom returns:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{ event: string }>(dataTable);
        const expected = rows.map((r) => r.event);
        expect(getValidAgentEventsFrom(state.currentState!)).toEqual(expected);
      });
    });

    RuleScenario(
      "getValidAgentEventsFrom returns correct events for error_recovery",
      ({ Given, Then }) => {
        Given('the state is "error_recovery"', () => {
          state.currentState = "error_recovery";
        });

        Then("getValidAgentEventsFrom returns:", (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{ event: string }>(dataTable);
          const expected = rows.map((r) => r.event);
          expect(getValidAgentEventsFrom(state.currentState!)).toEqual(expected);
        });
      }
    );
  });

  // ===========================================================================
  // Rule: getAllAgentTransitions returns the complete transition table
  // ===========================================================================

  Rule("getAllAgentTransitions returns the complete transition table", ({ RuleScenario }) => {
    RuleScenario("getAllAgentTransitions returns exactly 10 transitions", ({ Then }) => {
      Then("getAllAgentTransitions returns exactly 10 transitions", () => {
        expect(getAllAgentTransitions()).toHaveLength(10);
      });
    });

    RuleScenario("Each transition has from event and to fields", ({ Then }) => {
      Then("every transition from getAllAgentTransitions has from event and to fields", () => {
        const transitions = getAllAgentTransitions();
        for (const t of transitions) {
          expect(t).toHaveProperty("from");
          expect(t).toHaveProperty("event");
          expect(t).toHaveProperty("to");
        }
      });
    });

    RuleScenario("getAllAgentTransitions contains specific transitions", ({ Then }) => {
      Then(
        "getAllAgentTransitions contains these transitions:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{
            from: string;
            event: string;
            to: string;
          }>(dataTable);
          const transitions = getAllAgentTransitions();
          for (const row of rows) {
            expect(transitions).toContainEqual({
              from: row.from,
              event: row.event,
              to: row.to,
            });
          }
        }
      );
    });

    RuleScenario("getAllAgentTransitions returns same reference each call", ({ Then }) => {
      Then("getAllAgentTransitions returns the same reference on repeated calls", () => {
        const t1 = getAllAgentTransitions();
        const t2 = getAllAgentTransitions();
        expect(t1).toBe(t2);
      });
    });
  });

  // ===========================================================================
  // Rule: isAgentErrorState classifies states correctly
  // ===========================================================================

  Rule("isAgentErrorState classifies states correctly", ({ RuleScenario }) => {
    RuleScenario("isAgentErrorState returns correct classification for all states", ({ Then }) => {
      Then(
        "isAgentErrorState returns the correct value for each state:",
        (_ctx: unknown, dataTable: unknown) => {
          const rows = getDataTableRows<{
            state: string;
            expected: string;
          }>(dataTable);
          for (const row of rows) {
            expect(isAgentErrorState(row.state as AgentLifecycleState)).toBe(
              row.expected === "true"
            );
          }
        }
      );
    });
  });

  // ===========================================================================
  // Rule: isAgentProcessingState classifies states correctly
  // ===========================================================================

  Rule("isAgentProcessingState classifies states correctly", ({ RuleScenario }) => {
    RuleScenario(
      "isAgentProcessingState returns correct classification for all states",
      ({ Then }) => {
        Then(
          "isAgentProcessingState returns the correct value for each state:",
          (_ctx: unknown, dataTable: unknown) => {
            const rows = getDataTableRows<{
              state: string;
              expected: string;
            }>(dataTable);
            for (const row of rows) {
              expect(isAgentProcessingState(row.state as AgentLifecycleState)).toBe(
                row.expected === "true"
              );
            }
          }
        );
      }
    );
  });

  // ===========================================================================
  // Rule: commandToEvent maps command types to lifecycle events
  // ===========================================================================

  Rule("commandToEvent maps command types to lifecycle events", ({ RuleScenario }) => {
    RuleScenario("commandToEvent maps known commands and returns null for unknown", ({ Then }) => {
      Then("commandToEvent returns the correct mapping:", (_ctx: unknown, dataTable: unknown) => {
        const rows = getDataTableRows<{
          command: string;
          expected: string;
        }>(dataTable);
        for (const row of rows) {
          const result = commandToEvent(row.command);
          if (row.expected === "null") {
            expect(result).toBeNull();
          } else {
            expect(result).toBe(row.expected);
          }
        }
      });
    });
  });
});
