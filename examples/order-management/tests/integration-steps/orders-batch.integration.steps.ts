/**
 * Order Batch Operations Integration Step Definitions
 *
 * Step definitions for batch command operations on orders:
 * - Adding multiple items in batch
 * - Removing multiple items in batch
 * - Atomic failure handling
 *
 * Uses real Convex backend via Docker for full system validation.
 */
import { loadFeature, describeFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { ConvexTestingHelper } from "convex-helpers/testing";
import { api } from "../../convex/_generated/api";
import { generateCustomerId } from "../fixtures/orders";
import { waitUntil } from "../support/localBackendHelpers";
import { testMutation, testQuery } from "../support/integrationHelpers";

// =============================================================================
// Types
// =============================================================================

// Type for item data table rows
type ItemTableRow = {
  productId: string;
  productName: string;
  quantity: string;
  unitPrice: string;
};

// Type for productId-only table rows
type ProductIdTableRow = { productId: string };

// Scenario state interface
interface BatchScenarioState {
  t: ConvexTestingHelper;
  lastResult: unknown;
  lastError: Error | null;
  batchResult: {
    summary: {
      succeeded: number;
      failed: number;
      rejected: number;
      skipped: number;
    };
  } | null;
  scenario: {
    orderId?: string;
    customerId?: string;
  };
}

// Module-level state
let scenarioState: BatchScenarioState | null = null;

// Initialize state for a scenario
function initState(): BatchScenarioState {
  return {
    t: new ConvexTestingHelper({
      backendUrl: process.env.CONVEX_URL || "http://127.0.0.1:3210",
    }),
    lastResult: null,
    lastError: null,
    batchResult: null,
    scenario: {},
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Parse item table rows into order items.
 */
function parseItemTable(
  table: ItemTableRow[]
): Array<{ productId: string; productName: string; quantity: number; unitPrice: number }> {
  return table.map((row) => ({
    productId: row.productId,
    productName: row.productName,
    quantity: parseInt(row.quantity, 10),
    unitPrice: parseFloat(row.unitPrice),
  }));
}

/**
 * Parse productId table rows.
 */
function parseProductIdTable(table: ProductIdTableRow[]): string[] {
  return table.map((row) => row.productId);
}

// =============================================================================
// ORDER BATCH OPERATIONS FEATURE
// =============================================================================

const batchExecutionFeature = await loadFeature(
  "tests/integration-features/orders/batch-operations.feature"
);

describeFeature(batchExecutionFeature, ({ Scenario, Background, AfterEachScenario, Then, And }) => {
  AfterEachScenario(async () => {
    if (scenarioState) {
      await scenarioState.t.close();
    }
    scenarioState = null;
  });

  Background(({ Given }) => {
    Given("the backend is running and clean", async () => {
      // No clearAll needed - namespace isolation via testRunId prefix
      scenarioState = initState();
      expect(scenarioState.t).toBeDefined();
    });
  });

  // =========================================================================
  // SHARED STEP DEFINITIONS (feature level - reused across all scenarios)
  // =========================================================================

  Then("the batch should succeed with {int} items", (_ctx: unknown, expectedCount: number) => {
    if (scenarioState!.lastError) {
      throw new Error(`Batch failed with error: ${scenarioState!.lastError.message}`);
    }
    expect(scenarioState!.batchResult).toBeDefined();
    expect(scenarioState!.batchResult!.summary.succeeded).toBe(expectedCount);
  });

  And("the batch should have {int} failures", (_ctx: unknown, expectedCount: number) => {
    expect(scenarioState!.batchResult!.summary.failed).toBe(expectedCount);
  });

  And("I wait for projections to process", async () => {
    const orderId = scenarioState!.scenario.orderId!;
    // Use dynamic expected count from batch result instead of hardcoded value
    const expectedItemCount = scenarioState!.batchResult!.summary.succeeded;

    await waitUntil(
      async () => {
        const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, {
          orderId,
        });
        return order?.itemCount === expectedItemCount;
      },
      { message: "Projection processing" }
    );
  });

  And(
    "the order {string} should have {int} items",
    async (_ctx: unknown, _orderId: string, expectedCount: number) => {
      const orderId = scenarioState!.scenario.orderId!;
      const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, { orderId });
      expect(order?.itemCount).toBe(expectedCount);
    }
  );

  // Handle singular "item" variant (same implementation)
  And(
    "the order {string} should have {int} item",
    async (_ctx: unknown, _orderId: string, expectedCount: number) => {
      const orderId = scenarioState!.scenario.orderId!;
      const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, { orderId });
      expect(order?.itemCount).toBe(expectedCount);
    }
  );

  And(
    "the order {string} total should be {int}",
    async (_ctx: unknown, _orderId: string, expectedTotal: number) => {
      const orderId = scenarioState!.scenario.orderId!;
      const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, { orderId });
      expect(order?.totalAmount).toBe(expectedTotal);
    }
  );

  // Atomic failure scenario assertions
  Then("the batch should have {int} rejection", (_ctx: unknown, expectedCount: number) => {
    expect(scenarioState!.batchResult).toBeDefined();
    expect(scenarioState!.batchResult!.summary.rejected).toBe(expectedCount);
  });

  And("the batch should have {int} skipped", (_ctx: unknown, expectedCount: number) => {
    expect(scenarioState!.batchResult!.summary.skipped).toBe(expectedCount);
  });

  And("the batch should have {int} successes", (_ctx: unknown, expectedCount: number) => {
    expect(scenarioState!.batchResult!.summary.succeeded).toBe(expectedCount);
  });

  // =========================================================================
  // SCENARIOS (only unique Given/When steps defined inside each)
  // =========================================================================

  // --------------------------------------------------------------------------
  // Scenario: Add multiple items to order in batch
  // --------------------------------------------------------------------------
  Scenario("Add multiple items to order in batch", ({ Given, When }) => {
    Given("a draft order {string} exists", async (_ctx: unknown, orderId: string) => {
      const uniqueOrderId = `${orderId}-${Date.now()}`;
      const customerId = generateCustomerId();

      scenarioState!.scenario.orderId = uniqueOrderId;
      scenarioState!.scenario.customerId = customerId;

      await testMutation(scenarioState!.t, api.orders.createOrder, {
        orderId: uniqueOrderId,
        customerId,
      });

      // Wait for order to be created
      await waitUntil(
        async () => {
          const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, {
            orderId: uniqueOrderId,
          });
          return order !== null;
        },
        { message: "Order creation" }
      );
    });

    When(
      "I add multiple items to order {string} in batch:",
      async (_ctx: unknown, _orderId: string, table: ItemTableRow[]) => {
        const orderId = scenarioState!.scenario.orderId!;
        const items = parseItemTable(table);

        try {
          scenarioState!.batchResult = (await testMutation(
            scenarioState!.t,
            api.batchCommands.addMultipleOrderItems,
            {
              orderId,
              items,
            }
          )) as typeof scenarioState.batchResult;
          scenarioState!.lastError = null;
        } catch (error) {
          scenarioState!.lastError = error as Error;
          scenarioState!.batchResult = null;
        }
      }
    );
  });

  // --------------------------------------------------------------------------
  // Scenario: Batch respects order of execution
  // --------------------------------------------------------------------------
  Scenario("Batch respects order of execution", ({ Given, When }) => {
    Given(
      "a draft order {string} exists with items:",
      async (_ctx: unknown, orderId: string, table: ItemTableRow[]) => {
        const uniqueOrderId = `${orderId}-${Date.now()}`;
        const customerId = generateCustomerId();
        const items = parseItemTable(table);

        scenarioState!.scenario.orderId = uniqueOrderId;
        scenarioState!.scenario.customerId = customerId;

        await testMutation(scenarioState!.t, api.testing.createTestOrder, {
          orderId: uniqueOrderId,
          customerId,
          status: "draft",
          items,
        });

        // Wait for projection
        await waitUntil(
          async () => {
            const order = await testQuery(scenarioState!.t, api.orders.getOrderSummary, {
              orderId: uniqueOrderId,
            });
            return order?.itemCount === items.length;
          },
          { message: "Initial items projection" }
        );
      }
    );

    When(
      "I remove multiple items from order {string} in batch:",
      async (_ctx: unknown, _orderId: string, table: ProductIdTableRow[]) => {
        const orderId = scenarioState!.scenario.orderId!;
        const productIds = parseProductIdTable(table);

        try {
          scenarioState!.batchResult = (await testMutation(
            scenarioState!.t,
            api.batchCommands.removeMultipleOrderItems,
            {
              orderId,
              productIds,
            }
          )) as typeof scenarioState.batchResult;
          scenarioState!.lastError = null;
        } catch (error) {
          scenarioState!.lastError = error as Error;
          scenarioState!.batchResult = null;
        }
      }
    );
  });

  // --------------------------------------------------------------------------
  // Scenario: Batch stops on first failure in atomic mode
  // --------------------------------------------------------------------------
  Scenario("Batch stops on first failure in atomic mode", ({ Given, When }) => {
    Given(
      "a submitted order {string} exists with items:",
      async (_ctx: unknown, orderId: string, table: ItemTableRow[]) => {
        const uniqueOrderId = `${orderId}-${Date.now()}`;
        const customerId = generateCustomerId();
        const items = parseItemTable(table);

        scenarioState!.scenario.orderId = uniqueOrderId;
        scenarioState!.scenario.customerId = customerId;

        await testMutation(scenarioState!.t, api.testing.createTestOrder, {
          orderId: uniqueOrderId,
          customerId,
          status: "submitted",
          items,
        });
      }
    );

    When(
      "I add multiple items to order {string} in batch:",
      async (_ctx: unknown, _orderId: string, table: ItemTableRow[]) => {
        const orderId = scenarioState!.scenario.orderId!;
        const items = parseItemTable(table);

        try {
          scenarioState!.batchResult = (await testMutation(
            scenarioState!.t,
            api.batchCommands.addMultipleOrderItems,
            {
              orderId,
              items,
            }
          )) as typeof scenarioState.batchResult;
          scenarioState!.lastError = null;
        } catch (error) {
          scenarioState!.lastError = error as Error;
          scenarioState!.batchResult = null;
        }
      }
    );
  });
});
