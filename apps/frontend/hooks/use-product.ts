import { useSuspenseQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { makeFunctionReference } from "convex/server";
import type { FunctionReference } from "convex/server";
import type { Product } from "./use-products";

// Using makeFunctionReference to bypass FilterApi recursive type resolution (TS2589 prevention)
// Type safety is maintained by Convex's runtime validation layer
const getProductQuery = makeFunctionReference<"query">("inventory:getProduct") as FunctionReference<
  "query",
  "public",
  { productId: string },
  Product | null
>;

/**
 * Hook to fetch a single product by ID.
 *
 * Uses TanStack Query + Convex for SSR support with real-time updates.
 * Data is prefetched on the server, then hydrated with live subscriptions.
 *
 * @param productId - The product ID to fetch
 * @returns Object containing the product (or null)
 *
 * @example
 * ```tsx
 * function ProductDetail({ productId }: { productId: string }) {
 *   const { product } = useProduct(productId);
 *
 *   if (!product) return <NotFound />;
 *
 *   return (
 *     <div>
 *       <h1>{product.productName}</h1>
 *       <p>SKU: {product.sku}</p>
 *       <p>Available: {product.availableQuantity}</p>
 *     </div>
 *   );
 * }
 * ```
 */
export function useProduct(productId: string): {
  product: Product | null;
  isLoading: false; // With Suspense, data is always loaded
} {
  const { data } = useSuspenseQuery(convexQuery(getProductQuery, { productId }));

  return {
    product: (data ?? null) as Product | null,
    isLoading: false, // Suspense handles loading state
  };
}
