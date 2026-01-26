/**
 * CreateProduct decider - pure decision logic.
 *
 * Validates that a new product can be created and produces ProductCreated event.
 * Uses entity creation pattern: state is null if product doesn't exist.
 *
 * Note: SKU uniqueness is validated by preValidate hook in the handler,
 * not in this decider (requires database query).
 */

import type { DeciderOutput, Decider } from "@libar-dev/platform-core/decider";
import { success, rejected } from "@libar-dev/platform-core/decider";
import { assertValidProductName, assertValidSku } from "../invariants.js";
import { CURRENT_INVENTORY_CMS_VERSION } from "../inventory.js";
import type {
  InventoryCMS,
  CreateProductInput,
  CreateProductData,
  ProductCreatedEvent,
  InventoryStateUpdate,
  DeciderContext,
} from "./types.js";

/**
 * Decide whether to create a product.
 *
 * Pure function: no I/O, no side effects.
 *
 * Invariants:
 * - Product must not already exist (state must be null)
 * - Product name must not be empty
 * - SKU must not be empty
 * - Unit price must be positive
 *
 * Note: SKU uniqueness is validated by preValidate hook in handler.
 *
 * @param state - Current InventoryCMS state (null if product doesn't exist)
 * @param command - CreateProduct command input
 * @param context - Decider context (timestamp, IDs)
 * @returns DeciderOutput with ProductCreated event or rejection
 */
export function decideCreateProduct(
  state: InventoryCMS | null,
  command: CreateProductInput,
  context: DeciderContext
): DeciderOutput<ProductCreatedEvent, CreateProductData, InventoryStateUpdate> {
  // Check if product already exists
  if (state !== null) {
    return rejected("PRODUCT_ALREADY_EXISTS", `Product ${command.productId} already exists`, {
      productId: command.productId,
    });
  }

  // Validate product name (throws InventoryInvariantError on failure)
  try {
    assertValidProductName(command.productName);
  } catch {
    return rejected("INVALID_PRODUCT_NAME", "Product name cannot be empty");
  }

  // Validate SKU format (throws InventoryInvariantError on failure)
  try {
    assertValidSku(command.sku);
  } catch {
    return rejected("INVALID_SKU", "SKU cannot be empty");
  }

  // Validate unit price
  if (typeof command.unitPrice !== "number" || command.unitPrice <= 0) {
    return rejected("INVALID_UNIT_PRICE", "Unit price must be a positive number", {
      unitPrice: command.unitPrice,
    });
  }

  // Build success output
  return success({
    data: {
      productId: command.productId,
      productName: command.productName,
      sku: command.sku,
      unitPrice: command.unitPrice,
    },
    event: {
      eventType: "ProductCreated" as const,
      payload: {
        productId: command.productId,
        productName: command.productName,
        sku: command.sku,
        unitPrice: command.unitPrice,
        createdAt: context.now, // Timestamp for pure evolve()
      },
    },
    stateUpdate: {
      productName: command.productName,
      sku: command.sku,
      unitPrice: command.unitPrice,
      availableQuantity: 0,
      reservedQuantity: 0,
    },
  });
}

/**
 * Evolve inventory state by applying ProductCreated event.
 *
 * Pure function: creates initial state from event.
 *
 * IMPORTANT: All data comes from event payload to ensure deterministic replay.
 * Never use Date.now() or other impure functions in evolve().
 *
 * Note: For entity creation, state is typically null.
 * The handler uses stateUpdate to build the full initial CMS.
 *
 * @param _state - Current state (should be null for creation)
 * @param event - ProductCreated event
 * @returns Initial InventoryCMS state
 */
export function evolveCreateProduct(
  _state: InventoryCMS | null,
  event: ProductCreatedEvent
): InventoryCMS {
  // For entity creation, we build the full state from the event payload
  // createdAt comes from the event to ensure pure, deterministic replay
  return {
    productId: event.payload.productId,
    productName: event.payload.productName,
    sku: event.payload.sku,
    unitPrice: event.payload.unitPrice,
    availableQuantity: 0,
    reservedQuantity: 0,
    version: 1,
    stateVersion: CURRENT_INVENTORY_CMS_VERSION,
    createdAt: event.payload.createdAt,
    updatedAt: event.payload.createdAt,
  };
}

/**
 * Full CreateProduct Decider combining decide and evolve.
 *
 * Use this for:
 * - Property-based testing
 * - Projection rebuilding
 * - Event replay
 */
export const createProductDecider: Decider<
  InventoryCMS | null,
  CreateProductInput,
  ProductCreatedEvent,
  CreateProductData,
  InventoryStateUpdate
> = {
  decide: decideCreateProduct,
  evolve: evolveCreateProduct,
};
