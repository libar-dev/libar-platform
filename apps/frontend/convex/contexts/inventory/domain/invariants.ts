/**
 * Inventory business invariants (domain rules).
 */
import {
  createInvariant,
  createInvariantSet,
  InvariantError,
} from "@libar-dev/platform-core/invariants";
import type { InventoryCMS } from "./inventory.js";
import type { ReservationCMS, ReservationItem } from "./reservation.js";
import { ReservationItemSchema } from "./reservation.js";

/**
 * Error codes for inventory invariant violations.
 */
export const InventoryErrorCodes = {
  // Product errors
  PRODUCT_NOT_FOUND: "PRODUCT_NOT_FOUND",
  PRODUCT_ALREADY_EXISTS: "PRODUCT_ALREADY_EXISTS",
  INVALID_SKU: "INVALID_SKU",
  INVALID_PRODUCT_NAME: "INVALID_PRODUCT_NAME",
  SKU_ALREADY_EXISTS: "SKU_ALREADY_EXISTS",

  // Stock errors
  INSUFFICIENT_STOCK: "INSUFFICIENT_STOCK",
  INVALID_QUANTITY: "INVALID_QUANTITY",
  NEGATIVE_STOCK_NOT_ALLOWED: "NEGATIVE_STOCK_NOT_ALLOWED",

  // Reservation errors
  RESERVATION_NOT_FOUND: "RESERVATION_NOT_FOUND",
  RESERVATION_ALREADY_EXISTS: "RESERVATION_ALREADY_EXISTS",
  RESERVATION_NOT_PENDING: "RESERVATION_NOT_PENDING",
  RESERVATION_NOT_EXPIRED: "RESERVATION_NOT_EXPIRED",
  RESERVATION_ALREADY_CONFIRMED: "RESERVATION_ALREADY_CONFIRMED",
  RESERVATION_ALREADY_RELEASED: "RESERVATION_ALREADY_RELEASED",
  RESERVATION_EXPIRED: "RESERVATION_EXPIRED",
  EMPTY_RESERVATION: "EMPTY_RESERVATION",
  INVALID_RESERVATION_ITEM: "INVALID_RESERVATION_ITEM",
  DUPLICATE_PRODUCT_IDS: "DUPLICATE_PRODUCT_IDS",
} as const;

export type InventoryErrorCode = (typeof InventoryErrorCodes)[keyof typeof InventoryErrorCodes];

/**
 * Error for inventory invariant violations.
 *
 * Created using the platform's InvariantError.forContext() factory to ensure:
 * - InvariantError.isInvariantError() type guard works
 * - InvariantError.hasCode() type guard works
 * - Consistent error structure across all bounded contexts
 */
export const InventoryInvariantError = InvariantError.forContext<InventoryErrorCode>("Inventory");

// =============================================================================
// DECLARATIVE INVARIANTS
// =============================================================================
// These are composable, introspectable invariant objects created with
// createInvariant(). They provide check(), assert(), and validate() methods.

/**
 * Reservation must be in pending status.
 */
export const reservationIsPending = createInvariant<ReservationCMS, InventoryErrorCode>(
  {
    name: "reservationIsPending",
    code: InventoryErrorCodes.RESERVATION_NOT_PENDING,
    check: (reservation) => reservation.status === "pending",
    message: (reservation) => `Reservation must be pending. Current status: ${reservation.status}`,
    context: (reservation) => ({
      reservationId: reservation.reservationId,
      currentStatus: reservation.status,
    }),
  },
  InventoryInvariantError
);

/**
 * Reservation must not be expired.
 * Only checks expiration for pending reservations.
 */
export const reservationNotExpired = createInvariant<ReservationCMS, InventoryErrorCode>(
  {
    name: "reservationNotExpired",
    code: InventoryErrorCodes.RESERVATION_EXPIRED,
    check: (reservation) => reservation.status !== "pending" || Date.now() <= reservation.expiresAt,
    message: () => "Reservation has expired",
    context: (reservation) => ({
      reservationId: reservation.reservationId,
      expiresAt: reservation.expiresAt,
    }),
  },
  InventoryInvariantError
);

/**
 * Reservation must be expired (for expiration processing).
 * Only applies to pending reservations - validates they have passed expiresAt.
 */
export const reservationHasExpired = createInvariant<ReservationCMS, InventoryErrorCode>(
  {
    name: "reservationHasExpired",
    code: InventoryErrorCodes.RESERVATION_NOT_EXPIRED,
    check: (reservation) => reservation.status !== "pending" || Date.now() > reservation.expiresAt,
    message: () => "Reservation has not expired yet",
    context: (reservation) => ({
      reservationId: reservation.reservationId,
      expiresAt: reservation.expiresAt,
      currentTime: Date.now(),
    }),
  },
  InventoryInvariantError
);

// =============================================================================
// INVARIANT SETS
// =============================================================================
// Pre-composed invariant sets for common command validation scenarios.

/**
 * Invariants for confirming a reservation.
 * Validates: reservation is pending + reservation is not expired
 */
export const confirmReservationInvariants = createInvariantSet([
  reservationIsPending,
  reservationNotExpired,
]);

/**
 * Invariants for expiring a reservation.
 * Validates: reservation is pending + reservation has expired
 */
export const expireReservationInvariants = createInvariantSet([
  reservationIsPending,
  reservationHasExpired,
]);

// =============================================================================
// Product Invariants
// =============================================================================

/**
 * Assert that a product exists.
 */
export function assertProductExists(
  product: InventoryCMS | null | undefined
): asserts product is InventoryCMS {
  if (!product) {
    throw new InventoryInvariantError(InventoryErrorCodes.PRODUCT_NOT_FOUND, "Product not found");
  }
}

