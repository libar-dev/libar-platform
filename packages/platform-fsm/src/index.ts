/**
 * Finite State Machine module for explicit state transitions.
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
 * // In decider function:
 * if (!canTransition(orderFSM, state.status, "submitted")) {
 *   return { status: "rejected", code: "INVALID_TRANSITION", ... };
 * }
 * ```
 *
 * @module @libar-dev/platform-fsm
 */

// Types
export type { FSMDefinition, FSM } from "./types.js";
export { FSMTransitionError } from "./types.js";

// Factory
export { defineFSM } from "./defineFSM.js";

// Operations
export {
  canTransition,
  assertTransition,
  validTransitions,
  isTerminal,
  isValidState,
} from "./operations.js";
