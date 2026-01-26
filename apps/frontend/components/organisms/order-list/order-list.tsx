"use client";

import { OrderCard, type OrderCardOrder } from "@/components/molecules/order-card";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Props for the OrderList component
 */
export interface OrderListProps {
  /** Array of orders to display (undefined means loading) */
  orders: OrderCardOrder[] | undefined;
  /** Whether the list is in loading state */
  isLoading?: boolean;
  /** Callback when an order is clicked */
  onOrderClick?: (orderId: string) => void;
}

/**
 * Skeleton loader for order cards during loading state
 */
function OrderCardSkeleton() {
  return (
    <Card size="sm" className="animate-pulse">
      <div className="p-3 space-y-3">
        <div className="flex justify-between items-start">
          <div className="h-4 bg-muted rounded w-24 font-mono" />
          <div className="h-5 bg-muted rounded w-20" />
        </div>
        <div className="flex justify-between items-center">
          <div className="space-y-1">
            <div className="h-4 bg-muted rounded w-16" />
            <div className="h-3 bg-muted rounded w-12" />
          </div>
          <div className="h-3 bg-muted rounded w-20" />
        </div>
      </div>
    </Card>
  );
}

/**
 * Empty state when no orders exist
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
            <circle cx="8" cy="21" r="1" />
            <circle cx="19" cy="21" r="1" />
            <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
          </svg>
        </div>
        <h3 className="font-medium">No orders yet</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Your orders will appear here once you create them.
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * OrderList displays a grid of order cards with loading and empty states.
 * Used in order history views.
 *
 * @example
 * ```tsx
 * const { orders, isLoading } = useOrders();
 *
 * <OrderList
 *   orders={orders}
 *   isLoading={isLoading}
 *   onOrderClick={(id) => router.push(`/orders/${id}`)}
 * />
 * ```
 */
export function OrderList({ orders, isLoading, onOrderClick }: OrderListProps) {
  // Loading state: show skeleton grid
  if (isLoading || orders === undefined) {
    return (
      <div data-testid="order-list-loading" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <OrderCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  // Empty state
  if (orders.length === 0) {
    return (
      <div data-testid="order-list-empty" className="grid gap-4">
        <EmptyState />
      </div>
    );
  }

  // Populated state
  return (
    <div data-testid="order-list" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {orders.map((order) => (
        <OrderCard key={order.orderId} order={order} onClick={onOrderClick} />
      ))}
    </div>
  );
}
