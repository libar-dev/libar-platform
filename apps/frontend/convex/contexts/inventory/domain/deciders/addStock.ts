/**
 * AddStock decider - pure decision logic.
 *
 * Validates that stock can be added to a product and produces StockAdded event.
 * Standard modification pattern: requires existing state.
 */

import type { DeciderOutput, Decider } from "@libar-dev/platform-core/decider";
import { success, rejected } from "@libar-dev/platform-core/decider";
import { assertPositiveQuantity } from "../invariants.js";
import type {
  InventoryCMS,
  AddStockInput,
  AddStockData,
  StockAddedEvent,
  InventoryStateUpdate,
  DeciderContext,
} from "./types.js";

/**
 * Decide whether to add stock to a product.
 *
 * Pure function: no I/O, no side effects.
 *
 * Invariants:
 * - Quantity must be a positive integer
 *
 * @param state - Current InventoryCMS state
 * @param command - AddStock command input
 * @param _context - Decider context (timestamp, IDs)
 * @returns DeciderOutput with StockAdded event or rejection
 */
export function decideAddStock(
  state: InventoryCMS,
  command: AddStockInput,
  _context: DeciderContext
): DeciderOutput<StockAddedEvent, AddStockData, InventoryStateUpdate> {
  // Validate quantity (throws InventoryInvariantError on failure)
  try {
    assertPositiveQuantity(command.quantity);
  } catch {
    return rejected("INVALID_QUANTITY", "Quantity must be a positive integer", {
      quantity: command.quantity,
    });
  }

  // Calculate new available quantity
  const newAvailableQuantity = state.availableQuantity + command.quantity;

  // Build success output
  // Use spread for optional reason to avoid string | undefined vs string? type mismatch
  return success({
    data: {
      productId: state.productId,
      newAvailableQuantity,
      quantity: command.quantity,
    },
    event: {
      eventType: "StockAdded" as const,
      payload: {
        productId: state.productId,
        quantity: command.quantity,
        newAvailableQuantity,
        ...(command.reason !== undefined && { reason: command.reason }),
      },
    },
    stateUpdate: {
      availableQuantity: newAvailableQuantity,
    },
  });
}

/**
 * Evolve inventory state by applying StockAdded event.
 *
 * Pure function: applies event to produce new state.
 *
 * @param state - Current InventoryCMS state
 * @param event - StockAdded event
 * @returns New InventoryCMS state with updated availableQuantity
 */
export function evolveAddStock(state: InventoryCMS, event: StockAddedEvent): InventoryCMS {
  return {
    ...state,
    availableQuantity: event.payload.newAvailableQuantity,
  };
}

/**
 * Full AddStock Decider combining decide and evolve.
 *
 * Use this for:
 * - Property-based testing
 * - Projection rebuilding
 * - Event replay
 */
export const addStockDecider: Decider<
  InventoryCMS,
  AddStockInput,
  StockAddedEvent,
  AddStockData,
  InventoryStateUpdate
> = {
  decide: decideAddStock,
  evolve: evolveAddStock,
};
