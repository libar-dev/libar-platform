"use client";

import { ProductCard, type ProductCardProduct } from "@/components/molecules/product-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Props for the ProductList component
 */
export interface ProductListProps {
  /** Array of products to display (undefined means loading) */
  products: ProductCardProduct[] | undefined;
  /** Whether the list is in loading state */
  isLoading?: boolean;
  /** Error message to display */
  error?: string;
  /** Callback when a product is selected */
  onProductSelect?: (productId: string) => void;
  /** Currently selected product ID */
  selectedProductId?: string;
  /** Callback to retry loading after error */
  onRetry?: () => void;
}

/**
 * Skeleton loader for product cards during loading state
 */
function ProductCardSkeleton() {
  return (
    <Card size="sm" className="animate-pulse">
      <div className="p-3 space-y-3">
        <div className="flex justify-between items-start">
          <div className="h-4 bg-muted rounded w-32" />
          <div className="h-5 bg-muted rounded w-20" />
        </div>
        <div className="flex justify-between items-center">
          <div className="h-5 bg-muted rounded w-24" />
          <div className="h-3 bg-muted rounded w-16" />
        </div>
      </div>
    </Card>
  );
}

/**
 * Empty state when no products exist
 */
function EmptyState() {
  return (
    <Card size="sm" className="col-span-full">
      <CardContent className="flex flex-col items-center justify-center py-8 text-center">
        <div className="text-muted-foreground mb-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
            <path d="m3.3 7 8.7 5 8.7-5" />
            <path d="M12 22V12" />
          </svg>
        </div>
        <h3 className="font-medium">No products yet</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Products will appear here once they are created.
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * Error state with retry button
 */
function ErrorState({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <Card size="sm" className="col-span-full border-destructive/50">
      <CardContent className="flex flex-col items-center justify-center py-8 text-center">
        <div className="text-destructive mb-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" x2="12" y1="8" y2="12" />
            <line x1="12" x2="12.01" y1="16" y2="16" />
          </svg>
        </div>
        <h3 className="font-medium text-destructive">Error loading products</h3>
        <p className="text-sm text-muted-foreground mt-1">{error}</p>
        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="mt-4"
            data-testid="product-list-retry"
          >
            Try again
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * ProductList displays a grid of product cards with loading, empty, and error states.
 * Used in product catalog views and order creation.
 *
 * @example
 * ```tsx
 * const { products, isLoading } = useProducts();
 *
 * <ProductList
 *   products={products}
 *   isLoading={isLoading}
 *   onProductSelect={(id) => setSelectedProduct(id)}
 *   selectedProductId={selectedProduct}
 * />
 * ```
 */
export function ProductList({
  products,
  isLoading,
  error,
  onProductSelect,
  selectedProductId,
  onRetry,
}: ProductListProps) {
  // Loading state: show skeleton grid
  if (isLoading || products === undefined) {
    return (
      <div data-testid="product-list-loading" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div data-testid="product-list-error" className="grid gap-4">
        <ErrorState error={error} onRetry={onRetry} />
      </div>
    );
  }

  // Empty state
  if (products.length === 0) {
    return (
      <div data-testid="product-list-empty" className="grid gap-4">
        <EmptyState />
      </div>
    );
  }

  // Populated state
  return (
    <div data-testid="product-list" className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3")}>
      {products.map((product) => (
        <ProductCard
          key={product.productId}
          product={product}
          onSelect={onProductSelect}
          selected={selectedProductId === product.productId}
        />
      ))}
    </div>
  );
}
