"use client";

import { createFileRoute } from "@tanstack/react-router";
import { convexQuery } from "@convex-dev/react-query";
import { makeFunctionReference } from "convex/server";
import type { FunctionReference } from "convex/server";
import { AppLayout } from "@/components/templates/app-layout";
import { RouteErrorFallback } from "@/components/templates/route-error-fallback";
import { ProductList } from "@/components/organisms/product-list";
import { useProducts } from "@/hooks";
import type { Product } from "@/hooks/use-products";

// Query reference for SSR preloading (matching hooks/use-products.ts)
const listProductsQuery = makeFunctionReference<"query">(
  "inventory:listProducts"
) as FunctionReference<"query", "public", { limit?: number }, Product[]>;

export const Route = createFileRoute("/products")({
  ssr: "data-only",
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(convexQuery(listProductsQuery, {}));
  },
  component: ProductsPage,
  errorComponent: ({ error, reset }) => (
    <RouteErrorFallback
      title="Failed to Load Products"
      activeNav="products"
      error={error}
      reset={reset}
    />
  ),
});

/**
 * Products page - browse the product catalog.
 *
 * Displays all products with real-time updates from Convex.
 * Uses the productCatalog projection for efficient reads.
 */
function ProductsPage() {
  const { products, isLoading } = useProducts();

  return (
    <AppLayout activeNav="products">
      <div className="space-y-6">
        {/* Page Header */}
        <div data-testid="products-page-header">
          <h1 className="text-3xl font-bold tracking-tight">Products</h1>
          <p className="text-muted-foreground">Browse and manage the product catalog</p>
        </div>

        {/* Product List */}
        <ProductList products={products} isLoading={isLoading} />
      </div>
    </AppLayout>
  );
}
