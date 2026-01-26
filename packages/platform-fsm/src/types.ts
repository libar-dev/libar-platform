/**
 * ## FSM Types - Explicit State Transition Rules
 *
 * Finite State Machines make domain state transitions **explicit and type-safe**,
 * enabling compile-time validation of valid transitions.
 *
 * ### When to Use
 *
 * - Entity has distinct lifecycle states (`draft` → `submitted` → `confirmed`)
 * - Invalid state transitions should be prevented at compile time
 * - State transition rules are business requirements
 * - Documenting allowed paths through entity lifecycle
 *
 * ### Core Types
 *
 * | Type | Purpose |
 * |------|---------|
 * | `FSMDefinition<TState>` | Configuration: initial state + transition map |
 * | `FSM<TState>` | Instance with validation methods |
 * | `FSMTransitionError` | Error thrown for invalid transitions |
 *
 * ### FSM Definition Structure
 *
 * ```typescript
 * {
 *   initial: "draft",           // Starting state for new entities
 *   transitions: {
 *     draft: ["submitted", "cancelled"],  // Valid targets from draft
 *     submitted: ["confirmed", "cancelled"],
 *     confirmed: [],            // Terminal state (empty array)
 *     cancelled: [],            // Terminal state
 *   },
 * }
 * ```
 *
 * ### Relationship to Other Patterns
 *
 * - Used by **Deciders** to validate state transitions
 * - Enforces **aggregate invariants** in command handlers
 * - Complements **CMS upcast** for schema migrations
 *
 * @example
 * ```typescript
 * import { defineFSM, canTransition } from "@libar-dev/platform-fsm";
 *
 * type OrderStatus = "draft" | "submitted" | "confirmed" | "cancelled";
 *
 * export const orderFSM = defineFSM<OrderStatus>({
 *   initial: "draft",
 *   transitions: {
 *     draft: ["submitted", "cancelled"],
 *     submitted: ["confirmed", "cancelled"],
 *     confirmed: [],     // Terminal - order complete
 *     cancelled: [],     // Terminal - order abandoned
 *   },
 * });
 *
 * // Type-safe transition checks
 * if (canTransition(orderFSM, order.status, "submitted")) {
 *   // proceed with submit
 * }
 * ```
 */

/**
 * FSM definition for a set of states with allowed transitions.
 *
 * @typeParam TState - Union type of all valid states (string literals)
 *
 * @example
 * ```typescript
 * type OrderStatus = "draft" | "submitted" | "confirmed" | "cancelled";
 *
 * const definition: FSMDefinition<OrderStatus> = {
 *   initial: "draft",
 *   transitions: {
 *     draft: ["submitted", "cancelled"],
 *     submitted: ["confirmed", "cancelled"],
 *     confirmed: [],
 *     cancelled: [],
 *   },
 * };
 * ```
 */
export interface FSMDefinition<TState extends string> {
  /**
   * The initial state for new entities.
   */
  initial: TState;

  /**
   * Map of state → allowed target states.
   * Empty array = terminal state (no outgoing transitions).
   */
  transitions: Record<TState, readonly TState[]>;
}

/**
 * A complete FSM instance with validation operations.
 *
 * Created by `defineFSM()`, provides methods for checking
 * and asserting valid state transitions.
 *
 * @typeParam TState - Union type of all valid states
 */
export interface FSM<TState extends string> {
  /**
   * The underlying FSM definition.
   */
  readonly definition: FSMDefinition<TState>;

  /**
   * The initial state for new entities.
   */
  readonly initial: TState;

  /**
   * Check if a transition from one state to another is valid.
   *
   * @param from - Current state
   * @param to - Target state
   * @returns true if transition is allowed
   */
  canTransition(from: TState, to: TState): boolean;

  /**
   * Assert that a transition is valid, throwing if not.
   *
   * @param from - Current state
   * @param to - Target state
   * @throws FSMTransitionError if transition is not allowed
   */
  assertTransition(from: TState, to: TState): void;

  /**
   * Get all valid target states from a given state.
   *
   * @param from - Current state
   * @returns Array of valid target states
   */
  validTransitions(from: TState): readonly TState[];

  /**
   * Check if a state is terminal (no outgoing transitions).
   *
   * @param state - State to check
   * @returns true if state has no valid transitions
   */
  isTerminal(state: TState): boolean;

  /**
   * Check if a state is valid in this FSM.
   *
   * @param state - State to check
   * @returns true if state is defined in the FSM
   */
  isValidState(state: string): state is TState;
}

/**
 * Error thrown when an invalid FSM transition is attempted.
 */
export class FSMTransitionError extends Error {
  readonly code = "FSM_INVALID_TRANSITION";
  readonly from: string;
  readonly to: string;
  readonly validTransitions: readonly string[];

  constructor(from: string, to: string, validTransitions: readonly string[]) {
    const validList =
      validTransitions.length > 0 ? validTransitions.join(", ") : "(none - terminal state)";
    super(`Invalid transition from "${from}" to "${to}". Valid transitions: ${validList}`);
    this.name = "FSMTransitionError";
    this.from = from;
    this.to = to;
    this.validTransitions = validTransitions;
    // Required for proper Error subclass behavior in ES5 transpilation
    Object.setPrototypeOf(this, FSMTransitionError.prototype);
  }
}
