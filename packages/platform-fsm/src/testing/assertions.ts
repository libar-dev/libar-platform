/**
 * FSM Assertion Helpers
 *
 * Type-safe assertion functions for validating FSM behavior in BDD tests.
 * These use vitest's expect() for consistent test output formatting.
 *
 * @module @libar-dev/platform-fsm/testing
 */

import { expect } from "vitest";
import type { FSM } from "../types.js";

/**
 * Assert that a transition is valid in the FSM.
 *
 * @param fsm - The FSM to check
 * @param from - Current state
 * @param to - Target state
 * @throws AssertionError if transition is not valid
 *
 * @example
 * ```typescript
 * assertCanTransition(orderFSM, "draft", "submitted");
 * ```
 */
export function assertCanTransition<TState extends string>(
  fsm: FSM<TState>,
  from: TState,
  to: TState
): void {
  expect(fsm.canTransition(from, to)).toBe(true);
}

/**
 * Assert that a transition is NOT valid in the FSM.
 *
 * @param fsm - The FSM to check
 * @param from - Current state
 * @param to - Target state
 * @throws AssertionError if transition IS valid
 *
 * @example
 * ```typescript
 * assertCannotTransition(orderFSM, "confirmed", "draft");
 * ```
 */
export function assertCannotTransition<TState extends string>(
  fsm: FSM<TState>,
  from: TState,
  to: TState
): void {
  expect(fsm.canTransition(from, to)).toBe(false);
}

/**
 * Assert that a state is terminal (no outgoing transitions).
 *
 * @param fsm - The FSM to check
 * @param state - State to verify as terminal
 * @throws AssertionError if state is not terminal
 *
 * @example
 * ```typescript
 * assertIsTerminalState(orderFSM, "confirmed");
 * assertIsTerminalState(orderFSM, "cancelled");
 * ```
 */
export function assertIsTerminalState<TState extends string>(
  fsm: FSM<TState>,
  state: TState
): void {
  expect(fsm.isTerminal(state)).toBe(true);
}

/**
 * Assert that a state is NOT terminal (has outgoing transitions).
 *
 * @param fsm - The FSM to check
 * @param state - State to verify as non-terminal
 * @throws AssertionError if state IS terminal
 *
 * @example
 * ```typescript
 * assertIsNotTerminalState(orderFSM, "draft");
 * assertIsNotTerminalState(orderFSM, "submitted");
 * ```
 */
export function assertIsNotTerminalState<TState extends string>(
  fsm: FSM<TState>,
  state: TState
): void {
  expect(fsm.isTerminal(state)).toBe(false);
}

/**
 * Assert that a state is the initial state of the FSM.
 *
 * @param fsm - The FSM to check
 * @param state - State to verify as initial
 * @throws AssertionError if state is not the initial state
 *
 * @example
 * ```typescript
 * assertIsInitialState(orderFSM, "draft");
 * ```
 */
export function assertIsInitialState<TState extends string>(fsm: FSM<TState>, state: TState): void {
  expect(fsm.initial).toBe(state);
}

/**
 * Assert that a state is valid in the FSM.
 *
 * @param fsm - The FSM to check
 * @param state - State string to verify
 * @throws AssertionError if state is not defined in the FSM
 *
 * @example
 * ```typescript
 * assertIsValidState(orderFSM, "draft");
 * ```
 */
export function assertIsValidState<TState extends string>(fsm: FSM<TState>, state: string): void {
  expect(fsm.isValidState(state)).toBe(true);
}

/**
 * Assert that a state is NOT valid in the FSM.
 *
 * @param fsm - The FSM to check
 * @param state - State string to verify as invalid
 * @throws AssertionError if state IS defined in the FSM
 *
 * @example
 * ```typescript
 * assertIsInvalidState(orderFSM, "unknown_state");
 * ```
 */
export function assertIsInvalidState<TState extends string>(fsm: FSM<TState>, state: string): void {
  expect(fsm.isValidState(state)).toBe(false);
}

/**
 * Get all valid transitions as [from, to] pairs.
 *
 * Useful for parameterized tests that need to verify all valid paths.
 *
 * @param fsm - The FSM to analyze
 * @returns Array of [from, to] state pairs
 *
 * @example
 * ```typescript
 * const transitions = getAllValidTransitions(orderFSM);
 * // [["draft", "submitted"], ["draft", "cancelled"], ["submitted", "confirmed"], ...]
 *
 * // Use in parameterized tests
 * transitions.forEach(([from, to]) => {
 *   assertCanTransition(orderFSM, from, to);
 * });
 * ```
 */
export function getAllValidTransitions<TState extends string>(
  fsm: FSM<TState>
): Array<[TState, TState]> {
  const result: Array<[TState, TState]> = [];
  const states = Object.keys(fsm.definition.transitions) as TState[];

  for (const from of states) {
    const targets = fsm.validTransitions(from);
    for (const to of targets) {
      result.push([from, to]);
    }
  }

  return result;
}

/**
 * Get all states in the FSM.
 *
 * @param fsm - The FSM to analyze
 * @returns Array of all states
 *
 * @example
 * ```typescript
 * const states = getAllStates(orderFSM);
 * // ["draft", "submitted", "confirmed", "cancelled"]
 * ```
 */
export function getAllStates<TState extends string>(fsm: FSM<TState>): TState[] {
  return Object.keys(fsm.definition.transitions) as TState[];
}

/**
 * Get all terminal states in the FSM.
 *
 * @param fsm - The FSM to analyze
 * @returns Array of terminal states
 *
 * @example
 * ```typescript
 * const terminals = getTerminalStates(orderFSM);
 * // ["confirmed", "cancelled"]
 * ```
 */
export function getTerminalStates<TState extends string>(fsm: FSM<TState>): TState[] {
  const states = getAllStates(fsm);
  return states.filter((state) => fsm.isTerminal(state));
}

/**
 * Get all non-terminal states in the FSM.
 *
 * @param fsm - The FSM to analyze
 * @returns Array of non-terminal states
 *
 * @example
 * ```typescript
 * const nonTerminals = getNonTerminalStates(orderFSM);
 * // ["draft", "submitted"]
 * ```
 */
export function getNonTerminalStates<TState extends string>(fsm: FSM<TState>): TState[] {
  const states = getAllStates(fsm);
  return states.filter((state) => !fsm.isTerminal(state));
}

/**
 * Assert that the FSM has specific valid transitions from a state.
 *
 * @param fsm - The FSM to check
 * @param from - The source state
 * @param expectedTargets - Expected array of valid target states
 * @throws AssertionError if transitions don't match
 *
 * @example
 * ```typescript
 * assertValidTransitionsFrom(orderFSM, "draft", ["submitted", "cancelled"]);
 * ```
 */
export function assertValidTransitionsFrom<TState extends string>(
  fsm: FSM<TState>,
  from: TState,
  expectedTargets: TState[]
): void {
  const actualTargets = fsm.validTransitions(from);
  expect([...actualTargets].sort()).toEqual([...expectedTargets].sort());
}
