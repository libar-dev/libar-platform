/**
 * Common Test Helpers
 *
 * Shared utilities and types for step definitions.
 * These helpers provide a consistent pattern for:
 * - Scenario state management
 * - Order setup with specific statuses
 * - Command result assertions
 */

import { api } from "../../convex/_generated/api";
import { createUnitTestContext } from "../support/setup";
import { generateCustomerId, createOrderItem } from "../fixtures/orders";
import { generateSku } from "../fixtures/inventory";

// Re-export test context creation
export { createUnitTestContext };

// Type for convex-test instance
export type ConvexTestInstance = ReturnType<typeof createUnitTestContext>;

// Type for vitest-cucumber DataTable rows (field/value pairs)
export type DataTableRow = { field: string; value: string };

// Type for item DataTable rows - vitest-cucumber parses tables as objects
export type ItemTableRow = {
  productId: string;
  productName: string;
  quantity: string;
  unitPrice: string;
};

/**
 * Order item for scenario state.
 */
export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

/**
 * Scenario state interface.
 * Shared across Given-When-Then steps within a single scenario.
 */
export interface ScenarioState {
  t: ConvexTestInstance;
  lastResult: unknown;
  lastError: Error | null;
  scenario: {
    orderId?: string;
    customerId?: string;
    items?: OrderItem[];
    commandId?: string;
    reason?: string;
  };
}

/**
 * Initialize fresh scenario state.
 */
export function initState(): ScenarioState {
  return {
    t: createUnitTestContext(),
    lastResult: null,
    lastError: null,
    scenario: {},
  };
}

/**
 * Convert vitest-cucumber DataTable rows to a key-value object.
 */
export function tableRowsToObject(rows: DataTableRow[]): Record<string, string> {
  return rows.reduce(
    (acc, row) => {
      acc[row.field] = row.value;
      return acc;
    },
    {} as Record<string, string>
  );
}

/**
 * Parse item table rows into OrderItem array.
 * vitest-cucumber DataTables are arrays of objects with header keys.
 */
