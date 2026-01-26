/**
 * Custom React hooks for Convex data fetching.
 *
 * @example
 * ```tsx
 * import { useProducts, useOrders, useMutationWithFeedback } from "@/hooks";
 * ```
 */

export { useMounted } from "./use-mounted";
export { useProducts, type Product } from "./use-products";
export { useProduct } from "./use-product";
export { useOrders, type OrderSummary } from "./use-orders";
export type { OrderStatus } from "@/types";
// Re-export orchestrator types for backward compatibility
export type {
  CommandOrchestratorSuccess,
  CommandOrchestratorDuplicate,
  CommandOrchestratorRejected,
  CommandOrchestratorFailed,
  CommandOrchestratorResult,
} from "@/types";
export {
  useOrderDetail,
  type OrderWithInventory,
  type ReservationStatus,
} from "./use-order-detail";
export { useOrderItems, type OrderItem } from "./use-order-items";
export {
  useMutationWithFeedback,
  isOrchestratorResultSuccess,
  type MutationState,
  type MutationWithFeedback,
} from "./use-mutation-with-feedback";
export {
  useOrderCreation,
  type CreateOrderArgs,
  type OrderCreationResult,
  type UseOrderCreation,
} from "./use-order-creation";

// Reactive Projections (Phase 17)
export {
  useReactiveProjection,
  createGetPosition,
  type UseReactiveProjectionOptions,
  type ReactiveProjectionResult,
  type ReactiveDomainEvent,
  type EvolveFunction,
} from "./use-reactive-projection";
export {
  useReactiveOrderDetail,
  type OrderSummaryState,
  type OrderProjectionEvent,
} from "./use-reactive-order-detail";
