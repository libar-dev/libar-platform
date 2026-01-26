/**
 * Finite State Machine module for explicit state transitions.
 *
 * Re-exports from @libar-dev/platform-fsm (Layer 0 package).
 *
 * @example
 * ```typescript
 * import { defineFSM, canTransition, FSMTransitionError } from "@libar-dev/platform-core/fsm";
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
 * @module fsm
 */

// Re-export everything from @libar-dev/platform-fsm
export * from "@libar-dev/platform-fsm";
