"use client";

import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { makeFunctionReference } from "convex/server";
import type { FunctionReference } from "convex/server";
import type { OrderStatus } from "@/types";

/**
 * Reservation status type.
 */
export type ReservationStatus = "pending" | "confirmed" | "released" | "expired" | "failed";

/**
 * Order with inventory status from the cross-context projection.
 * Combines order and reservation data.
 */
export interface OrderWithInventory {
  _id: string;
  _creationTime: number;
  orderId: string;
  customerId: string;
  orderStatus: OrderStatus;
  reservationId?: string;
  reservationStatus?: ReservationStatus;
  totalAmount: number;
  itemCount: number;
  createdAt: number;
  updatedAt: number;
}

// Using makeFunctionReference to bypass FilterApi recursive type resolution (TS2589 prevention)
// Type safety is maintained by Convex's runtime validation layer
export const getOrderWithInventoryQuery = makeFunctionReference<"query">(
  "crossContextQueries:getOrderWithInventoryStatus"
) as FunctionReference<"query", "public", { orderId: string }, OrderWithInventory | null>;

/**
 * Hook to fetch order details with inventory status.
 *
 * Uses the cross-context projection that combines data from
 * both Orders and Inventory bounded contexts.
 *
 * @param orderId - The order ID to fetch
 * @returns Object containing the order with inventory status (or null) and loading state
 *
 * @example
 * ```tsx
 * function OrderDetail({ orderId }: { orderId: string }) {
 *   const { order, isLoading } = useOrderDetail(orderId);
 *
 *   if (isLoading) return <Skeleton />;
 *   if (!order) return <NotFound />;
 *
 *   return (
 *     <div>
 *       <h1>Order {order.orderId}</h1>
 *       <p>Status: {order.orderStatus}</p>
 *       {order.reservationStatus && (
 *         <p>Reservation: {order.reservationStatus}</p>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 */
export function useOrderDetail(orderId: string | undefined): {
  order: OrderWithInventory | null;
  isLoading: boolean;
} {
  // TanStack Query with convexQuery "skip" pattern — reads from the same cache
  // that route loaders populate via ensureQueryData(convexQuery(...))
  const { data, isLoading } = useQuery(
    convexQuery(getOrderWithInventoryQuery, orderId ? { orderId } : "skip")
  );

  return {
    order: (data ?? null) as OrderWithInventory | null,
    isLoading,
  };
}
