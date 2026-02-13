"use client";

import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { convexQuery } from "@convex-dev/react-query";
import { makeFunctionReference } from "convex/server";
import type { FunctionReference } from "convex/server";
import { AppLayout } from "@/components/templates/app-layout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ProductForm } from "@/components/organisms/product-form";
import { StockForm } from "@/components/organisms/stock-form";
import { ProductList } from "@/components/organisms/product-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useProducts, useMutationWithFeedback, isOrchestratorResultSuccess } from "@/hooks";
import type { Product } from "@/hooks/use-products";
import type { CommandOrchestratorResult } from "@/types";

// Query reference for SSR preloading (matching hooks/use-products.ts)
const listProductsQuery = makeFunctionReference<"query">(
  "inventory:listProducts"
) as FunctionReference<"query", "public", { limit?: number }, Product[]>;

export const Route = createFileRoute("/admin/products")({
  ssr: "data-only",
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(convexQuery(listProductsQuery, {}));
  },
  component: AdminProductsPage,
  errorComponent: AdminProductsErrorFallback,
});

// =============================================================================
// Mutation References (TS2589 Prevention)
// =============================================================================
// Using makeFunctionReference() bypasses Convex's FilterApi recursive type
// resolution entirely. This prevents TS2589 errors when accessing api paths.
// =============================================================================
const createProductMutation = makeFunctionReference<"mutation">(
  "inventory:createProduct"
) as FunctionReference<
  "mutation",
  "public",
  {
    productId: string;
    productName: string;
    sku: string;
    unitPrice: number;
  },
  CommandOrchestratorResult
>;

const addStockMutation = makeFunctionReference<"mutation">(
  "inventory:addStock"
) as FunctionReference<
  "mutation",
  "public",
  {
    productId: string;
    quantity: number;
    reason?: string;
  },
  CommandOrchestratorResult
>;

/**
 * Admin Products page - manage products and stock levels.
 *
 * Provides:
 * - Create Product tab: Form to create new products
 * - Add Stock tab: Form to add stock to existing products
 * - Current Inventory: List of all products with stock levels
 */
function AdminProductsPage() {
  const { products, isLoading } = useProducts();
  const [activeTab, setActiveTab] = useState("create");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    execute: executeCreateProduct,
    state: createState,
    error: createError,
    reset: resetCreate,
  } = useMutationWithFeedback(createProductMutation);

  const {
    execute: executeAddStock,
    state: stockState,
    error: stockError,
    reset: resetStock,
  } = useMutationWithFeedback(addStockMutation);

  const isSubmitting = createState === "pending" || stockState === "pending";

  const handleCreateProduct = async (data: {
    productId: string;
    productName: string;
    sku: string;
    unitPrice: number;
  }) => {
    setSuccessMessage(null);
    resetStock();

    const result = await executeCreateProduct({
      productId: data.productId,
      productName: data.productName,
      sku: data.sku,
      unitPrice: data.unitPrice,
    });

    if (isOrchestratorResultSuccess(result)) {
      setSuccessMessage(`Product "${data.productName}" created successfully!`);
    }
    // Errors are displayed via createError from the hook
  };

  const handleAddStock = async (data: { productId: string; quantity: number; reason?: string }) => {
    setSuccessMessage(null);
    resetCreate();

    const result = await executeAddStock({
      productId: data.productId,
      quantity: data.quantity,
      reason: data.reason,
    });

    if (isOrchestratorResultSuccess(result)) {
      const product = products.find((p) => p.productId === data.productId);
      setSuccessMessage(
        `Stock added successfully! ${data.quantity} units added to ${product?.productName || data.productId}.`
      );
    }
    // Error will be displayed via stockError from the hook
  };

  return (
    <AppLayout activeNav="admin">
      <div className="space-y-6">
        {/* Page Header */}
        <div data-testid="admin-products-page-header">
          <h1 className="text-3xl font-bold tracking-tight">Admin - Products</h1>
          <p className="text-muted-foreground">Create products and manage stock levels</p>
        </div>

        {/* Success Banner */}
        {successMessage && (
          <div
            data-testid="admin-success-banner"
            className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950"
          >
            <div className="flex items-center gap-2">
              <svg
                className="h-5 w-5 text-green-600 dark:text-green-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <p className="font-medium text-green-800 dark:text-green-200">{successMessage}</p>
              <button
                onClick={() => setSuccessMessage(null)}
                className="ml-auto text-green-600 hover:text-green-800 dark:text-green-400"
                data-testid="admin-success-dismiss"
                aria-label="Dismiss success message"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* Error Banner */}
        {(createError || stockError) && (
          <div
            data-testid="admin-error-banner"
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
              <p className="font-medium text-red-800 dark:text-red-200">
                {createError || stockError}
              </p>
              <button
                onClick={() => {
                  resetCreate();
                  resetStock();
                }}
                className="ml-auto text-red-600 hover:text-red-800 dark:text-red-400"
                data-testid="admin-error-dismiss"
                aria-label="Dismiss error"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* Tabs for Create Product / Add Stock */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="create" data-testid="tab-create-product">
              Create Product
            </TabsTrigger>
            <TabsTrigger value="stock" data-testid="tab-add-stock">
              Add Stock
            </TabsTrigger>
          </TabsList>

          <TabsContent value="create">
            <Card>
              <CardHeader>
                <CardTitle>Create New Product</CardTitle>
              </CardHeader>
              <CardContent>
                <ProductForm onSubmit={handleCreateProduct} isSubmitting={isSubmitting} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="stock">
            <Card>
              <CardHeader>
                <CardTitle>Add Stock</CardTitle>
              </CardHeader>
              <CardContent>
                <StockForm
                  products={products}
                  onSubmit={handleAddStock}
                  isSubmitting={isSubmitting}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Current Inventory */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Current Inventory</h2>
          <ProductList
            products={products}
            isLoading={isLoading}
            onProductSelect={() => {
              // Switch to stock tab when a product is selected
              setActiveTab("stock");
            }}
          />
        </div>
      </div>
    </AppLayout>
  );
}

function AdminProductsErrorFallback({ error, reset }: { error: Error; reset?: () => void }) {
  return (
    <AppLayout activeNav="products">
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
        <h2 className="text-lg font-semibold text-destructive">Failed to Load Admin Products</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {error.message || "An unexpected error occurred while loading products."}
        </p>
        {reset && (
          <button
            onClick={reset}
            className="mt-4 rounded-md border px-4 py-2 text-sm hover:bg-accent"
          >
            Try Again
          </button>
        )}
      </div>
    </AppLayout>
  );
}