/**
 * Assert that a product does not already exist.
 */
export function assertProductDoesNotExist(product: InventoryCMS | null | undefined): void {
  if (product) {
    throw new InventoryInvariantError(
      InventoryErrorCodes.PRODUCT_ALREADY_EXISTS,
      "Product already exists",
      { productId: product.productId }
    );
  }
}

/**
 * Assert that a SKU is valid.
 */
export function assertValidSku(sku: string): void {
  if (!sku || sku.trim().length === 0) {
    throw new InventoryInvariantError(InventoryErrorCodes.INVALID_SKU, "SKU cannot be empty");
  }
}

/**
 * Assert that a product name is valid.
 */
export function assertValidProductName(productName: string): void {
  if (!productName || productName.trim().length === 0) {
    throw new InventoryInvariantError(
      InventoryErrorCodes.INVALID_PRODUCT_NAME,
      "Product name cannot be empty"
    );
  }
}

// =============================================================================
// Stock Invariants
// =============================================================================

/**
 * Assert that a quantity is positive.
 */
export function assertPositiveQuantity(quantity: number, context?: string): void {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new InventoryInvariantError(
      InventoryErrorCodes.INVALID_QUANTITY,
      `Quantity must be a positive integer${context ? ` (${context})` : ""}`,
      { quantity }
    );
  }
}

/**
 * Assert that sufficient stock is available.
 */
export function assertSufficientStock(product: InventoryCMS, requestedQuantity: number): void {
  if (product.availableQuantity < requestedQuantity) {
    throw new InventoryInvariantError(
      InventoryErrorCodes.INSUFFICIENT_STOCK,
      `Insufficient stock for product ${product.productId}. Available: ${product.availableQuantity}, Requested: ${requestedQuantity}`,
      {
        productId: product.productId,
        availableQuantity: product.availableQuantity,
        requestedQuantity,
      }
    );
  }
}

/**
 * Check if sufficient stock is available (non-throwing version).
 * Returns stock deficit info if insufficient.
 */
export function checkStockAvailability(
  product: InventoryCMS,
  requestedQuantity: number
): { available: true } | { available: false; deficit: number } {
  if (product.availableQuantity >= requestedQuantity) {
    return { available: true };
  }
  return {
    available: false,
    deficit: requestedQuantity - product.availableQuantity,
  };
}

// =============================================================================
// Reservation Invariants
// =============================================================================

/**
 * Assert that a reservation exists.
 */
export function assertReservationExists(
  reservation: ReservationCMS | null | undefined
): asserts reservation is ReservationCMS {
  if (!reservation) {
    throw new InventoryInvariantError(
      InventoryErrorCodes.RESERVATION_NOT_FOUND,
      "Reservation not found"
    );
  }
}

/**
 * Assert that a reservation does not already exist.
 */
export function assertReservationDoesNotExist(
  reservation: ReservationCMS | null | undefined
): void {
  if (reservation) {
    throw new InventoryInvariantError(
      InventoryErrorCodes.RESERVATION_ALREADY_EXISTS,
      "Reservation already exists",
      { reservationId: reservation.reservationId }
    );
  }
}

/**
 * Assert that a reservation has items.
 */
export function assertReservationHasItems(items: ReservationItem[]): void {
  if (!items || items.length === 0) {
    throw new InventoryInvariantError(
      InventoryErrorCodes.EMPTY_RESERVATION,
      "Reservation must have at least one item"
    );
  }
}

/**
 * Assert that reservation items have no duplicate product IDs.
 *
 * Design Decision: Reject duplicates rather than aggregate them.
 * - Explicit is better than implicit - callers should consolidate their own items
 * - Prevents masking bugs in calling code
 * - Simpler mental model for API consumers
 * - Follows fail-fast principle
 */
export function assertNoDuplicateProductIds(items: ReservationItem[]): void {
  const seen = new Set<string>();
  const duplicates: string[] = [];

  for (const item of items) {
    if (seen.has(item.productId)) {
      duplicates.push(item.productId);
    }
    seen.add(item.productId);
  }

  if (duplicates.length > 0) {
    // De-duplicate the list of duplicate IDs (a product could appear 3+ times)
    const uniqueDuplicates = [...new Set(duplicates)];
    throw new InventoryInvariantError(
      InventoryErrorCodes.DUPLICATE_PRODUCT_IDS,
      `Duplicate product IDs in reservation: ${uniqueDuplicates.join(", ")}`,
      { duplicateProductIds: uniqueDuplicates }
    );
  }
}

/**
 * Validate reservation item data using the Zod schema as source of truth.
 */
export function validateReservationItem(item: ReservationItem): void {
  const result = ReservationItemSchema.safeParse(item);

  if (!result.success) {
    const firstError = result.error.issues[0];
    const field = firstError?.path[0] as string;

    if (field === "quantity") {
      throw new InventoryInvariantError(
        InventoryErrorCodes.INVALID_QUANTITY,
        firstError?.message ?? "Quantity must be positive",
        { productId: item.productId, quantity: item.quantity }
      );
    }

    throw new InventoryInvariantError(
      InventoryErrorCodes.INVALID_RESERVATION_ITEM,
      firstError?.message ?? "Invalid reservation item",
      { field, value: (item as Record<string, unknown>)[field] }
    );
  }
}

/**
 * Validate all reservation items.
 *
 * Performs validations in order:
 * 1. Non-empty check (at least one item)
 * 2. Duplicate product ID check (fails fast before item validation)
 * 3. Individual item validation (productId format, quantity > 0)
 */
export function validateReservationItems(items: ReservationItem[]): void {
  assertReservationHasItems(items);
  assertNoDuplicateProductIds(items);
  for (const item of items) {
    validateReservationItem(item);
  }
}
