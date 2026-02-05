import type { Story, StoryDefault } from "@ladle/react";
import { Link } from "@tanstack/react-router";
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
import { mockOrderItems, mockOrders } from "@/components/__fixtures__/orders";
import { formatCurrency, formatDate } from "@/lib/formatters";

const meta: StoryDefault = {
  title: "Pages/OrderDetail",
};
export default meta;

// Status badge variants
const statusVariants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  submitted: "secondary",
  confirmed: "default",
  cancelled: "destructive",
};

// Reservation status colors
const reservationColors: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  confirmed: "bg-green-100 text-green-800",
  released: "bg-gray-100 text-gray-800",
  failed: "bg-red-100 text-red-800",
};

/**
 * Order Detail page - confirmed order with reservation
 */
export const Confirmed: Story = () => {
  const order = mockOrders.confirmed;
  const totalAmount = mockOrderItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  return (
    <AppLayout activeNav="orders">
      <div className="space-y-6">
        {/* Back link */}
        <Link to="/orders" className="text-sm text-muted-foreground hover:underline">
          ← Back to Orders
        </Link>

        {/* Page Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Order {order.orderId}</h1>
            <p className="text-muted-foreground">Created {formatDate(order.createdAt)}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={statusVariants[order.status]}>{order.status}</Badge>
            <span className={`rounded-full px-2 py-1 text-xs ${reservationColors.confirmed}`}>
              Stock Reserved
            </span>
          </div>
        </div>

        {/* Order Summary */}
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Order Items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {mockOrderItems.map((item, index) => (
                <OrderItemRow key={index} item={item} readOnly />
              ))}
              <div className="mt-4 flex justify-between border-t pt-4 text-lg font-semibold">
                <span>Total</span>
                <span>{formatCurrency(totalAmount)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Order Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Customer ID</p>
                <p className="font-medium">demo-customer-001</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <p className="font-medium capitalize">{order.status}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Items</p>
                <p className="font-medium">{order.itemCount} items</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Reservation</p>
                <span className={`rounded-full px-2 py-1 text-xs ${reservationColors.confirmed}`}>
                  Confirmed
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
};
Confirmed.meta = {
  description: "Order detail page for a confirmed order with reservation",
};

/**
 * Order Detail page - submitted order awaiting confirmation
 *
 * Submitted orders can be cancelled (triggers Agent BC churn detection on 3+ cancellations).
 */
export const Submitted: Story = () => {
  const order = mockOrders.submitted;

  return (
    <AppLayout activeNav="orders">
      <div className="space-y-6">
        <Link to="/orders" className="text-sm text-muted-foreground hover:underline">
          ← Back to Orders
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Order {order.orderId}</h1>
            <p className="text-muted-foreground">Created {formatDate(order.createdAt)}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={statusVariants[order.status]}>{order.status}</Badge>
            <span className={`rounded-full px-2 py-1 text-xs ${reservationColors.pending}`}>
              Reservation Pending
            </span>
          </div>
        </div>

        {/* Loading indicator for reservation */}
        <Card>
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

        <Card>
          <CardHeader>
            <CardTitle>Order Items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {mockOrderItems.slice(0, 2).map((item, index) => (
              <OrderItemRow key={index} item={item} readOnly />
            ))}
          </CardContent>
        </Card>

        {/* Cancel action - submitted orders can be cancelled */}
        <div className="flex gap-3">
          <AlertDialog>
            <AlertDialogTrigger variant="destructive">Cancel Order</AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancel this order?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. The order will be permanently cancelled.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep Order</AlertDialogCancel>
                <AlertDialogAction>Yes, Cancel Order</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </AppLayout>
  );
};
Submitted.meta = {
  description: "Order detail page for a submitted order with pending reservation and cancel option",
};

/**
 * Order Detail page - draft order with submit and cancel options
 *
 * Both draft and submitted orders can be cancelled (triggers Agent BC churn detection on 3+ cancellations).
 */
export const Draft: Story = () => {
  const order = mockOrders.draft;

  return (
    <AppLayout activeNav="orders">
      <div className="space-y-6">
        <Link to="/orders" className="text-sm text-muted-foreground hover:underline">
          ← Back to Orders
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Order {order.orderId}</h1>
            <p className="text-muted-foreground">Created {formatDate(order.createdAt)}</p>
          </div>
          <Badge variant={statusVariants[order.status]}>{order.status}</Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Order Items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {mockOrderItems.slice(0, 2).map((item, index) => (
              <OrderItemRow key={index} item={item} readOnly />
            ))}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-3">
          <Button>Submit Order</Button>
          <AlertDialog>
            <AlertDialogTrigger variant="destructive">Cancel Order</AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancel this order?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. The order will be permanently cancelled.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep Order</AlertDialogCancel>
                <AlertDialogAction>Yes, Cancel Order</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </AppLayout>
  );
};
Draft.meta = {
  description: "Order detail page for a draft order with submit and cancel options",
};

/**
 * Order Detail page - cancelled order
 */
export const Cancelled: Story = () => {
  const order = mockOrders.cancelled;

  return (
    <AppLayout activeNav="orders">
      <div className="space-y-6">
        <Link to="/orders" className="text-sm text-muted-foreground hover:underline">
          ← Back to Orders
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Order {order.orderId}</h1>
            <p className="text-muted-foreground">Created {formatDate(order.createdAt)}</p>
          </div>
          <Badge variant={statusVariants[order.status]}>{order.status}</Badge>
        </div>

        {/* Cancellation notice */}
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-6">
            <p className="font-medium text-destructive">Order Cancelled</p>
            <p className="text-sm text-muted-foreground">
              This order was cancelled. Reason: Customer request
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Order Items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 opacity-60">
            {mockOrderItems.slice(0, 2).map((item, index) => (
              <OrderItemRow key={index} item={item} readOnly />
            ))}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};
Cancelled.meta = {
  description: "Order detail page for a cancelled order",
};

/**
 * Order Detail page - failed reservation
 */
export const FailedReservation: Story = () => {
  const order = { ...mockOrders.submitted, status: "submitted" as const };

  return (
    <AppLayout activeNav="orders">
      <div className="space-y-6">
        <Link to="/orders" className="text-sm text-muted-foreground hover:underline">
          ← Back to Orders
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Order {order.orderId}</h1>
            <p className="text-muted-foreground">Created {formatDate(order.createdAt)}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={statusVariants[order.status]}>{order.status}</Badge>
            <span className={`rounded-full px-2 py-1 text-xs ${reservationColors.failed}`}>
              Reservation Failed
            </span>
          </div>
        </div>

        {/* Error banner */}
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-6">
            <p className="font-medium text-destructive">Stock Reservation Failed</p>
            <p className="text-sm text-muted-foreground">
              Insufficient stock for &quot;Wireless Mouse&quot;. Compensation has been applied.
            </p>
            <Button variant="outline" size="sm" className="mt-3">
              Modify Order
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Order Items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {mockOrderItems.slice(0, 2).map((item, index) => (
              <OrderItemRow key={index} item={item} readOnly />
            ))}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};
FailedReservation.meta = {
  description: "Order detail page showing failed reservation with compensation",
};
