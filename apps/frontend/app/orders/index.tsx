"use client";

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { convexQuery } from "@convex-dev/react-query";
import { makeFunctionReference } from "convex/server";
import type { FunctionReference } from "convex/server";
import { AppLayout } from "@/components/templates/app-layout";
import { OrderList } from "@/components/organisms/order-list";
import { Button } from "@/components/ui/button";
import { useOrders, useMounted } from "@/hooks";
import type { OrderSummary } from "@/hooks/use-orders";

// Query reference for SSR preloading (matching hooks/use-orders.ts)
const getAllOrdersQuery = makeFunctionReference<"query">(
  "orders:getAllOrders"
) as FunctionReference<"query", "public", { limit?: number }, OrderSummary[]>;

export const Route = createFileRoute("/orders/")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(convexQuery(getAllOrdersQuery, {}));
  },
  component: OrdersPage,
});

/**
 * Orders page - view and manage customer orders.
 *
 * Displays all orders with real-time updates from Convex.
 * Uses the orderSummaries projection for efficient reads.
 */
function OrdersPage() {
  const mounted = useMounted();
  const { orders, isLoading } = useOrders();
  const navigate = useNavigate();

  return (
    <AppLayout activeNav="orders">
      <div className="space-y-6">
        {/* Page Header with New Order Button */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Orders</h1>
            <p className="text-muted-foreground">View and manage customer orders</p>
          </div>
          <Link to="/orders/new">
            <Button data-testid="new-order-button">New Order</Button>
          </Link>
        </div>

        {/* Order List - treat SSR as loading to avoid hydration mismatch */}
        <OrderList
          orders={orders}
          isLoading={!mounted || isLoading}
          onOrderClick={(orderId) => navigate({ to: `/orders/${orderId}` })}
        />
      </div>
    </AppLayout>
  );
}
