"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatRelativeTime } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { OrderStatus } from "@/types";

/**
 * Order data required for the OrderCard component
 */
export interface OrderCardOrder {
  orderId: string;
  status: OrderStatus;
  itemCount: number;
  totalAmount: number;
  createdAt: number;
}

/**
 * Props for the OrderCard component
 */
export interface OrderCardProps {
  /** Order data to display */
  order: OrderCardOrder;
  /** Callback when the card is clicked */
  onClick?: (orderId: string) => void;
}

/**
 * Status display configuration for consistent styling
 */
const statusConfig: Record<
  OrderStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  draft: { label: "Draft", variant: "secondary" },
  submitted: { label: "Submitted", variant: "default" },
  confirmed: { label: "Confirmed", variant: "outline" },
  cancelled: { label: "Cancelled", variant: "destructive" },
};

/**
 * Truncates order ID for display (shows first 8 chars)
 */
function truncateOrderId(orderId: string): string {
  if (orderId.length <= 12) return orderId;
  return `${orderId.slice(0, 8)}...`;
}

/**
 * OrderCard displays an order summary with status.
 * Used in order list views and navigation.
 *
 * @example
 * ```tsx
 * <OrderCard
 *   order={{
 *     orderId: "ord-001",
 *     status: "submitted",
 *     itemCount: 3,
 *     totalAmount: 299.99,
 *     createdAt: Date.now() - 3600000,
 *   }}
 *   onClick={(id) => console.log("Navigate to:", id)}
 * />
 * ```
 */
export function OrderCard({ order, onClick }: OrderCardProps) {
  const config = statusConfig[order.status];

  const handleClick = () => {
    if (onClick) {
      onClick(order.orderId);
    }
  };

  const isInteractive = !!onClick;

  return (
    <Card
      size="sm"
      data-testid={`order-card-${order.orderId}`}
      className={cn(
        isInteractive && "cursor-pointer transition-shadow hover:ring-2 hover:ring-primary/50"
      )}
      onClick={isInteractive ? handleClick : undefined}
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onKeyDown={
        isInteractive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleClick();
              }
            }
          : undefined
      }
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle data-testid="order-id" className="font-mono text-sm">
            {truncateOrderId(order.orderId)}
          </CardTitle>
          <Badge variant={config.variant} data-testid="order-status">
            {config.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium" data-testid="order-total">
              {formatCurrency(order.totalAmount)}
            </span>
            <span className="text-xs text-muted-foreground" data-testid="order-item-count">
              {order.itemCount} {order.itemCount === 1 ? "item" : "items"}
            </span>
          </div>
          <span className="text-xs text-muted-foreground" data-testid="order-time">
            {formatRelativeTime(order.createdAt)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
