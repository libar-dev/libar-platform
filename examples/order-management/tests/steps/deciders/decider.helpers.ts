/**
 * Decider Test Helpers
 *
 * Domain-specific utilities for testing pure decider functions without any infrastructure.
 *
 * Generic decider testing utilities are imported from @libar-dev/platform-decider/testing.
 * Generic data table utilities are imported from @libar-dev/platform-core/testing.
 *
 * This file contains:
 * - Domain-specific state builders (OrderCMS, InventoryCMS, ReservationCMS)
 * - Domain-specific type aliases
 *
 * IMPORTANT: No convex-test, no ctx, no database - pure functions only.
 */

// =============================================================================
// Re-exports from platform packages for backward compatibility
// =============================================================================

// Decider testing utilities
export {
  type DeciderScenarioState,
  initDeciderState,
  createDeciderContext,
  assertDecisionSuccess,
  assertDecisionRejected,
  assertDecisionFailed,
  getSuccessData,
  getSuccessEvent,
  getSuccessStateUpdate,
  assertEventType,
  assertEventPayload,
  assertStateUpdate,
  assertRejectionCode,
  assertRejectionMessage,
  assertFailureReason,
  assertFailureEventType,
} from "@libar-dev/platform-decider/testing";

// Data table utilities
export {
  type DataTableRow,
  tableRowsToObject,
  parseTableValue,
  getRequiredField,
  getOptionalField,
} from "@libar-dev/platform-core/testing";

// =============================================================================
// Domain-specific imports
// =============================================================================

import type {
  OrderCMS,
  OrderItem,
  OrderStatus,
} from "../../../convex/contexts/orders/domain/order";
import type { InventoryCMS } from "../../../convex/contexts/inventory/domain/inventory";
import type {
  ReservationCMS,
  ReservationStatus,
  ReservationItem,
} from "../../../convex/contexts/inventory/domain/reservation";
import { tableRowsToObject, type DataTableRow } from "@libar-dev/platform-core/testing";

// =============================================================================
// Domain-specific Types
// =============================================================================

/**
 * Type for item DataTable rows.
 */
export type ItemTableRow = {
  productId: string;
  productName: string;
  quantity: string;
  unitPrice: string;
};

/**
 * Type for inventory DataTable rows.
 */
export type InventoryTableRow = {
  field: string;
  value: string;
};

/**
 * Type for reservation item DataTable rows.
 */
export type ReservationItemTableRow = {
  productId: string;
  quantity: string;
};

// =============================================================================
// Order State Builders
// =============================================================================

/**
 * Create a default OrderCMS state.
 */
