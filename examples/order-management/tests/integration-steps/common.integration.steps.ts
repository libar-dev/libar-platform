/**
 * Common Integration Step Definitions for Gherkin BDD Tests
 *
 * Shared Given/When/Then steps for backend integration tests running against
 * Docker backend (port 3210). These steps handle:
 * - Backend setup and cleanup
 * - Result assertions
 * - Waiting for eventual consistency (projections, sagas)
 *
 * Usage in other step files:
 * ```typescript
 * import {
 *   getState,
 *   setLastResult,
 *   setLastError,
 *   initIntegrationState,
 *   type IntegrationScenarioState,
 * } from './common.integration.steps';
 * ```
 */
import { expect } from "vitest";
import { ConvexTestingHelper } from "convex-helpers/testing";
import { api } from "../../convex/_generated/api";
import { testMutation, testQuery } from "../support/integrationHelpers";
import {
  waitUntil,
  waitForSagaCompletion,
  waitForProjections,
} from "../support/localBackendHelpers";

// =============================================================================
// Types
// =============================================================================

/**
 * Order item structure.
 */
export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

/**
 * Reservation item structure.
 */
export interface ReservationItem {
  productId: string;
  quantity: number;
}

/**
 * Common integration scenario state.
 * Shared across Given-When-Then steps within a single scenario.
 */
export interface IntegrationScenarioState {
  /** ConvexTestingHelper instance for backend communication */
  t: ConvexTestingHelper;

  /** Backend URL */
  backendUrl: string;

  /** Last command/mutation result */
  lastResult: unknown;

  /** Last error caught (null if no error) */
  lastError: Error | null;

  /** Test data for the current scenario */
  scenario: {
    orderId?: string;
    customerId?: string;
    items?: OrderItem[];
    commandId?: string;
    reason?: string;
    productId?: string;
    productName?: string;
    sku?: string;
    reservationId?: string;
    reservationItems?: ReservationItem[];
    sagaType?: string;
    sagaId?: string;
  };
}

// Type for vitest-cucumber DataTable rows (field/value pairs)
export type DataTableRow = { field: string; value: string };

// Type for item DataTable rows
export type ItemTableRow = {
  productId: string;
  productName: string;
  quantity: string;
  unitPrice: string;
};

// Type for inventory item table rows
export type InventoryItemTableRow = {
  productId: string;
  quantity: string;
};

// =============================================================================
// Module-Level State Management
// =============================================================================

/**
 * Module-level scenario state.
 * This is shared across all steps within a scenario.
 * Each step file that imports this module will share the same state instance.
 */
let scenarioState: IntegrationScenarioState | null = null;

/**
 * Get the current scenario state.
 * Throws if state hasn't been initialized (forgot to call initIntegrationState).
 */
export function getState(): IntegrationScenarioState {
  if (!scenarioState) {
    throw new Error(
      "Integration scenario state not initialized. " +
        "Ensure 'the backend is running and clean' step runs in Background."
    );
  }
  return scenarioState;
}

/**
 * Store the last command result in state.
 */
export function setLastResult(result: unknown): void {
  const state = getState();
  state.lastResult = result;
  state.lastError = null;
}

/**
 * Store the last error in state.
 */
export function setLastError(error: Error): void {
  const state = getState();
  state.lastError = error;
  state.lastResult = null;
}

/**
 * Initialize fresh integration scenario state.
 * Call this in BeforeEachScenario or the first Given step.
 */
export function initIntegrationState(): IntegrationScenarioState {
  const backendUrl = process.env.CONVEX_URL || "http://127.0.0.1:3210";

  scenarioState = {
    t: new ConvexTestingHelper({ backendUrl }),
    backendUrl,
    lastResult: null,
    lastError: null,
    scenario: {},
  };

  return scenarioState;
}

/**
 * Cleanup integration scenario state.
 * Call this in AfterEachScenario.
 *
 * Note: Uses namespace-based isolation via testRunId prefix instead of clearAll.
 * Each test run's entities have unique IDs, so no cleanup is needed.
 */
