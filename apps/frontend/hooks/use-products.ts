import { useSuspenseQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { makeFunctionReference } from "convex/server";
import type { FunctionReference } from "convex/server";

/**
 * Product data from the productCatalog projection.
 */
export interface Product {
  _id: string;
  _creationTime: number;
  productId: string;
  productName: string;
  sku: string;
  unitPrice: number;
  availableQuantity: number;
  reservedQuantity: number;
  totalQuantity: number;
  createdAt: number;
  updatedAt: number;
}

// Using makeFunctionReference to bypass FilterApi recursive type resolution (TS2589 prevention)
// Type safety is maintained by Convex's runtime validation layer
const listProductsQuery = makeFunctionReference<"query">(
  "inventory:listProducts"
) as FunctionReference<"query", "public", { limit?: number }, Product[]>;

/**
 * Hook to fetch products from the inventory.
 *
 * Uses TanStack Query + Convex for SSR support with real-time updates.
 * Data is prefetched on the server, then hydrated with live subscriptions.
 *
 * @param limit - Maximum number of products to fetch (default 100)
 * @returns Object containing products array (always defined with Suspense)
 *
 * @example
 * ```tsx
 * function ProductList() {
 *   const { products } = useProducts(10);
 *
 *   return (
 *     <ul>
 *       {products.map(product => (
 *         <li key={product.productId}>{product.productName}</li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 */
export function useProducts(limit?: number): {
  products: Product[];
  isLoading: false; // With Suspense, data is always loaded
} {
  const { data } = useSuspenseQuery(convexQuery(listProductsQuery, { limit }));

  return {
    products: (data ?? []) as Product[],
    isLoading: false, // Suspense handles loading state
  };
}
