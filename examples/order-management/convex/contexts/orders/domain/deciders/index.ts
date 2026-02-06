/**
 * @libar-docs
 * @libar-docs-pattern OrderDeciders
 * @libar-docs-status completed
 * @libar-docs-decider
 * @libar-docs-arch-role decider
 * @libar-docs-arch-context orders
 * @libar-docs-arch-layer domain
 * @libar-docs-used-by OrderCommandHandlers
 *
 * Pure decision functions for Order aggregate.
 * Each decider validates invariants and produces events.
 * No I/O, no ctx — pure functions only.
 */

// Types
export type {
  // Event payloads (V1)
  OrderCreatedPayload,
  OrderItemAddedPayload,
  OrderItemRemovedPayload,
  OrderSubmittedPayload, // V1 (deprecated)
  OrderConfirmedPayload,
  OrderCancelledPayload,
  // Event payloads (V2 - Fat Events)
  OrderSubmittedV2Payload,
  // Event types
  OrderCreatedEvent,
  OrderItemAddedEvent,
  OrderItemRemovedEvent,
  OrderSubmittedEvent, // V1 (deprecated)
  OrderSubmittedV2Event, // V2 with customer snapshot
  OrderConfirmedEvent,
  OrderCancelledEvent,
  OrderEvent,
  // Command inputs
  CreateOrderInput,
  AddOrderItemInput,
  RemoveOrderItemInput,
  SubmitOrderInput,
  ConfirmOrderInput,
  CancelOrderInput,
  // State update
  OrderStateUpdate,
  // Success data
  CreateOrderData,
  AddOrderItemData,
  RemoveOrderItemData,
  SubmitOrderData,
  ConfirmOrderData,
  CancelOrderData,
  // Context types
  DeciderContext,
  SubmitOrderContext, // Extended context for Fat Events
  CustomerSnapshot,
} from "./types.js";

// Decider functions (decide)
export { decideCreateOrder } from "./createOrder.js";
export { decideAddOrderItem } from "./addOrderItem.js";
export { decideRemoveOrderItem } from "./removeOrderItem.js";
export { decideSubmitOrder } from "./submitOrder.js";
export { decideConfirmOrder } from "./confirmOrder.js";
export { decideCancelOrder } from "./cancelOrder.js";

// Evolve functions
export { evolveCreateOrder } from "./createOrder.js";
export { evolveAddOrderItem } from "./addOrderItem.js";
export { evolveRemoveOrderItem } from "./removeOrderItem.js";
export { evolveSubmitOrder } from "./submitOrder.js";
export { evolveConfirmOrder } from "./confirmOrder.js";
export { evolveCancelOrder } from "./cancelOrder.js";

// Full Decider objects (combining decide + evolve)
export { createOrderDecider } from "./createOrder.js";
export { addOrderItemDecider } from "./addOrderItem.js";
export { removeOrderItemDecider } from "./removeOrderItem.js";
export { submitOrderDecider } from "./submitOrder.js";
export { confirmOrderDecider } from "./confirmOrder.js";
export { cancelOrderDecider } from "./cancelOrder.js";