export function parseItemTable(table: ItemTableRow[]): OrderItem[] {
  return table.map((row, index) => {
    const quantity = parseInt(row.quantity, 10);
    if (isNaN(quantity)) {
      throw new Error(
        `Invalid quantity "${row.quantity}" at row ${index + 1}: expected a valid integer`
      );
    }

    const unitPrice = parseFloat(row.unitPrice);
    if (isNaN(unitPrice)) {
      throw new Error(
        `Invalid unitPrice "${row.unitPrice}" at row ${index + 1}: expected a valid number`
      );
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
 * Create an order with a specific status for test setup.
 *
 * Uses api.testing.createTestOrder which creates CMS and events
 * to ensure version consistency.
 */
export async function setupOrderWithStatus(
  state: ScenarioState,
  orderId: string,
  status: "draft" | "submitted" | "confirmed" | "cancelled",
  items?: OrderItem[]
): Promise<void> {
  state.scenario.orderId = orderId;
  state.scenario.customerId = state.scenario.customerId || generateCustomerId();
  state.scenario.items = items;

  // For draft orders with no special requirements, use the regular createOrder
  // For other statuses, use createTestOrder which sets up CMS and events correctly
  if (status === "draft" && (!items || items.length === 0)) {
    await state.t.mutation(api.orders.createOrder, {
      orderId,
      customerId: state.scenario.customerId,
    });
  } else {
    // Use test helper to create order with specific status and items
    await state.t.mutation(api.testing.createTestOrder, {
      orderId,
      customerId: state.scenario.customerId,
      status,
      items: items || [],
    });
  }
}

/**
 * Execute a mutation and capture result/error.
 */
export async function executeMutation<T>(
  state: ScenarioState,
  mutation: () => Promise<T>
): Promise<void> {
  try {
    state.lastResult = await mutation();
    state.lastError = null;
  } catch (error) {
    state.lastError = error as Error;
    state.lastResult = null;
  }
}

/**
 * Assert command succeeded.
 */
export function assertCommandSucceeded(state: ScenarioState): void {
  if (state.lastError) {
    throw new Error(`Command failed with error: ${state.lastError.message}`);
  }
  const result = state.lastResult as { status?: string } | null;
  if (!result) {
    throw new Error("Command did not return a result");
  }
  if (result.status !== "success") {
    throw new Error(`Expected status "success" but got "${result.status}"`);
  }
}

/**
 * Assert command returned a rejection result (structured domain rejection).
 * Use this when the command is expected to return { status: "rejected", code: "..." }
 * rather than throwing an exception.
 */
export function assertCommandReturnedRejection(state: ScenarioState, expectedCode?: string): void {
  if (state.lastError) {
    throw new Error(
      `Expected command to return rejection result, but it threw an error: ${state.lastError.message}`
    );
  }
  if (!state.lastResult) {
    throw new Error("Command did not return a result");
  }
  const result = state.lastResult as { status?: string; code?: string };
  if (result.status !== "rejected") {
    throw new Error(`Expected status "rejected" but got "${result.status}"`);
  }
  if (expectedCode && result.code !== expectedCode) {
    throw new Error(`Expected rejection code "${expectedCode}" but got "${result.code}"`);
  }
}

/**
 * Assert command threw an error (exception-based rejection).
 * Use this when the command is expected to throw an exception
 * rather than returning a structured rejection result.
 */
export function assertCommandThrewError(state: ScenarioState, expectedMessage?: string): void {
  if (state.lastResult) {
    throw new Error(
      `Expected command to throw an error, but it returned a result: ${JSON.stringify(state.lastResult)}`
    );
  }
  if (!state.lastError) {
    throw new Error("Command did not throw an error");
  }
  if (expectedMessage && !state.lastError.message.includes(expectedMessage)) {
    throw new Error(
      `Expected error containing "${expectedMessage}" but got: ${state.lastError.message}`
    );
  }
}

/**
 * Assert command returned duplicate status.
 */
export function assertCommandDuplicate(state: ScenarioState): void {
  if (state.lastError) {
    throw new Error(`Command failed with error: ${state.lastError.message}`);
  }
  const result = state.lastResult as { status?: string } | null;
  if (!result) {
    throw new Error("Command did not return a result");
  }
  if (result.status !== "duplicate") {
    throw new Error(`Expected status "duplicate" but got "${result.status}"`);
  }
}

/**
 * Create default items for testing.
 */
export function createDefaultItems(): OrderItem[] {
  return [createOrderItem({ productId: "prod_default", productName: "Default Widget" })];
}

// =============================================================================
// Inventory Helpers
// =============================================================================

/**
 * Reservation item for inventory testing.
 */
export interface ReservationItem {
  productId: string;
  quantity: number;
}

/**
 * Extended scenario state for inventory tests.
 */
export interface InventoryScenarioState extends ScenarioState {
  scenario: ScenarioState["scenario"] & {
    productId?: string;
    productName?: string;
    sku?: string;
    reservationId?: string;
    reservationItems?: ReservationItem[];
  };
}

/**
 * Initialize fresh inventory scenario state.
 */
export function initInventoryState(): InventoryScenarioState {
  return {
    t: createUnitTestContext(),
    lastResult: null,
    lastError: null,
    scenario: {},
  };
}

/**
 * Create a product with stock for test setup.
 *
 * Uses the test mutation to create both CMS and projections.
 */
export async function setupProductWithStock(
  state: InventoryScenarioState,
  productId: string,
  quantity: number,
  options?: {
    productName?: string;
    sku?: string;
  }
): Promise<void> {
  state.scenario.productId = productId;
  state.scenario.productName = options?.productName || "Test Product";
  state.scenario.sku = options?.sku || generateSku();

  // Use component test helper to create product with stock
  await state.t.mutation(api.testing.createTestProduct, {
    productId,
    productName: state.scenario.productName,
    sku: state.scenario.sku,
    availableQuantity: quantity,
  });
}

/**
 * Create a product with no stock (out of stock).
 */
export async function setupProductOutOfStock(
  state: InventoryScenarioState,
  productId: string,
  options?: {
    productName?: string;
    sku?: string;
  }
): Promise<void> {
  await setupProductWithStock(state, productId, 0, options);
}

/**
 * Create a reservation for test setup.
 */
export async function setupReservation(
  state: InventoryScenarioState,
  reservationId: string,
  orderId: string,
  items: ReservationItem[],
  options?: {
    status?: "pending" | "confirmed" | "released" | "expired";
    expiresAt?: number;
  }
): Promise<void> {
  state.scenario.reservationId = reservationId;
  state.scenario.orderId = orderId;
  state.scenario.reservationItems = items;

  // Use component test helper to create reservation
  await state.t.mutation(api.testing.createTestReservation, {
    reservationId,
    orderId,
    items,
    status: options?.status,
    expiresAt: options?.expiresAt,
  });
}

/**
 * Assert command returned failed status (business failure with event).
 * Used for ReserveStock when there's insufficient stock.
 */
export function assertCommandFailed(state: ScenarioState, expectedReason?: string): void {
  if (state.lastError) {
    throw new Error(`Command threw an error: ${state.lastError.message}`);
  }
  const result = state.lastResult as { status?: string; reason?: string } | null;
  if (!result) {
    throw new Error("Command did not return a result");
  }
  if (result.status !== "failed") {
    throw new Error(`Expected status "failed" but got "${result.status}"`);
  }
  if (expectedReason && !result.reason?.includes(expectedReason)) {
    throw new Error(`Expected reason containing "${expectedReason}" but got "${result.reason}"`);
  }
}

/**
 * Type for inventory item table rows.
 */
export type InventoryItemTableRow = {
  productId: string;
  quantity: string;
};

/**
 * Parse inventory item table rows into ReservationItem array.
 */
export function parseInventoryItemTable(table: InventoryItemTableRow[]): ReservationItem[] {
  return table.map((row, index) => {
    const quantity = parseInt(row.quantity, 10);
    if (isNaN(quantity)) {
      throw new Error(
        `Invalid quantity "${row.quantity}" at row ${index + 1}: expected a valid integer`
      );
    }
    return {
      productId: row.productId,
      quantity,
    };
  });
}
