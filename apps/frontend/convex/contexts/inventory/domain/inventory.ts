/**
 * Inventory CMS (Command Model State) types and utilities.
 *
 * Represents stock levels per product.
 */
import type { BaseCMS } from "@libar-dev/platform-core";

/**
 * Current CMS schema version.
 * Increment when the InventoryCMS structure changes.
 *
 * Version history:
 * - v1: Initial version (productId, productName, sku, stock levels)
 * - v2: Added unitPrice field
 */
export const CURRENT_INVENTORY_CMS_VERSION = 2;

/**
 * Inventory CMS (Command Model State).
 *
 * Represents the current stock level for a product.
 * Maintained atomically alongside events in the dual-write pattern.
 */
export interface InventoryCMS extends BaseCMS {
  productId: string;
  productName: string;
  sku: string;
  unitPrice: number; // Price per unit (dollars for demo)
  availableQuantity: number;
  reservedQuantity: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Calculate total quantity (available + reserved).
 */
export function calculateTotalQuantity(inventory: InventoryCMS): number {
  return inventory.availableQuantity + inventory.reservedQuantity;
}

/**
 * Create initial CMS for a new product.
 */
export function createInitialInventoryCMS(
  productId: string,
  productName: string,
  sku: string,
  unitPrice: number
): InventoryCMS {
  const now = Date.now();
  return {
    productId,
    productName,
    sku,
    unitPrice,
    availableQuantity: 0,
    reservedQuantity: 0,
    version: 0, // Will be 1 after first event
    stateVersion: CURRENT_INVENTORY_CMS_VERSION,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Upcast InventoryCMS from older versions to current version.
 */
export function upcastInventoryCMS(raw: unknown): InventoryCMS {
  const state = raw as Record<string, unknown>;
  const currentStateVersion = typeof state["stateVersion"] === "number" ? state["stateVersion"] : 0;

  // Already at current version
  if (currentStateVersion === CURRENT_INVENTORY_CMS_VERSION) {
    return raw as InventoryCMS;
  }

  // Reject future versions that this code doesn't understand
  if (currentStateVersion > CURRENT_INVENTORY_CMS_VERSION) {
    throw new Error(
      `InventoryCMS version ${currentStateVersion} is newer than supported version ${CURRENT_INVENTORY_CMS_VERSION}. Update code to handle this version.`
    );
  }

  // Migration from v1 to v2: Add unitPrice with default value
  // Products created before v2 get a default price of $49.99
  if (currentStateVersion <= 1) {
    const v1State = raw as Omit<InventoryCMS, "unitPrice" | "stateVersion">;
    return {
      ...v1State,
      unitPrice: 49.99, // Default price for pre-v2 products (before unitPrice was added)
      stateVersion: CURRENT_INVENTORY_CMS_VERSION,
    };
  }

  // If no migration path, return as-is with updated version
  return {
    ...(raw as InventoryCMS),
    stateVersion: CURRENT_INVENTORY_CMS_VERSION,
  };
}
