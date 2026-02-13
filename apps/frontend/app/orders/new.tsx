"use client";

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { convexQuery } from "@convex-dev/react-query";
import { makeFunctionReference } from "convex/server";
import type { FunctionReference } from "convex/server";
import { AppLayout } from "@/components/templates/app-layout";
import { OrderCreateForm } from "@/components/organisms/order-create-form";
import { useProducts, useOrderCreation } from "@/hooks";
import type { Product } from "@/hooks/use-products";
import { DEMO_CUSTOMER_ID } from "@/app/-constants";
import type { CartItem } from "@/types";

// Query reference for SSR preloading (TS2589 prevention)
const listProductsQuery = makeFunctionReference<"query">(
  "inventory:listProducts"
) as FunctionReference<"query", "public", { limit?: number }, Product[]>;

export const Route = createFileRoute("/orders/new")({
  ssr: "data-only",
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(convexQuery(listProductsQuery, {}));
  },
  component: NewOrderPage,
});

/**
 * Create Order page - allows users to create new orders.
 *
 * Uses the useOrderCreation hook to encapsulate the multi-step mutation flow:
 * 1. createOrder - Create draft order with UUID
 * 2. addOrderItem - Add each cart item (sequential)
 * 3. submitOrder - Submit for processing (triggers saga)
 * 4. Redirect to order detail page
 */
function NewOrderPage() {
  const navigate = useNavigate();
  const { products, isLoading } = useProducts();
  const { execute, state, error, reset } = useOrderCreation();

  const isSubmitting = state === "pending";

  const handleSubmit = async (items: CartItem[]) => {
    const result = await execute({ customerId: DEMO_CUSTOMER_ID, items });
    if (result) {
      navigate({ to: "/orders/$orderId", params: { orderId: result.orderId } });
    }
    // Error state is handled by useOrderCreation
  };

  const handleCancel = () => {
    navigate({ to: "/orders" });
  };

  return (
    <AppLayout activeNav="orders">
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Create Order</h1>
          <p className="text-muted-foreground">Select products and quantities for a new order</p>
        </div>

        {/* Error Banner */}
        {error && (
          <div
            data-testid="order-create-error-banner"
            className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950"
          >
            <div className="flex items-center gap-2">
              <svg
                className="h-5 w-5 text-red-600 dark:text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="font-medium text-red-800 dark:text-red-200">{error}</p>
              <button
                onClick={reset}
                className="ml-auto text-red-600 hover:text-red-800 dark:text-red-400"
                data-testid="order-create-error-dismiss"
                aria-label="Dismiss error"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading products...</div>
        ) : (
          /* Order Form */
          <OrderCreateForm
            products={products}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            isSubmitting={isSubmitting}
          />
        )}
      </div>
    </AppLayout>
  );
}
