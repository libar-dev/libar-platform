/**
 * Mock order data fixtures for Ladle stories.
 * Matches the orderSummaries projection schema.
 */

import type { OrderStatus } from "@/types";

/**
 * Mock ID type for Convex documents.
 * In production, this would come from Convex generated types.
 */
type MockId<TableName extends string> = string & { __tableName: TableName };

// Re-export OrderStatus for consumers that import from this file
export type { OrderStatus };

/**
 * Order summary projection type (matches schema.ts)
 */
export interface OrderSummaryItem {
  _id: MockId<"orderSummaries">;
  _creationTime: number;
  orderId: string;
  customerId: string;
  status: OrderStatus;
  itemCount: number;
  totalAmount: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Order item for cart/order detail views.
 * Note: This is a UI-level type, not directly from a projection.
 */
export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

const now = Date.now();
const hourMs = 3600000;
const dayMs = 86400000;

/**
 * Individual mock orders with different statuses.
 */
export const mockOrders = {
  draft: {
    _id: "order_001" as MockId<"orderSummaries">,
    _creationTime: now - hourMs,
    orderId: "ord-001",
    customerId: "demo-customer-001",
    status: "draft" as const,
    itemCount: 2,
    totalAmount: 299.99,
    createdAt: now - hourMs,
    updatedAt: now,
  },
  submitted: {
    _id: "order_002" as MockId<"orderSummaries">,
    _creationTime: now - hourMs * 3,
    orderId: "ord-002",
    customerId: "demo-customer-001",
    status: "submitted" as const,
    itemCount: 4,
    totalAmount: 549.96,
    createdAt: now - hourMs * 3,
    updatedAt: now - hourMs * 2,
  },
  confirmed: {
    _id: "order_003" as MockId<"orderSummaries">,
    _creationTime: now - dayMs,
    orderId: "ord-003",
    customerId: "demo-customer-002",
    status: "confirmed" as const,
    itemCount: 1,
    totalAmount: 89.99,
    createdAt: now - dayMs,
    updatedAt: now - hourMs * 12,
  },
  cancelled: {
    _id: "order_004" as MockId<"orderSummaries">,
    _creationTime: now - dayMs * 2,
    orderId: "ord-004",
    customerId: "demo-customer-001",
    status: "cancelled" as const,
    itemCount: 3,
    totalAmount: 179.97,
    createdAt: now - dayMs * 2,
    updatedAt: now - dayMs * 2 + hourMs * 4,
  },
  largeOrder: {
    _id: "order_005" as MockId<"orderSummaries">,
    _creationTime: now - hourMs * 6,
    orderId: "ord-005",
    customerId: "demo-customer-003",
    status: "submitted" as const,
    itemCount: 15,
    totalAmount: 2499.85,
    createdAt: now - hourMs * 6,
    updatedAt: now - hourMs * 5,
  },
  recentDraft: {
    _id: "order_006" as MockId<"orderSummaries">,
    _creationTime: now - 300000, // 5 minutes ago
    orderId: "ord-006",
    customerId: "demo-customer-001",
    status: "draft" as const,
    itemCount: 1,
    totalAmount: 49.99,
    createdAt: now - 300000,
    updatedAt: now - 60000, // 1 minute ago
  },
} as const satisfies Record<string, OrderSummaryItem>;

/**
 * Array of all mock orders for list views.
 */
export const orderList: OrderSummaryItem[] = Object.values(mockOrders);

/**
 * Orders filtered by status for testing filter views.
 */
export const ordersByStatus = {
  draft: orderList.filter((o) => o.status === "draft"),
  submitted: orderList.filter((o) => o.status === "submitted"),
  confirmed: orderList.filter((o) => o.status === "confirmed"),
  cancelled: orderList.filter((o) => o.status === "cancelled"),
} as const;

/**
 * Mock order items for cart and order detail views.
 */
export const mockOrderItems: OrderItem[] = [
  {
    productId: "prod-001",
    productName: "Ergonomic Keyboard",
    quantity: 2,
    unitPrice: 89.99,
  },
  {
    productId: "prod-002",
    productName: "Wireless Mouse",
    quantity: 1,
    unitPrice: 49.99,
  },
  {
    productId: "prod-003",
    productName: "USB-C Hub",
    quantity: 3,
    unitPrice: 39.99,
  },
  {
    productId: "prod-004",
    productName: "4K Monitor",
    quantity: 1,
    unitPrice: 399.99,
  },
  {
    productId: "prod-005",
    productName: "Mechanical Keyboard Pro",
    quantity: 1,
    unitPrice: 149.99,
  },
];

/**
 * Cart scenarios for testing different states.
 */
export const cartScenarios = {
  empty: [] as OrderItem[],
  singleItem: [mockOrderItems[0]],
  multipleItems: mockOrderItems.slice(0, 3),
  fullCart: mockOrderItems,
} as const;

/**
 * Helper to calculate total from order items.
 */
export function calculateOrderTotal(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
}

/**
 * Helper to calculate item count from order items.
 */
export function calculateItemCount(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

/**
 * Status display configuration for UI.
 */
export const orderStatusConfig: Record<
  OrderStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  draft: { label: "Draft", variant: "secondary" },
  submitted: { label: "Submitted", variant: "default" },
  confirmed: { label: "Confirmed", variant: "outline" },
  cancelled: { label: "Cancelled", variant: "destructive" },
} as const;
