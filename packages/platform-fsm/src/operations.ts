/**
 * ## FSM Operations - Functional State Validation
 *
 * Standalone functions for FSM state transition validation.
 * Provides the same functionality as FSM instance methods, but as pure
 * functions that take the FSM as an argument.
 *
 * ### When to Use
 *
 * - Prefer functional style over OOP method calls
 * - Need to pass transition checks as callbacks
 * - Composing FSM operations with other functions
 *
 * ### Available Operations
 *
 * | Function | Returns | Purpose |
 * |----------|---------|---------|
 * | `canTransition(fsm, from, to)` | `boolean` | Check if valid |
 * | `assertTransition(fsm, from, to)` | `void` | Throw if invalid |
 * | `validTransitions(fsm, from)` | `TState[]` | List targets |
 * | `isTerminal(fsm, state)` | `boolean` | Check end state |
 * | `isValidState(fsm, state)` | `boolean` | Type guard |
 *
 * ### Relationship to Other Patterns
 *
 * - Operates on **FSM** instances from `defineFSM`
 * - Alternative to FSM instance methods
 * - Used by **Deciders** for transition validation
 *
 * @example
 * ```typescript
 * import { canTransition, assertTransition } from "@libar-dev/platform-fsm";
 * import { orderFSM } from "./orderFSM";
 *
 * // Functional style
 * if (canTransition(orderFSM, order.status, "submitted")) {
 *   // proceed
 * }
 *
 * // Assertion style
 * assertTransition(orderFSM, order.status, "submitted");
 * ```
 */

import type { FSM } from "./types.js";

/**
 * Check if a transition from one state to another is valid.
 *
 * @param fsm - The FSM instance
 * @param from - Current state
 * @param to - Target state
 * @returns true if transition is allowed
 */
export function canTransition<TState extends string>(
  fsm: FSM<TState>,
  from: TState,
  to: TState
): boolean {
  return fsm.canTransition(from, to);
}

/**
 * Assert that a transition is valid, throwing if not.
 *
 * @param fsm - The FSM instance
 * @param from - Current state
 * @param to - Target state
 * @throws FSMTransitionError if transition is not allowed
 */
export function assertTransition<TState extends string>(
  fsm: FSM<TState>,
  from: TState,
  to: TState
): void {
  fsm.assertTransition(from, to);
}

/**
 * Get all valid target states from a given state.
 *
 * @param fsm - The FSM instance
 * @param from - Current state
 * @returns Array of valid target states
 */
export function validTransitions<TState extends string>(
  fsm: FSM<TState>,
  from: TState
): readonly TState[] {
  return fsm.validTransitions(from);
}

/**
 * Check if a state is terminal (no outgoing transitions).
 *
 * @param fsm - The FSM instance
 * @param state - State to check
 * @returns true if state has no valid transitions
 */
export function isTerminal<TState extends string>(fsm: FSM<TState>, state: TState): boolean {
  return fsm.isTerminal(state);
}

/**
 * Check if a state is valid in the FSM.
 *
 * @param fsm - The FSM instance
 * @param state - State to check
 * @returns true if state is defined in the FSM (type guard)
 */
export function isValidState<TState extends string>(
  fsm: FSM<TState>,
  state: string
): state is TState {
  return fsm.isValidState(state);
}
