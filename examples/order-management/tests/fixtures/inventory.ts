/**
 * Inventory Fixtures and Factories
 *
 * Test data factories for Inventory-related entities.
 * All generated IDs include the testRunId prefix for test isolation.
 */

import { withPrefix } from "../support/testRunId";

/**
 * Generates a unique product ID for testing.
 * Includes testRunId prefix for test isolation.
 */
export function generateProductId(prefix: string = "prod"): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 7);
  return withPrefix(`${prefix}_test_${timestamp}_${random}`);
}

/**
 * Generates a unique reservation ID for testing.
 * Includes testRunId prefix for test isolation.
 */
export function generateReservationId(prefix: string = "res"): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 7);
  return withPrefix(`${prefix}_test_${timestamp}_${random}`);
}

/**
 * Generates a unique SKU for testing.
 * Includes testRunId prefix for test isolation.
 */
export function generateSku(prefix: string = "SKU"): string {
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return withPrefix(`${prefix}-${random}`);
}

/**
 * Generates a unique command ID for idempotency testing.
 * Includes testRunId prefix for test isolation.
 */
export function generateInventoryCommandId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 9);
  return withPrefix(`cmd_inv_${timestamp}_${random}`);
}

/**
 * Product data for testing.
 */
export interface ProductData {
  productId: string;
  productName: string;
  sku: string;
  availableQuantity: number;
  reservedQuantity: number;
}

/**
 * Creates product data with defaults.
 */
export function createProductData(overrides?: Partial<ProductData>): ProductData {
  return {
    productId: overrides?.productId ?? generateProductId(),
    productName: overrides?.productName ?? "Test Product",
    sku: overrides?.sku ?? generateSku(),
    availableQuantity: overrides?.availableQuantity ?? 0,
    reservedQuantity: overrides?.reservedQuantity ?? 0,
  };
}

/**
 * Reservation item for testing.
 */
export interface ReservationItemData {
  productId: string;
  quantity: number;
}

/**
 * Creates a reservation item with defaults.
 */
export function createReservationItem(
  overrides?: Partial<ReservationItemData>
): ReservationItemData {
  return {
    productId: overrides?.productId ?? generateProductId(),
    quantity: overrides?.quantity ?? 1,
  };
}

/**
 * Creates an array of reservation items.
 */
export function createReservationItems(count: number = 1): ReservationItemData[] {
  return Array.from({ length: count }, (_, i) =>
    createReservationItem({
      productId: withPrefix(`prod_${i + 1}`),
      quantity: i + 1,
    })
  );
}

/**
 * Reservation status type.
 */
export type ReservationStatus = "pending" | "confirmed" | "released" | "expired";

/**
 * Full reservation data for testing.
 */
export interface ReservationData {
  reservationId: string;
  orderId: string;
  items: ReservationItemData[];
  status: ReservationStatus;
  expiresAt: number;
}

/**
 * Creates reservation data with defaults.
 */
export function createReservationData(overrides?: Partial<ReservationData>): ReservationData {
  const now = Date.now();
  return {
    reservationId: overrides?.reservationId ?? generateReservationId(),
    orderId: overrides?.orderId ?? withPrefix(`ord_test_${now.toString(36)}`),
    items: overrides?.items ?? [createReservationItem()],
    status: overrides?.status ?? "pending",
    expiresAt: overrides?.expiresAt ?? now + 60 * 60 * 1000, // 1 hour default
  };
}

/**
 * Preset inventory configurations for common test scenarios.
 */
export const InventoryPresets = {
  /**
   * Product with available stock.
   */
  productWithStock: (productId?: string, quantity: number = 10) =>
    createProductData({
      productId,
      productName: "Product with Stock",
      availableQuantity: quantity,
      reservedQuantity: 0,
    }),

  /**
   * Product with no stock (out of stock).
   */
  productOutOfStock: (productId?: string) =>
    createProductData({
      productId,
      productName: "Out of Stock Product",
      availableQuantity: 0,
      reservedQuantity: 0,
    }),

  /**
   * Product with some reserved stock.
   */
  productWithReservedStock: (productId?: string, available: number = 5, reserved: number = 5) =>
    createProductData({
      productId,
      productName: "Partially Reserved Product",
      availableQuantity: available,
      reservedQuantity: reserved,
    }),

  /**
   * Pending reservation.
   */
  pendingReservation: (reservationId?: string, orderId?: string) =>
    createReservationData({
      reservationId,
      orderId,
      status: "pending",
    }),

  /**
   * Confirmed reservation.
   */
  confirmedReservation: (reservationId?: string, orderId?: string) =>
    createReservationData({
      reservationId,
      orderId,
      status: "confirmed",
    }),

  /**
   * Expired reservation (expiresAt in the past).
   */
  expiredReservation: (reservationId?: string, orderId?: string) =>
    createReservationData({
      reservationId,
      orderId,
      status: "pending",
      expiresAt: Date.now() - 1000, // Already expired
    }),
};