export function createOrderCMS(overrides?: Partial<OrderCMS>): OrderCMS {
  const now = Date.now();
  return {
    orderId: "ord_test_001",
    customerId: "cust_test_001",
    status: "draft",
    items: [],
    totalAmount: 0,
    version: 1,
    stateVersion: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Create test items for a given count.
 * Each item has unit price 20.00 + (index * 5.00) for predictable totals.
 */
export function createTestItems(count: number): OrderItem[] {
  return Array.from({ length: count }, (_, i) => ({
    productId: `prod_${i + 1}`,
    productName: `Test Product ${i + 1}`,
    quantity: 1,
    unitPrice: 20.0 + i * 5.0,
  }));
}

/**
 * Create order state from Gherkin table.
 *
 * Supported fields:
 * - orderId: string
 * - customerId: string
 * - status: OrderStatus
 * - itemCount: number (creates test items)
 * - total: number (sets totalAmount)
 * - version: number
 */
export function createOrderStateFromTable(rows: DataTableRow[]): OrderCMS {
  const data = tableRowsToObject(rows);

  const itemCount = data.itemCount ? parseInt(data.itemCount, 10) : 0;
  if (data.itemCount && isNaN(itemCount)) {
    throw new Error(`Invalid itemCount "${data.itemCount}"`);
  }
  if (data.itemCount && itemCount < 0) {
    throw new Error(`itemCount must be non-negative, got "${data.itemCount}"`);
  }

  const items = itemCount > 0 ? createTestItems(itemCount) : [];
  const calculatedTotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  const total = data.total ? parseFloat(data.total) : calculatedTotal;
  if (data.total && isNaN(total)) {
    throw new Error(`Invalid total "${data.total}"`);
  }

  const version = data.version ? parseInt(data.version, 10) : 1;
  if (data.version && isNaN(version)) {
    throw new Error(`Invalid version "${data.version}"`);
  }
  if (data.version && version < 1) {
    throw new Error(`version must be >= 1, got "${data.version}"`);
  }

  return createOrderCMS({
    orderId: data.orderId || "ord_test_001",
    customerId: data.customerId || "cust_test_001",
    status: (data.status as OrderStatus) || "draft",
    items,
    totalAmount: total,
    version,
  });
}

/**
 * Create order state with a specific status (shorthand).
 */
export function createOrderWithStatus(status: OrderStatus): OrderCMS {
  return createOrderCMS({ status });
}

/**
 * Parse item table rows into OrderItem array.
 */
export function parseItemTable(table: ItemTableRow[]): OrderItem[] {
  return table.map((row, index) => {
    const quantity = parseInt(row.quantity, 10);
    if (isNaN(quantity)) {
      throw new Error(`Invalid quantity "${row.quantity}" at row ${index + 1}`);
    }

    const unitPrice = parseFloat(row.unitPrice);
    if (isNaN(unitPrice)) {
      throw new Error(`Invalid unitPrice "${row.unitPrice}" at row ${index + 1}`);
    }

    return {
      productId: row.productId,
      productName: row.productName,
      quantity,
      unitPrice,
    };
  });
}

/**
 * Parse a single OrderItem from a field/value DataTable.
 *
 * Expected fields: productId, productName, quantity, unitPrice
 */
export function parseOrderItemFromTable(table: DataTableRow[]): OrderItem {
  const itemData = tableRowsToObject(table);

  const quantity = parseInt(itemData.quantity, 10);
  if (isNaN(quantity)) {
    throw new Error(`Invalid quantity "${itemData.quantity}"`);
  }

  const unitPrice = parseFloat(itemData.unitPrice);
  if (isNaN(unitPrice)) {
    throw new Error(`Invalid unitPrice "${itemData.unitPrice}"`);
  }

  return {
    productId: itemData.productId,
    productName: itemData.productName,
    quantity,
    unitPrice,
  };
}

// =============================================================================
// Inventory State Builders
// =============================================================================

/**
 * Default schema version for test InventoryCMS.
 */
const INVENTORY_CMS_VERSION = 2;

/**
 * Create a default InventoryCMS state.
 */
export function createInventoryCMS(overrides?: Partial<InventoryCMS>): InventoryCMS {
  const now = Date.now();
  return {
    productId: "prod_test_001",
    productName: "Test Product",
    sku: "SKU-TEST-001",
    unitPrice: 29.99,
    availableQuantity: 100,
    reservedQuantity: 0,
    version: 1,
    stateVersion: INVENTORY_CMS_VERSION,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Create InventoryCMS state from Gherkin table.
 *
 * Supported fields:
 * - productId: string
 * - productName: string
 * - sku: string
 * - unitPrice: number
 * - availableQuantity: number
 * - reservedQuantity: number
 * - version: number
 */
export function createInventoryStateFromTable(rows: DataTableRow[]): InventoryCMS {
  const data = tableRowsToObject(rows);

  const availableQuantity = data.availableQuantity ? parseInt(data.availableQuantity, 10) : 100;
  if (data.availableQuantity && isNaN(availableQuantity)) {
    throw new Error(`Invalid availableQuantity "${data.availableQuantity}"`);
  }

  const reservedQuantity = data.reservedQuantity ? parseInt(data.reservedQuantity, 10) : 0;
  if (data.reservedQuantity && isNaN(reservedQuantity)) {
    throw new Error(`Invalid reservedQuantity "${data.reservedQuantity}"`);
  }

  const unitPrice = data.unitPrice ? parseFloat(data.unitPrice) : 29.99;
  if (data.unitPrice && isNaN(unitPrice)) {
    throw new Error(`Invalid unitPrice "${data.unitPrice}"`);
  }

  const version = data.version ? parseInt(data.version, 10) : 1;
  if (data.version && isNaN(version)) {
    throw new Error(`Invalid version "${data.version}"`);
  }
  if (data.version && version < 1) {
    throw new Error(`version must be >= 1, got "${data.version}"`);
  }

  return createInventoryCMS({
    productId: data.productId || "prod_test_001",
    productName: data.productName || "Test Product",
    sku: data.sku || "SKU-TEST-001",
    unitPrice,
    availableQuantity,
    reservedQuantity,
    version,
  });
}

// =============================================================================
// Reservation State Builders
// =============================================================================

/**
 * Default schema version for test ReservationCMS.
 */
const RESERVATION_CMS_VERSION = 1;

/**
 * Default reservation TTL: 1 hour in milliseconds.
 */
const DEFAULT_RESERVATION_TTL_MS = 60 * 60 * 1000;

/**
 * Create a default ReservationCMS state.
 */
export function createReservationCMS(overrides?: Partial<ReservationCMS>): ReservationCMS {
  const now = Date.now();
  return {
    reservationId: "res_test_001",
    orderId: "ord_test_001",
    items: [{ productId: "prod_test_001", quantity: 5 }],
    status: "pending",
    expiresAt: now + DEFAULT_RESERVATION_TTL_MS,
    version: 1,
    stateVersion: RESERVATION_CMS_VERSION,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Parse reservation item table rows into ReservationItem array.
 */
export function parseReservationItemTable(table: ReservationItemTableRow[]): ReservationItem[] {
  return table.map((row, index) => {
    const quantity = parseInt(row.quantity, 10);
    if (isNaN(quantity)) {
      throw new Error(`Invalid quantity "${row.quantity}" at row ${index + 1}`);
    }
    if (quantity <= 0) {
      throw new Error(`Quantity must be positive, got "${row.quantity}" at row ${index + 1}`);
    }

    return {
      productId: row.productId,
      quantity,
    };
  });
}

/**
 * Create ReservationCMS state from Gherkin table.
 *
 * Supported fields:
 * - reservationId: string
 * - orderId: string
 * - status: ReservationStatus
 * - itemCount: number (creates test items with productId prod_1, prod_2, etc.)
 * - expiresIn: number (milliseconds from now, use negative for expired)
 * - version: number
 */
export function createReservationStateFromTable(rows: DataTableRow[]): ReservationCMS {
  const data = tableRowsToObject(rows);

  const itemCount = data.itemCount ? parseInt(data.itemCount, 10) : 1;
  if (data.itemCount && isNaN(itemCount)) {
    throw new Error(`Invalid itemCount "${data.itemCount}"`);
  }
  if (data.itemCount && itemCount < 0) {
    throw new Error(`itemCount must be non-negative, got "${data.itemCount}"`);
  }

  const items: ReservationItem[] =
    itemCount > 0
      ? Array.from({ length: itemCount }, (_, i) => ({
          productId: `prod_${i + 1}`,
          quantity: 5,
        }))
      : [];

  const now = Date.now();
  const expiresIn = data.expiresIn ? parseInt(data.expiresIn, 10) : DEFAULT_RESERVATION_TTL_MS;
  if (data.expiresIn && isNaN(expiresIn)) {
    throw new Error(`Invalid expiresIn "${data.expiresIn}"`);
  }

  const version = data.version ? parseInt(data.version, 10) : 1;
  if (data.version && isNaN(version)) {
    throw new Error(`Invalid version "${data.version}"`);
  }
  if (data.version && version < 1) {
    throw new Error(`version must be >= 1, got "${data.version}"`);
  }

  return createReservationCMS({
    reservationId: data.reservationId || "res_test_001",
    orderId: data.orderId || "ord_test_001",
    status: (data.status as ReservationStatus) || "pending",
    items,
    expiresAt: now + expiresIn,
    version,
  });
}

/**
 * Create reservation state with a specific status (shorthand).
 */
export function createReservationWithStatus(status: ReservationStatus): ReservationCMS {
  return createReservationCMS({ status });
}
