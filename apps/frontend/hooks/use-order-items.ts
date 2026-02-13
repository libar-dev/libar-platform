import { useQuery } from "@tanstack/react-query";
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
export const getOrderItemsQuery = makeFunctionReference<"query">(
  "orders:getOrderItems"
) as FunctionReference<"query", "public", { orderId: string }, OrderItem[]>;

/**
 * Hook to fetch order items for a specific order.
 *
 * Uses Convex's native useQuery with "skip" pattern for conditional fetching.
 *
 * @param orderId - The order ID to fetch items for (undefined to skip)
 * @returns Object containing items array and loading state
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
export function useOrderItems(orderId: string | undefined): {
  items: OrderItem[];
  isLoading: boolean;
} {
  // TanStack Query with convexQuery "skip" pattern — reads from the same cache
  // that route loaders populate via ensureQueryData(convexQuery(...))
  const { data, isLoading } = useQuery(
    convexQuery(getOrderItemsQuery, orderId ? { orderId } : "skip")
  );

  return {
    items: (data ?? []) as OrderItem[],
    isLoading,
  };
}
