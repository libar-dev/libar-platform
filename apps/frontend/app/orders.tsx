import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Orders layout route - renders child routes via Outlet.
 *
 * Child routes:
 * - /orders/ (index) - Orders list
 * - /orders/new - Create new order
 * - /orders/:orderId - Order detail
 */
export const Route = createFileRoute("/orders")({
  component: OrdersLayout,
});

function OrdersLayout() {
  return <Outlet />;
}