export async function cleanupIntegrationState(): Promise<void> {
  if (scenarioState) {
    try {
      // Close the connection - no clearAll needed with namespace isolation
      await scenarioState.t.close();
    } catch (error) {
      // Log cleanup errors for debugging but don't fail the test
      console.warn("Cleanup error (non-fatal):", error instanceof Error ? error.message : error);
    }
    scenarioState = null;
  }
}

/**
 * Reset the module-level state reference.
 * Use this in AfterEachScenario when not using cleanupIntegrationState.
 */
export function resetState(): void {
  scenarioState = null;
}

// =============================================================================
// Helper Functions
// =============================================================================

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

/**
 * Execute a mutation and capture result/error in state.
 */
export async function executeMutation<T>(mutation: () => Promise<T>): Promise<void> {
  try {
    const result = await mutation();
    setLastResult(result);
  } catch (error) {
    setLastError(error as Error);
  }
}

/**
 * Simple sleep function.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// Setup Step Implementations
// =============================================================================

/**
 * Gherkin Step: Given the backend is running and clean
 *
 * Initializes the integration test context.
 * Uses namespace-based isolation via testRunId - each test run's entities
 * have unique prefixed IDs, so no clearAll is needed.
 */
export async function givenBackendIsRunningAndClean(): Promise<void> {
  initIntegrationState();
  // No clearAll needed - namespace isolation via testRunId prefix
}

/**
 * Gherkin Step: Given the system has been reset
 *
 * No-op with namespace-based isolation.
 * Each test run uses unique prefixed IDs, so no reset is needed.
 */
export async function givenSystemHasBeenReset(): Promise<void> {
  // No-op with namespace isolation - each test run has unique IDs
}

// =============================================================================
// Result Assertion Step Implementations
// =============================================================================

/**
 * Gherkin Step: Then the command should succeed
 *
 * Verifies the last command returned status: "success".
 */
export function thenCommandShouldSucceed(): void {
  const state = getState();

  if (state.lastError) {
    throw new Error(`Command failed with error: ${state.lastError.message}`);
  }

  expect(state.lastResult).toBeDefined();
  const result = state.lastResult as { status?: string };
  expect(result.status).toBe("success");
}

/**
 * Gherkin Step: Then the command should fail
 *
 * Verifies the last command either threw an error or returned a non-success status.
 */
export function thenCommandShouldFail(): void {
  const state = getState();

  if (state.lastError) {
    // Error was thrown - this counts as failure
    return;
  }

  const result = state.lastResult as { status?: string } | null;
  if (result && result.status === "success") {
    throw new Error("Expected command to fail but it succeeded");
  }
}

/**
 * Gherkin Step: Then the command should be rejected with code {string}
 *
 * Verifies the command returned { status: "rejected", code: expectedCode }.
 */
export function thenCommandShouldBeRejectedWithCode(expectedCode: string): void {
  const state = getState();

  if (state.lastError) {
    // Check if the error message contains the expected code
    if (state.lastError.message.includes(expectedCode)) {
      return;
    }
    throw new Error(
      `Expected rejection with code "${expectedCode}" but got error: ${state.lastError.message}`
    );
  }

  expect(state.lastResult).toBeDefined();
  const result = state.lastResult as { status?: string; code?: string };
  expect(result.status).toBe("rejected");
  expect(result.code).toBe(expectedCode);
}

/**
 * Gherkin Step: Then the command should return duplicate status
 *
 * Verifies the last command returned status: "duplicate" (idempotency).
 */
export function thenCommandShouldReturnDuplicateStatus(): void {
  const state = getState();

  if (state.lastError) {
    throw new Error(`Command failed with error: ${state.lastError.message}`);
  }

  expect(state.lastResult).toBeDefined();
  const result = state.lastResult as { status?: string };
  expect(result.status).toBe("duplicate");
}

/**
 * Gherkin Step: Then the result should contain {string}
 *
 * Verifies the last result contains the expected string when stringified.
 */
