/**
 * Pure Functional Event Sourcing Decider Pattern.
 *
 * The Decider pattern separates pure business logic from infrastructure concerns,
 * enabling unit testing without database dependencies.
 *
 * @example
 * ```typescript
 * import {
 *   success,
 *   rejected,
 *   failed,
 *   isSuccess,
 *   type DeciderOutput,
 *   type DeciderContext,
 * } from "@libar-dev/platform-decider";
 *
 * // Pure decider function - no I/O, fully testable
 * export function decideSubmitOrder(
 *   state: OrderCMS,
 *   command: { orderId: string },
 *   context: DeciderContext
 * ): DeciderOutput<OrderSubmittedEvent, SubmitOrderData, OrderStateUpdate> {
 *   if (state.status !== "draft") {
 *     return rejected("ORDER_NOT_IN_DRAFT", `Order is ${state.status}`);
 *   }
 *
 *   return success({
 *     data: { orderId: state.orderId, totalAmount: state.totalAmount },
 *     event: { eventType: "OrderSubmitted", payload: { orderId: state.orderId } },
 *     stateUpdate: { status: "submitted" },
 *   });
 * }
 *
 * // In tests
 * const result = decideSubmitOrder(mockState, command, mockContext);
 * if (isSuccess(result)) {
 *   expect(result.event.eventType).toBe("OrderSubmitted");
 * }
 * ```
 *
 * @module @libar-dev/platform-decider
 */

// Types
export type {
  UnknownRecord,
  EventPayload,
  DeciderEvent,
  DeciderSuccess,
  DeciderRejected,
  DeciderFailed,
  DeciderOutput,
  DeciderContext,
  DeciderFn,
  Decider,
} from "./types.js";

// Helper Functions
export { success, rejected, failed } from "./types.js";

// Type Guards
export { isSuccess, isRejected, isFailed } from "./types.js";
