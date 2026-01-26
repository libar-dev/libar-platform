import { useSuspenseQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { makeFunctionReference } from "convex/server";
import type { FunctionReference } from "convex/server";

/**
 * Order item data from the orderItems projection.
 */
export interface OrderItem {
  _id: string;
  _creationTime: number;
  orderId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  createdAt: number;
  updatedAt: number;
}

// Using makeFunctionReference to bypass FilterApi recursive type resolution (TS2589 prevention)
// Type safety is maintained by Convex's runtime validation layer
const getOrderItemsQuery = makeFunctionReference<"query">(
  "orders:getOrderItems"
) as FunctionReference<"query", "public", { orderId: string }, OrderItem[]>;

/**
 * Hook to fetch order items for a specific order.
 *
 * Uses TanStack Query + Convex for SSR support with real-time updates.
 * Data is prefetched on the server, then hydrated with live subscriptions.
 *
 * @param orderId - The order ID to fetch items for
 * @returns Object containing items array (always defined with Suspense)
 *
 * @example
 * ```tsx
 * function OrderItems({ orderId }: { orderId: string }) {
 *   const { items } = useOrderItems(orderId);
 *
 *   return (
 *     <ul>
 *       {items.map(item => (
 *         <li key={item.productId}>
 *           {item.productName} x {item.quantity} = ${item.lineTotal}
 *         </li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 */
export function useOrderItems(orderId: string): {
  items: OrderItem[];
  isLoading: false; // With Suspense, data is always loaded
} {
  const { data } = useSuspenseQuery(convexQuery(getOrderItemsQuery, { orderId }));

  return {
    items: (data ?? []) as OrderItem[],
    isLoading: false, // Suspense handles loading state
  };
}
