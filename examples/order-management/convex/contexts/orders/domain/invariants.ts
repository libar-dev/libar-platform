/**
 * Order business invariants (domain rules).
 *
 * This module provides declarative invariants using createInvariant() that are:
 * - Composable into invariant sets for command validation
 * - Introspectable (check(), assert(), validate() methods)
 *
 * @example
 * ```typescript
 * // Validate all invariants for a command:
 * orderSubmitInvariants.assertAll(cms);
 *
 * // Or use individual invariant:
 * orderIsSubmitted.assert(cms);
 * ```
 */
import {
  createInvariant,
  createInvariantSet,
  InvariantError,
} from "@libar-dev/platform-core/invariants";
import { type OrderCMS, type OrderItem, OrderItemSchema } from "./order.js";

/**
 * Error codes for order invariant violations.
 */
export const OrderErrorCodes = {
  ORDER_NOT_FOUND: "ORDER_NOT_FOUND",
  ORDER_ALREADY_EXISTS: "ORDER_ALREADY_EXISTS",
  ORDER_NOT_IN_DRAFT: "ORDER_NOT_IN_DRAFT",
  ORDER_NOT_SUBMITTED: "ORDER_NOT_SUBMITTED",
  ORDER_ALREADY_CANCELLED: "ORDER_ALREADY_CANCELLED",
  ORDER_ALREADY_CONFIRMED: "ORDER_ALREADY_CONFIRMED",
  ORDER_HAS_NO_ITEMS: "ORDER_HAS_NO_ITEMS",
  ITEM_NOT_FOUND: "ITEM_NOT_FOUND",
  INVALID_QUANTITY: "INVALID_QUANTITY",
  INVALID_PRICE: "INVALID_PRICE",
  INVALID_ITEM_DATA: "INVALID_ITEM_DATA",
  MAX_ITEMS_EXCEEDED: "MAX_ITEMS_EXCEEDED",
} as const;

export type OrderErrorCode = (typeof OrderErrorCodes)[keyof typeof OrderErrorCodes];

/**
 * Error for order invariant violations.
 *
 * Created using the platform's InvariantError.forContext() factory to ensure:
 * - InvariantError.isInvariantError() type guard works
 * - InvariantError.hasCode() type guard works
 * - Consistent error structure across all bounded contexts
 */
export const OrderInvariantError = InvariantError.forContext<OrderErrorCode>("Order");

/**
 * Maximum number of items allowed per order.
 */
export const MAX_ITEMS_PER_ORDER = 100;

// ============================================================================
// DECLARATIVE INVARIANTS
// ============================================================================
// These are composable, introspectable invariant objects created with
// createInvariant(). They provide check(), assert(), and validate() methods.

/**
 * Order must be in draft status.
 */
export const orderIsDraft = createInvariant<OrderCMS, OrderErrorCode>(
  {
    name: "orderIsDraft",
    code: OrderErrorCodes.ORDER_NOT_IN_DRAFT,
    check: (order) => order.status === "draft",
    message: (order) =>
      `Order must be in draft status to perform this action. Current status: ${order.status}`,
    context: (order) => ({ orderId: order.orderId, currentStatus: order.status }),
  },
  OrderInvariantError
);

/**
 * Order must have at least one item.
 */
export const orderHasItems = createInvariant<OrderCMS, OrderErrorCode>(
  {
    name: "orderHasItems",
    code: OrderErrorCodes.ORDER_HAS_NO_ITEMS,
    check: (order) => order.items.length > 0,
    message: () => "Order must have at least one item to submit",
    context: (order) => ({ orderId: order.orderId }),
  },
  OrderInvariantError
);

/**
 * Order can accept more items (under limit).
 */
export const orderCanAddItem = createInvariant<OrderCMS, OrderErrorCode>(
  {
    name: "orderCanAddItem",
    code: OrderErrorCodes.MAX_ITEMS_EXCEEDED,
    check: (order) => order.items.length < MAX_ITEMS_PER_ORDER,
    message: () => `Cannot exceed ${MAX_ITEMS_PER_ORDER} items per order`,
    context: (order) => ({ orderId: order.orderId, currentCount: order.items.length }),
  },
  OrderInvariantError
);

/**
 * Order must not be cancelled.
 */
