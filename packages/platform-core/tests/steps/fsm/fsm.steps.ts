/**
 * FSM Core - Step Definitions
 *
 * BDD step definitions for FSM module behavior:
 * - defineFSM: creation and definition preservation
 * - canTransition: valid/invalid transition checks
 * - assertTransition: throw/no-throw enforcement
 * - validTransitions: target state listing
 * - isTerminal: terminal state identification
 * - isValidState: state existence checks
 * - FSMTransitionError: error property validation
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import {
  defineFSM,
  canTransition,
  assertTransition,
  validTransitions,
  isTerminal,
  isValidState,
  FSMTransitionError,
} from "../../../src/fsm";
import { extractDataTable } from "../_helpers/data-table.js";

// =============================================================================
// Test State
// =============================================================================

type TestStatus = "draft" | "submitted" | "confirmed" | "cancelled";

interface TestState {
  fsm: ReturnType<typeof defineFSM<TestStatus>> | null;
  error: FSMTransitionError | null;
}

function createInitialState(): TestState {
  return {
    fsm: null,
    error: null,
  };
}

let state: TestState = createInitialState();

// =============================================================================
// Helper: create the test FSM
// =============================================================================

function createTestFSM() {
  return defineFSM<TestStatus>({
    initial: "draft",
    transitions: {
      draft: ["submitted", "cancelled"],
      submitted: ["confirmed", "cancelled"],
      confirmed: [],
      cancelled: [],
    },
  });
}

// =============================================================================
// Feature
// =============================================================================

const feature = await loadFeature("tests/features/behavior/fsm/fsm.feature");

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  BeforeEachScenario(() => {
    state = createInitialState();
  });

  // ==========================================================================
  // Rule: defineFSM
  // ==========================================================================

  Rule("defineFSM creates an FSM with correct initial state and definition", ({ RuleScenario }) => {
    RuleScenario("FSM is created with correct initial state", ({ Given, Then }) => {
      Given('a test FSM with initial state "draft"', () => {
        state.fsm = createTestFSM();
      });

      Then('the FSM initial state is "draft"', () => {
        expect(state.fsm!.initial).toBe("draft");
      });
    });

    RuleScenario("FSM preserves the definition", ({ Given, Then, And }) => {
      Given('a test FSM with initial state "draft"', () => {
        state.fsm = createTestFSM();
      });

      Then('the FSM definition initial state is "draft"', () => {
        expect(state.fsm!.definition.initial).toBe("draft");
      });

      And('the FSM definition transitions for "draft" are:', (...args: unknown[]) => {
        const rows = extractDataTable<{ target: string }>(...args);
        const expected = rows.map((row) => row.target);
        expect(state.fsm!.definition.transitions.draft).toEqual(expected);
      });
    });
  });

  // ==========================================================================
  // Rule: canTransition
  // ==========================================================================

  Rule("canTransition returns true only for transitions defined in the FSM", ({ RuleScenario }) => {
    RuleScenario("Valid transitions return true", ({ Given, Then }) => {
      Given('a test FSM with initial state "draft"', () => {
        state.fsm = createTestFSM();
      });

      Then("canTransition returns true for:", (...args: unknown[]) => {
        const rows = extractDataTable<{ from: string; to: string }>(...args);
        for (const row of rows) {
          expect(state.fsm!.canTransition(row.from as TestStatus, row.to as TestStatus)).toBe(true);
        }
      });
    });

    RuleScenario("Invalid transitions return false", ({ Given, Then }) => {
      Given('a test FSM with initial state "draft"', () => {
        state.fsm = createTestFSM();
      });

      Then("canTransition returns false for:", (...args: unknown[]) => {
        const rows = extractDataTable<{ from: string; to: string }>(...args);
        for (const row of rows) {
          expect(state.fsm!.canTransition(row.from as TestStatus, row.to as TestStatus)).toBe(
            false
          );
        }
      });
    });

    RuleScenario("Standalone canTransition function works", ({ Given, Then, And }) => {
      Given('a test FSM with initial state "draft"', () => {
        state.fsm = createTestFSM();
      });

      Then('standalone canTransition returns true for "draft" to "submitted"', () => {
        expect(canTransition(state.fsm!, "draft", "submitted")).toBe(true);
      });

      And('standalone canTransition returns false for "draft" to "confirmed"', () => {
        expect(canTransition(state.fsm!, "draft", "confirmed")).toBe(false);
      });
    });
  });

  // ==========================================================================
  // Rule: assertTransition
  // ==========================================================================

  Rule("assertTransition throws FSMTransitionError for invalid transitions", ({ RuleScenario }) => {
    RuleScenario("Valid transitions do not throw", ({ Given, Then }) => {
      Given('a test FSM with initial state "draft"', () => {
        state.fsm = createTestFSM();
      });

      Then("assertTransition does not throw for:", (...args: unknown[]) => {
        const rows = extractDataTable<{ from: string; to: string }>(...args);
        for (const row of rows) {
          expect(() =>
            state.fsm!.assertTransition(row.from as TestStatus, row.to as TestStatus)
          ).not.toThrow();
        }
      });
    });

    RuleScenario("Invalid transition throws FSMTransitionError", ({ Given, When, Then }) => {
      Given('a test FSM with initial state "draft"', () => {
        state.fsm = createTestFSM();
      });

      When('I attempt transition from "draft" to "confirmed"', () => {
        try {
          state.fsm!.assertTransition("draft", "confirmed");
          expect.fail("Should have thrown");
        } catch (error) {
          state.error = error as FSMTransitionError;
        }
      });

      Then("an FSMTransitionError is thrown", () => {
        expect(state.error).toBeInstanceOf(FSMTransitionError);
      });
    });

    RuleScenario("FSMTransitionError includes transition details", ({ Given, When, Then, And }) => {
      Given('a test FSM with initial state "draft"', () => {
        state.fsm = createTestFSM();
      });

      When('I attempt transition from "draft" to "confirmed"', () => {
        try {
          state.fsm!.assertTransition("draft", "confirmed");
          expect.fail("Should have thrown");
        } catch (error) {
          state.error = error as FSMTransitionError;
        }
      });

      Then('the error has from "draft" and to "confirmed"', () => {
        expect(state.error!.from).toBe("draft");
        expect(state.error!.to).toBe("confirmed");
      });

      And("the error has valid transitions:", (...args: unknown[]) => {
        const rows = extractDataTable<{ target: string }>(...args);
        const expected = rows.map((row) => row.target);
        expect(state.error!.validTransitions).toEqual(expected);
      });

      And('the error has code "FSM_INVALID_TRANSITION"', () => {
        expect(state.error!.code).toBe("FSM_INVALID_TRANSITION");
      });
    });

    RuleScenario("Standalone assertTransition function works", ({ Given, Then, And }) => {
      Given('a test FSM with initial state "draft"', () => {
        state.fsm = createTestFSM();
      });

      Then('standalone assertTransition does not throw for "draft" to "submitted"', () => {
        expect(() => assertTransition(state.fsm!, "draft", "submitted")).not.toThrow();
      });

      And(
        'standalone assertTransition throws FSMTransitionError for "draft" to "confirmed"',
        () => {
          expect(() => assertTransition(state.fsm!, "draft", "confirmed")).toThrow(
            FSMTransitionError
          );
        }
      );
    });
  });

  // ==========================================================================
  // Rule: validTransitions
  // ==========================================================================

  Rule("validTransitions returns the list of allowed target states", ({ RuleScenario }) => {
    RuleScenario("Returns valid transitions for each state", ({ Given, Then }) => {
      Given('a test FSM with initial state "draft"', () => {
        state.fsm = createTestFSM();
      });

      Then("validTransitions returns for each state:", (...args: unknown[]) => {
        const rows = extractDataTable<{ state: string; targets: string }>(...args);
        for (const row of rows) {
          const expected = row.targets ? row.targets.split(", ") : [];
          expect(state.fsm!.validTransitions(row.state as TestStatus)).toEqual(expected);
        }
      });
    });

    RuleScenario("Standalone validTransitions function works", ({ Given, Then }) => {
      Given('a test FSM with initial state "draft"', () => {
        state.fsm = createTestFSM();
      });

      Then('standalone validTransitions for "draft" returns:', (...args: unknown[]) => {
        const rows = extractDataTable<{ target: string }>(...args);
        const expected = rows.map((row) => row.target);
        expect(validTransitions(state.fsm!, "draft")).toEqual(expected);
      });
    });
  });

  // ==========================================================================
  // Rule: isTerminal
  // ==========================================================================

  Rule("isTerminal identifies states with no outgoing transitions", ({ RuleScenario }) => {
    RuleScenario("Terminal states are identified", ({ Given, Then }) => {
      Given('a test FSM with initial state "draft"', () => {
        state.fsm = createTestFSM();
      });

      Then("isTerminal returns true for:", (...args: unknown[]) => {
        const rows = extractDataTable<{ state: string }>(...args);
        for (const row of rows) {
          expect(state.fsm!.isTerminal(row.state as TestStatus)).toBe(true);
        }
      });
    });

    RuleScenario("Non-terminal states are identified", ({ Given, Then }) => {
      Given('a test FSM with initial state "draft"', () => {
        state.fsm = createTestFSM();
      });

      Then("isTerminal returns false for:", (...args: unknown[]) => {
        const rows = extractDataTable<{ state: string }>(...args);
        for (const row of rows) {
          expect(state.fsm!.isTerminal(row.state as TestStatus)).toBe(false);
        }
      });
    });

    RuleScenario("Standalone isTerminal function works", ({ Given, Then, And }) => {
      Given('a test FSM with initial state "draft"', () => {
        state.fsm = createTestFSM();
      });

      Then('standalone isTerminal returns true for "confirmed"', () => {
        expect(isTerminal(state.fsm!, "confirmed")).toBe(true);
      });

      And('standalone isTerminal returns false for "draft"', () => {
        expect(isTerminal(state.fsm!, "draft")).toBe(false);
      });
    });
  });

  // ==========================================================================
  // Rule: isValidState
  // ==========================================================================

  Rule("isValidState returns true only for states defined in the FSM", ({ RuleScenario }) => {
    RuleScenario("Valid states return true", ({ Given, Then }) => {
      Given('a test FSM with initial state "draft"', () => {
        state.fsm = createTestFSM();
      });

      Then("isValidState returns true for:", (...args: unknown[]) => {
        const rows = extractDataTable<{ state: string }>(...args);
        for (const row of rows) {
          expect(state.fsm!.isValidState(row.state as string)).toBe(true);
        }
      });
    });

    RuleScenario("Invalid states return false", ({ Given, Then }) => {
      Given('a test FSM with initial state "draft"', () => {
        state.fsm = createTestFSM();
      });

      Then("isValidState returns false for:", (...args: unknown[]) => {
        const rows = extractDataTable<{ state: string }>(...args);
        for (const row of rows) {
          expect(state.fsm!.isValidState(row.state as string)).toBe(false);
        }
      });
    });

    RuleScenario("Standalone isValidState function works", ({ Given, Then, And }) => {
      Given('a test FSM with initial state "draft"', () => {
        state.fsm = createTestFSM();
      });

      Then('standalone isValidState returns true for "draft"', () => {
        expect(isValidState(state.fsm!, "draft")).toBe(true);
      });

      And('standalone isValidState returns false for "unknown"', () => {
        expect(isValidState(state.fsm!, "unknown")).toBe(false);
      });
    });
  });

  // ==========================================================================
  // Rule: FSMTransitionError
  // ==========================================================================

  Rule("FSMTransitionError has correct error properties", ({ RuleScenario }) => {
    RuleScenario("Error has correct properties", ({ When, Then, And }) => {
      When(
        'I create an FSMTransitionError from "draft" to "confirmed" with valid transitions:',
        (...args: unknown[]) => {
          const rows = extractDataTable<{ target: string }>(...args);
          const targets = rows.map((row) => row.target);
          state.error = new FSMTransitionError("draft", "confirmed", targets);
        }
      );

      Then('the error name is "FSMTransitionError"', () => {
        expect(state.error!.name).toBe("FSMTransitionError");
      });

      And('the error code is "FSM_INVALID_TRANSITION"', () => {
        expect(state.error!.code).toBe("FSM_INVALID_TRANSITION");
      });

      And('the error has from "draft" and to "confirmed"', () => {
        expect(state.error!.from).toBe("draft");
        expect(state.error!.to).toBe("confirmed");
      });

      And('the error message contains "Invalid transition"', () => {
        expect(state.error!.message).toContain("Invalid transition");
      });

      And('the error message contains "draft"', () => {
        expect(state.error!.message).toContain("draft");
      });

      And('the error message contains "confirmed"', () => {
        expect(state.error!.message).toContain("confirmed");
      });
    });

    RuleScenario("Error handles terminal states in message", ({ When, Then }) => {
      When(
        'I create an FSMTransitionError from "confirmed" to "draft" with no valid transitions',
        () => {
          state.error = new FSMTransitionError("confirmed", "draft", []);
        }
      );

      Then('the error message contains "(none - terminal state)"', () => {
        expect(state.error!.message).toContain("(none - terminal state)");
      });
    });
  });
});
