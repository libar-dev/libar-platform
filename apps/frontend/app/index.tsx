"use client";

import { createFileRoute, Link } from "@tanstack/react-router";
import { convexQuery } from "@convex-dev/react-query";
import { makeFunctionReference } from "convex/server";
import type { FunctionReference } from "convex/server";
import { AppLayout } from "@/components/templates/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useProducts, useOrders } from "@/hooks";
import { STOCK_THRESHOLDS } from "@/lib/stock-utils";
import type { Product } from "@/hooks/use-products";
import type { OrderSummary } from "@/hooks/use-orders";

// Query references for SSR preloading (matching hooks/use-products.ts and hooks/use-orders.ts)
const listProductsQuery = makeFunctionReference<"query">(
  "inventory:listProducts"
) as FunctionReference<"query", "public", { limit?: number }, Product[]>;

const getAllOrdersQuery = makeFunctionReference<"query">(
  "orders:getAllOrders"
) as FunctionReference<"query", "public", { limit?: number }, OrderSummary[]>;

export const Route = createFileRoute("/")({
  ssr: "data-only",
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(convexQuery(listProductsQuery, {})),
      context.queryClient.ensureQueryData(convexQuery(getAllOrdersQuery, {})),
    ]);
  },
  component: DashboardPage,
  errorComponent: DashboardErrorFallback,
});

/**
 * Dashboard page - main entry point showing stats and quick actions.
 *
 * Uses real-time data from Convex projections:
 * - productCatalog for product stats
 * - orderSummaries for order stats
 */
function DashboardPage() {
  const { products, isLoading: productsLoading } = useProducts();
  const { orders, isLoading: ordersLoading } = useOrders();

  // Calculate stats from real data
  const totalProducts = products.length;
  const lowStockProducts = products.filter(
    (p) => p.availableQuantity > 0 && p.availableQuantity <= STOCK_THRESHOLDS.LOW
  );
  const totalOrders = orders.length;
  const pendingOrders = orders.filter((o) => o.status === "submitted");

  const isLoading = productsLoading || ordersLoading;

  return (
    <AppLayout activeNav="dashboard">
      <div className="space-y-6" data-testid="dashboard-page">
        {/* Page Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Welcome to the Order Management System</p>
        </div>

        {/* Low Stock Warning */}
        {lowStockProducts.length > 0 && (
          <div
            data-testid="low-stock-warning"
            className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950"
          >
            <div className="flex items-start gap-3">
              <svg
                className="h-5 w-5 text-amber-600 dark:text-amber-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <div>
                <h3 className="font-medium text-amber-800 dark:text-amber-200">Low Stock Alert</h3>
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  {lowStockProducts.length} product
                  {lowStockProducts.length === 1 ? " is" : "s are"} running low on stock. Consider
                  restocking soon.
                </p>
                <Link to="/admin/products">
                  <Button variant="outline" size="sm" className="mt-2">
                    View Low Stock Items
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card data-testid="stat-product-count">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Products
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{isLoading ? "..." : totalProducts}</div>
              {lowStockProducts.length > 0 ? (
                <p className="text-xs text-red-500">{lowStockProducts.length} low stock</p>
              ) : (
                <p className="text-xs text-muted-foreground">All products in stock</p>
              )}
            </CardContent>
          </Card>

          <Card data-testid="stat-order-count">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Orders
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{isLoading ? "..." : totalOrders}</div>
              <p className="text-xs text-muted-foreground">All time orders</p>
            </CardContent>
          </Card>

          <Card data-testid="stat-pending-count">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pending Orders
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className={`text-3xl font-bold ${pendingOrders.length > 0 ? "text-amber-600" : ""}`}
              >
                {isLoading ? "..." : pendingOrders.length}
              </div>
              <p className="text-xs text-muted-foreground">Awaiting confirmation</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card data-testid="quick-actions">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Link to="/orders/new">
              <Button data-testid="quick-new-order">New Order</Button>
            </Link>
            <Link to="/products">
              <Button variant="outline" data-testid="quick-view-products">
                View Products
              </Button>
            </Link>
            <Link to="/admin/products">
              <Button variant="outline" data-testid="quick-manage-stock">
                Manage Stock
              </Button>
            </Link>
            <Link to="/admin/products">
              <Button variant="secondary" data-testid="quick-admin">
                Admin Panel
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

function DashboardErrorFallback({ error, reset }: { error: Error; reset?: () => void }) {
  return (
    <AppLayout activeNav="dashboard">
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
        <h2 className="text-lg font-semibold text-destructive">Failed to Load Dashboard</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {error.message || "An unexpected error occurred while loading the dashboard."}
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