export const orderNotCancelled = createInvariant<OrderCMS, OrderErrorCode>(
  {
    name: "orderNotCancelled",
    code: OrderErrorCodes.ORDER_ALREADY_CANCELLED,
    check: (order) => order.status !== "cancelled",
    message: () => "Order has already been cancelled",
    context: (order) => ({ orderId: order.orderId }),
  },
  OrderInvariantError
);

/**
 * Order must be in submitted status.
 */
export const orderIsSubmitted = createInvariant<OrderCMS, OrderErrorCode>(
  {
    name: "orderIsSubmitted",
    code: OrderErrorCodes.ORDER_NOT_SUBMITTED,
    check: (order) => order.status === "submitted",
    message: (order) => `Order must be in submitted status. Current status: ${order.status}`,
    context: (order) => ({ orderId: order.orderId, currentStatus: order.status }),
  },
  OrderInvariantError
);

/**
 * Order must not be confirmed (allows cancellation of draft/submitted orders).
 */
export const orderNotConfirmed = createInvariant<OrderCMS, OrderErrorCode>(
  {
    name: "orderNotConfirmed",
    code: OrderErrorCodes.ORDER_ALREADY_CONFIRMED,
    check: (order) => order.status !== "confirmed",
    message: () => "Order has already been confirmed",
    context: (order) => ({ orderId: order.orderId }),
  },
  OrderInvariantError
);

// ============================================================================
// INVARIANT SETS
// ============================================================================
// Pre-composed invariant sets for common command validation scenarios.

/**
 * Invariants for submitting an order.
 * Validates: order is draft + order has items
 */
export const orderSubmitInvariants = createInvariantSet([orderIsDraft, orderHasItems]);

/**
 * Invariants for adding an item to an order.
 * Validates: order is draft + can add more items
 */
export const orderAddItemInvariants = createInvariantSet([orderIsDraft, orderCanAddItem]);

/**
 * Invariants for cancelling an order.
 * Validates: order is not confirmed + order is not already cancelled
 */
export const orderCancelInvariants = createInvariantSet([orderNotConfirmed, orderNotCancelled]);

// ============================================================================
// PROCEDURAL ASSERTIONS
// ============================================================================
// These functions handle cases that don't fit the declarative pattern:
// - Type guards (assertOrderExists)
// - Parameterized checks (assertItemExists)
// - Schema-based validation (validateItem)

/**
 * Assert that an order exists.
 */
export function assertOrderExists(order: OrderCMS | null | undefined): asserts order is OrderCMS {
  if (!order) {
    throw new OrderInvariantError(OrderErrorCodes.ORDER_NOT_FOUND, "Order not found");
  }
}

/**
 * Assert that an order does not already exist.
 */
export function assertOrderDoesNotExist(order: OrderCMS | null | undefined): void {
  if (order) {
    throw new OrderInvariantError(OrderErrorCodes.ORDER_ALREADY_EXISTS, "Order already exists", {
      orderId: order.orderId,
    });
  }
}

/**
 * Assert that an item exists in the order.
 */
export function assertItemExists(order: OrderCMS, productId: string): void {
  const item = order.items.find((i) => i.productId === productId);
  if (!item) {
    throw new OrderInvariantError(
      OrderErrorCodes.ITEM_NOT_FOUND,
      `Item with productId ${productId} not found in order`,
      { orderId: order.orderId, productId }
    );
  }
}

/**
 * Validate item data using the Zod schema as source of truth.
 *
 * This ensures invariants stay in sync with the schema definition.
 */
export function validateItem(item: OrderItem): void {
  const result = OrderItemSchema.safeParse(item);

  if (!result.success) {
    const firstError = result.error.issues[0];
    const field = firstError?.path[0] as string;

    if (field === "quantity") {
      throw new OrderInvariantError(
        OrderErrorCodes.INVALID_QUANTITY,
        firstError?.message ?? "Quantity must be positive",
        { productId: item.productId, quantity: item.quantity }
      );
    }

    if (field === "unitPrice") {
      throw new OrderInvariantError(
        OrderErrorCodes.INVALID_PRICE,
        firstError?.message ?? "Price cannot be negative",
        { productId: item.productId, unitPrice: item.unitPrice }
      );
    }

    // For other validation errors (productId, productName)
    throw new OrderInvariantError(
      OrderErrorCodes.INVALID_ITEM_DATA,
      firstError?.message ?? "Invalid item data",
      { field, value: (item as Record<string, unknown>)[field] }
    );
  }
}
