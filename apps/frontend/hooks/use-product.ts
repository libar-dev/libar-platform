import { useQuery } from "convex/react";
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
 * Uses Convex's native useQuery with "skip" pattern for conditional fetching.
 *
 * @param productId - The product ID to fetch (undefined to skip the query)
 * @returns Object containing the product (or null) and loading state
 *
 * @example
 * ```tsx
 * function ProductDetail({ productId }: { productId: string }) {
 *   const { product, isLoading } = useProduct(productId);
 *
 *   if (isLoading) return <Skeleton />;
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
export function useProduct(productId: string | undefined): {
  product: Product | null;
  isLoading: boolean;
} {
  // Use Convex "skip" pattern when productId is undefined to avoid calling query with empty args
  const data = useQuery(getProductQuery, productId ? { productId } : "skip");

  return {
    product: (data ?? null) as Product | null,
    isLoading: !!productId && data === undefined,
  };
}
