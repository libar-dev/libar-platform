/**
 * ## Shared Evolve Functions for Reactive Projections
 *
 * This module exports pure evolve functions that run identically on
 * both server (durable projections) and client (optimistic updates).
 *
 * ### Usage
 *
 * ```typescript
 * // Server-side (projection handler)
 * import { evolveOrderSummary } from "./evolve";
 *
 * // Client-side (React hook)
 * import { evolveOrderSummary } from "@convex/projections/evolve";
 * ```
 *
 * @libar-docs
 * @libar-docs-implements ReactiveProjections
 * @libar-docs-status completed
 */

// Order Summary evolve function
export {
  evolveOrderSummary,
  createInitialOrderSummary,
  type OrderSummaryState,
  type OrderProjectionEvent,
  type OrderEventType,
  type OrderEventPayload,
  type OrderCreatedPayload,
  type OrderItemAddedPayload,
  type OrderItemRemovedPayload,
  type OrderSubmittedPayload,
  type OrderConfirmedPayload,
  type OrderCancelledPayload,
} from "./orderSummary.evolve.js";
