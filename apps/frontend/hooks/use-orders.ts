import { useSuspenseQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { makeFunctionReference } from "convex/server";
import type { FunctionReference } from "convex/server";
import type { OrderStatus } from "@/types";

/**
 * Order summary data from the orderSummaries projection.
 */
export interface OrderSummary {
  _id: string;
  _creationTime: number;
  orderId: string;
  customerId: string;
  status: OrderStatus;
  itemCount: number;
  totalAmount: number;
  createdAt: number;
  updatedAt: number;
}

// Using makeFunctionReference to bypass FilterApi recursive type resolution (TS2589 prevention)
// Type safety is maintained by Convex's runtime validation layer
const getAllOrdersQuery = makeFunctionReference<"query">(
  "orders:getAllOrders"
) as FunctionReference<"query", "public", { limit?: number }, OrderSummary[]>;

/**
 * Hook to fetch all orders.
 *
 * Uses TanStack Query + Convex for SSR support with real-time updates.
 * Data is prefetched on the server, then hydrated with live subscriptions.
 *
 * @param limit - Maximum number of orders to fetch (default 100)
 * @returns Object containing orders array (always defined with Suspense)
 *
 * @example
 * ```tsx
 * function OrderList() {
 *   const { orders } = useOrders(20);
 *
 *   return (
 *     <ul>
 *       {orders.map(order => (
 *         <li key={order.orderId}>
 *           Order {order.orderId} - {order.status}
 *         </li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 */
export function useOrders(limit?: number): {
  orders: OrderSummary[];
  isLoading: false; // With Suspense, data is always loaded
} {
  const { data } = useSuspenseQuery(convexQuery(getAllOrdersQuery, { limit }));

  return {
    orders: (data ?? []) as OrderSummary[],
    isLoading: false, // Suspense handles loading state
  };
}
