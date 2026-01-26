/**
 * Integration BDD Test Setup
 *
 * Provides setup utilities for Gherkin BDD integration tests running against
 * the real Convex backend via Docker (port 3210).
 *
 * Uses ConvexTestingHelper from convex-helpers/testing for backend interaction.
 * Uses namespace-based isolation via testRunId - no clearAll needed.
 */

import { ConvexTestingHelper } from "convex-helpers/testing";

/**
 * Default backend URL for integration tests.
 */
const DEFAULT_BACKEND_URL = "http://127.0.0.1:3210";

/**
 * Order item structure matching the schema.
 */
export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

/**
 * Scenario state interface for integration BDD tests.
 * Stores state shared across Given-When-Then steps within a single scenario.
 */
export interface IntegrationScenarioState {
  /** ConvexTestingHelper instance for backend interaction */
  t: ConvexTestingHelper;

  /** Last command/mutation result (success, rejected, duplicate, etc.) */
  lastResult: unknown;

  /** Last error caught during step execution (null if no error) */
  lastError: Error | null;

  /** Scenario-specific test data storage */
  scenario: {
    /** Current order ID under test */
    orderId?: string;
    /** Current customer ID */
    customerId?: string;
    /** Order items */
    items?: OrderItem[];
    /** Command ID for idempotency testing */
    commandId?: string;
    /** Product ID for inventory tests */
    productId?: string;
    /** Reservation ID for inventory tests */
    reservationId?: string;
    /** Saga ID for saga tests */
    sagaId?: string;
    /** Additional dynamic data */
    [key: string]: unknown;
  };
}

/**
 * Creates a fresh IntegrationScenarioState with a ConvexTestingHelper instance.
 *
 * The helper connects to the Docker backend on port 3210.
 *
 * @returns A new IntegrationScenarioState ready for use in tests
 *
 * @example
 * ```typescript
 * let state: IntegrationScenarioState;
 *
 * beforeEach(() => {
 *   state = createIntegrationTestContext();
 * });
 * ```
 */
export function createIntegrationTestContext(): IntegrationScenarioState {
  const backendUrl = process.env.CONVEX_URL || DEFAULT_BACKEND_URL;

  const t = new ConvexTestingHelper({
    backendUrl,
  });

  return {
    t,
    lastResult: null,
    lastError: null,
    scenario: {},
  };
}

/**
 * Cleans up after a test scenario.
 *
 * Closes the helper connection. No clearAll needed with namespace isolation.
 * Each test run's entities have unique testRunId-prefixed IDs.
 * Call this in afterEach() for proper test isolation.
 *
 * @param state - The IntegrationScenarioState to clean up
 *
 * @example
 * ```typescript
 * afterEach(async () => {
 *   await cleanupIntegrationTest(state);
 * });
 * ```
 */
export async function cleanupIntegrationTest(state: IntegrationScenarioState): Promise<void> {
  // No clearAll needed - namespace isolation via testRunId prefix
  await state.t.close();
}

/**
 * Resets scenario state between steps if needed.
 * Preserves the t instance but clears result/error/scenario data.
 *
 * @param state - The IntegrationScenarioState to reset
 */
export function resetScenarioState(state: IntegrationScenarioState): void {
  state.lastResult = null;
  state.lastError = null;
  state.scenario = {};
}
