/**
 * Decider pattern module for pure domain logic.
 *
 * The Decider pattern separates pure decision logic from infrastructure:
 * - `decide(state, command)` → events or rejection (PURE)
 * - Handler wrapper does I/O (load, persist, enqueue)
 *
 * Types and helpers are re-exported from @libar-dev/platform-decider (Layer 0).
 * Factory functions remain in this package (Layer 2) as they integrate with
 * orchestration infrastructure.
 *
 * @example
 * ```typescript
 * import { success, rejected, type DeciderOutput } from "@libar-dev/platform-core/decider";
 *
 * // Pure decider function
 * export function decideSubmitOrder(
 *   state: OrderCMS,
 *   command: { orderId: string },
 *   context: DeciderContext
 * ): DeciderOutput<OrderSubmittedEvent, SubmitOrderData, OrderStateUpdate> {
 *   if (state.status !== "draft") {
 *     return rejected("ORDER_NOT_IN_DRAFT", `Order is ${state.status}`);
 *   }
 *   if (state.items.length === 0) {
 *     return rejected("ORDER_HAS_NO_ITEMS", "Order must have items");
 *   }
 *
 *   return success({
 *     data: { orderId: state.orderId, totalAmount: state.totalAmount },
 *     event: {
 *       eventType: "OrderSubmitted",
 *       payload: { orderId: state.orderId, items: state.items },
 *     },
 *     stateUpdate: { status: "submitted" },
 *   });
 * }
 * ```
 *
 * @module decider
 */

// Re-export types from @libar-dev/platform-decider (Layer 0)
// Note: UnknownRecord is NOT re-exported here as it's already exported from ../types.js
export type {
  EventPayload,
  DeciderEvent,
  DeciderSuccess,
  DeciderRejected,
  DeciderFailed,
  DeciderOutput,
  DeciderContext,
  DeciderFn,
  Decider,
} from "@libar-dev/platform-decider";

// Re-export helper functions from @libar-dev/platform-decider
export { success, rejected, failed } from "@libar-dev/platform-decider";

// Re-export type guards from @libar-dev/platform-decider
export { isSuccess, isRejected, isFailed } from "@libar-dev/platform-decider";

// Factory functions (Layer 2 - integrates with orchestration)
export { createDeciderHandler, createEntityDeciderHandler } from "./factory.js";
export type {
  DeciderHandlerConfig,
  EntityDeciderHandlerConfig,
  BaseCommandArgs,
  LoadResult,
  BaseCMSState,
} from "./factory.js";
