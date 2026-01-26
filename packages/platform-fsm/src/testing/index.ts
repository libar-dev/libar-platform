/**
 * Testing utilities for FSM pattern.
 *
 * Provides reusable infrastructure for BDD testing of finite state machines.
 *
 * @module @libar-dev/platform-fsm/testing
 */

// =============================================================================
// Assertions
// =============================================================================

export {
  // Transition assertions
  assertCanTransition,
  assertCannotTransition,
  // State property assertions
  assertIsTerminalState,
  assertIsNotTerminalState,
  assertIsInitialState,
  assertIsValidState,
  assertIsInvalidState,
  // Transition list assertion
  assertValidTransitionsFrom,
  // Utility functions
  getAllValidTransitions,
  getAllStates,
  getTerminalStates,
  getNonTerminalStates,
} from "./assertions.js";
