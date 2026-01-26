/**
 * Order Fixtures and Factories
 *
 * Test data factories for Order-related entities.
 * All generated IDs include the testRunId prefix for test isolation.
 */

import type { OrderItem, OrderStatus } from "../support/world";
import { withPrefix } from "../support/testRunId";

/**
 * Generates a unique order ID for testing.
 * Includes testRunId prefix for test isolation.
 */
export function generateOrderId(prefix: string = "ord"): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 7);
  return withPrefix(`${prefix}_test_${timestamp}_${random}`);
}

/**
 * Generates a unique customer ID for testing.
 * Includes testRunId prefix for test isolation.
 */
export function generateCustomerId(prefix: string = "cust"): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 7);
  return withPrefix(`${prefix}_test_${timestamp}_${random}`);
}

/**
 * Creates a default order item.
 */
export function createOrderItem(overrides?: Partial<OrderItem>): OrderItem {
  return {
    productId: overrides?.productId ?? generateProductId(),
    productName: overrides?.productName ?? "Test Product",
    quantity: overrides?.quantity ?? 1,
    unitPrice: overrides?.unitPrice ?? 10.0,
  };
}

/**
 * Creates an array of order items.
 */
export function createOrderItems(count: number = 1): OrderItem[] {
  return Array.from({ length: count }, (_, i) =>
    createOrderItem({
      productId: withPrefix(`prod_${i + 1}`),
      productName: `Product ${i + 1}`,
      quantity: i + 1,
      unitPrice: (i + 1) * 10,
    })
  );
}

/**
 * Generates a unique product ID for testing.
 * Includes testRunId prefix for test isolation.
 */
export function generateProductId(prefix: string = "prod"): string {
  const random = Math.random().toString(36).substring(2, 7);
  return withPrefix(`${prefix}_${random}`);
}

/**
 * Generates a unique command ID for idempotency testing.
 * Includes testRunId prefix for test isolation.
 */
export function generateCommandId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 9);
  return withPrefix(`cmd_${timestamp}_${random}`);
}

/**
 * Order factory with sensible defaults.
 */
export interface OrderFactoryOptions {
  orderId?: string;
  customerId?: string;
  status?: OrderStatus;
  items?: OrderItem[];
}

export function createOrderData(options: OrderFactoryOptions = {}) {
  const items = options.items ?? [];
  const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  return {
    orderId: options.orderId ?? generateOrderId(),
    customerId: options.customerId ?? generateCustomerId(),
    status: options.status ?? ("draft" as OrderStatus),
    items,
    totalAmount,
    itemCount: items.length,
  };
}

/**
 * Preset order configurations for common test scenarios.
 */
export const OrderPresets = {
  /**
   * Empty draft order (no items).
   */
  emptyDraft: (orderId?: string, customerId?: string) =>
    createOrderData({
      orderId,
      customerId,
      status: "draft",
      items: [],
    }),

  /**
   * Draft order with items.
   */
  draftWithItems: (orderId?: string, customerId?: string, itemCount: number = 2) =>
    createOrderData({
      orderId,
      customerId,
      status: "draft",
      items: createOrderItems(itemCount),
    }),

  /**
   * Submitted order.
   */
  submitted: (orderId?: string, customerId?: string) =>
    createOrderData({
      orderId,
      customerId,
      status: "submitted",
      items: createOrderItems(2),
    }),

  /**
   * Cancelled order.
   */
  cancelled: (orderId?: string, customerId?: string) =>
    createOrderData({
      orderId,
      customerId,
      status: "cancelled",
      items: createOrderItems(1),
    }),
};
