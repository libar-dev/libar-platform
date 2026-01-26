"use client";

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { convexQuery } from "@convex-dev/react-query";
import { makeFunctionReference } from "convex/server";
import type { FunctionReference } from "convex/server";
import { AppLayout } from "@/components/templates/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OrderItemRow } from "@/components/molecules/order-item-row";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  useOrderDetail,
  useOrderItems,
  useMutationWithFeedback,
  useReactiveOrderDetail,
  isOrchestratorResultSuccess,
} from "@/hooks";
import { formatCurrency, formatDate } from "@/lib/formatters";
import type { OrderStatus, CommandOrchestratorResult } from "@/types";
import type { ReservationStatus, OrderWithInventory } from "@/hooks/use-order-detail";
import type { OrderItem } from "@/hooks/use-order-items";

// Query references for SSR preloading (matching hooks)
const getOrderWithInventoryQuery = makeFunctionReference<"query">(
  "crossContextQueries:getOrderWithInventoryStatus"
) as FunctionReference<"query", "public", { orderId: string }, OrderWithInventory | null>;

const getOrderItemsQuery = makeFunctionReference<"query">(
  "orders:getOrderItems"
) as FunctionReference<"query", "public", { orderId: string }, OrderItem[]>;

export const Route = createFileRoute("/orders/$orderId")({
  loader: async ({ context, params }) => {
    // Prefetch order detail and items on the server
    await Promise.all([
      context.queryClient.ensureQueryData(
        convexQuery(getOrderWithInventoryQuery, { orderId: params.orderId })
      ),
      context.queryClient.ensureQueryData(
        convexQuery(getOrderItemsQuery, { orderId: params.orderId })
      ),
    ]);
  },
  component: OrderDetailPage,
});

// =============================================================================
// Mutation References (TS2589 Prevention)
// =============================================================================
// Using makeFunctionReference() bypasses Convex's FilterApi recursive type
// resolution entirely. This prevents TS2589 "Type instantiation is excessively
// deep" errors that occur when accessing paths like `api.orders.*`.
// =============================================================================

const submitOrderMutation = makeFunctionReference<"mutation">(
  "orders:submitOrder"
) as FunctionReference<
  "mutation",
  "public",
  { orderId: string; correlationId?: string },
  CommandOrchestratorResult
>;

const cancelOrderMutation = makeFunctionReference<"mutation">(
  "orders:cancelOrder"
) as FunctionReference<
  "mutation",
  "public",
  { orderId: string; reason?: string; correlationId?: string },
  CommandOrchestratorResult
>;

// Status badge variants
const statusVariants: Record<OrderStatus, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  submitted: "secondary",
  confirmed: "default",
  cancelled: "destructive",
};

// Reservation status display
const reservationDisplay: Record<string, { label: string; className: string }> = {
  pending: {
    label: "Reservation Pending",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  },
  confirmed: {
    label: "Stock Reserved",
    className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  },
  released: {
    label: "Stock Released",
    className: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
  },
  expired: {
    label: "Reservation Expired",
    className: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
  },
  failed: {
    label: "Reservation Failed",
    className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  },
};

/**
 * Order Detail page - displays order information, items, and reservation status.
 *
 * Features:
 * - **Reactive projections** for instant order status updates (10-50ms latency)
 * - Real-time updates via Convex subscriptions
 * - Order items from the orderItems projection
 * - Reservation status from cross-context projection
 * - Conditional actions based on order status
 *
 * ## Hybrid Data Fetching Strategy
 *
 * Uses two data sources for optimal UX:
 * 1. `useReactiveOrderDetail` - Instant order status updates via reactive projection
 * 2. `useOrderDetail` - Reservation status from cross-context (Inventory BC) projection
 *
 * The reactive projection only evolves from Order BC events, so reservation status
 * (which comes from Inventory BC) requires the cross-context query.
 */