export function thenResultShouldContain(expected: string): void {
  const state = getState();

  if (state.lastError) {
    // Check if error message contains expected string
    if (state.lastError.message.includes(expected)) {
      return;
    }
    throw new Error(
      `Expected result to contain "${expected}" but got error: ${state.lastError.message}`
    );
  }

  const resultString = JSON.stringify(state.lastResult);
  expect(resultString).toContain(expected);
}

/**
 * Gherkin Step: Then the command should return failed status
 *
 * Verifies the last command returned status: "failed" (business failure with event).
 */
export function thenCommandShouldReturnFailedStatus(expectedReason?: string): void {
  const state = getState();

  if (state.lastError) {
    throw new Error(`Command threw an error: ${state.lastError.message}`);
  }

  expect(state.lastResult).toBeDefined();
  const result = state.lastResult as { status?: string; reason?: string };
  expect(result.status).toBe("failed");

  if (expectedReason) {
    expect(result.reason).toContain(expectedReason);
  }
}

// =============================================================================
// Waiting Step Implementations
// =============================================================================

/** Default wait time when no specific orderId is available for projection polling */
const DEFAULT_PROJECTION_WAIT_MS = 2000;

/**
 * Gherkin Step: And I wait for projections to process
 *
 * Waits for workpool projection processing to complete.
 * Default timeout: 30 seconds.
 */
export async function andWaitForProjectionsToProcess(): Promise<void> {
  const state = getState();

  if (state.scenario.orderId) {
    await waitForProjections(state.t, state.scenario.orderId);
  } else {
    // If no orderId, just wait a reasonable time for projections
    await sleep(DEFAULT_PROJECTION_WAIT_MS);
  }
}

/**
 * Gherkin Step: And I wait for the saga to complete
 *
 * Waits for the current saga to reach a terminal state (completed/failed).
 * Requires scenario.sagaType and scenario.sagaId to be set.
 */
export async function andWaitForSagaToComplete(): Promise<{
  status: string;
  error?: string;
}> {
  const state = getState();

  const sagaType = state.scenario.sagaType || "OrderFulfillment";
  const sagaId = state.scenario.sagaId || state.scenario.orderId;

  if (!sagaId) {
    throw new Error("No sagaId or orderId set in scenario state for waiting on saga completion");
  }

  return await waitForSagaCompletion(state.t, sagaType, sagaId);
}

/**
 * Gherkin Step: And I wait for {int} milliseconds
 *
 * Simple delay for timing-sensitive tests.
 */
export async function andWaitForMilliseconds(ms: number): Promise<void> {
  await sleep(ms);
}

/**
 * Wait until a condition is met, polling periodically.
 * Re-exported from localBackendHelpers for convenience.
 */
export async function waitUntilCondition<T>(
  check: () => Promise<T>,
  options: {
    timeoutMs?: number;
    pollIntervalMs?: number;
    message?: string;
  } = {}
): Promise<T> {
  return waitUntil(check, options);
}

// =============================================================================
// Query Helper Functions
// =============================================================================

/**
 * Query order summary projection.
 */
export async function queryOrderSummary(orderId: string): Promise<unknown> {
  const state = getState();
  return testQuery(state.t, api.orders.getOrderSummary, { orderId });
}

/**
 * Query inventory product projection.
 */
export async function queryProduct(productId: string): Promise<unknown> {
  const state = getState();
  return testQuery(state.t, api.inventory.getProduct, { productId });
}

/**
 * Query reservation projection.
 */
export async function queryReservation(reservationId: string): Promise<unknown> {
  const state = getState();
  return testQuery(state.t, api.inventory.getReservation, { reservationId });
}

/**
 * Query saga status.
 */
export async function querySagaStatus(
  sagaType: string,
  sagaId: string
): Promise<{ status: string; error?: string } | null> {
  const state = getState();
  return testQuery(state.t, api.sagas.getSaga, { sagaType, sagaId });
}

// =============================================================================
// Test Data Setup Helpers
// =============================================================================

/**
 * Create a test order with specific status.
 * Uses the testing helper mutation.
 */
