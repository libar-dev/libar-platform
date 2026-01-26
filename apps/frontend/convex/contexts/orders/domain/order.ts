/**
 * Order CMS (Command Model State) types and utilities.
 */
import type { BaseCMS } from "@libar-dev/platform-core";
import { z } from "zod";

/**
 * Current CMS schema version.
 * Increment when the OrderCMS structure changes.
 */
export const CURRENT_ORDER_CMS_VERSION = 1;

/**
 * Order status values.
 */
export type OrderStatus = "draft" | "submitted" | "confirmed" | "cancelled";

/**
 * Order item value object schema (single source of truth).
 *
 * Constraints:
 * - quantity: must be a positive integer (> 0)
 * - unitPrice: must be non-negative (>= 0)
 */
export const OrderItemSchema = z.object({
  productId: z.string().min(1, "Product ID is required"),
  productName: z.string().min(1, "Product name is required"),
  quantity: z.number().int("Quantity must be an integer").positive("Quantity must be positive"),
  unitPrice: z.number().nonnegative("Unit price cannot be negative"),
});

/**
 * Order item type (derived from schema).
 */
export type OrderItem = z.infer<typeof OrderItemSchema>;

/**
 * Order CMS (Command Model State).
 *
 * This represents the current state of an Order aggregate.
 * It's maintained atomically alongside events in the dual-write pattern.
 */
export interface OrderCMS extends BaseCMS {
  orderId: string;
  customerId: string;
  status: OrderStatus;
  items: OrderItem[];
  totalAmount: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Calculate total amount from items.
 */
export function calculateTotalAmount(items: OrderItem[]): number {
  return items.reduce((total, item) => total + item.quantity * item.unitPrice, 0);
}

/**
 * Create initial CMS for a new order.
 */
export function createInitialOrderCMS(orderId: string, customerId: string): OrderCMS {
  const now = Date.now();
  return {
    orderId,
    customerId,
    status: "draft",
    items: [],
    totalAmount: 0,
    version: 0, // Will be 1 after first event
    stateVersion: CURRENT_ORDER_CMS_VERSION,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Upcast OrderCMS from older versions to current version.
 */
export function upcastOrderCMS(raw: unknown): OrderCMS {
  const state = raw as Record<string, unknown>;
  const currentStateVersion = typeof state["stateVersion"] === "number" ? state["stateVersion"] : 0;

  // Already at current version
  if (currentStateVersion === CURRENT_ORDER_CMS_VERSION) {
    return raw as OrderCMS;
  }

  // Reject future versions that this code doesn't understand
  if (currentStateVersion > CURRENT_ORDER_CMS_VERSION) {
    throw new Error(
      `OrderCMS version ${currentStateVersion} is newer than supported version ${CURRENT_ORDER_CMS_VERSION}. Update code to handle this version.`
    );
  }

  // Add migrations here as schema evolves
  // Example:
  // if (currentStateVersion === 0) {
  //   return {
  //     ...(raw as OrderCMSv0),
  //     newField: "defaultValue",
  //     stateVersion: 1,
  //   };
  // }

  // If no migration path, return as-is (will fail type check if incompatible)
  return {
    ...(raw as OrderCMS),
    stateVersion: CURRENT_ORDER_CMS_VERSION,
  };
}