function OrderDetailPage() {
  const navigate = useNavigate();
  const { orderId } = Route.useParams();

  // Guard: orderId must be defined before calling hooks
  // This can be undefined briefly during navigation transitions
  if (!orderId) {
    return (
      <AppLayout activeNav="orders">
        <div className="space-y-6">
          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          <div className="h-10 w-64 animate-pulse rounded bg-muted" />
          <div className="h-48 animate-pulse rounded-lg bg-muted" />
        </div>
      </AppLayout>
    );
  }

  // Reactive projection for instant order status updates (10-50ms latency)
  const {
    state: reactiveOrder,
    isOptimistic,
    isLoading: reactiveLoading,
  } = useReactiveOrderDetail(orderId);

  // Cross-context projection for reservation status (not in reactive projection)
  const { order: crossContextOrder, isLoading: crossContextLoading } = useOrderDetail(orderId);

  // Line items from dedicated projection
  const { items, isLoading: itemsLoading } = useOrderItems(orderId);

  // Merge data: reactive for order status, cross-context for reservation
  const order = reactiveOrder
    ? {
        orderId: reactiveOrder.orderId,
        customerId: reactiveOrder.customerId,
        orderStatus: reactiveOrder.status, // Map field name from reactive
        totalAmount: reactiveOrder.totalAmount,
        itemCount: reactiveOrder.itemCount,
        createdAt: reactiveOrder.createdAt,
        // Reservation status from cross-context (Inventory BC)
        reservationStatus: crossContextOrder?.reservationStatus,
      }
    : crossContextOrder
      ? {
          orderId: crossContextOrder.orderId,
          customerId: crossContextOrder.customerId,
          orderStatus: crossContextOrder.orderStatus,
          totalAmount: crossContextOrder.totalAmount,
          itemCount: crossContextOrder.itemCount,
          createdAt: crossContextOrder.createdAt,
          reservationStatus: crossContextOrder.reservationStatus,
        }
      : null;

  const {
    execute: executeSubmit,
    state: submitState,
    error: submitError,
    reset: resetSubmit,
  } = useMutationWithFeedback(submitOrderMutation);

  const {
    execute: executeCancel,
    state: cancelState,
    error: cancelError,
    reset: resetCancel,
  } = useMutationWithFeedback(cancelOrderMutation);

  // Show loading only while we don't have order data AND something is still loading
  // This allows the page to render once ANY data source has data (reactive OR cross-context)
  // rather than waiting for ALL sources to complete
  const isLoading = !order && (reactiveLoading || crossContextLoading || itemsLoading);
  const isActionPending = submitState === "pending" || cancelState === "pending";
  const actionError = submitError || cancelError;

  const handleSubmitOrder = async () => {
    await executeSubmit({ orderId });
  };

  const handleCancelOrder = async () => {
    const result = await executeCancel({ orderId, reason: "Cancelled by user" });
    if (isOrchestratorResultSuccess(result)) {
      navigate({ to: "/orders" });
    }
    // Error state is handled by useMutationWithFeedback
  };

  const dismissError = () => {
    resetSubmit();
    resetCancel();
  };

  // Calculate total from items
  const totalAmount = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  // Loading state
  if (isLoading) {
    return (
      <AppLayout activeNav="orders">
        <div className="space-y-6">
          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          <div className="h-10 w-64 animate-pulse rounded bg-muted" />
          <div className="h-48 animate-pulse rounded-lg bg-muted" />
        </div>
      </AppLayout>
    );
  }

  // Not found state
  if (!order) {
    return (
      <AppLayout activeNav="orders">
        <div className="space-y-6">
          <Link
            to="/orders"
            className="text-sm text-muted-foreground hover:underline"
            data-testid="back-to-orders-link"
          >
            ← Back to Orders
          </Link>
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-lg font-medium">Order not found</p>
              <p className="text-sm text-muted-foreground mt-1">
                The order you&apos;re looking for doesn&apos;t exist or has been removed.
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => navigate({ to: "/orders" })}
              >
                View All Orders
              </Button>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  const status = order.orderStatus;
  const reservationStatus = order.reservationStatus as ReservationStatus | undefined;

  return (
    <AppLayout activeNav="orders">
      <div className="space-y-6">
        {/* Back link */}
        <Link
          to="/orders"
          className="text-sm text-muted-foreground hover:underline"
          data-testid="back-to-orders-link"
        >
          ← Back to Orders
        </Link>

        {/* Page Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Order {order.orderId.slice(0, 8)}...
            </h1>
            <p className="text-muted-foreground">Created {formatDate(order.createdAt)}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={statusVariants[status]} data-testid="order-status-badge">
              {status}
            </Badge>
            {/* Optimistic update indicator - shows when reactive projection is ahead of durable */}
            {isOptimistic && (
              <span
                className="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                data-testid="optimistic-indicator"
              >
                <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                Updating...
              </span>
            )}
            {reservationStatus && reservationDisplay[reservationStatus] && (
              <span
                className={`rounded-full px-2 py-1 text-xs ${reservationDisplay[reservationStatus].className}`}
                data-testid="reservation-status-badge"
              >
                {reservationDisplay[reservationStatus].label}
              </span>
            )}
          </div>
        </div>

        {/* Action Error Banner */}
        {actionError && (
          <div
            data-testid="order-error-banner"
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
              <p className="font-medium text-red-800 dark:text-red-200">{actionError}</p>
              <button
                onClick={dismissError}
                className="ml-auto text-red-600 hover:text-red-800 dark:text-red-400"
                data-testid="order-error-dismiss"
                aria-label="Dismiss error"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* Status-specific banners */}
        {status === "submitted" && reservationStatus === "pending" && (
          <Card data-testid="order-processing-banner">
            <CardContent className="flex items-center gap-4 p-6">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <div>
                <p className="font-medium">Processing Order</p>
                <p className="text-sm text-muted-foreground">
                  Waiting for stock reservation to complete...
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {reservationStatus === "failed" && (
          <Card
            className="border-destructive/50 bg-destructive/5"
            data-testid="reservation-failed-banner"
          >
            <CardContent className="p-6">
              <p className="font-medium text-destructive">Stock Reservation Failed</p>
              <p className="text-sm text-muted-foreground">
                Unable to reserve stock for this order. The order may need to be modified.
              </p>
            </CardContent>
          </Card>
        )}

        {status === "cancelled" && (
          <Card
            className="border-destructive/50 bg-destructive/5"
            data-testid="order-cancelled-banner"
          >
            <CardContent className="p-6">
              <p className="font-medium text-destructive">Order Cancelled</p>
              <p className="text-sm text-muted-foreground" data-testid="cancellation-reason">
                This order was cancelled and can no longer be processed.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Order Content */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Order Items */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Order Items</CardTitle>
            </CardHeader>
            <CardContent className={`space-y-2 ${status === "cancelled" ? "opacity-60" : ""}`}>
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No items in this order
                </p>
              ) : (
                <>
                  {items.map((item) => (
                    <OrderItemRow
                      key={item.productId}
                      item={{
                        productId: item.productId,
                        productName: item.productName,
                        quantity: item.quantity,
                        unitPrice: item.unitPrice,
                      }}
                      readOnly
                    />
                  ))}
                  <div className="mt-4 flex justify-between border-t pt-4 text-lg font-semibold">
                    <span>Total</span>
                    <span>{formatCurrency(totalAmount)}</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Order Details */}
          <Card>
            <CardHeader>
              <CardTitle>Order Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Order ID</p>
                <p className="font-mono text-sm">{order.orderId}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Customer ID</p>
                <p className="font-medium">{order.customerId}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <p className="font-medium capitalize">{status}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Items</p>
                <p className="font-medium">{items.length} item(s)</p>
              </div>
              {reservationStatus && (
                <div>
                  <p className="text-sm text-muted-foreground">Reservation</p>
                  <span
                    className={`inline-block rounded-full px-2 py-1 text-xs ${
                      reservationDisplay[reservationStatus]?.className ??
                      "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {reservationDisplay[reservationStatus]?.label ?? reservationStatus}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Actions for draft orders */}
        {status === "draft" && (
          <div className="flex gap-3">
            <Button
              onClick={handleSubmitOrder}
              disabled={isActionPending || items.length === 0}
              data-testid="submit-order-button"
            >
              {submitState === "pending" ? (
                <>
                  <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Submitting...
                </>
              ) : (
                "Submit Order"
              )}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger
                variant="destructive"
                disabled={isActionPending}
                data-testid="cancel-order-button"
              >
                Cancel Order
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel this order?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. The order will be permanently cancelled.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep Order</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleCancelOrder}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Yes, Cancel Order
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