export async function createTestOrder(options: {
  orderId: string;
  customerId: string;
  status?: "draft" | "submitted" | "confirmed" | "cancelled";
  items?: OrderItem[];
}): Promise<void> {
  const state = getState();

  await testMutation(state.t, api.testing.createTestOrder, {
    orderId: options.orderId,
    customerId: options.customerId,
    status: options.status || "draft",
    items: options.items || [],
  });

  // Store in scenario for later reference
  state.scenario.orderId = options.orderId;
  state.scenario.customerId = options.customerId;
  state.scenario.items = options.items;
}

/**
 * Create a test product with stock.
 */
export async function createTestProduct(options: {
  productId: string;
  productName: string;
  sku: string;
  availableQuantity: number;
}): Promise<void> {
  const state = getState();

  await testMutation(state.t, api.testing.createTestProduct, {
    productId: options.productId,
    productName: options.productName,
    sku: options.sku,
    availableQuantity: options.availableQuantity,
  });

  state.scenario.productId = options.productId;
  state.scenario.productName = options.productName;
  state.scenario.sku = options.sku;
}

/**
 * Create a test reservation.
 */
export async function createTestReservation(options: {
  reservationId: string;
  orderId: string;
  items: ReservationItem[];
  status?: "pending" | "confirmed" | "released" | "expired";
  expiresAt?: number;
}): Promise<void> {
  const state = getState();

  await testMutation(state.t, api.testing.createTestReservation, {
    reservationId: options.reservationId,
    orderId: options.orderId,
    items: options.items,
    status: options.status,
    expiresAt: options.expiresAt,
  });

  state.scenario.reservationId = options.reservationId;
  state.scenario.orderId = options.orderId;
  state.scenario.reservationItems = options.items;
}

// =============================================================================
// Step Registration Helper
// =============================================================================

/**
 * Register common Background steps.
 *
 * Usage in step definition files:
 * ```typescript
 * Background(({ Given }) => {
 *   registerCommonBackgroundSteps({ Given });
 * });
 * ```
 */
export function registerCommonBackgroundSteps(hooks: {
  Given: (pattern: string, handler: () => Promise<void>) => void;
}): void {
  hooks.Given("the backend is running and clean", givenBackendIsRunningAndClean);
  hooks.Given("the system has been reset", givenSystemHasBeenReset);
}

/**
 * Register common Then steps for result assertions.
 *
 * Usage in step definition files:
 * ```typescript
 * Scenario("my scenario", ({ Given, When, Then }) => {
 *   registerCommonThenSteps({ Then });
 *   // ... scenario-specific steps
 * });
 * ```
 */
export function registerCommonThenSteps(hooks: {
  Then: (pattern: string, handler: (...args: unknown[]) => void) => void;
}): void {
  hooks.Then("the command should succeed", thenCommandShouldSucceed);
  hooks.Then("the command should fail", thenCommandShouldFail);
  hooks.Then("the command should be rejected with code {string}", (_ctx: unknown, code: string) =>
    thenCommandShouldBeRejectedWithCode(code)
  );
  hooks.Then("the command should return duplicate status", thenCommandShouldReturnDuplicateStatus);
  hooks.Then("the result should contain {string}", (_ctx: unknown, expected: string) =>
    thenResultShouldContain(expected)
  );
}

/**
 * Register common waiting steps.
 *
 * Usage in step definition files:
 * ```typescript
 * Scenario("my scenario", ({ Given, When, Then, And }) => {
 *   registerCommonWaitingSteps({ And });
 *   // ... scenario-specific steps
 * });
 * ```
 */
export function registerCommonWaitingSteps(hooks: {
  And: (pattern: string, handler: (...args: unknown[]) => Promise<void>) => void;
}): void {
  hooks.And("I wait for projections to process", andWaitForProjectionsToProcess);
  hooks.And("I wait for the saga to complete", andWaitForSagaToComplete);
  hooks.And("I wait for {int} milliseconds", (_ctx: unknown, ms: number) =>
    andWaitForMilliseconds(ms)
  );
}
