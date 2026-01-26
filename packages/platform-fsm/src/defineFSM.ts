/**
 * ## defineFSM - Type-Safe State Machine Factory
 *
 * Creates an FSM instance from a definition, providing **O(1) state validation**
 * with pre-computed lookup tables.
 *
 * ### When to Use
 *
 * - Define domain entity lifecycle (Order, Reservation, etc.)
 * - Need both functional (`canTransition`) and OOP (`fsm.assertTransition`) APIs
 * - Want type-safe state narrowing after validation
 *
 * ### FSM Instance Methods
 *
 * | Method | Returns | Purpose |
 * |--------|---------|---------|
 * | `canTransition(from, to)` | `boolean` | Check if transition valid |
 * | `assertTransition(from, to)` | `void` | Throw if invalid |
 * | `validTransitions(from)` | `TState[]` | List valid targets |
 * | `isTerminal(state)` | `boolean` | Check for end state |
 * | `isValidState(state)` | `boolean` | Type guard for state |
 *
 * ### Integration with Deciders
 *
 * ```typescript
 * // In decider function
 * if (!orderFSM.canTransition(state.status, "submitted")) {
 *   return rejected(
 *     "INVALID_TRANSITION",
 *     `Cannot transition from ${state.status} to submitted`
 *   );
 * }
 * ```
 *
 * ### Relationship to Other Patterns
 *
 * - Defines state rules for **FSM Types**
 * - Used by **Decider** pure functions
 * - Complements **Invariants** for domain validation
 *
 * @example
 * ```typescript
 * import { defineFSM, canTransition, FSMTransitionError } from "@libar-dev/platform-fsm";
 *
 * type OrderStatus = "draft" | "submitted" | "confirmed" | "cancelled";
 *
 * export const orderFSM = defineFSM<OrderStatus>({
 *   initial: "draft",
 *   transitions: {
 *     draft: ["submitted", "cancelled"],
 *     submitted: ["confirmed", "cancelled"],
 *     confirmed: [],
 *     cancelled: [],
 *   },
 * });
 *
 * // Usage in domain logic
 * orderFSM.assertTransition(order.status, "submitted"); // Throws if invalid
 *
 * // Functional style
 * if (canTransition(orderFSM, order.status, "confirmed")) {
 *   // Safe to proceed
 * }
 *
 * // Check terminal state
 * if (orderFSM.isTerminal(order.status)) {
 *   // No further transitions allowed
 * }
 * ```
 */

import type { FSM, FSMDefinition } from "./types.js";
import { FSMTransitionError } from "./types.js";

/**
 * Create a type-safe FSM from a definition.
 *
 * @typeParam TState - Union type of all valid states
 * @param definition - FSM definition with initial state and transitions
 * @returns FSM instance with validation methods
 */
export function defineFSM<TState extends string>(definition: FSMDefinition<TState>): FSM<TState> {
  // Pre-compute valid states for O(1) lookup
  const validStates = new Set<string>(Object.keys(definition.transitions));

  return {
    definition,
    initial: definition.initial,

    canTransition(from: TState, to: TState): boolean {
      const allowed = definition.transitions[from];
      if (!allowed) return false;
      return allowed.includes(to);
    },

    assertTransition(from: TState, to: TState): void {
      const allowed = definition.transitions[from];
      if (!allowed || !allowed.includes(to)) {
        throw new FSMTransitionError(from, to, allowed ?? []);
      }
    },

    validTransitions(from: TState): readonly TState[] {
      return definition.transitions[from] ?? [];
    },

    isTerminal(state: TState): boolean {
      const allowed = definition.transitions[state];
      return !allowed || allowed.length === 0;
    },

    isValidState(state: string): state is TState {
      return validStates.has(state);
    },
  };
}
