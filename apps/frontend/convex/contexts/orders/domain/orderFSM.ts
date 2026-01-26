/**
 * Order Finite State Machine definition.
 *
 * Defines valid state transitions for the Order aggregate.
 * Used by deciders to validate transitions before emitting events.
 *
 * @example
 * ```typescript
 * import { orderFSM } from "./orderFSM";
 *
 * // In decider function
 * if (!orderFSM.canTransition(state.status, "submitted")) {
 *   return rejected("INVALID_TRANSITION", `Cannot submit from ${state.status}`);
 * }
 * ```
 */
import { defineFSM } from "@libar-dev/platform-core/fsm";
import type { OrderStatus } from "./order.js";

/**
 * Order aggregate FSM.
 *
 * Valid transitions:
 * - draft → submitted (SubmitOrder command)
 * - draft → cancelled (CancelOrder command)
 * - submitted → confirmed (ConfirmOrder command)
 * - submitted → cancelled (CancelOrder command)
 * - confirmed → (terminal)
 * - cancelled → (terminal)
 */
export const orderFSM = defineFSM<OrderStatus>({
  initial: "draft",
  transitions: {
    draft: ["submitted", "cancelled"],
    submitted: ["confirmed", "cancelled"],
    confirmed: [], // terminal state
    cancelled: [], // terminal state
  },
});
